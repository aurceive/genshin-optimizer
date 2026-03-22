import type { LapicCandidateDescriptor, LapicCanonicalProblem } from '../types'
import {
  createCombinationStateId,
  createFrameAxisIdentity,
  hasExclusiveResourceConflict,
} from './state-composition'

function minimalProblem(
  overrides: Partial<
    Pick<LapicCanonicalProblem, 'teamLayout' | 'frameAxis' | 'problemDigest'>
  > = {}
): LapicCanonicalProblem {
  return {
    problemId: 'test-problem',
    problemDigest: overrides.problemDigest ?? 'test-digest',
    engineVersion: '0.1.0',
    arithmeticPolicyId: 'arith-policy',
    teamLayout: overrides.teamLayout ?? {
      teamKind: 'gi-single',
      slotCount: 2,
      slotIds: ['slot-a', 'slot-b'],
      slotRoleTaxonomy: ['artifact', 'artifact'],
      slotRequirements: { 'slot-a': 'required', 'slot-b': 'required' },
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: [],
    sharedTeamContext: {
      adapterSemanticMode: 'gi-legacy-validated',
      aggregateFacts: {},
      metadata: {},
    },
    frameAxis: overrides.frameAxis ?? [],
    itemDomains: [],
    compatibilityRules: [],
    objective: {
      objectiveId: 'obj',
      objectiveKind: 'single-slot',
      expressionDigest: 'obj-digest',
      targetSlotIds: [],
      frameIds: [],
    },
    constraints: [],
    topN: 1,
    orderingPolicy: {
      tieBreakDimensions: [],
      canonicalCandidateOrdering: [],
    },
    auxiliaryOutputs: [],
    adapterMetadata: {
      adapterKind: 'gi-wr',
      adapterVersion: '0.1.0',
      sourceSnapshotDigests: [],
      declaredUnsupportedFeatures: [],
      metadata: {},
    },
    provenance: {
      teamLayoutDigest: 'layout-digest',
      sharedTeamContextDigest: 'ctx-digest',
      crossSlotRuleDescriptorVersion: '0.1.0',
      compatibilitySignatureSchemaVersion: '0.1.0-draft',
      slotProvenance: [],
    },
  }
}

function candidate(
  id: string,
  slotId: string,
  exclusiveResourceClaims: LapicCandidateDescriptor['provenance']['exclusiveResourceClaims'] = []
): LapicCandidateDescriptor {
  return {
    candidateId: id,
    sourceRecordDigest: id,
    domainId: `domain-${slotId}`,
    slotId,
    additiveFeatureDigest: `feature:${id}`,
    discreteCounters: [],
    categoricalSignatureDigest: `cat:${id}`,
    provenance: {
      slotId,
      sourceEntityId: 'inventory',
      sourceRecordDigests: [id],
      exclusiveResourceClaims,
      concreteInventoryBacked: true,
      featureExtractionDigest: `extract:${id}`,
    },
  }
}

// ---------------------------------------------------------------------------
// createFrameAxisIdentity
// ---------------------------------------------------------------------------

describe('createFrameAxisIdentity', () => {
  it('returns axisKind "none" and empty frameIds when no frames', () => {
    const problem = minimalProblem()
    const result = createFrameAxisIdentity(problem)

    expect(result.axisKind).toBe('none')
    expect(result.frameIds).toEqual([])
  })

  it('extracts explicit frame axis from the problem', () => {
    const problem = minimalProblem({
      teamLayout: {
        teamKind: 'gi-team',
        slotCount: 4,
        slotIds: ['char-1', 'char-2', 'char-3', 'char-4'],
        slotRoleTaxonomy: ['main-dps', 'sub-dps', 'support', 'healer'],
        slotRequirements: {
          'char-1': 'required',
          'char-2': 'required',
          'char-3': 'required',
          'char-4': 'required',
        },
        slotOrderSemantics: 'semantic',
        frameAxisKind: 'explicit',
      },
      frameAxis: [
        {
          frameId: 'frame-normal',
          order: 0,
          semanticTags: ['normal'],
          conditionalDigests: [],
          bonusDigests: [],
          constraintDigests: [],
        },
        {
          frameId: 'frame-burst',
          order: 1,
          semanticTags: ['burst'],
          conditionalDigests: [],
          bonusDigests: [],
          constraintDigests: [],
        },
      ],
    })

    const result = createFrameAxisIdentity(problem)
    expect(result.axisKind).toBe('explicit')
    expect(result.frameIds).toEqual(['frame-normal', 'frame-burst'])
  })
})

// ---------------------------------------------------------------------------
// createCombinationStateId
// ---------------------------------------------------------------------------

describe('createCombinationStateId', () => {
  it('builds a deterministic state id from problem and candidates', () => {
    const problem = minimalProblem({ problemDigest: 'p-1' })
    const candidates = [candidate('c1', 'slot-a'), candidate('c2', 'slot-b')]

    const stateId = createCombinationStateId(problem, candidates)
    expect(stateId).toBe('state:p-1:slot-a:c1|slot-b:c2')
  })

  it('produces different ids for different candidate orderings', () => {
    const problem = minimalProblem({ problemDigest: 'p-1' })
    const id1 = createCombinationStateId(problem, [
      candidate('c1', 'slot-a'),
      candidate('c2', 'slot-b'),
    ])
    const id2 = createCombinationStateId(problem, [
      candidate('c2', 'slot-b'),
      candidate('c1', 'slot-a'),
    ])

    expect(id1).not.toBe(id2)
  })

  it('handles a single candidate', () => {
    const problem = minimalProblem({ problemDigest: 'p-2' })
    const stateId = createCombinationStateId(problem, [
      candidate('only', 'slot-a'),
    ])
    expect(stateId).toBe('state:p-2:slot-a:only')
  })
})

// ---------------------------------------------------------------------------
// hasExclusiveResourceConflict
// ---------------------------------------------------------------------------

describe('hasExclusiveResourceConflict', () => {
  it('returns false for candidates with no exclusive claims', () => {
    expect(
      hasExclusiveResourceConflict([
        candidate('c1', 'slot-a'),
        candidate('c2', 'slot-b'),
      ])
    ).toBe(false)
  })

  it('returns false for candidates with non-overlapping claims', () => {
    expect(
      hasExclusiveResourceConflict([
        candidate('c1', 'slot-a', [
          {
            resourceKind: 'weapon',
            resourceId: 'w-1',
            claimedBySlotId: 'slot-a',
            reservationClass: 'hardReserved',
          },
        ]),
        candidate('c2', 'slot-b', [
          {
            resourceKind: 'weapon',
            resourceId: 'w-2',
            claimedBySlotId: 'slot-b',
            reservationClass: 'hardReserved',
          },
        ]),
      ])
    ).toBe(false)
  })

  it('returns true when the same resource is claimed by two candidates', () => {
    expect(
      hasExclusiveResourceConflict([
        candidate('c1', 'slot-a', [
          {
            resourceKind: 'weapon',
            resourceId: 'w-1',
            claimedBySlotId: 'slot-a',
            reservationClass: 'hardReserved',
          },
        ]),
        candidate('c2', 'slot-b', [
          {
            resourceKind: 'weapon',
            resourceId: 'w-1',
            claimedBySlotId: 'slot-b',
            reservationClass: 'hardReserved',
          },
        ]),
      ])
    ).toBe(true)
  })

  it('returns false for empty candidate list', () => {
    expect(hasExclusiveResourceConflict([])).toBe(false)
  })

  it('distinguishes different resource kinds for the same id', () => {
    expect(
      hasExclusiveResourceConflict([
        candidate('c1', 'slot-a', [
          {
            resourceKind: 'weapon',
            resourceId: 'r-1',
            claimedBySlotId: 'slot-a',
            reservationClass: 'hardReserved',
          },
        ]),
        candidate('c2', 'slot-b', [
          {
            resourceKind: 'artifact',
            resourceId: 'r-1',
            claimedBySlotId: 'slot-b',
            reservationClass: 'hardReserved',
          },
        ]),
      ])
    ).toBe(false)
  })
})
