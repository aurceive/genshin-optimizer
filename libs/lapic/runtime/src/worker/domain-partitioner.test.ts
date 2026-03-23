import type { LapicFrontierJoinPlan } from '../solve/join-plan'
import { createDomainPartitionedJoinPlans } from './domain-partitioner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJoinPlan(rowCounts: number[]): LapicFrontierJoinPlan {
  const entries = rowCounts.map((count, i) => ({
    slotId: `slot-${i}`,
    blockIds: [`block-${i}`],
    groupDigests: [`digest-${i}`],
    rows: Array.from({ length: count }, (_, j) => ({
      row: {
        stateId: `state-${i}-${j}`,
        slotId: `slot-${i}`,
        candidateId: `cand-${i}-${j}`,
        rowDigest: `row-${i}-${j}`,
        occupiedSlotMask: 1 << i,
        scoreContribution: `${j}`,
        additiveFeatureDigest: `feature-${i}-${j}`,
        categoricalSignatureDigest: `cat-${i}-${j}`,
      },
      candidate: {
        candidateId: `cand-${i}-${j}`,
        sourceRecordDigest: `cand-${i}-${j}`,
        domainId: `domain-${i}`,
        slotId: `slot-${i}`,
        additiveFeatureDigest: `feature-${i}-${j}`,
        discreteCounters: [],
        categoricalSignatureDigest: `cat-${i}-${j}`,
        provenance: {
          slotId: `slot-${i}`,
          sourceEntityId: 'test',
          sourceRecordDigests: [`cand-${i}-${j}`],
          exclusiveResourceClaims: [],
          concreteInventoryBacked: true,
          featureExtractionDigest: `feature-${i}-${j}`,
        },
      },
    })),
  }))
  return {
    entries,
    totalCombinationCount: rowCounts.reduce((p, c) => p * c, 1),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createDomainPartitionedJoinPlans', () => {
  it('returns a single partition when partitionCount is 1', () => {
    const plan = makeJoinPlan([6, 3])
    const partitions = createDomainPartitionedJoinPlans(plan, 1)

    expect(partitions).toHaveLength(1)
    expect(partitions[0]!.partitionIndex).toBe(0)
    expect(partitions[0]!.joinPlan.entries[0]!.rows).toHaveLength(6)
    expect(partitions[0]!.joinPlan.totalCombinationCount).toBe(18)
  })

  it('evenly splits first domain rows', () => {
    const plan = makeJoinPlan([6, 3])
    const partitions = createDomainPartitionedJoinPlans(plan, 3)

    expect(partitions).toHaveLength(3)
    for (const p of partitions) {
      expect(p.joinPlan.entries[0]!.rows).toHaveLength(2) // 6 / 3 = 2
      expect(p.joinPlan.entries[1]!.rows).toHaveLength(3) // unchanged
      expect(p.joinPlan.totalCombinationCount).toBe(6) // 2 * 3
    }
  })

  it('handles uneven split with remainder', () => {
    const plan = makeJoinPlan([7, 2])
    const partitions = createDomainPartitionedJoinPlans(plan, 3)

    expect(partitions).toHaveLength(3)
    // 7 / 3: base=2, remainder=1 → sizes: 3, 2, 2
    const rowCounts = partitions.map((p) => p.joinPlan.entries[0]!.rows.length)
    expect(rowCounts).toEqual([3, 2, 2])
    // Total combination count must sum to the original
    const totalCombos = partitions.reduce(
      (s, p) => s + p.joinPlan.totalCombinationCount,
      0
    )
    expect(totalCombos).toBe(14) // 7 * 2
  })

  it('clamps partition count when more than rows', () => {
    const plan = makeJoinPlan([3, 5])
    const partitions = createDomainPartitionedJoinPlans(plan, 10)

    expect(partitions).toHaveLength(3) // clamped to row count
    for (const p of partitions) {
      expect(p.joinPlan.entries[0]!.rows).toHaveLength(1) // 1 row each
      expect(p.joinPlan.totalCombinationCount).toBe(5) // 1 * 5
    }
  })

  it('returns empty array for empty entries', () => {
    const plan: LapicFrontierJoinPlan = {
      entries: [],
      totalCombinationCount: 0,
    }
    const partitions = createDomainPartitionedJoinPlans(plan, 4)
    expect(partitions).toHaveLength(0)
  })

  it('returns empty array when first domain has no rows', () => {
    const plan = makeJoinPlan([0, 5])
    const partitions = createDomainPartitionedJoinPlans(plan, 4)
    expect(partitions).toHaveLength(0)
  })

  it('preserves row identity across partitions', () => {
    const plan = makeJoinPlan([4, 2])
    const partitions = createDomainPartitionedJoinPlans(plan, 2)

    // All first-domain rows from all partitions should cover the originals
    const allRowIds = partitions.flatMap((p) =>
      p.joinPlan.entries[0]!.rows.map((r) => r.row.stateId)
    )
    const expectedIds = plan.entries[0]!.rows.map((r) => r.row.stateId)
    expect(allRowIds).toEqual(expectedIds)
  })

  it('partitions have contiguous indices starting at 0', () => {
    const plan = makeJoinPlan([8, 3])
    const partitions = createDomainPartitionedJoinPlans(plan, 4)

    expect(partitions.map((p) => p.partitionIndex)).toEqual([0, 1, 2, 3])
  })

  it('all subsequent domain entries are shared unchanged', () => {
    const plan = makeJoinPlan([4, 3, 2])
    const partitions = createDomainPartitionedJoinPlans(plan, 2)

    for (const p of partitions) {
      // entries[1] and entries[2] should be unchanged
      expect(p.joinPlan.entries[1]!.rows).toHaveLength(3)
      expect(p.joinPlan.entries[2]!.rows).toHaveLength(2)
      expect(p.joinPlan.entries[1]!.slotId).toBe('slot-1')
      expect(p.joinPlan.entries[2]!.slotId).toBe('slot-2')
    }
  })

  it('throws on partitionCount < 1', () => {
    const plan = makeJoinPlan([4, 2])
    expect(() => createDomainPartitionedJoinPlans(plan, 0)).toThrow()
    expect(() => createDomainPartitionedJoinPlans(plan, -1)).toThrow()
  })
})
