/**
 * MessagePort-based worker handle.
 *
 * Provides a concrete `LapicWorkerHandle` backed by any
 * `MessagePort`-compatible channel. Works with:
 * - Browser `Web Worker` + `MessagePort`
 * - Node.js `worker_threads` + `MessagePort`
 * - `MessageChannel` for testing
 *
 * Two sides:
 * - **Main thread**: `createMessagePortWorkerHandle(workerId, port)`
 *   returns a `LapicWorkerHandle` that sends messages through the port.
 * - **Worker thread**: `createWorkerEntryHandler(port, executor)`
 *   listens for messages and runs the evaluate loop.
 */

import type { LapicWorkerHandle } from './pool'
import type {
  LapicInProcessWorkExecutor,
  LapicWorkerDispatchMessage,
  LapicWorkerPauseAckMessage,
  LapicWorkerResultMessage,
} from './transport'

// ---------------------------------------------------------------------------
// MessagePort abstraction
// ---------------------------------------------------------------------------

/**
 * Minimal interface satisfied by both browser `MessagePort` and
 * Node.js `worker_threads.MessagePort`.
 *
 * Using this abstraction allows the same code to run in both
 * environments without importing platform-specific types.
 */
export interface LapicMessagePortLike {
  postMessage(data: unknown): void
  on?(event: 'message', handler: (data: unknown) => void): void
  addEventListener?(
    type: 'message',
    handler: (event: { data: unknown }) => void
  ): void
  removeEventListener?(
    type: 'message',
    handler: (event: { data: unknown }) => void
  ): void
  off?(event: 'message', handler: (data: unknown) => void): void
  close?(): void
}

// ---------------------------------------------------------------------------
// Envelope types (sent over the port)
// ---------------------------------------------------------------------------

/**
 * Messages sent from the main thread to the worker.
 */
export type LapicPortCoordinatorEnvelope =
  | {
      readonly kind: 'dispatch'
      readonly id: number
      readonly message: LapicWorkerDispatchMessage
    }
  | { readonly kind: 'pause'; readonly id: number; readonly sessionId: string }
  | { readonly kind: 'terminate' }

/**
 * Messages sent from the worker back to the main thread.
 */
export type LapicPortWorkerEnvelope =
  | {
      readonly kind: 'dispatch-result'
      readonly id: number
      readonly result: LapicWorkerResultMessage
    }
  | {
      readonly kind: 'pause-ack'
      readonly id: number
      readonly result: LapicWorkerPauseAckMessage | undefined
    }
  | { readonly kind: 'error'; readonly id: number; readonly message: string }

// ---------------------------------------------------------------------------
// Main-thread side: MessagePort worker handle
// ---------------------------------------------------------------------------

/**
 * Create a `LapicWorkerHandle` backed by a `MessagePort`.
 *
 * Each `dispatch()` and `requestPause()` call posts a message
 * with a unique correlation ID and waits for the matching response.
 */
export function createMessagePortWorkerHandle(
  workerId: string,
  port: LapicMessagePortLike
): LapicWorkerHandle {
  let nextId = 1
  let terminated = false

  // Pending request map: id → { resolve, reject }
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >()

  // Attach the message listener (supports both Node and browser APIs)
  function handleMessage(envelope: LapicPortWorkerEnvelope) {
    const entry = pending.get(envelope.id)
    if (!entry) return

    pending.delete(envelope.id)

    if (envelope.kind === 'error') {
      entry.reject(new Error(envelope.message))
    } else if (envelope.kind === 'dispatch-result') {
      entry.resolve(envelope.result)
    } else if (envelope.kind === 'pause-ack') {
      entry.resolve(envelope.result)
    }
  }

  if (typeof port.on === 'function') {
    // Node.js worker_threads MessagePort
    port.on('message', (data) => handleMessage(data as LapicPortWorkerEnvelope))
  } else if (typeof port.addEventListener === 'function') {
    // Browser MessagePort
    port.addEventListener('message', (event) =>
      handleMessage(event.data as LapicPortWorkerEnvelope)
    )
  }

  return {
    workerId,

    dispatch(
      message: LapicWorkerDispatchMessage
    ): Promise<LapicWorkerResultMessage> {
      if (terminated)
        return Promise.reject(new Error(`Worker ${workerId} is terminated.`))

      const id = nextId++
      return new Promise<LapicWorkerResultMessage>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        const envelope: LapicPortCoordinatorEnvelope = {
          kind: 'dispatch',
          id,
          message,
        }
        port.postMessage(envelope)
      })
    },

    requestPause(
      sessionId: string
    ): Promise<LapicWorkerPauseAckMessage | undefined> {
      if (terminated) return Promise.resolve(undefined)

      const id = nextId++
      return new Promise<LapicWorkerPauseAckMessage | undefined>(
        (resolve, reject) => {
          pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
          const envelope: LapicPortCoordinatorEnvelope = {
            kind: 'pause',
            id,
            sessionId,
          }
          port.postMessage(envelope)
        }
      )
    },

    async terminate(): Promise<void> {
      if (terminated) return
      terminated = true

      // Reject all pending requests
      for (const [, entry] of pending) {
        entry.reject(new Error(`Worker ${workerId} terminated.`))
      }
      pending.clear()

      const envelope: LapicPortCoordinatorEnvelope = { kind: 'terminate' }
      port.postMessage(envelope)
      port.close?.()
    },
  }
}

// ---------------------------------------------------------------------------
// Worker-thread side: entry handler
// ---------------------------------------------------------------------------

/**
 * Options for creating a worker entry handler.
 */
export interface LapicWorkerEntryConfig {
  /** The message port to listen on and respond through. */
  readonly port: LapicMessagePortLike
  /** The evaluate loop that processes flat-index ranges. */
  readonly executor: LapicInProcessWorkExecutor
  /** Session ID to include in pause acks. */
  readonly sessionId?: string
}

/**
 * Create a worker-side message handler.
 *
 * Listens for coordinator messages on the port and:
 * - For `dispatch`: runs the executor, posts `dispatch-result`
 * - For `pause`: responds with `pause-ack` (sync executor can't
 *   pause mid-operation, so ack is immediate with empty state)
 * - For `terminate`: closes the port
 *
 * Returns a cleanup function that removes the listener.
 */
export function createWorkerEntryHandler(
  config: LapicWorkerEntryConfig
): () => void {
  const { port, executor } = config
  let disposed = false

  function handleMessage(envelope: LapicPortCoordinatorEnvelope) {
    if (disposed) return

    switch (envelope.kind) {
      case 'dispatch': {
        try {
          const result = executor(
            envelope.message.startFlatIndex,
            envelope.message.endFlatIndex
          )

          const response: LapicPortWorkerEnvelope = {
            kind: 'dispatch-result',
            id: envelope.id,
            result: {
              tag: 'WorkComplete',
              sessionId: envelope.message.sessionId,
              partitionIndex: envelope.message.partitionIndex,
              topCandidates: result.topCandidates,
              evaluatedCount: result.evaluatedCount,
              visitedCount: result.visitedCount,
            },
          }
          port.postMessage(response)
        } catch (err) {
          const response: LapicPortWorkerEnvelope = {
            kind: 'error',
            id: envelope.id,
            message: err instanceof Error ? err.message : String(err),
          }
          port.postMessage(response)
        }
        break
      }

      case 'pause': {
        // Synchronous executor can't pause mid-work.
        // Respond immediately with no partial state.
        const response: LapicPortWorkerEnvelope = {
          kind: 'pause-ack',
          id: envelope.id,
          result: undefined,
        }
        port.postMessage(response)
        break
      }

      case 'terminate': {
        disposed = true
        port.close?.()
        break
      }
    }
  }

  // Attach listener
  if (typeof port.on === 'function') {
    port.on('message', (data) =>
      handleMessage(data as LapicPortCoordinatorEnvelope)
    )
  } else if (typeof port.addEventListener === 'function') {
    port.addEventListener('message', (event) =>
      handleMessage(event.data as LapicPortCoordinatorEnvelope)
    )
  }

  return () => {
    disposed = true
  }
}
