/**
 * Types for the lapic work scheduler.
 *
 * The scheduler manages a deterministic priority queue of work units
 * and tracks their lifecycle from enqueued → dispatched → completed/failed.
 */

import type {
  LapicPriorityDescriptor,
  LapicWorkUnitEnvelope,
  LapicWorkUnitKind,
} from '../types'

// ---------------------------------------------------------------------------
// Queue item lifecycle
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of a scheduled work unit.
 */
export type LapicScheduledWorkStatus =
  | 'queued'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'cancelled'

/**
 * A work unit wrapped with scheduling metadata.
 */
export interface LapicScheduledWorkItem {
  readonly workUnit: LapicWorkUnitEnvelope
  readonly status: LapicScheduledWorkStatus
  readonly enqueuedAtSequence: number
  readonly dispatchedAtSequence?: number
  readonly completedAtSequence?: number
}

// ---------------------------------------------------------------------------
// Scheduler events
// ---------------------------------------------------------------------------

/**
 * Events emitted by the scheduler for observability.
 */
export type LapicSchedulerEventKind =
  | 'enqueued'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'reprioritized'

export interface LapicSchedulerEvent {
  readonly kind: LapicSchedulerEventKind
  readonly workUnitId: string
  readonly workUnitKind: LapicWorkUnitKind
  readonly sequence: number
}

// ---------------------------------------------------------------------------
// Scheduler statistics
// ---------------------------------------------------------------------------

export interface LapicSchedulerStatistics {
  readonly totalEnqueued: number
  readonly totalDispatched: number
  readonly totalCompleted: number
  readonly totalFailed: number
  readonly totalCancelled: number
  readonly currentQueueDepth: number
  readonly currentInFlight: number
}

// ---------------------------------------------------------------------------
// Priority comparison
// ---------------------------------------------------------------------------

/**
 * Compare two priority descriptors for deterministic ordering.
 *
 * Order of comparison (highest priority first):
 * 1. upperBoundOrderingDigest (descending — higher bound = higher priority)
 * 2. uncertaintyGapDigest (descending — larger gap = more uncertain = explore first)
 * 3. residualCostDigest (ascending — lower cost = higher priority)
 * 4. deterministicTieBreakDigest (ascending — lexicographic tie-break)
 *
 * Returns negative if `a` has higher priority than `b`.
 */
export function comparePriorityDescriptors(
  a: LapicPriorityDescriptor,
  b: LapicPriorityDescriptor
): number {
  // 1. Higher upper bound = higher priority (descending)
  if (a.upperBoundOrderingDigest > b.upperBoundOrderingDigest) return -1
  if (a.upperBoundOrderingDigest < b.upperBoundOrderingDigest) return 1

  // 2. Larger uncertainty gap = higher priority (descending)
  if (a.uncertaintyGapDigest > b.uncertaintyGapDigest) return -1
  if (a.uncertaintyGapDigest < b.uncertaintyGapDigest) return 1

  // 3. Lower residual cost = higher priority (ascending)
  if (a.residualCostDigest < b.residualCostDigest) return -1
  if (a.residualCostDigest > b.residualCostDigest) return 1

  // 4. Deterministic tie-break (ascending)
  if (a.deterministicTieBreakDigest < b.deterministicTieBreakDigest) return -1
  if (a.deterministicTieBreakDigest > b.deterministicTieBreakDigest) return 1

  return 0
}
