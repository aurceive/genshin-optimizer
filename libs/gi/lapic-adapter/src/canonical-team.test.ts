import type {
  LapicAdapterMetadata,
  LapicCanonicalConstraint,
  LapicCanonicalObjective,
  LapicCandidateDomain,
  LapicDigest,
  LapicOrderingPolicy,
  LapicSlotCandidateProvenance,
  LapicSlotId,
} from '@genshin-optimizer/lapic/core'
import { lapicCompatibilitySignatureSchemaVersion } from '@genshin-optimizer/lapic/core'
import type {
  GiTeamCanonicalIdentity,
  GiTeamCanonicalProblemInput,
  GiTeamSlotFullInput,
} from './canonical-team'
import { buildGiTeamCanonicalProblem } from './canonical-team'
import type { GiSlotEquipmentInput } from './exclusivity'
import { GI_TEAM_SLOT_IDS } from './team-layout'
import type { GiTeamSlotInput } from './team-layout'

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeSlotId(i: number): LapicSlotId {
  return GI_TEAM_SLOT_IDS[i] as LapicSlotId
}

function makeDigest(s: string): LapicDigest {
  return s as LapicDigest
}

function makeIdentity(): GiTeamCanonicalIdentity {
  return {
    problemId: 'test-team-problem' as LapicDigest,
    problemDigest: makeDigest('team-digest'),
    engineVersion: '0.1.0-test' as LapicDigest,
    arithmeticPolicyId: 'ieee754-double' as LapicDigest,
  }
}

function makeLayoutSlot(
  index: number,
  mode: 'optimizedBuild' | 'fixedBuild' = 'optimizedBuild'
): GiTeamSlotInput {
  return {
    slotIndex: index,
    role: index === 0 ? 'on-field' : 'off-field',
    participationMode: mode,
    requirement: 'required',
    characterKey: `char-${index}`,
  }
}

function makeEquipment(index: number): GiSlotEquipmentInput {
  const slotId = makeSlotId(index)
  return {
    slotId,
    characterKey: `char-${index}`,
    artifactIds: [`art-${index}-flower`, `art-${index}-plume`],
    weaponId: `wpn-${index}`,
  }
}

function makeCandidateDomain(index: number): LapicCandidateDomain {
  const slotId = makeSlotId(index)
  return {
    domainId: `gi:character:char-${index}` as LapicDigest,
    slotId,
    candidates: [
      {
        candidateId: `candidate-${index}-0` as LapicDigest,
        sourceRecordDigest: makeDigest(`src-${index}-0`),
        domainId: `gi:character:char-${index}` as LapicDigest,
        slotId,
        additiveFeatureDigest: makeDigest(`feat-${index}`),
        discreteCounters: [],
        categoricalSignatureDigest: makeDigest(`sig-${index}`),
        provenance: makeProvenance(index),
      },
    ],
  }
}

function makeProvenance(index: number): LapicSlotCandidateProvenance {
  return {
    slotId: makeSlotId(index),
    sourceEntityId: `char-${index}`,
    sourceRecordDigests: [makeDigest(`rec-${index}`)],
    exclusiveResourceClaims: [],
    concreteInventoryBacked: true,
    featureExtractionDigest: makeDigest(`extract-${index}`),
  }
}

function makeObjective(): LapicCanonicalObjective {
  return {
    objectiveId: 'test-objective' as LapicDigest,
    objectiveKind: 'single-slot',
    expressionDigest: makeDigest('expr-0'),
    targetSlotIds: [makeSlotId(0)],
    frameIds: [],
  }
}

function makeOrderingPolicy(): LapicOrderingPolicy {
  return {
    tieBreakDimensions: ['objective-value'],
    canonicalCandidateOrdering: ['ascending'],
  }
}

function makeAdapterMetadata(): LapicAdapterMetadata {
  return {
    adapterKind: 'gi',
    adapterVersion: '0.1.0-draft',
    sourceSnapshotDigests: [makeDigest('snap-1')],
    declaredUnsupportedFeatures: [],
    metadata: {},
  }
}

function makeFullSlot(
  index: number,
  mode: 'optimizedBuild' | 'fixedBuild' = 'optimizedBuild'
): GiTeamSlotFullInput {
  return {
    layout: makeLayoutSlot(index, mode),
    equipment: makeEquipment(index),
    candidateDomain: makeCandidateDomain(index),
    provenance: makeProvenance(index),
  }
}

function makeInput(
  slotCount: number,
  overrides: Partial<GiTeamCanonicalProblemInput> = {}
): GiTeamCanonicalProblemInput {
  const slots = Array.from({ length: slotCount }, (_, i) => makeFullSlot(i))
  return {
    identity: makeIdentity(),
    slots,
    teamConfig: {},
    objective: makeObjective(),
    constraints: [],
    topN: 10,
    orderingPolicy: makeOrderingPolicy(),
    adapterMetadata: makeAdapterMetadata(),
    teamLayoutDigest: makeDigest('layout-digest'),
    sharedTeamContextDigest: makeDigest('ctx-digest'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildGiTeamCanonicalProblem', () => {
  describe('validation', () => {
    test('rejects empty slots', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(0))
      expect(result.ok).toBe(false)
    })

    test('rejects more than 4 slots', () => {
      const input = makeInput(4)
      const slots5 = [...input.slots, makeFullSlot(0)]
      // 5 slots → invalid but slotIndex duplication will also fail
      const result = buildGiTeamCanonicalProblem({
        ...input,
        slots: slots5,
      })
      expect(result.ok).toBe(false)
    })

    test('rejects duplicate slot indices', () => {
      const slot0a = makeFullSlot(0)
      const slot0b = makeFullSlot(0)
      const result = buildGiTeamCanonicalProblem({
        ...makeInput(1),
        slots: [slot0a, slot0b],
      })
      expect(result.ok).toBe(false)
    })

    test('rejects out-of-range slot index', () => {
      const badSlot: GiTeamSlotFullInput = {
        ...makeFullSlot(0),
        layout: { ...makeLayoutSlot(0), slotIndex: 5 },
      }
      const result = buildGiTeamCanonicalProblem({
        ...makeInput(1),
        slots: [badSlot],
      })
      expect(result.ok).toBe(false)
    })
  })

  describe('single-slot team', () => {
    test('builds valid canonical problem for 1 slot', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(1))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const problem = result.value
      expect(problem.problemId).toBe('test-team-problem')
      expect(problem.teamLayout.teamKind).toBe('gi-ordered-roster')
      expect(problem.teamLayout.slotCount).toBe(1)
      expect(problem.slotDescriptors).toHaveLength(1)
      expect(problem.itemDomains).toHaveLength(1)
    })
  })

  describe('full 4-character team', () => {
    test('builds valid canonical problem for 4 slots', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(4))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const problem = result.value
      expect(problem.teamLayout.slotCount).toBe(4)
      expect(problem.teamLayout.slotIds).toHaveLength(4)
      expect(problem.slotDescriptors).toHaveLength(4)
      expect(problem.itemDomains).toHaveLength(4)
    })

    test('assigns correct slot IDs', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(4))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.teamLayout.slotIds).toEqual([
        'gi-slot-0',
        'gi-slot-1',
        'gi-slot-2',
        'gi-slot-3',
      ])
    })
  })

  describe('mixed participation', () => {
    test('supports 1 optimized + 3 fixed builds', () => {
      const slots: GiTeamSlotFullInput[] = [
        makeFullSlot(0, 'optimizedBuild'),
        makeFullSlot(1, 'fixedBuild'),
        makeFullSlot(2, 'fixedBuild'),
        makeFullSlot(3, 'fixedBuild'),
      ]
      const result = buildGiTeamCanonicalProblem({
        ...makeInput(4),
        slots,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const descs = result.value.slotDescriptors
      expect(descs[0].participationMode).toBe('optimizedBuild')
      expect(descs[1].participationMode).toBe('fixedBuild')
      expect(descs[2].participationMode).toBe('fixedBuild')
      expect(descs[3].participationMode).toBe('fixedBuild')
    })
  })

  describe('provenance', () => {
    test('populates team layout and context digests', () => {
      const result = buildGiTeamCanonicalProblem(
        makeInput(2, {
          teamLayoutDigest: makeDigest('my-layout'),
          sharedTeamContextDigest: makeDigest('my-ctx'),
        })
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const prov = result.value.provenance
      expect(prov.teamLayoutDigest).toBe('my-layout')
      expect(prov.sharedTeamContextDigest).toBe('my-ctx')
    })

    test('uses default cross-slot rule version', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(1))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.provenance.crossSlotRuleDescriptorVersion).toBe(
        'gi:cross-slot-rules:v1'
      )
    })

    test('uses lapic compatibility signature schema version', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(1))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(
        result.value.provenance.compatibilitySignatureSchemaVersion
      ).toBe(lapicCompatibilitySignatureSchemaVersion)
    })

    test('enriches slot provenance with exclusive resource claims', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(2))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const slotProv = result.value.provenance.slotProvenance
      expect(slotProv).toHaveLength(2)

      // Each slot has 2 artifacts + 1 weapon = 3 resource claims
      for (const sp of slotProv) {
        expect(sp.exclusiveResourceClaims.length).toBe(3)
      }
    })
  })

  describe('compatibility rules', () => {
    test('includes GI standard compatibility rules', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(4))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const ruleIds = result.value.compatibilityRules.map((r) => r.ruleId)
      expect(ruleIds).toContain('gi:character-uniqueness')
      expect(ruleIds).toContain('gi:weapon-exclusivity')
      expect(ruleIds).toContain('gi:artifact-exclusivity')
    })
  })

  describe('shared team context', () => {
    test('uses default semantic mode', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(1))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.sharedTeamContext.adapterSemanticMode).toBe(
        'gi-legacy-compatibility'
      )
    })

    test('accepts custom semantic mode', () => {
      const result = buildGiTeamCanonicalProblem(
        makeInput(1, {
          teamConfig: { adapterSemanticMode: 'gi-canonical' },
        })
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.sharedTeamContext.adapterSemanticMode).toBe(
        'gi-canonical'
      )
    })
  })

  describe('constraints and objective pass-through', () => {
    test('passes constraints through', () => {
      const constraints: LapicCanonicalConstraint[] = [
        {
          constraintId: 'hp-min' as LapicDigest,
          kind: 'lower-bound',
          expressionDigest: makeDigest('hp-expr'),
          hard: true,
        },
      ]
      const result = buildGiTeamCanonicalProblem(
        makeInput(1, { constraints })
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.constraints).toEqual(constraints)
    })

    test('passes objective through', () => {
      const objective = makeObjective()
      const result = buildGiTeamCanonicalProblem(
        makeInput(1, { objective })
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.objective).toEqual(objective)
    })
  })

  describe('optional fields', () => {
    test('frame axis defaults to empty', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(1))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.frameAxis).toEqual([])
    })

    test('auxiliary outputs defaults to empty', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(1))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.auxiliaryOutputs).toEqual([])
    })

    test('does not include potentialConfiguration when absent', () => {
      const result = buildGiTeamCanonicalProblem(makeInput(1))
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.value.potentialConfiguration).toBeUndefined()
    })
  })
})
