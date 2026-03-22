/**
 * Work partitioner for multi-worker join search.
 *
 * Splits the flat-index range of a join plan's Cartesian product
 * into balanced partitions that can be dispatched to independent
 * workers. Guarantees every combination is covered exactly once
 * (no gaps, no overlaps) and that the union of partitions produces
 * deterministic results independent of worker count.
 */

import type { LapicFrontierJoinPlan } from '../solve/join-plan'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A contiguous range of flat indices [startFlatIndex, endFlatIndex).
 * The worker assigned this partition processes combinations whose
 * flat ordinal falls within this half-open interval.
 */
export interface LapicWorkerPartition {
  readonly partitionIndex: number
  readonly startFlatIndex: number
  readonly endFlatIndex: number
  readonly combinationCount: number
}

/**
 * Complete partitioning of a join plan across N workers.
 */
export interface LapicWorkerPartitionPlan {
  readonly workerCount: number
  readonly totalCombinationCount: number
  readonly partitions: readonly LapicWorkerPartition[]
}

/**
 * Configuration for partition generation.
 */
export interface LapicPartitionConfig {
  /** Number of workers to partition across. Must be >= 1. */
  readonly workerCount: number
  /**
   * Optional minimum combinations per partition.
   * Partitions with fewer combinations are merged into neighbours.
   * Default: 1.
   */
  readonly minCombinationsPerPartition?: number
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a balanced partition plan for the given join plan.
 *
 * Strategy: divide `totalCombinationCount` into `workerCount` partitions
 * as evenly as possible. Remainder combinations are distributed one-per-worker
 * to the first `remainder` partitions (largest-first balancing).
 *
 * When `workerCount` exceeds `totalCombinationCount`, the effective worker
 * count is clamped to `totalCombinationCount` (no empty partitions).
 */
export function createWorkerPartitionPlan(
  joinPlan: LapicFrontierJoinPlan,
  config: LapicPartitionConfig
): LapicWorkerPartitionPlan {
  const total = joinPlan.totalCombinationCount
  if (config.workerCount < 1) throw new Error('workerCount must be >= 1')
  if (total === 0)
    return { workerCount: 0, totalCombinationCount: 0, partitions: [] }

  const minPerPartition = config.minCombinationsPerPartition ?? 1
  const effectiveWorkerCount = Math.min(
    config.workerCount,
    Math.max(1, Math.floor(total / Math.max(1, minPerPartition)))
  )

  const baseSize = Math.floor(total / effectiveWorkerCount)
  const remainder = total - baseSize * effectiveWorkerCount

  const partitions: LapicWorkerPartition[] = []
  let cursor = 0

  for (let i = 0; i < effectiveWorkerCount; i++) {
    const size = baseSize + (i < remainder ? 1 : 0)
    partitions.push({
      partitionIndex: i,
      startFlatIndex: cursor,
      endFlatIndex: cursor + size,
      combinationCount: size,
    })
    cursor += size
  }

  return {
    workerCount: effectiveWorkerCount,
    totalCombinationCount: total,
    partitions,
  }
}

/**
 * Validate that a partition plan covers the full combination space
 * without gaps or overlaps.
 */
export function validatePartitionPlanCoverage(
  plan: LapicWorkerPartitionPlan
): boolean {
  if (plan.partitions.length === 0) return plan.totalCombinationCount === 0

  let covered = 0
  let expectedStart = 0

  for (const partition of plan.partitions) {
    if (partition.startFlatIndex !== expectedStart) return false
    if (partition.endFlatIndex <= partition.startFlatIndex) return false
    if (
      partition.combinationCount !==
      partition.endFlatIndex - partition.startFlatIndex
    )
      return false
    covered += partition.combinationCount
    expectedStart = partition.endFlatIndex
  }

  return covered === plan.totalCombinationCount
}

/**
 * Decode a flat index into per-domain row indices for the join plan.
 * This allows a worker to reconstruct the candidate combination
 * at any flat ordinal without enumerating all preceding combinations.
 */
export function decodeFlatIndex(
  joinPlan: LapicFrontierJoinPlan,
  flatIndex: number
): readonly number[] {
  const domainCount = joinPlan.entries.length
  const indices: number[] = new Array(domainCount)
  let remaining = flatIndex

  for (let d = domainCount - 1; d >= 0; d--) {
    const rowCount = joinPlan.entries[d]!.rows.length
    indices[d] = remaining % rowCount
    remaining = Math.floor(remaining / rowCount)
  }

  return indices
}

/**
 * Encode per-domain row indices back into a flat index.
 */
export function encodeFlatIndex(
  joinPlan: LapicFrontierJoinPlan,
  domainIndices: readonly number[]
): number {
  let flatIndex = 0
  let multiplier = 1

  for (let d = joinPlan.entries.length - 1; d >= 0; d--) {
    flatIndex += domainIndices[d]! * multiplier
    multiplier *= joinPlan.entries[d]!.rows.length
  }

  return flatIndex
}
