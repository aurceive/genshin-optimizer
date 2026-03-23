/**
 * Tests for Runtime Join Executor (§5.3–5.4)
 */

import type {
  LapicCandidateDescriptor,
  LapicCompatibilitySignature,
  LapicFrameAxisIdentity,
} from '@genshin-optimizer/lapic/core'
import { executeJoinPhase } from './join-executor'
import type { LapicTeamCombinationEvaluation } from './join-executor'
import type {
  LapicFrontierJoinPlan,
  LapicFrontierJoinPlanRow,
} from './join-plan'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FRAME_AXIS: LapicFrameAxisIdentity = {
  axisKind: 'implicit-single',
  frameIds: [],
}

function makeCandidate(id: string, slotId: string): LapicCandidateDescriptor {
  return {
    candidateId: id,
    sourceRecordDigest: id,
    domainId: `domain-${slotId}`,
    slotId,
    additiveFeatureDigest: `feat-${id}`,
    discreteCounters: [],
    categoricalSignatureDigest: `cat-${id}`,
    provenance: {
      slotId,
      sourceEntityId: 'test',
      sourceRecordDigests: [id],
      exclusiveResourceClaims: [],
      concreteInventoryBacked: false,
      featureExtractionDigest: `feat-${id}`,
    },
  }
}

function makeRow(
  candidateId: string,
  slotId: string
): LapicFrontierJoinPlanRow {
  return {
    row: {
      rowDigest: `digest-${candidateId}`,
      slotId,
      candidateId,
      blockId: 'block-0',
      objectiveValue: '0',
      sortKey: candidateId,
    },
    candidate: makeCandidate(candidateId, slotId),
  }
}

function makePlan(
  slots: { slotId: string; candidates: string[] }[]
): LapicFrontierJoinPlan {
  return {
    entries: slots.map((s) => ({
      slotId: s.slotId,
      blockIds: ['block-0'],
      groupDigests: ['group-0'],
      rows: s.candidates.map((c) => makeRow(c, s.slotId)),
    })),
    totalCombinationCount: slots.reduce((p, s) => p * s.candidates.length, 1),
  }
}

function makeSignature(
  slotMask: number,
  overrides?: Partial<LapicCompatibilitySignature>
): LapicCompatibilitySignature {
  return {
    schemaVersion: '0.1.0-draft',
    occupiedSlotMask: slotMask,
    actorUniquenessClaims: [],
    exclusiveResourceClaims: [],
    aggregateCounts: [],
    remainingAggregateObligations: [],
    providedCapabilityFacts: [],
    remainingRequiredCapabilityFacts: [],
    branchCompatibilityToggles: [],
    frameAxisIdentity: FRAME_AXIS,
    adapterSemanticMode: 'gi-test',
    ...overrides,
  }
}

function sumEvaluator(
  candidates: readonly LapicCandidateDescriptor[]
): LapicTeamCombinationEvaluation {
  // Simple sum of candidate ID numeric suffixes
  const value = candidates.reduce((sum, c) => {
    const num = Number.parseInt(c.candidateId.replace(/\D/g, ''), 10)
    return sum + (Number.isNaN(num) ? 0 : num)
  }, 0)
  return { objectiveValue: value }
}

// ---------------------------------------------------------------------------
// Basic execution
// ---------------------------------------------------------------------------

describe('executeJoinPhase — basic', () => {
  test('2-slot join: 3×3 candidates → 9 combinations explored', () => {
    const plan = makePlan([
      { slotId: 'slot-0', candidates: ['a1', 'a2', 'a3'] },
      { slotId: 'slot-1', candidates: ['b1', 'b2', 'b3'] },
    ])

    const result = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 20,
    })

    expect(result.stats.totalCombinationsExplored).toBe(9)
    expect(result.stats.legalCombinations).toBe(9)
    expect(result.results).toHaveLength(9)
  })

  test('top-N: request 3, produce exactly 3', () => {
    const plan = makePlan([
      { slotId: 'slot-0', candidates: ['a1', 'a2', 'a3'] },
      { slotId: 'slot-1', candidates: ['b1', 'b2', 'b3'] },
    ])

    const result = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 3,
    })

    expect(result.results).toHaveLength(3)
    // Best combinations should be those with highest sum
    expect(result.results[0].objectiveValue).toBeGreaterThanOrEqual(
      result.results[1].objectiveValue
    )
    expect(result.results[1].objectiveValue).toBeGreaterThanOrEqual(
      result.results[2].objectiveValue
    )
  })

  test('4-slot join: simple team with no conflicts → all legal', () => {
    const plan = makePlan([
      { slotId: 'slot-0', candidates: ['a1', 'a2'] },
      { slotId: 'slot-1', candidates: ['b1', 'b2'] },
      { slotId: 'slot-2', candidates: ['c1', 'c2'] },
      { slotId: 'slot-3', candidates: ['d1', 'd2'] },
    ])

    const result = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 50,
    })

    expect(result.stats.totalCombinationsExplored).toBe(16)
    expect(result.stats.legalCombinations).toBe(16)
    expect(result.stats.illegalCombinations).toBe(0)
  })

  test('empty plan → empty results', () => {
    const plan: LapicFrontierJoinPlan = {
      entries: [],
      totalCombinationCount: 0,
    }

    const result = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 10,
    })

    expect(result.results).toHaveLength(0)
    expect(result.stats.totalCombinationsExplored).toBe(0)
  })

  test('single slot → each row is a result', () => {
    const plan = makePlan([
      { slotId: 'slot-0', candidates: ['a1', 'a2', 'a3'] },
    ])

    const result = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 10,
    })

    expect(result.results).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// Legality filtering
// ---------------------------------------------------------------------------

describe('executeJoinPhase — legality filtering', () => {
  test('weapon conflict filtering reduces valid combinations', () => {
    const plan = makePlan([
      { slotId: 'slot-0', candidates: ['a1', 'a2'] },
      { slotId: 'slot-1', candidates: ['b1', 'b2'] },
    ])

    // a1 and b1 both claim the same weapon → conflict
    const sigMap: Record<string, LapicCompatibilitySignature> = {
      a1: makeSignature(1, {
        exclusiveResourceClaims: [
          {
            resourceKind: 'gi:weapon',
            resourceId: 'shared-weapon',
            claimedBySlotId: 'slot-0',
            reservationClass: 'hardReserved',
          },
        ],
      }),
      a2: makeSignature(1),
      b1: makeSignature(2, {
        exclusiveResourceClaims: [
          {
            resourceKind: 'gi:weapon',
            resourceId: 'shared-weapon',
            claimedBySlotId: 'slot-1',
            reservationClass: 'hardReserved',
          },
        ],
      }),
      b2: makeSignature(2),
    }

    const result = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 10,
      getCompatibilitySignature: (row) => sigMap[row.candidate.candidateId],
    })

    // a1+b1 is illegal (weapon conflict), rest are legal
    expect(result.stats.illegalCombinations).toBe(1)
    expect(result.stats.legalCombinations).toBe(3)
  })

  test('character uniqueness conflict filtering', () => {
    const plan = makePlan([
      { slotId: 'slot-0', candidates: ['char-bennett-0'] },
      { slotId: 'slot-1', candidates: ['char-bennett-1'] },
    ])

    // Both claim Bennett in gi:character-identity family → conflict
    const sigMap: Record<string, LapicCompatibilitySignature> = {
      'char-bennett-0': makeSignature(1, {
        actorUniquenessClaims: [
          {
            actorId: 'Bennett',
            family: 'gi:character-identity',
            claimedBySlotId: 'slot-0',
          },
        ],
      }),
      'char-bennett-1': makeSignature(2, {
        actorUniquenessClaims: [
          {
            actorId: 'Bennett',
            family: 'gi:character-identity',
            claimedBySlotId: 'slot-1',
          },
        ],
      }),
    }

    const result = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 10,
      getCompatibilitySignature: (row) => sigMap[row.candidate.candidateId],
    })

    expect(result.stats.illegalCombinations).toBe(1)
    expect(result.stats.legalCombinations).toBe(0)
  })

  test('no signature extractor → all combinations treated as legal', () => {
    const plan = makePlan([
      { slotId: 'slot-0', candidates: ['a1'] },
      { slotId: 'slot-1', candidates: ['b1'] },
    ])

    const result = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 10,
      // No getCompatibilitySignature → skip legality checks
    })

    expect(result.stats.legalCombinations).toBe(1)
    expect(result.stats.illegalCombinations).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

describe('executeJoinPhase — ordering', () => {
  test('results are sorted by descending objective', () => {
    const plan = makePlan([
      { slotId: 'slot-0', candidates: ['a10', 'a20', 'a30'] },
    ])

    const result = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 10,
    })

    expect(result.results[0].objectiveValue).toBe(30)
    expect(result.results[1].objectiveValue).toBe(20)
    expect(result.results[2].objectiveValue).toBe(10)
  })

  test('ordering is deterministic across runs', () => {
    const plan = makePlan([
      { slotId: 'slot-0', candidates: ['a1', 'a2'] },
      { slotId: 'slot-1', candidates: ['b1', 'b2'] },
    ])

    const r1 = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 10,
    })

    const r2 = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 10,
    })

    expect(r1.results.map((r) => r.slotCandidateIds)).toEqual(
      r2.results.map((r) => r.slotCandidateIds)
    )
  })
})

// ---------------------------------------------------------------------------
// Evaluation failures
// ---------------------------------------------------------------------------

describe('executeJoinPhase — evaluation failures', () => {
  test('evaluation returning undefined increments failure count', () => {
    const plan = makePlan([
      { slotId: 'slot-0', candidates: ['a1', 'a2'] },
      { slotId: 'slot-1', candidates: ['b1'] },
    ])

    let callCount = 0
    const result = executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: () => {
        callCount++
        // First evaluation fails
        if (callCount === 1) return undefined
        return { objectiveValue: 100 }
      },
      topN: 10,
    })

    expect(result.stats.evaluationFailures).toBe(1)
    expect(result.stats.legalCombinations).toBe(1)
    expect(result.results).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Progress callback
// ---------------------------------------------------------------------------

describe('executeJoinPhase — progress', () => {
  test('progress callback is invoked for each legal combination', () => {
    const plan = makePlan([
      { slotId: 'slot-0', candidates: ['a1', 'a2'] },
      { slotId: 'slot-1', candidates: ['b1'] },
    ])

    const progressCalls: number[] = []

    executeJoinPhase({
      joinPlan: plan,
      evaluateTeam: sumEvaluator,
      topN: 10,
      onProgress: (stats) => {
        progressCalls.push(stats.legalCombinations)
      },
    })

    expect(progressCalls).toEqual([1, 2])
  })
})
