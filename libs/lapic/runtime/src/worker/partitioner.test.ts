import type { LapicFrontierJoinPlan } from '../solve/join-plan'
import {
  createWorkerPartitionPlan,
  decodeFlatIndex,
  encodeFlatIndex,
  validatePartitionPlanCoverage,
} from './partitioner'

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
        sourceRecordDigest: `src-${i}-${j}`,
        domainId: `domain-${i}`,
        slotId: `slot-${i}`,
        additiveFeatureDigest: `feature-${i}-${j}`,
        discreteCounters: [],
        categoricalSignatureDigest: `cat-${i}-${j}`,
        provenance: {
          slotId: `slot-${i}`,
          sourceEntityId: 'test',
          sourceRecordDigests: [`src-${i}-${j}`],
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

describe('createWorkerPartitionPlan', () => {
  it('creates a single partition for workerCount=1', () => {
    const plan = createWorkerPartitionPlan(makeJoinPlan([3, 4]), { workerCount: 1 })
    expect(plan.workerCount).toBe(1)
    expect(plan.totalCombinationCount).toBe(12)
    expect(plan.partitions).toHaveLength(1)
    expect(plan.partitions[0]!.startFlatIndex).toBe(0)
    expect(plan.partitions[0]!.endFlatIndex).toBe(12)
    expect(plan.partitions[0]!.combinationCount).toBe(12)
  })

  it('balances partitions evenly when divisible', () => {
    const plan = createWorkerPartitionPlan(makeJoinPlan([3, 4]), { workerCount: 4 })
    expect(plan.workerCount).toBe(4)
    expect(plan.partitions).toHaveLength(4)
    for (const p of plan.partitions) {
      expect(p.combinationCount).toBe(3)
    }
  })

  it('distributes remainder to first partitions', () => {
    const plan = createWorkerPartitionPlan(makeJoinPlan([5, 2]), { workerCount: 3 })
    expect(plan.workerCount).toBe(3)
    expect(plan.partitions).toHaveLength(3)
    // 10 / 3 = 3 remainder 1 → first partition gets 4, others get 3
    expect(plan.partitions[0]!.combinationCount).toBe(4)
    expect(plan.partitions[1]!.combinationCount).toBe(3)
    expect(plan.partitions[2]!.combinationCount).toBe(3)
  })

  it('clamps workerCount to totalCombinationCount', () => {
    const plan = createWorkerPartitionPlan(makeJoinPlan([2, 2]), { workerCount: 100 })
    expect(plan.workerCount).toBe(4) // 4 combinations total
    expect(plan.partitions).toHaveLength(4)
    for (const p of plan.partitions) {
      expect(p.combinationCount).toBe(1)
    }
  })

  it('returns empty plan for zero-combination join plan', () => {
    const plan = createWorkerPartitionPlan(
      { entries: [], totalCombinationCount: 0 },
      { workerCount: 4 }
    )
    expect(plan.workerCount).toBe(0)
    expect(plan.partitions).toHaveLength(0)
  })

  it('throws on workerCount < 1', () => {
    expect(() =>
      createWorkerPartitionPlan(makeJoinPlan([3, 4]), { workerCount: 0 })
    ).toThrow('workerCount must be >= 1')
  })

  it('respects minCombinationsPerPartition', () => {
    // 12 combinations, 4 workers, min 5 per partition → 2 effective workers
    const plan = createWorkerPartitionPlan(makeJoinPlan([3, 4]), {
      workerCount: 4,
      minCombinationsPerPartition: 5,
    })
    expect(plan.workerCount).toBe(2)
    expect(plan.partitions).toHaveLength(2)
    expect(plan.partitions[0]!.combinationCount).toBe(6)
    expect(plan.partitions[1]!.combinationCount).toBe(6)
  })
})

describe('validatePartitionPlanCoverage', () => {
  it('validates a correct plan', () => {
    const plan = createWorkerPartitionPlan(makeJoinPlan([3, 4]), { workerCount: 3 })
    expect(validatePartitionPlanCoverage(plan)).toBe(true)
  })

  it('validates an empty plan', () => {
    expect(
      validatePartitionPlanCoverage({
        workerCount: 0,
        totalCombinationCount: 0,
        partitions: [],
      })
    ).toBe(true)
  })

  it('rejects a plan with gaps', () => {
    expect(
      validatePartitionPlanCoverage({
        workerCount: 2,
        totalCombinationCount: 10,
        partitions: [
          { partitionIndex: 0, startFlatIndex: 0, endFlatIndex: 4, combinationCount: 4 },
          { partitionIndex: 1, startFlatIndex: 6, endFlatIndex: 10, combinationCount: 4 },
        ],
      })
    ).toBe(false)
  })
})

describe('decodeFlatIndex / encodeFlatIndex roundtrip', () => {
  it('encodes and decodes correctly for a 3×4 plan', () => {
    const plan = makeJoinPlan([3, 4])
    for (let i = 0; i < 12; i++) {
      const indices = decodeFlatIndex(plan, i)
      expect(indices).toHaveLength(2)
      expect(indices[0]).toBeLessThan(3)
      expect(indices[1]).toBeLessThan(4)
      expect(encodeFlatIndex(plan, indices)).toBe(i)
    }
  })

  it('handles single-domain plan', () => {
    const plan = makeJoinPlan([7])
    for (let i = 0; i < 7; i++) {
      const indices = decodeFlatIndex(plan, i)
      expect(indices).toEqual([i])
      expect(encodeFlatIndex(plan, indices)).toBe(i)
    }
  })

  it('handles triple-domain plan', () => {
    const plan = makeJoinPlan([2, 3, 5])
    const total = 2 * 3 * 5
    const seen = new Set<string>()
    for (let i = 0; i < total; i++) {
      const indices = decodeFlatIndex(plan, i)
      expect(indices).toHaveLength(3)
      const key = indices.join(',')
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      expect(encodeFlatIndex(plan, indices)).toBe(i)
    }
    expect(seen.size).toBe(total)
  })
})
