/**
 * Domain-level join-plan partitioner.
 *
 * Splits a join plan by distributing the outermost domain's rows
 * across partitions. Each partition receives a sub-join-plan that
 * covers a disjoint subset of the first domain while keeping all
 * other domains intact. This approach is natural for the recursive
 * tree-traversal executor: each partition explores a subtree rooted
 * at its assigned first-domain rows, preserving branch-and-bound
 * pruning within each partition.
 */

import type { LapicFrontierJoinPlan } from '../solve/join-plan'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LapicDomainPartition {
  readonly partitionIndex: number
  readonly joinPlan: LapicFrontierJoinPlan
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Partition a join plan by splitting the first domain's rows.
 *
 * The result is an array of sub-join-plans where:
 * - Each sub-plan has a subset of `entries[0].rows`
 * - All subsequent entries are shared unchanged
 * - The union of all sub-plans covers the full join plan exactly once
 * - `totalCombinationCount` is updated per partition
 *
 * When `partitionCount` exceeds the first domain's row count,
 * the effective partition count is clamped (no empty partitions).
 *
 * @param joinPlan - The full join plan to partition.
 * @param partitionCount - Desired number of partitions (>= 1).
 */
export function createDomainPartitionedJoinPlans(
  joinPlan: LapicFrontierJoinPlan,
  partitionCount: number
): readonly LapicDomainPartition[] {
  if (partitionCount < 1) throw new Error('partitionCount must be >= 1')

  if (joinPlan.entries.length === 0) return []

  const firstEntry = joinPlan.entries[0]!
  const rowCount = firstEntry.rows.length
  if (rowCount === 0) return []

  const effectiveCount = Math.min(partitionCount, rowCount)

  // Compute per-row combination multiplier (product of subsequent domain sizes)
  const tailMultiplier = joinPlan.entries
    .slice(1)
    .reduce((product, entry) => product * entry.rows.length, 1)

  const baseSize = Math.floor(rowCount / effectiveCount)
  const remainder = rowCount - baseSize * effectiveCount

  const partitions: LapicDomainPartition[] = []
  let cursor = 0

  for (let i = 0; i < effectiveCount; i++) {
    const size = baseSize + (i < remainder ? 1 : 0)
    const partitionRows = firstEntry.rows.slice(cursor, cursor + size)

    partitions.push({
      partitionIndex: i,
      joinPlan: {
        entries: [
          {
            slotId: firstEntry.slotId,
            blockIds: firstEntry.blockIds,
            groupDigests: firstEntry.groupDigests,
            rows: partitionRows,
          },
          ...joinPlan.entries.slice(1),
        ],
        totalCombinationCount: partitionRows.length * tailMultiplier,
      },
    })

    cursor += size
  }

  return partitions
}
