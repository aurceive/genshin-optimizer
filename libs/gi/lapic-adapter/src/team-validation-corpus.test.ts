/**
 * Team-Level Validation Corpus (§3–§8 integration tests)
 *
 * Golden test cases that exercise the full team-level adapter boundary
 * pipeline: layout → exclusivity → team context → composition →
 * join legality → join executor → canonical problem builder.
 *
 * These tests verify cross-module wiring rather than individual module
 * behavior.  They serve as regression anchors for the team-level boundary.
 */

import type {
  LapicCandidateDescriptor,
  LapicCandidateDomain,
  LapicCompatibilitySignature,
  LapicDigest,
  LapicSlotCandidateProvenance,
  LapicSlotId,
} from '@genshin-optimizer/lapic/core'
import {
  checkJoinLegality,
  mergeCompatibilitySignatures,
} from '@genshin-optimizer/lapic/runtime'
import type { GiTeamCanonicalProblemInput } from './canonical-team'
import { buildGiTeamCanonicalProblem } from './canonical-team'
import {
  createGiArtifactExclusiveResourceClaims,
  createGiCharacterActorUniquenessClaim,
  createGiWeaponExclusiveResourceClaim,
} from './exclusivity'
import type { GiTeamMemberDescriptor } from './team-context'
import {
  createGiTeamAggregateObligations,
  createGiTeamCompatibilityRules,
  extractGiElementCountFacts,
  extractGiResonanceFacts,
  extractGiTeamBuffCapabilities,
} from './team-context'
import type { GiTeamLayoutInput } from './team-layout'
import {
  GI_ADAPTER_SEMANTIC_MODE,
  GI_TEAM_KIND,
  GI_TEAM_SLOT_IDS,
  createGiSharedTeamContext,
  createGiSlotDescriptors,
  createGiTeamLayoutDescriptor,
} from './team-layout'

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

function d(s: string): LapicDigest {
  return s as LapicDigest
}

function slotId(i: number): LapicSlotId {
  return GI_TEAM_SLOT_IDS[i] as LapicSlotId
}

function makeProvenance(i: number): LapicSlotCandidateProvenance {
  return {
    slotId: slotId(i),
    sourceEntityId: `char-${i}`,
    sourceRecordDigests: [d(`rec-${i}`)],
    exclusiveResourceClaims: [],
    concreteInventoryBacked: true,
    featureExtractionDigest: d(`feat-${i}`),
  }
}

function makeCandidate(
  slotIdx: number,
  candIdx: number,
  overrides: Partial<LapicCandidateDescriptor> = {}
): LapicCandidateDescriptor {
  const sid = slotId(slotIdx)
  return {
    candidateId: d(`cand-${slotIdx}-${candIdx}`),
    sourceRecordDigest: d(`src-${slotIdx}-${candIdx}`),
    domainId: d(`domain-${slotIdx}`),
    slotId: sid,
    additiveFeatureDigest: d(`feat-${slotIdx}-${candIdx}`),
    discreteCounters: [],
    categoricalSignatureDigest: d(`sig-${slotIdx}-${candIdx}`),
    provenance: makeProvenance(slotIdx),
    ...overrides,
  }
}

function makeDomain(
  slotIdx: number,
  candidateCount: number
): LapicCandidateDomain {
  return {
    domainId: d(`domain-${slotIdx}`),
    slotId: slotId(slotIdx),
    candidates: Array.from({ length: candidateCount }, (_, c) =>
      makeCandidate(slotIdx, c)
    ),
  }
}

function makeSignature(
  slotIdx: number,
  overrides: Partial<LapicCompatibilitySignature> = {}
): LapicCompatibilitySignature {
  const sid = slotId(slotIdx)
  return {
    schemaVersion:
      '0.1.0-draft' as LapicCompatibilitySignature['schemaVersion'],
    occupiedSlotMask: 1 << slotIdx,
    actorUniquenessClaims: [
      createGiCharacterActorUniquenessClaim(`char-${slotIdx}`, sid),
    ],
    exclusiveResourceClaims: [
      ...createGiArtifactExclusiveResourceClaims(
        [`art-${slotIdx}-flower`, `art-${slotIdx}-plume`],
        sid
      ),
      createGiWeaponExclusiveResourceClaim(`wpn-${slotIdx}`, sid),
    ],
    aggregateCounts: [],
    remainingAggregateObligations: [],
    providedCapabilityFacts: [],
    remainingRequiredCapabilityFacts: [],
    branchCompatibilityToggles: [],
    frameAxisIdentity: { axisKind: 'implicit-single', frameIds: [] },
    adapterSemanticMode: GI_ADAPTER_SEMANTIC_MODE,
    ...overrides,
  }
}

// ===========================================================================
// Golden Test 1: Fixed 4-Character Team End-to-End
// ===========================================================================

describe('Golden: fixed 4-character team end-to-end', () => {
  const members: GiTeamMemberDescriptor[] = [
    { characterKey: 'HuTao', element: 'pyro' },
    { characterKey: 'Xingqiu', element: 'hydro' },
    { characterKey: 'Zhongli', element: 'geo' },
    { characterKey: 'Albedo', element: 'geo' },
  ]

  test('layout descriptor captures 4-slot ordered roster', () => {
    const layoutInput: GiTeamLayoutInput = {
      slots: members.map((m, i) => ({
        slotIndex: i,
        role: i === 0 ? 'on-field' : 'off-field',
        participationMode: 'fixedBuild' as const,
        requirement: 'required' as const,
        characterKey: m.characterKey,
      })),
    }

    const layout = createGiTeamLayoutDescriptor(layoutInput)
    expect(layout.teamKind).toBe(GI_TEAM_KIND)
    expect(layout.slotCount).toBe(4)
    expect(layout.slotIds).toEqual(GI_TEAM_SLOT_IDS)
    expect(layout.frameAxisKind).toBe('implicit-single')

    const descs = createGiSlotDescriptors(layoutInput)
    expect(descs).toHaveLength(4)
    expect(descs[0].slotRole).toBe('on-field')
    expect(descs[1].slotRole).toBe('off-field')
  })

  test('element count facts and resonance for HuTao-Xingqiu-Zhongli-Albedo', () => {
    const elementFacts = extractGiElementCountFacts(members)
    const pyroFact = elementFacts.find(
      (f) => f.counterId === 'gi:element-count:pyro'
    )
    const geoFact = elementFacts.find(
      (f) => f.counterId === 'gi:element-count:geo'
    )
    const hydroFact = elementFacts.find(
      (f) => f.counterId === 'gi:element-count:hydro'
    )
    const uniqueFact = elementFacts.find(
      (f) => f.counterId === 'gi:unique-element-count'
    )

    expect(pyroFact?.value).toBe(1)
    expect(geoFact?.value).toBe(2) // Zhongli + Albedo
    expect(hydroFact?.value).toBe(1)
    expect(uniqueFact?.value).toBe(3) // pyro, hydro, geo

    const resonanceFacts = extractGiResonanceFacts(members)
    const geoResonance = resonanceFacts.find(
      (f) => f.capabilityId === 'gi:resonance:geo'
    )
    expect(geoResonance).toBeDefined()
    expect(geoResonance?.value).toBe(true)

    // No rainbow resonance — only 3 unique elements
    const rainbow = resonanceFacts.find(
      (f) => f.capabilityId === 'gi:resonance:protective-canopy'
    )
    expect(rainbow).toBeUndefined()
  })

  test('exclusive claims per slot do not conflict across slots', () => {
    // No shared artifact or weapon IDs — all claims should be compatible
    const sigs = members.map((_, i) => makeSignature(i))

    let merged = sigs[0]
    for (let i = 1; i < sigs.length; i++) {
      const result = checkJoinLegality(merged, sigs[i])
      expect(result.legal).toBe(true)
      merged = mergeCompatibilitySignatures(merged, sigs[i])
    }

    // Verify merged occupiedSlotMask covers all 4 slots
    expect(merged.occupiedSlotMask).toBe(0b1111)
    expect(merged.actorUniquenessClaims).toHaveLength(4)
    // 3 claims per slot (2 artifacts + 1 weapon) × 4 slots = 12
    expect(merged.exclusiveResourceClaims).toHaveLength(12)
  })

  test('full canonical problem builds successfully', () => {
    const slots = members.map((m, i) => ({
      layout: {
        slotIndex: i,
        role: i === 0 ? 'on-field' : 'off-field',
        participationMode: 'fixedBuild' as const,
        requirement: 'required' as const,
        characterKey: m.characterKey,
      },
      equipment: {
        slotId: slotId(i),
        characterKey: m.characterKey,
        artifactIds: [`art-${i}-flower`, `art-${i}-plume`],
        weaponId: `wpn-${i}`,
      },
      candidateDomain: makeDomain(i, 3),
      provenance: makeProvenance(i),
    }))

    const input: GiTeamCanonicalProblemInput = {
      identity: {
        problemId: 'golden-team-1' as LapicDigest,
        problemDigest: d('golden-team-1-digest'),
        engineVersion: '0.1.0-test' as LapicDigest,
        arithmeticPolicyId: 'ieee754-double' as LapicDigest,
      },
      slots,
      teamConfig: {},
      objective: {
        objectiveId: 'total-dmg' as LapicDigest,
        objectiveKind: 'weighted-aggregate',
        expressionDigest: d('dmg-expr'),
        targetSlotIds: slots.map((_, i) => slotId(i)),
        frameIds: [],
      },
      constraints: [],
      topN: 5,
      orderingPolicy: {
        tieBreakDimensions: ['objective-value'],
        canonicalCandidateOrdering: ['ascending'],
      },
      adapterMetadata: {
        adapterKind: 'gi',
        adapterVersion: '0.1.0-draft',
        sourceSnapshotDigests: [d('snap')],
        declaredUnsupportedFeatures: [],
        metadata: {},
      },
      teamLayoutDigest: d('layout-digest'),
      sharedTeamContextDigest: d('ctx-digest'),
    }

    const result = buildGiTeamCanonicalProblem(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const problem = result.value
    expect(problem.teamLayout.slotCount).toBe(4)
    expect(problem.slotDescriptors).toHaveLength(4)
    expect(problem.itemDomains).toHaveLength(4)
    expect(problem.compatibilityRules.length).toBeGreaterThanOrEqual(3)
    expect(problem.topN).toBe(5)

    // Provenance enriched with exclusive claims
    for (const sp of problem.provenance.slotProvenance) {
      expect(sp.exclusiveResourceClaims.length).toBe(3) // 2 artifacts + 1 weapon
    }
  })
})

// ===========================================================================
// Golden Test 2: Weapon/Character Conflict Rejection
// ===========================================================================

describe('Golden: weapon/character conflict rejection', () => {
  test('shared weapon triggers hardReserved conflict', () => {
    const sig0 = makeSignature(0, {
      exclusiveResourceClaims: [
        createGiWeaponExclusiveResourceClaim('shared-weapon', slotId(0)),
      ],
    })
    const sig1 = makeSignature(1, {
      exclusiveResourceClaims: [
        createGiWeaponExclusiveResourceClaim('shared-weapon', slotId(1)),
      ],
    })

    const result = checkJoinLegality(sig0, sig1)
    expect(result.legal).toBe(false)
    expect(result.violations.length).toBeGreaterThan(0)

    const weaponViolation = result.violations.find(
      (v) => v.kind === 'hardReservedResourceConflict'
    )
    expect(weaponViolation).toBeDefined()
  })

  test('shared character triggers actor uniqueness conflict', () => {
    const sig0 = makeSignature(0, {
      actorUniquenessClaims: [
        createGiCharacterActorUniquenessClaim('Bennett', slotId(0)),
      ],
    })
    const sig1 = makeSignature(1, {
      actorUniquenessClaims: [
        createGiCharacterActorUniquenessClaim('Bennett', slotId(1)),
      ],
    })

    const result = checkJoinLegality(sig0, sig1)
    expect(result.legal).toBe(false)

    const uniquenessViolation = result.violations.find(
      (v) => v.kind === 'actorUniquenessConflict'
    )
    expect(uniquenessViolation).toBeDefined()
  })

  test('shared artifact triggers hardReserved conflict', () => {
    const sig0 = makeSignature(0, {
      exclusiveResourceClaims: createGiArtifactExclusiveResourceClaims(
        ['shared-flower'],
        slotId(0)
      ),
    })
    const sig1 = makeSignature(1, {
      exclusiveResourceClaims: createGiArtifactExclusiveResourceClaims(
        ['shared-flower'],
        slotId(1)
      ),
    })

    const result = checkJoinLegality(sig0, sig1)
    expect(result.legal).toBe(false)

    const conflict = result.violations.find(
      (v) => v.kind === 'hardReservedResourceConflict'
    )
    expect(conflict).toBeDefined()
  })

  test('semantic mode mismatch rejected', () => {
    const sig0 = makeSignature(0, {
      adapterSemanticMode: 'gi-legacy-compatibility',
    })
    const sig1 = makeSignature(1, {
      adapterSemanticMode: 'gi-canonical-v2',
    })

    const result = checkJoinLegality(sig0, sig1)
    expect(result.legal).toBe(false)
    expect(
      result.violations.some((v) => v.kind === 'semanticModeIncompatible')
    ).toBe(true)
  })
})

// ===========================================================================
// Golden Test 3: Resonance Facts Verification
// ===========================================================================

describe('Golden: resonance facts comprehensive', () => {
  test('mono pyro team (4 pyro) → pyro resonance active', () => {
    const members: GiTeamMemberDescriptor[] = [
      { characterKey: 'HuTao', element: 'pyro' },
      { characterKey: 'Bennett', element: 'pyro' },
      { characterKey: 'Xiangling', element: 'pyro' },
      { characterKey: 'Yanfei', element: 'pyro' },
    ]
    const resonance = extractGiResonanceFacts(members)
    expect(resonance.some((f) => f.capabilityId === 'gi:resonance:pyro')).toBe(
      true
    )
    // 1 unique element → no rainbow
    expect(
      resonance.some((f) => f.capabilityId === 'gi:resonance:protective-canopy')
    ).toBe(false)
  })

  test('rainbow team (4 unique) → protective canopy', () => {
    const members: GiTeamMemberDescriptor[] = [
      { characterKey: 'Bennett', element: 'pyro' },
      { characterKey: 'Xingqiu', element: 'hydro' },
      { characterKey: 'Fischl', element: 'electro' },
      { characterKey: 'Kazuha', element: 'anemo' },
    ]
    const resonance = extractGiResonanceFacts(members)
    expect(
      resonance.some((f) => f.capabilityId === 'gi:resonance:protective-canopy')
    ).toBe(true)
    // No element has 2+, so no elemental resonance
    expect(resonance.some((f) => f.capabilityId === 'gi:resonance:pyro')).toBe(
      false
    )
  })

  test('3-member team → no resonance (needs 4)', () => {
    const members: GiTeamMemberDescriptor[] = [
      { characterKey: 'HuTao', element: 'pyro' },
      { characterKey: 'Bennett', element: 'pyro' },
      { characterKey: 'Xingqiu', element: 'hydro' },
    ]
    const resonance = extractGiResonanceFacts(members)
    expect(resonance).toHaveLength(0)
  })

  test('double resonance: 2 pyro + 2 geo', () => {
    const members: GiTeamMemberDescriptor[] = [
      { characterKey: 'HuTao', element: 'pyro' },
      { characterKey: 'Bennett', element: 'pyro' },
      { characterKey: 'Zhongli', element: 'geo' },
      { characterKey: 'Albedo', element: 'geo' },
    ]
    const resonance = extractGiResonanceFacts(members)
    expect(resonance.some((f) => f.capabilityId === 'gi:resonance:pyro')).toBe(
      true
    )
    expect(resonance.some((f) => f.capabilityId === 'gi:resonance:geo')).toBe(
      true
    )
    // Only 2 unique elements → no rainbow
    expect(
      resonance.some((f) => f.capabilityId === 'gi:resonance:protective-canopy')
    ).toBe(false)
  })

  test('element count facts match expected values', () => {
    const members: GiTeamMemberDescriptor[] = [
      { characterKey: 'HuTao', element: 'pyro' },
      { characterKey: 'Bennett', element: 'pyro' },
      { characterKey: 'Zhongli', element: 'geo' },
      { characterKey: 'Xingqiu', element: 'hydro' },
    ]
    const facts = extractGiElementCountFacts(members)

    const byId = new Map(facts.map((f) => [f.counterId, f.value]))
    expect(byId.get('gi:element-count:pyro')).toBe(2)
    expect(byId.get('gi:element-count:geo')).toBe(1)
    expect(byId.get('gi:element-count:hydro')).toBe(1)
    expect(byId.get('gi:unique-element-count')).toBe(3)
    expect(byId.has('gi:element-count:electro')).toBe(false)
  })
})

// ===========================================================================
// Golden Test 4: Weighted Aggregate Objective Integration
// ===========================================================================

describe('Golden: weighted aggregate objective integration', () => {
  test('canonical problem with weighted-aggregate wires correctly', () => {
    const slotCount = 4
    const slots = Array.from({ length: slotCount }, (_, i) => ({
      layout: {
        slotIndex: i,
        role: i === 0 ? 'on-field' : 'off-field',
        participationMode: (i === 0 ? 'optimizedBuild' : 'fixedBuild') as
          | 'optimizedBuild'
          | 'fixedBuild',
        requirement: 'required' as const,
        characterKey: `char-${i}`,
      },
      equipment: {
        slotId: slotId(i),
        characterKey: `char-${i}`,
        artifactIds: [`art-${i}-0`, `art-${i}-1`],
        weaponId: `wpn-${i}`,
      },
      candidateDomain: makeDomain(i, 2),
      provenance: makeProvenance(i),
    }))

    const input: GiTeamCanonicalProblemInput = {
      identity: {
        problemId: 'weighted-team' as LapicDigest,
        problemDigest: d('w-digest'),
        engineVersion: '0.1.0' as LapicDigest,
        arithmeticPolicyId: 'ieee754-double' as LapicDigest,
      },
      slots,
      teamConfig: {},
      objective: {
        objectiveId: 'weighted-dmg' as LapicDigest,
        objectiveKind: 'weighted-aggregate',
        expressionDigest: d('weighted-expr'),
        targetSlotIds: slots.map((_, i) => slotId(i)),
        frameIds: [],
      },
      constraints: [
        {
          constraintId: 'hp-min' as LapicDigest,
          kind: 'lower-bound',
          expressionDigest: d('hp-expr'),
          hard: true,
        },
      ],
      topN: 3,
      orderingPolicy: {
        tieBreakDimensions: ['objective-value', 'secondary-0'],
        canonicalCandidateOrdering: ['descending'],
      },
      adapterMetadata: {
        adapterKind: 'gi',
        adapterVersion: '0.1.0-draft',
        sourceSnapshotDigests: [d('snap')],
        declaredUnsupportedFeatures: [],
        metadata: {},
      },
      teamLayoutDigest: d('layout'),
      sharedTeamContextDigest: d('ctx'),
    }

    const result = buildGiTeamCanonicalProblem(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const problem = result.value
    expect(problem.objective.objectiveKind).toBe('weighted-aggregate')
    expect(problem.objective.targetSlotIds).toHaveLength(4)
    expect(problem.constraints).toHaveLength(1)
    expect(problem.topN).toBe(3)
    expect(problem.orderingPolicy.tieBreakDimensions).toEqual([
      'objective-value',
      'secondary-0',
    ])

    // Slot 0 is optimized, rest are fixed
    expect(problem.slotDescriptors[0].contributesToObjective).toBe(true)
    expect(problem.slotDescriptors[1].contributesToObjective).toBe(false)
  })
})

// ===========================================================================
// Golden Test 5: Team Buff Capabilities & Aggregate Obligations
// ===========================================================================

describe('Golden: team buffs and obligations', () => {
  test('team buff capabilities normalize correctly', () => {
    const buffs = extractGiTeamBuffCapabilities([
      {
        capabilityId: 'gi:buff:bennett-q-atk',
        sourceCharacterKey: 'Bennett',
        scope: 'all-occupied-slots',
        value: 1200,
      },
      {
        capabilityId: 'gi:buff:zhongli-shield-res-shred',
        sourceCharacterKey: 'Zhongli',
        scope: 'source-slot-only',
        value: 0.2,
      },
    ])

    expect(buffs).toHaveLength(2)
    expect(buffs[0].capabilityId).toBe('gi:buff:bennett-q-atk')
    expect(buffs[0].scope).toBe('all-occupied-slots')
    expect(buffs[0].value).toBe(1200)
    expect(buffs[1].scope).toBe('source-slot-only')
  })

  test('aggregate obligations for element requirements', () => {
    const obligations = createGiTeamAggregateObligations([
      { element: 'pyro', minimumCount: 2 },
      { element: 'geo', minimumCount: 1 },
    ])

    expect(obligations).toHaveLength(2)
    expect(obligations[0].counterId).toBe('gi:element-count:pyro')
    expect(obligations[0].minimumRequired).toBe(2)
    expect(obligations[1].counterId).toBe('gi:element-count:geo')
  })
})

// ===========================================================================
// Golden Test 6: Compatibility Rules Complete Set
// ===========================================================================

describe('Golden: compatibility rules', () => {
  test('GI standard rules cover character, weapon, artifact exclusivity', () => {
    const rules = createGiTeamCompatibilityRules()
    expect(rules).toHaveLength(3)

    const ruleIds = rules.map((r) => r.ruleId)
    expect(ruleIds).toContain('gi:character-uniqueness')
    expect(ruleIds).toContain('gi:weapon-exclusivity')
    expect(ruleIds).toContain('gi:artifact-exclusivity')

    // Each rule has a non-empty description and digest
    for (const rule of rules) {
      expect(rule.description.length).toBeGreaterThan(0)
      expect(rule.signatureDigest.length).toBeGreaterThan(0)
    }
  })
})

// ===========================================================================
// Golden Test 7: Merge Chain Correctness (4-Way Sequential Merge)
// ===========================================================================

describe('Golden: 4-way sequential compatibility merge', () => {
  test('merging 4 non-conflicting signatures produces correct aggregate', () => {
    const sigs = [0, 1, 2, 3].map((i) =>
      makeSignature(i, {
        aggregateCounts: [
          { counterId: `gi:element-count:pyro`, value: i === 0 ? 1 : 0 },
        ],
      })
    )

    let merged = sigs[0]
    for (let i = 1; i < sigs.length; i++) {
      const legality = checkJoinLegality(merged, sigs[i])
      expect(legality.legal).toBe(true)
      merged = mergeCompatibilitySignatures(merged, sigs[i])
    }

    // Occupied slot mask = all 4 slots
    expect(merged.occupiedSlotMask).toBe(0b1111)

    // 4 actor uniqueness claims
    expect(merged.actorUniquenessClaims).toHaveLength(4)

    // 12 resource claims (3 per slot × 4)
    expect(merged.exclusiveResourceClaims).toHaveLength(12)

    // Semantic mode preserved
    expect(merged.adapterSemanticMode).toBe(GI_ADAPTER_SEMANTIC_MODE)
  })

  test('conflict at step 3 of 4-way merge is detected', () => {
    const sigs = [0, 1, 2].map((i) => makeSignature(i))

    // Slot 3 shares a weapon with slot 0
    const conflicting = makeSignature(3, {
      exclusiveResourceClaims: [
        createGiWeaponExclusiveResourceClaim('wpn-0', slotId(3)),
      ],
    })

    let merged = sigs[0]
    for (let i = 1; i < sigs.length; i++) {
      merged = mergeCompatibilitySignatures(merged, sigs[i])
    }

    const result = checkJoinLegality(merged, conflicting)
    expect(result.legal).toBe(false)
    expect(
      result.violations.some((v) => v.kind === 'hardReservedResourceConflict')
    ).toBe(true)
  })
})

// ===========================================================================
// Golden Test 8: Shared Team Context Pass-Through
// ===========================================================================

describe('Golden: shared team context integration', () => {
  test('environment digest and aggregate facts reach canonical problem', () => {
    const layoutInput: GiTeamLayoutInput = {
      slots: [
        {
          slotIndex: 0,
          role: 'on-field',
          participationMode: 'optimizedBuild',
          requirement: 'required',
        },
      ],
      environmentDigest: d('env-abyss-12-3'),
      aggregateFacts: {
        'pyro-count': 2,
        'geo-resonance': true,
      },
      metadata: {
        adapterVersion: '0.1.0-draft',
      },
    }

    const ctx = createGiSharedTeamContext(layoutInput)
    expect(ctx.environmentDigest).toBe('env-abyss-12-3')
    expect(ctx.aggregateFacts['pyro-count']).toBe(2)
    expect(ctx.aggregateFacts['geo-resonance']).toBe(true)
    expect(ctx.metadata['adapterVersion']).toBe('0.1.0-draft')
  })
})
