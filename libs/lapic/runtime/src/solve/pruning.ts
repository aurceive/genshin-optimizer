/**
 * Pruning utilities for the bounded exact solve executor.
 *
 * Provides subtree size calculation and pruning statistics tracking
 * for branch-and-bound integration.
 */

import type { LapicFrontierJoinPlan } from './join-plan'

// ---------------------------------------------------------------------------
// Subtree size
// ---------------------------------------------------------------------------

/**
 * Compute the number of leaf-level combinations in the subtree
 * rooted at the given `domainIndex`.
 *
 * This is the product of row counts for domains at `domainIndex`
 * and deeper.  Used to advance `currentFlatIndex` when pruning.
 */
export function computeSubtreeSize(
  joinPlan: LapicFrontierJoinPlan,
  domainIndex: number
): number {
  let size = 1
  for (let i = domainIndex; i < joinPlan.entries.length; i++) {
    size *= joinPlan.entries[i]!.rows.length
  }
  return size
}

// ---------------------------------------------------------------------------
// Pruning statistics
// ---------------------------------------------------------------------------

/**
 * Mutable statistics tracker for bound-based pruning.
 */
export interface LapicPruningStatistics {
  /** Number of bound evaluations performed. */
  boundEvaluationCount: number
  /** Number of leaf combinations pruned by bound checks. */
  prunedCombinationCount: number
  /** Number of subtrees (intermediate nodes) pruned. */
  prunedSubtreeCount: number
}

export function createPruningStatistics(): LapicPruningStatistics {
  return {
    boundEvaluationCount: 0,
    prunedCombinationCount: 0,
    prunedSubtreeCount: 0,
  }
}

/**
 * Snapshot of pruning statistics for checkpoint persistence.
 */
export interface LapicPruningStatisticsSnapshot {
  readonly boundEvaluationCount: number
  readonly prunedCombinationCount: number
  readonly prunedSubtreeCount: number
}

export function snapshotPruningStatistics(
  stats: LapicPruningStatistics
): LapicPruningStatisticsSnapshot {
  return {
    boundEvaluationCount: stats.boundEvaluationCount,
    prunedCombinationCount: stats.prunedCombinationCount,
    prunedSubtreeCount: stats.prunedSubtreeCount,
  }
}

export function restorePruningStatistics(
  snapshot: LapicPruningStatisticsSnapshot
): LapicPruningStatistics {
  return {
    boundEvaluationCount: snapshot.boundEvaluationCount,
    prunedCombinationCount: snapshot.prunedCombinationCount,
    prunedSubtreeCount: snapshot.prunedSubtreeCount,
  }
}