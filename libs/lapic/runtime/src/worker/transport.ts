/**
 * Abstract transport layer for multi-worker communication.
 *
 * Provides an environment-agnostic interface for sending work
 * to worker backends and collecting results. Three backends
 * are specified by the architecture:
 *
 * - `in-process`: synchronous execution in the coordinator thread
 *   (deterministic, used for testing and small problems)
 * - `browser-worker`: Web Worker + MessagePort
 * - `node-worker`: Node.js worker_threads
 *
 * Only the `in-process` backend is implemented here. Browser and
 * Node backends are extension points for platform-specific packages.
 */

import type { LapicCandidateDescriptor } from '@genshin-optimizer/lapic/core'
import type { LapicWorkerBackendKind } from '../types'
import type { LapicBoundedExactCombinationEvaluation } from '../solve/types'

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

/**
 * A work item dispatched to a worker: evaluate combinations in
 * the flat-index range [startFlatIndex, endFlatIndex).
 */
export interface LapicWorkerDispatchMessage {
  readonly tag: 'StartWork'
  readonly sessionId: string
  readonly partitionIndex: number
  readonly startFlatIndex: number
  readonly endFlatIndex: number
}

/**
 * Result collected from a worker after processing its partition.
 */
export interface LapicWorkerResultMessage {
  readonly tag: 'WorkComplete'
  readonly sessionId: string
  readonly partitionIndex: number
  /** Top-N candidates found within this partition. */
  readonly topCandidates: readonly LapicWorkerResultEntry[]
  /** Total combinations evaluated (excluding pruned/infeasible). */
  readonly evaluatedCount: number
  /** Total combinations visited (including pruned/infeasible). */
  readonly visitedCount: number
}

/**
 * A single top-N entry produced by a worker.
 */
export interface LapicWorkerResultEntry {
  readonly stateId: string
  readonly candidates: readonly LapicCandidateDescriptor[]
  readonly evaluation: LapicBoundedExactCombinationEvaluation
}

/**
 * Pause request sent from coordinator to worker.
 */
export interface LapicWorkerPauseMessage {
  readonly tag: 'PauseAtSafePoint'
  readonly sessionId: string
}

/**
 * Pause acknowledgment from worker.
 */
export interface LapicWorkerPauseAckMessage {
  readonly tag: 'AckPaused'
  readonly sessionId: string
  readonly partitionIndex: number
  readonly lastProcessedFlatIndex: number
  readonly topCandidates: readonly LapicWorkerResultEntry[]
  readonly evaluatedCount: number
  readonly visitedCount: number
}

/**
 * Union of all coordinator-to-worker messages.
 */
export type LapicCoordinatorMessage =
  | LapicWorkerDispatchMessage
  | LapicWorkerPauseMessage

/**
 * Union of all worker-to-coordinator messages.
 */
export type LapicWorkerMessage =
  | LapicWorkerResultMessage
  | LapicWorkerPauseAckMessage

// ---------------------------------------------------------------------------
// Transport interface
// ---------------------------------------------------------------------------

/**
 * Abstract transport for dispatching work to and collecting results
 * from worker backends.
 */
export interface LapicWorkerTransport {
  readonly backendKind: LapicWorkerBackendKind

  /**
   * Dispatch a partition to a worker and await its result.
   * The transport is responsible for routing, serialization,
   * and error recovery.
   */
  dispatch(message: LapicWorkerDispatchMessage): Promise<LapicWorkerResultMessage>

  /**
   * Request all active workers to pause at the next safe point.
   * Returns pause acknowledgments from each worker.
   */
  requestPauseAll(sessionId: string): Promise<readonly LapicWorkerPauseAckMessage[]>

  /**
   * Terminate all workers and release resources.
   */
  shutdown(): Promise<void>
}

/**
 * Function executed by the in-process backend for each combination.
 * This is the same evaluate-and-insert loop from the executor,
 * but isolated to a flat-index range.
 */
export type LapicInProcessWorkExecutor = (
  startFlatIndex: number,
  endFlatIndex: number
) => LapicInProcessWorkResult

export interface LapicInProcessWorkResult {
  readonly topCandidates: readonly LapicWorkerResultEntry[]
  readonly evaluatedCount: number
  readonly visitedCount: number
}

// ---------------------------------------------------------------------------
// In-process transport
// ---------------------------------------------------------------------------

/**
 * Create an in-process transport that executes work synchronously
 * in the calling thread. Used for testing and small problems.
 *
 * The `executor` callback is invoked for each dispatched partition.
 * It runs the evaluate/insert loop over [startFlatIndex, endFlatIndex).
 */
export function createInProcessTransport(
  executor: LapicInProcessWorkExecutor
): LapicWorkerTransport {
  return {
    backendKind: 'in-process',

    async dispatch(message: LapicWorkerDispatchMessage): Promise<LapicWorkerResultMessage> {
      const result = executor(message.startFlatIndex, message.endFlatIndex)

      return {
        tag: 'WorkComplete',
        sessionId: message.sessionId,
        partitionIndex: message.partitionIndex,
        topCandidates: result.topCandidates,
        evaluatedCount: result.evaluatedCount,
        visitedCount: result.visitedCount,
      }
    },

    async requestPauseAll(): Promise<readonly LapicWorkerPauseAckMessage[]> {
      // In-process transport completes synchronously, so there are
      // never active workers to pause.
      return []
    },

    async shutdown(): Promise<void> {
      // No resources to release in the in-process backend.
    },
  }
}
