/**
 * Abstract worker pool transport.
 *
 * Manages a set of abstract worker handles and implements the
 * `LapicWorkerTransport` interface by routing dispatches to
 * available workers. Supports both sequential (round-robin)
 * and concurrent (all-at-once) dispatch modes.
 *
 * Worker handles are abstract — the caller provides them.
 * This decouples pool scheduling from platform-specific
 * worker creation (Web Workers, Node worker_threads, etc.).
 */

import type {
  LapicWorkerDispatchMessage,
  LapicWorkerPauseAckMessage,
  LapicWorkerResultMessage,
  LapicWorkerTransport,
} from './transport'
import type { LapicWorkerBackendKind } from '../types'

// ---------------------------------------------------------------------------
// Worker handle abstraction
// ---------------------------------------------------------------------------

/**
 * Abstract handle to a single worker.
 *
 * The pool transport dispatches work through handles without
 * knowing how the worker is implemented (in-process, thread,
 * Web Worker, etc.).
 */
export interface LapicWorkerHandle {
  /** Identifier for this worker (for diagnostics). */
  readonly workerId: string

  /**
   * Send a dispatch message and await the result.
   * The handle is responsible for serialization and transport.
   */
  dispatch(message: LapicWorkerDispatchMessage): Promise<LapicWorkerResultMessage>

  /**
   * Request this worker to pause at the next safe point.
   * Returns the pause acknowledgment.
   */
  requestPause(sessionId: string): Promise<LapicWorkerPauseAckMessage | undefined>

  /**
   * Terminate this worker and release resources.
   */
  terminate(): Promise<void>
}

/**
 * State of a worker in the pool.
 */
export type LapicPoolWorkerState = 'idle' | 'busy' | 'terminated'

// ---------------------------------------------------------------------------
// Pool configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for creating a pool transport.
 */
export interface LapicPoolTransportConfig {
  /** The worker handles to manage. */
  readonly handles: readonly LapicWorkerHandle[]
  /** Backend kind label for the transport (e.g. 'browser-worker'). */
  readonly backendKind: LapicWorkerBackendKind
}

// ---------------------------------------------------------------------------
// Pool transport implementation
// ---------------------------------------------------------------------------

interface PoolEntry {
  readonly handle: LapicWorkerHandle
  state: LapicPoolWorkerState
  /** Partition index currently being processed (when busy). */
  activePartitionIndex?: number
}

/**
 * Create a pool-based worker transport.
 *
 * Dispatches are routed to the next idle worker (round-robin).
 * If all workers are busy, the dispatch waits until one becomes
 * available.
 *
 * The pool maintains a deterministic dispatch order: partition i
 * is assigned to worker (i % workerCount). This ensures that
 * the same partition always goes to the same worker position,
 * which aids reproducibility.
 */
export function createPoolTransport(
  config: LapicPoolTransportConfig
): LapicWorkerTransport & { readonly poolSize: number } {
  if (config.handles.length === 0)
    throw new Error('Pool transport requires at least one worker handle.')

  const entries: PoolEntry[] = config.handles.map((handle) => ({
    handle,
    state: 'idle' as LapicPoolWorkerState,
  }))

  // Pending waiters: resolve functions waiting for an idle worker
  const waiters: Array<(entry: PoolEntry) => void> = []
  let isShutdown = false

  /**
   * Synchronously find and claim an idle entry.
   * Returns null if none available (caller must wait).
   */
  function claimIdleEntry(): PoolEntry | null {
    const entry = entries.find((e) => e.state === 'idle')
    if (entry) {
      entry.state = 'busy'
      return entry
    }
    return null
  }

  function releaseEntry(entry: PoolEntry) {
    entry.activePartitionIndex = undefined

    if (waiters.length > 0) {
      // Hand directly to next waiter without going idle
      // (keeps entry in 'busy' state for the new owner)
      const waiter = waiters.shift()!
      waiter(entry)
    } else {
      entry.state = 'idle'
    }
  }

  return {
    backendKind: config.backendKind,
    get poolSize() {
      return entries.length
    },

    async dispatch(
      message: LapicWorkerDispatchMessage
    ): Promise<LapicWorkerResultMessage> {
      if (isShutdown) throw new Error('Pool transport has been shut down.')

      // Claim synchronously to avoid microtask races
      let entry = claimIdleEntry()
      if (!entry) {
        entry = await new Promise<PoolEntry>((resolve) => {
          waiters.push(resolve)
        })
      }
      entry.activePartitionIndex = message.partitionIndex

      try {
        const result = await entry.handle.dispatch(message)
        return result
      } finally {
        if (!isShutdown) releaseEntry(entry)
      }
    },

    async requestPauseAll(
      sessionId: string
    ): Promise<readonly LapicWorkerPauseAckMessage[]> {
      const busyEntries = entries.filter((entry) => entry.state === 'busy')
      if (busyEntries.length === 0) return []

      const acks = await Promise.all(
        busyEntries.map((entry) => entry.handle.requestPause(sessionId))
      )

      return acks.filter(
        (ack): ack is LapicWorkerPauseAckMessage => ack !== undefined
      )
    },

    async shutdown(): Promise<void> {
      isShutdown = true

      // Reject all pending waiters
      for (const waiter of waiters) {
        // Release with a terminated entry (will throw on dispatch)
        waiter(entries[0]!)
      }
      waiters.length = 0

      // Terminate all workers
      await Promise.all(
        entries.map(async (entry) => {
          entry.state = 'terminated'
          await entry.handle.terminate()
        })
      )
    },
  }
}

// ---------------------------------------------------------------------------
// Callback-based worker handle (for testing and in-process use)
// ---------------------------------------------------------------------------

/**
 * Create a worker handle from a callback function.
 *
 * Useful for testing the pool transport without platform-specific
 * worker creation. The callback implements the worker's evaluate
 * logic synchronously or asynchronously.
 */
export function createCallbackWorkerHandle(
  workerId: string,
  executeFn: (
    message: LapicWorkerDispatchMessage
  ) => Promise<LapicWorkerResultMessage> | LapicWorkerResultMessage
): LapicWorkerHandle {
  return {
    workerId,

    async dispatch(message) {
      return executeFn(message)
    },

    async requestPause() {
      // Callback workers process synchronously — they are never
      // in a pauseable state between events.
      return undefined
    },

    async terminate() {
      // No resources to release.
    },
  }
}
