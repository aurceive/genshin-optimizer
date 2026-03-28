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

import type { LapicFrontierJoinPlan } from '../solve/join-plan'
import type { LapicInMemorySessionController } from '../types'
import type {
  LapicPartitionDispatchConfig,
  LapicPartitionDispatchRequest,
  LapicPartitionDispatchResponse,
  LapicPartitionDispatcher,
} from './partition-dispatch'
import { createInProcessPartitionDispatcher } from './partition-dispatch'
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
  start?(): void
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
// Bounded-exact envelope types (sent over the port)
// ---------------------------------------------------------------------------

/**
 * Serializable partition request sent from coordinator to worker.
 *
 * Unlike `LapicPartitionDispatchRequest`, this omits the controller
 * (which is not serializable). The worker creates its own controller.
 */
export interface LapicBoundedExactPortDispatchRequest {
  readonly partitionIndex: number
  readonly joinPlanPayload: string
  readonly frontierBlockIds: readonly string[]
  readonly initialIncumbentThreshold?: string | undefined
}

/**
 * Messages sent from coordinator to bounded-exact worker.
 */
export type LapicBoundedExactPortCoordinatorEnvelope =
  | {
      readonly kind: 'dispatch-partition'
      readonly id: number
      readonly request: LapicBoundedExactPortDispatchRequest
    }
  | { readonly kind: 'terminate' }
  | {
      /** Push a cross-partition incumbent threshold to the worker. */
      readonly kind: 'threshold-update'
      readonly threshold: string
    }

/**
 * Messages sent from bounded-exact worker back to coordinator.
 */
export type LapicBoundedExactPortWorkerEnvelope =
  | {
      readonly kind: 'partition-result'
      readonly id: number
      readonly response: LapicPartitionDispatchResponse
    }
  | { readonly kind: 'error'; readonly id: number; readonly message: string }
  | {
      readonly kind: 'partition-progress'
      readonly id: number
      readonly completedUnits: number
      readonly totalUnits?: number
      readonly skippedUnits?: number
    }
  | {
      /** Worker's local incumbent improved — notify coordinator. */
      readonly kind: 'incumbent-update'
      readonly id: number
      readonly threshold: string
    }

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

// ---------------------------------------------------------------------------
// Bounded-exact MessagePort worker entry handler
// ---------------------------------------------------------------------------

/**
 * Configuration for a bounded-exact worker entry handler.
 *
 * The dispatcher config provides the evaluator callbacks that
 * cannot be serialized across MessagePort — the worker thread
 * must supply them at initialization time.
 */
export interface LapicBoundedExactWorkerEntryConfig {
  /** The message port to listen on and respond through. */
  readonly port: LapicMessagePortLike
  /**
   * Shared partition dispatch config.
   * Provides the problem definition, evaluators, and other
   * callbacks that the executor needs.
   */
  readonly dispatchConfig: LapicPartitionDispatchConfig
  /**
   * Factory for creating a partition controller on the worker side.
   * Called once per dispatched partition.
   */
  readonly createController: (
    partitionIndex: number
  ) => LapicInMemorySessionController
  /**
   * Deserialize a join plan from its serialized form.
   * The coordinated solve serializes the join plan before sending
   * it over the port; this function reverses the serialization.
   */
  readonly deserializeJoinPlan: (payload: string) => LapicFrontierJoinPlan
}

/**
 * Create a worker-side bounded-exact message handler.
 *
 * Listens for `dispatch-partition` messages and runs the full
 * `executeLapicBoundedExactSolve` for each partition.  Unlike
 * the flat-index `createWorkerEntryHandler`, this handler
 * produces certificates, supports branch-and-bound pruning,
 * and returns the full partition dispatch response.
 *
 * Threshold sharing: the handler maintains a local
 * `externalThreshold` variable updated by `threshold-update`
 * messages from the coordinator.  The executor reads it at
 * safe-point boundaries for cross-partition B&B pruning.
 * When the executor's local incumbent improves, an
 * `incumbent-update` message is sent back to the coordinator.
 *
 * Returns a cleanup function that stops listening.
 */
export function createBoundedExactWorkerEntryHandler(
  config: LapicBoundedExactWorkerEntryConfig
): () => void {
  const { port } = config
  let disposed = false

  // Cross-partition incumbent threshold, updated by coordinator pushes
  let externalThreshold: string | undefined

  const dispatcher = createInProcessPartitionDispatcher(config.dispatchConfig)

  async function handleMessage(
    envelope: LapicBoundedExactPortCoordinatorEnvelope
  ) {
    if (disposed) return

    switch (envelope.kind) {
      case 'threshold-update': {
        externalThreshold = envelope.threshold
        break
      }

      case 'dispatch-partition': {
        try {
          const controller = config.createController(
            envelope.request.partitionIndex
          )
          controller.awaitCompletion().catch(() => {})

          // Forward partition progress to coordinator via port
          let lastForwardTime = 0
          const unsub = controller.subscribeProgress((event) => {
            if (event.phase !== 'join') return
            const now = performance.now()
            if (now - lastForwardTime < 100) return
            lastForwardTime = now
            const progressReply: LapicBoundedExactPortWorkerEnvelope = {
              kind: 'partition-progress',
              id: envelope.id,
              completedUnits: event.completedUnits,
              ...(event.totalUnits !== undefined && {
                totalUnits: event.totalUnits,
              }),
              ...(event.skippedUnits !== undefined && {
                skippedUnits: event.skippedUnits,
              }),
            }
            port.postMessage(progressReply)
          })

          const response = await dispatcher.dispatch({
            partitionIndex: envelope.request.partitionIndex,
            controller,
            joinPlan: config.deserializeJoinPlan(
              envelope.request.joinPlanPayload
            ),
            frontierBlockIds: envelope.request.frontierBlockIds,
            initialIncumbentThreshold:
              envelope.request.initialIncumbentThreshold,
            getExternalIncumbentThreshold: () => externalThreshold,
            onIncumbentImproved: (threshold) => {
              const reply: LapicBoundedExactPortWorkerEnvelope = {
                kind: 'incumbent-update',
                id: envelope.id,
                threshold,
              }
              port.postMessage(reply)
            },
          })

          unsub.unsubscribe()

          const reply: LapicBoundedExactPortWorkerEnvelope = {
            kind: 'partition-result',
            id: envelope.id,
            response,
          }
          port.postMessage(reply)
        } catch (err) {
          const reply: LapicBoundedExactPortWorkerEnvelope = {
            kind: 'error',
            id: envelope.id,
            message: err instanceof Error ? err.message : String(err),
          }
          port.postMessage(reply)
        }
        break
      }

      case 'terminate': {
        disposed = true
        await dispatcher.shutdown()
        port.close?.()
        break
      }
    }
  }

  if (typeof port.on === 'function') {
    port.on('message', (data) =>
      handleMessage(data as LapicBoundedExactPortCoordinatorEnvelope)
    )
  } else if (typeof port.addEventListener === 'function') {
    port.addEventListener('message', (event) =>
      handleMessage(event.data as LapicBoundedExactPortCoordinatorEnvelope)
    )
    // Browser MessagePort requires explicit start() when using addEventListener
    if (typeof port.start === 'function') port.start()
  }

  return () => {
    disposed = true
  }
}

// ---------------------------------------------------------------------------
// MessagePort-based partition dispatcher (main thread side)
// ---------------------------------------------------------------------------

/**
 * Configuration for a MessagePort-based partition dispatcher.
 */
export interface LapicMessagePortPartitionDispatcherConfig {
  /** The message port to communicate through. */
  readonly port: LapicMessagePortLike
  /**
   * Serialize a join plan for transport over the port.
   * The default implementation uses `JSON.stringify`.
   */
  readonly serializeJoinPlan?: (joinPlan: LapicFrontierJoinPlan) => string
}

/**
 * Create a partition dispatcher that sends work to a bounded-exact
 * worker thread via MessagePort.
 *
 * Each `dispatch()` call serializes the partition descriptor,
 * posts it to the worker, and awaits the matching response.
 * The worker runs the full executor and returns certificates
 * and top-N candidates.
 */
export function createMessagePortPartitionDispatcher(
  config: LapicMessagePortPartitionDispatcherConfig
): LapicPartitionDispatcher {
  const { port } = config
  const serializeJoinPlan =
    config.serializeJoinPlan ?? ((jp) => JSON.stringify(jp))
  let nextId = 1
  let terminated = false

  const pending = new Map<
    number,
    {
      resolve: (value: LapicPartitionDispatchResponse) => void
      reject: (reason: unknown) => void
      controller: LapicInMemorySessionController | undefined
      getExternalIncumbentThreshold: (() => string | undefined) | undefined
      onIncumbentImproved: ((threshold: string) => void) | undefined
      lastSentThreshold: string | undefined
    }
  >()

  function handleMessage(envelope: LapicBoundedExactPortWorkerEnvelope) {
    // Progress updates don't resolve the pending request but piggyback
    // threshold delivery: check whether the coordinator-side threshold
    // has changed since the last push and, if so, send an update.
    if (envelope.kind === 'partition-progress') {
      const entry = pending.get(envelope.id)
      if (entry?.controller) {
        entry.controller.publishProgress({
          phase: 'join',
          completedUnits: envelope.completedUnits,
          ...(envelope.totalUnits !== undefined && {
            totalUnits: envelope.totalUnits,
          }),
          ...(envelope.skippedUnits !== undefined && {
            skippedUnits: envelope.skippedUnits,
          }),
        })
      }
      // Piggyback threshold push on progress traffic
      if (entry?.getExternalIncumbentThreshold) {
        const current = entry.getExternalIncumbentThreshold()
        if (current !== undefined && current !== entry.lastSentThreshold) {
          entry.lastSentThreshold = current
          const update: LapicBoundedExactPortCoordinatorEnvelope = {
            kind: 'threshold-update',
            threshold: current,
          }
          port.postMessage(update)
        }
      }
      return
    }

    // Worker's local incumbent improved — propagate to coordinator state
    if (envelope.kind === 'incumbent-update') {
      const entry = pending.get(envelope.id)
      entry?.onIncumbentImproved?.(envelope.threshold)
      return
    }

    const entry = pending.get(envelope.id)
    if (!entry) return

    pending.delete(envelope.id)

    if (envelope.kind === 'error') {
      entry.reject(new Error(envelope.message))
    } else if (envelope.kind === 'partition-result') {
      entry.resolve(envelope.response)
    }
  }

  if (typeof port.on === 'function') {
    port.on('message', (data) =>
      handleMessage(data as LapicBoundedExactPortWorkerEnvelope)
    )
  } else if (typeof port.addEventListener === 'function') {
    port.addEventListener('message', (event) =>
      handleMessage(event.data as LapicBoundedExactPortWorkerEnvelope)
    )
    // Browser MessagePort requires explicit start() when using addEventListener
    if (typeof port.start === 'function') port.start()
  }

  return {
    dispatch(
      request: LapicPartitionDispatchRequest
    ): Promise<LapicPartitionDispatchResponse> {
      if (terminated)
        return Promise.reject(new Error('MessagePort dispatcher terminated.'))

      const id = nextId++
      return new Promise<LapicPartitionDispatchResponse>((resolve, reject) => {
        pending.set(id, {
          resolve,
          reject,
          controller: request.controller,
          getExternalIncumbentThreshold: request.getExternalIncumbentThreshold,
          onIncumbentImproved: request.onIncumbentImproved,
          lastSentThreshold: undefined,
        })
        const envelope: LapicBoundedExactPortCoordinatorEnvelope = {
          kind: 'dispatch-partition',
          id,
          request: {
            partitionIndex: request.partitionIndex,
            joinPlanPayload: serializeJoinPlan(request.joinPlan),
            frontierBlockIds: request.frontierBlockIds,
            initialIncumbentThreshold: request.initialIncumbentThreshold,
          },
        }
        port.postMessage(envelope)
      })
    },

    async shutdown(): Promise<void> {
      if (terminated) return
      terminated = true

      for (const [, entry] of pending) {
        entry.reject(new Error('MessagePort dispatcher terminated.'))
      }
      pending.clear()

      const envelope: LapicBoundedExactPortCoordinatorEnvelope = {
        kind: 'terminate',
      }
      port.postMessage(envelope)
      port.close?.()
    },
  }
}
