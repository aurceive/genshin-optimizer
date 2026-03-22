import {
  type LapicCandidateDescriptor,
  type LapicCanonicalProblem,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicFrontierJoinPlan } from '../solve/join-plan'
import {
  createInProcessCoordinatedSolve,
  mergeWorkerResults,
} from './coordinator'
import type {
  LapicWorkerResultEntry,
  LapicWorkerResultMessage,
} from './transport'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function candidate(
  candidateId: string,
  domainId: string,
  slotId: string
): LapicCandidateDescriptor {
  return {
    candidateId,
    sourceRecordDigest: candidateId,
    domainId,
    slotId,
    additiveFeatureDigest: `feature:${candidateId}`,
    discreteCounters: [],
    categoricalSignatureDigest: `cat:${candidateId}`,
    provenance: {
      slotId,
      sourceEntityId: 'test',
      sourceRecordDigests: [candidateId],
      exclusiveResourceClaims: [],
      concreteInventoryBacked: true,
      featureExtractionDigest: `feature:${candidateId}`,
    },
  }
}

function createProblem(config: {
  slotIds: string[]
  domains: Array<{
    domainId: string
    slotId: string
    candidates: LapicCandidateDescriptor[]
  }>
  topN?: number
}): LapicCanonicalProblem {
  return {
    problemId: 'coord-test',
    problemDigest: 'coord-digest',
    engineVersion: 'engine-version',
    arithmeticPolicyId: 'arith-policy',
    teamLayout: {
      teamKind: 'gi-single',
      slotCount: config.slotIds.length,
      slotIds: config.slotIds,
      slotRoleTaxonomy: config.slotIds.map(() => 'artifact'),
      slotRequirements: Object.fromEntries(
        config.slotIds.map((s) => [s, 'required'])
      ),
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: config.slotIds.map((slotId) => ({
      slotId,
      slotRole: `artifact-${slotId}`,
      participationMode: 'optimizedBuild',
      occupantDomainId: config.domains.find((d) => d.slotId === slotId)!
        .domainId,
      equipmentOwnershipModel: 'hard-reserved-inventory',
      contributesToObjective: true,
      contributesToConstraints: true,
      mayRemainEmpty: false,
    })),
    sharedTeamContext: {
      adapterSemanticMode: 'gi-legacy-validated',
      aggregateFacts: {},
      metadata: {},
    },
    frameAxis: [],
    itemDomains: config.domains,
    compatibilityRules: [],
    objective: {
      objectiveId: 'objective-id',
      objectiveKind: 'single-slot',
      expressionDigest: 'objective-digest',
      targetSlotIds: config.slotIds,
      frameIds: [],
    },
    constraints: [],
    topN: config.topN ?? 1,
    orderingPolicy: {
      tieBreakDimensions: ['value'],
      canonicalCandidateOrdering: ['value'],
    },
    auxiliaryOutputs: [],
    adapterMetadata: {
      adapterKind: 'gi-wr',
      adapterVersion: '0.1.0-draft',
      sourceSnapshotDigests: ['snapshot-digest'],
      declaredUnsupportedFeatures: [],
      metadata: {},
    },
    provenance: {
      teamLayoutDigest: 'team-layout-digest',
      sharedTeamContextDigest: 'shared-context-digest',
      crossSlotRuleDescriptorVersion: '0.1.0-draft',
      compatibilitySignatureSchemaVersion: '0.1.0-draft',
      slotProvenance: [],
    },
  }
}

function makeJoinPlan(
  problem: LapicCanonicalProblem,
  rowCounts: number[]
): LapicFrontierJoinPlan {
  const entries = rowCounts.map((count, i) => ({
    slotId: problem.teamLayout.slotIds[i]!,
    blockIds: [`block-${i}`],
    groupDigests: [`digest-${i}`],
    rows: Array.from({ length: count }, (_, j) => ({
      row: {
        stateId: `state-${i}-${j}`,
        slotId: problem.teamLayout.slotIds[i]!,
        candidateId: `cand-${i}-${j}`,
        rowDigest: `row-${i}-${j}`,
        occupiedSlotMask: 1 << i,
        scoreContribution: `${j}`,
        additiveFeatureDigest: `feature-${i}-${j}`,
        categoricalSignatureDigest: `cat-${i}-${j}`,
      },
      candidate: candidate(
        `cand-${i}-${j}`,
        `domain-${i}`,
        problem.teamLayout.slotIds[i]!
      ),
    })),
  }))
  return {
    entries,
    totalCombinationCount: rowCounts.reduce((p, c) => p * c, 1),
  }
}

/**
 * A simple evaluator: the objective value is the sum of candidate numeric indices.
 * E.g., cand-0-2 + cand-1-3 → 2 + 3 = 5, formatted as "0005.0000".
 */
function numericEvaluator(combination: {
  candidates: readonly LapicCandidateDescriptor[]
}) {
  let sum = 0
  for (const c of combination.candidates) {
    const parts = c.candidateId.split('-')
    sum += parseInt(parts[parts.length - 1]!, 10)
  }
  const formatted = sum.toFixed(4).padStart(12, '0')
  return createLapicSuccessResult({
    objectiveValue: formatted,
    evidenceDigest: `eval:${formatted}`,
    orderingKey: [formatted],
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mergeWorkerResults', () => {
  it('merges and deduplicates entries from multiple workers', () => {
    const results: LapicWorkerResultMessage[] = [
      {
        tag: 'WorkComplete',
        sessionId: 's1',
        partitionIndex: 0,
        topCandidates: [
          {
            stateId: 'A',
            candidates: [],
            evaluation: { objectiveValue: '10', evidenceDigest: 'a' },
          },
          {
            stateId: 'B',
            candidates: [],
            evaluation: { objectiveValue: '08', evidenceDigest: 'b' },
          },
        ],
        evaluatedCount: 5,
        visitedCount: 10,
      },
      {
        tag: 'WorkComplete',
        sessionId: 's1',
        partitionIndex: 1,
        topCandidates: [
          {
            stateId: 'C',
            candidates: [],
            evaluation: { objectiveValue: '12', evidenceDigest: 'c' },
          },
          {
            stateId: 'A',
            candidates: [],
            evaluation: { objectiveValue: '10', evidenceDigest: 'a' },
          },
        ],
        evaluatedCount: 5,
        visitedCount: 10,
      },
    ]

    const merged = mergeWorkerResults(results, 2)
    expect(merged).toHaveLength(2)
    expect(merged[0]!.stateId).toBe('C') // highest
    expect(merged[1]!.stateId).toBe('A') // second highest (deduplicated)
  })

  it('returns empty array when no workers have results', () => {
    const merged = mergeWorkerResults([], 5)
    expect(merged).toHaveLength(0)
  })
})

describe('createInProcessCoordinatedSolve', () => {
  const slotIds = ['slot-0', 'slot-1']
  const domains = slotIds.map((slotId, i) => ({
    domainId: `domain-${i}`,
    slotId,
    candidates: Array.from({ length: 4 }, (_, j) =>
      candidate(`cand-${i}-${j}`, `domain-${i}`, slotId)
    ),
  }))
  const problem = createProblem({ slotIds, domains, topN: 3 })
  const joinPlan = makeJoinPlan(problem, [4, 4])

  it('produces correct top-N with a single worker', async () => {
    const result = await createInProcessCoordinatedSolve({
      problem,
      joinPlan,
      evaluateCombination: numericEvaluator,
      partitionConfig: { workerCount: 1 },
      topN: 3,
    })

    expect(result.workerCount).toBe(1)
    expect(result.topCandidates).toHaveLength(3)
    // Best combo: cand-0-3 + cand-1-3 = 6
    expect(result.topCandidates[0]!.evaluation.objectiveValue).toBe(
      '0000006.0000'
    )
  })

  it('produces identical results with different worker counts (determinism invariant)', async () => {
    const results: (typeof undefined)[] &
      { topCandidates?: readonly LapicWorkerResultEntry[] }[] = []

    for (const wc of [1, 2, 3, 4, 8, 16]) {
      const result = await createInProcessCoordinatedSolve({
        problem,
        joinPlan,
        evaluateCombination: numericEvaluator,
        partitionConfig: { workerCount: wc },
        topN: 3,
      })
      results.push(result as any)
    }

    // All results must have the same top candidates
    const reference = results[0] as any
    for (let i = 1; i < results.length; i++) {
      const current = results[i] as any
      expect(current.topCandidates).toHaveLength(reference.topCandidates.length)
      for (let j = 0; j < reference.topCandidates.length; j++) {
        expect(current.topCandidates[j].stateId).toBe(
          reference.topCandidates[j].stateId
        )
        expect(current.topCandidates[j].evaluation.objectiveValue).toBe(
          reference.topCandidates[j].evaluation.objectiveValue
        )
      }
    }
  })

  it('handles empty join plan', async () => {
    const result = await createInProcessCoordinatedSolve({
      problem,
      joinPlan: { entries: [], totalCombinationCount: 0 },
      evaluateCombination: numericEvaluator,
      partitionConfig: { workerCount: 4 },
      topN: 3,
    })

    expect(result.workerCount).toBe(0)
    expect(result.topCandidates).toHaveLength(0)
    expect(result.totalEvaluatedCount).toBe(0)
  })

  it('calls onPartitionComplete for each partition', async () => {
    const calls: Array<[number, number]> = []
    await createInProcessCoordinatedSolve({
      problem,
      joinPlan,
      evaluateCombination: numericEvaluator,
      partitionConfig: { workerCount: 4 },
      topN: 3,
      onPartitionComplete: (idx, total) => calls.push([idx, total]),
    })

    expect(calls).toHaveLength(4)
    expect(calls.map(([idx]) => idx)).toEqual([0, 1, 2, 3])
    for (const [, total] of calls) {
      expect(total).toBe(4)
    }
  })

  it('counts all evaluated and visited combinations', async () => {
    const result = await createInProcessCoordinatedSolve({
      problem,
      joinPlan,
      evaluateCombination: numericEvaluator,
      partitionConfig: { workerCount: 2 },
      topN: 3,
    })

    expect(result.totalVisitedCount).toBe(16) // 4 × 4
    expect(result.totalEvaluatedCount).toBe(16) // no feasibility filter
  })

  it('respects feasibility filter', async () => {
    const result = await createInProcessCoordinatedSolve({
      problem,
      joinPlan,
      evaluateCombination: numericEvaluator,
      isCombinationFeasible: (combo) => {
        // Only allow combinations where first candidate index is even
        const idx = parseInt(
          combo.candidates[0]!.candidateId.split('-')[2]!,
          10
        )
        return idx % 2 === 0
      },
      partitionConfig: { workerCount: 3 },
      topN: 3,
    })

    // Only cand-0-0 and cand-0-2 pass feasibility → 2 × 4 = 8 evaluated
    expect(result.totalEvaluatedCount).toBe(8)
    // Top entry: cand-0-2 + cand-1-3 = 5
    expect(result.topCandidates[0]!.evaluation.objectiveValue).toBe(
      '0000005.0000'
    )
  })

  it('produces stable results across 3×3×3 domain with various worker counts', async () => {
    const slotIds3 = ['s0', 's1', 's2']
    const domains3 = slotIds3.map((slotId, i) => ({
      domainId: `d-${i}`,
      slotId,
      candidates: Array.from({ length: 3 }, (_, j) =>
        candidate(`c-${i}-${j}`, `d-${i}`, slotId)
      ),
    }))
    const problem3 = createProblem({
      slotIds: slotIds3,
      domains: domains3,
      topN: 5,
    })
    const joinPlan3 = makeJoinPlan(problem3, [3, 3, 3])

    const singleWorker = await createInProcessCoordinatedSolve({
      problem: problem3,
      joinPlan: joinPlan3,
      evaluateCombination: numericEvaluator,
      partitionConfig: { workerCount: 1 },
      topN: 5,
    })

    for (const wc of [2, 3, 5, 9, 27]) {
      const result = await createInProcessCoordinatedSolve({
        problem: problem3,
        joinPlan: joinPlan3,
        evaluateCombination: numericEvaluator,
        partitionConfig: { workerCount: wc },
        topN: 5,
      })

      expect(result.topCandidates).toHaveLength(
        singleWorker.topCandidates.length
      )
      for (let j = 0; j < singleWorker.topCandidates.length; j++) {
        expect(result.topCandidates[j]!.stateId).toBe(
          singleWorker.topCandidates[j]!.stateId
        )
        expect(result.topCandidates[j]!.evaluation.objectiveValue).toBe(
          singleWorker.topCandidates[j]!.evaluation.objectiveValue
        )
      }
    }
  })
})
