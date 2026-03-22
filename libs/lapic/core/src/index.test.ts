import {
  areLapicSirStatesExactComparable,
  compareLapicExactSignatureGroupKeys,
  compareLapicSirStateIdentity,
  createLapicCanonicalProblem,
  createLapicCompatibilitySignature,
  createLapicExactSignatureGroupKey,
  createLapicExactSignatureGroupKeyFromCompatibilitySignature,
  createLapicExactSignatureGroupOrderingKey,
  createLapicSirState,
  createLapicSirStateIdentityOrderingKey,
  createLapicStateLayoutDescriptor,
  validateLapicCanonicalProblem,
  validateLapicCompatibilitySignature,
  validateLapicExactSignatureGroupKey,
  validateLapicProblemNormalizationInput,
  validateLapicSirState,
} from './index'

function createNormalizationInput() {
  return {
    teamLayout: {
      teamKind: 'gi-single',
      slotCount: 1,
      slotIds: ['flower'],
      slotRoleTaxonomy: ['artifact'],
      slotRequirements: { flower: 'required' as const },
      slotOrderSemantics: 'semantic' as const,
      frameAxisKind: 'none' as const,
    },
    slotDescriptors: [
      {
        slotId: 'flower',
        slotRole: 'artifact-flower',
        participationMode: 'optimizedBuild' as const,
        occupantDomainId: 'gi:flower',
        equipmentOwnershipModel: 'hard-reserved-inventory' as const,
        contributesToObjective: true,
        contributesToConstraints: true,
        mayRemainEmpty: false,
      },
    ],
    sharedTeamContext: {
      adapterSemanticMode: 'gi',
      aggregateFacts: {},
      metadata: {},
    },
    itemDomains: [
      {
        domainId: 'gi:flower',
        slotId: 'flower',
        candidates: [
          {
            candidateId: 'artifact-id',
            sourceRecordDigest: 'artifact-id',
            domainId: 'gi:flower',
            slotId: 'flower',
            additiveFeatureDigest: 'feature-digest',
            discreteCounters: [],
            categoricalSignatureDigest: 'categorical-digest',
            provenance: {
              slotId: 'flower',
              sourceEntityId: 'inventory',
              sourceRecordDigests: ['artifact-id'],
              exclusiveResourceClaims: [],
              concreteInventoryBacked: true,
              featureExtractionDigest: 'feature-digest',
            },
          },
        ],
      },
    ],
    compatibilityRules: [],
    objective: {
      objectiveId: 'objective-id',
      objectiveKind: 'single-slot' as const,
      expressionDigest: 'objective-digest',
      targetSlotIds: ['flower'],
      frameIds: [],
    },
    constraints: [],
    topN: 1,
    orderingPolicy: {
      tieBreakDimensions: ['value'],
      canonicalCandidateOrdering: ['value'],
    },
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
      compatibilitySignatureSchemaVersion: '0.1.0-draft' as const,
      slotProvenance: [],
    },
  }
}

function createStateLayout() {
  return createLapicStateLayoutDescriptor({
    layoutId: 'layout-id',
    teamLayoutDigest: 'team-layout-digest',
    slotIds: ['flower'],
    frameAxisIdentity: {
      axisKind: 'none',
      frameIds: [],
    },
    dominanceProjectionIds: ['dominance-projection'],
  })
}

function createCompatibilitySignature() {
  return createLapicCompatibilitySignature({
    occupiedSlotMask: 1,
    actorUniquenessClaims: [
      {
        actorId: 'char:nahida',
        family: 'character',
        claimedBySlotId: 'flower',
      },
    ],
    exclusiveResourceClaims: [
      {
        resourceKind: 'artifact',
        resourceId: 'artifact-id',
        claimedBySlotId: 'flower',
        reservationClass: 'hardReserved',
      },
    ],
    aggregateCounts: [
      {
        counterId: 'set-count',
        value: 1,
      },
    ],
    remainingAggregateObligations: [
      {
        counterId: 'resonance-count',
        minimumRequired: 0,
      },
    ],
    providedCapabilityFacts: [
      {
        capabilityId: 'can-heal',
        scope: 'self-only',
        value: true,
      },
    ],
    remainingRequiredCapabilityFacts: [
      {
        capabilityId: 'needs-target',
        scope: 'specific-target-slot',
        targetSlotId: 'flower',
        value: true,
      },
    ],
    branchCompatibilityToggles: [
      {
        toggleId: 'burst-enabled',
        enabled: true,
      },
    ],
    frameAxisIdentity: {
      axisKind: 'none',
      frameIds: [],
    },
    adapterSemanticMode: 'gi-team',
  })
}

function createExactSignatureGroupKey() {
  return createLapicExactSignatureGroupKey({
    occupiedSlotMask: 1,
    actorIds: ['char:nahida'],
    exclusiveResourceKeys: ['artifact:artifact-id'],
    frameAxisIdentityDigest: 'frame-axis-digest',
    adapterSemanticMode: 'gi-team',
    discreteTeamModeKey: 'spread',
  })
}

function createSirState() {
  return createLapicSirState({
    stateId: 'state-id',
    layout: createStateLayout(),
    exactSignatureGroupKey: createExactSignatureGroupKey(),
    compatibilitySignature: createCompatibilitySignature(),
    dominanceProjection: {
      projectionId: 'dominance-projection',
      vectorDigest: 'dominance-vector-digest',
    },
    potentialOrderingDigest: 'potential-ordering-digest',
    potentialSummaryDigests: ['potential-summary-digest'],
    provenance: createNormalizationInput().provenance,
  })
}

describe('lapic core builders and validators', () => {
  it('validates a well-formed normalization input', () => {
    const result = validateLapicProblemNormalizationInput(
      createNormalizationInput()
    )

    expect(result.ok).toBe(true)
  })

  it('rejects invalid normalization input with mismatched candidate domain', () => {
    const input = createNormalizationInput()
    input.itemDomains[0]!.candidates[0]!.domainId = 'other-domain'

    const result = validateLapicProblemNormalizationInput(input)

    expect(result.ok).toBe(false)
  })

  it('creates and validates a canonical problem', () => {
    const problem = createLapicCanonicalProblem(createNormalizationInput(), {
      problemId: 'problem-id',
      problemDigest: 'problem-digest',
      engineVersion: 'engine-version',
      arithmeticPolicyId: 'arith-policy',
    })

    const result = validateLapicCanonicalProblem(problem)

    expect(result.ok).toBe(true)
  })

  it('creates and validates a compatibility signature', () => {
    const signature = createCompatibilitySignature()

    const result = validateLapicCompatibilitySignature(signature)

    expect(result.ok).toBe(true)
  })

  it('rejects a compatibility signature with missing target slot for a targeted capability fact', () => {
    const signature = createCompatibilitySignature()
    signature.remainingRequiredCapabilityFacts[0]!.targetSlotId = undefined

    const result = validateLapicCompatibilitySignature(signature)

    expect(result.ok).toBe(false)
  })

  it('creates and validates an exact signature group key', () => {
    const key = createExactSignatureGroupKey()

    const result = validateLapicExactSignatureGroupKey(key)

    expect(result.ok).toBe(true)
  })

  it('canonicalizes exact signature group key collections in the public builder', () => {
    const key = createLapicExactSignatureGroupKey({
      occupiedSlotMask: 1,
      actorIds: ['char:yae', 'char:nahida'],
      exclusiveResourceKeys: ['weapon:widsth', 'artifact:flower'],
      frameAxisIdentityDigest: 'frame-axis-digest',
      adapterSemanticMode: 'gi-team',
      discreteTeamModeKey: 'spread',
    })

    expect(key.actorIds).toEqual(['char:nahida', 'char:yae'])
    expect(key.exclusiveResourceKeys).toEqual([
      'artifact:flower',
      'weapon:widsth',
    ])
  })

  it('rejects an exact signature group key with an empty frame axis digest', () => {
    const key = createExactSignatureGroupKey()
    key.frameAxisIdentityDigest = ''

    const result = validateLapicExactSignatureGroupKey(key)

    expect(result.ok).toBe(false)
  })

  it('derives an exact signature group key from a compatibility signature', () => {
    const result = createLapicExactSignatureGroupKeyFromCompatibilitySignature({
      compatibilitySignature: createCompatibilitySignature(),
      frameAxisIdentityDigest: 'frame-axis-digest',
      discreteTeamModeKey: 'spread',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.occupiedSlotMask).toBe(1)
    expect(result.value.actorIds).toEqual(['char:nahida'])
    expect(result.value.exclusiveResourceKeys).toEqual([
      'hardReserved|artifact|artifact-id|flower',
    ])
  })

  it('creates a deterministic exact signature group ordering key', () => {
    const result = createLapicExactSignatureGroupOrderingKey(
      createExactSignatureGroupKey()
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual([
      '1',
      'gi-team',
      'frame-axis-digest',
      'spread',
      'char:nahida',
      'artifact:artifact-id',
    ])
  })

  it('compares exact signature group keys deterministically', () => {
    const left = createExactSignatureGroupKey()
    const right = createExactSignatureGroupKey()
    right.discreteTeamModeKey = 'aggravate'

    const result = compareLapicExactSignatureGroupKeys(left, right)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toBe(1)
  })

  it('treats exact signature group keys with equivalent sets as equal', () => {
    const left = createLapicExactSignatureGroupKey({
      occupiedSlotMask: 1,
      actorIds: ['char:nahida', 'char:yae'],
      exclusiveResourceKeys: ['artifact:flower', 'weapon:widsth'],
      frameAxisIdentityDigest: 'frame-axis-digest',
      adapterSemanticMode: 'gi-team',
      discreteTeamModeKey: 'spread',
    })
    const right = createLapicExactSignatureGroupKey({
      occupiedSlotMask: 1,
      actorIds: ['char:yae', 'char:nahida'],
      exclusiveResourceKeys: ['weapon:widsth', 'artifact:flower'],
      frameAxisIdentityDigest: 'frame-axis-digest',
      adapterSemanticMode: 'gi-team',
      discreteTeamModeKey: 'spread',
    })

    const result = compareLapicExactSignatureGroupKeys(left, right)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toBe(0)
  })

  it('creates and validates an s-ir state', () => {
    const state = createSirState()

    const result = validateLapicSirState(state)

    expect(result.ok).toBe(true)
  })

  it('rejects an s-ir state with mismatched exact and compatibility occupied slot masks', () => {
    const state = createSirState()
    state.exactSignatureGroupKey.occupiedSlotMask = 3

    const result = validateLapicSirState(state)

    expect(result.ok).toBe(false)
  })

  it('creates a deterministic s-ir state identity ordering key', () => {
    const result = createLapicSirStateIdentityOrderingKey(createSirState())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toContain('dominance-vector-digest')
    expect(result.value[result.value.length - 1]).toBe('state-id')
  })

  it('reports exact comparability only for states in the same exact signature group', () => {
    const left = createSirState()
    const right = createSirState()
    right.exactSignatureGroupKey.discreteTeamModeKey = 'hyperbloom'

    expect(areLapicSirStatesExactComparable(left, right)).toBe(false)
  })

  it('compares s-ir state identities within the same exact signature group', () => {
    const left = createSirState()
    const right = createSirState()
    right.stateId = 'state-id-2'

    const result = compareLapicSirStateIdentity(left, right)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toBe(-1)
  })

  it('rejects s-ir state identity comparison across different exact signature groups', () => {
    const left = createSirState()
    const right = createSirState()
    right.exactSignatureGroupKey.discreteTeamModeKey = 'hyperbloom'

    const result = compareLapicSirStateIdentity(left, right)

    expect(result.ok).toBe(false)
  })
})
