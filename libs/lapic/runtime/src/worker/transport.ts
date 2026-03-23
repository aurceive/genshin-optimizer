/**
 * Flat-index transport layer for multi-worker communication.
 *
 * @deprecated The flat-index transport protocol is superseded by the
 * unified partition dispatch contract in `partition-dispatch.ts`.
 * New code should use `LapicPartitionDispatcher` and its concrete
 * implementations (`createInProcessPartitionDispatcher`,
 * `createMessagePortPartitionDispatcher`).  The types in this module
 * are retained for backward compatibility with the existing
 * `message-port.ts` flat-index envelope types and `pool.ts`.
 */

import type { LapicCandidateDescriptor } from '@genshin-optimizer/lapic/core'
import type { LapicCertificate } from '@genshin-optimizer/lapic/cert'
import type { LapicBoundedExactCombinationEvaluation } from '../solve/types'
import type { LapicWorkerBackendKind } from '../types'

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
  /**
   * Certificates emitted during this partition's execution.
   * Present when the partition was executed via the full bounded-exact
   * executor (not the primitive flat-index executor).
   */
  readonly certificates?: readonly LapicCertificate[]
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

// ---------------------------------------------------------------------------
// Transport interface
// ---------------------------------------------------------------------------

/**
 * Abstract transport for dispatching work to and collecting results
 * from worker backends.
 *
 * @deprecated Use `LapicPartitionDispatcher` from `partition-dispatch.ts`
 * instead. This interface operates on flat-index ranges and lacks
 * branch-and-bound pruning, certificates, and incumbent sharing.
 */
export interface LapicWorkerTransport {
  readonly backendKind: LapicWorkerBackendKind

  /**
   * Dispatch a partition to a worker and await its result.
   * The transport is responsible for routing, serialization,
   * and error recovery.
   */
  dispatch(
    message: LapicWorkerDispatchMessage
  ): Promise<LapicWorkerResultMessage>

  /**
   * Request all active workers to pause at the next safe point.
   * Returns pause acknowledgments from each worker.
   */
  requestPauseAll(
    sessionId: string
  ): Promise<readonly LapicWorkerPauseAckMessage[]>

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
