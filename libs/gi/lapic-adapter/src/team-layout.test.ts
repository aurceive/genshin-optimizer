/**
 * Tests for GI Team Layout Normalization (§3.1–3.6, §8.1)
 */

import type {
  LapicSlotDescriptor,
  LapicTeamLayoutDescriptor,
} from '@genshin-optimizer/lapic/core'
import {
  GI_ADAPTER_SEMANTIC_MODE,
  GI_CHARACTER_DOMAIN_ID,
  GI_TEAM_KIND,
  GI_TEAM_SLOT_IDS,
  createGiSharedTeamContext,
  createGiSlotDescriptors,
  createGiTeamLayoutDescriptor,
} from './team-layout'
import type { GiTeamLayoutInput, GiTeamSlotInput } from './team-layout'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSlot(
  overrides: Partial<GiTeamSlotInput> & { slotIndex: number }
): GiTeamSlotInput {
  return {
    role: 'off-field',
    participationMode: 'optimizedBuild',
    requirement: 'required',
    characterKey: `char-${overrides.slotIndex}`,
    ...overrides,
  }
}

function make4SlotInput(
  overrides?: Partial<GiTeamLayoutInput>
): GiTeamLayoutInput {
  return {
    slots: [
      makeSlot({ slotIndex: 0, role: 'on-field' }),
      makeSlot({ slotIndex: 1 }),
      makeSlot({ slotIndex: 2 }),
      makeSlot({ slotIndex: 3 }),
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// createGiTeamLayoutDescriptor
// ---------------------------------------------------------------------------

describe('createGiTeamLayoutDescriptor', () => {
  test('produces correct 4-slot standard team layout', () => {
    const input = make4SlotInput()
    const layout = createGiTeamLayoutDescriptor(input)

    expect(layout.teamKind).toBe(GI_TEAM_KIND)
    expect(layout.slotCount).toBe(4)
    expect(layout.slotIds).toEqual([...GI_TEAM_SLOT_IDS])
    expect(layout.slotRoleTaxonomy).toEqual(['on-field', 'off-field'])
    expect(layout.slotOrderSemantics).toBe('semantic')
    expect(layout.frameAxisKind).toBe('implicit-single')
  })

  test('all 4 slots required by default', () => {
    const layout = createGiTeamLayoutDescriptor(make4SlotInput())

    for (const slotId of GI_TEAM_SLOT_IDS) {
      expect(layout.slotRequirements[slotId]).toBe('required')
    }
  })

  test('partial team with 1 optimized + 3 fixed', () => {
    const input: GiTeamLayoutInput = {
      slots: [
        makeSlot({
          slotIndex: 0,
          role: 'on-field',
          participationMode: 'optimizedBuild',
        }),
        makeSlot({ slotIndex: 1, participationMode: 'fixedBuild' }),
        makeSlot({ slotIndex: 2, participationMode: 'fixedBuild' }),
        makeSlot({ slotIndex: 3, participationMode: 'fixedBuild' }),
      ],
    }
    const layout = createGiTeamLayoutDescriptor(input)

    expect(layout.slotCount).toBe(4)
    // All slots still required — participation mode doesn't change requirement
    for (const slotId of GI_TEAM_SLOT_IDS) {
      expect(layout.slotRequirements[slotId]).toBe('required')
    }
  })

  test('partial team with optional empty slot', () => {
    const input: GiTeamLayoutInput = {
      slots: [
        makeSlot({ slotIndex: 0, role: 'on-field' }),
        makeSlot({ slotIndex: 1 }),
        makeSlot({ slotIndex: 2 }),
        makeSlot({
          slotIndex: 3,
          requirement: 'optional',
          characterKey: undefined,
        }),
      ],
    }
    const layout = createGiTeamLayoutDescriptor(input)

    expect(layout.slotCount).toBe(4)
    expect(layout.slotRequirements['gi-slot-0']).toBe('required')
    expect(layout.slotRequirements['gi-slot-3']).toBe('optional')
  })

  test('2-slot partial team', () => {
    const input: GiTeamLayoutInput = {
      slots: [
        makeSlot({ slotIndex: 0, role: 'on-field' }),
        makeSlot({ slotIndex: 1 }),
      ],
    }
    const layout = createGiTeamLayoutDescriptor(input)

    expect(layout.slotCount).toBe(2)
    expect(layout.slotIds).toEqual(['gi-slot-0', 'gi-slot-1'])
  })

  test('fixed-external slot requirement', () => {
    const input: GiTeamLayoutInput = {
      slots: [
        makeSlot({ slotIndex: 0, role: 'on-field' }),
        makeSlot({
          slotIndex: 1,
          requirement: 'fixed-external',
          participationMode: 'externalSummary',
        }),
        makeSlot({ slotIndex: 2 }),
        makeSlot({ slotIndex: 3 }),
      ],
    }
    const layout = createGiTeamLayoutDescriptor(input)
    expect(layout.slotRequirements['gi-slot-1']).toBe('fixed-external')
  })

  test('satisfies LapicTeamLayoutDescriptor shape', () => {
    const layout = createGiTeamLayoutDescriptor(make4SlotInput())
    const _check: LapicTeamLayoutDescriptor = layout
    expect(_check).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// createGiSlotDescriptors
// ---------------------------------------------------------------------------

describe('createGiSlotDescriptors', () => {
  test('produces 4 slot descriptors with correct IDs', () => {
    const descriptors = createGiSlotDescriptors(make4SlotInput())

    expect(descriptors).toHaveLength(4)
    expect(descriptors.map((d) => d.slotId)).toEqual([...GI_TEAM_SLOT_IDS])
  })

  test('all slots use gi:character domain', () => {
    const descriptors = createGiSlotDescriptors(make4SlotInput())

    for (const d of descriptors) {
      expect(d.occupantDomainId).toBe(GI_CHARACTER_DOMAIN_ID)
    }
  })

  test('all slots use hard-reserved-inventory ownership', () => {
    const descriptors = createGiSlotDescriptors(make4SlotInput())

    for (const d of descriptors) {
      expect(d.equipmentOwnershipModel).toBe('hard-reserved-inventory')
    }
  })

  test('optimized slots contribute to objective', () => {
    const input = make4SlotInput({
      slots: [
        makeSlot({
          slotIndex: 0,
          role: 'on-field',
          participationMode: 'optimizedBuild',
        }),
        makeSlot({ slotIndex: 1, participationMode: 'fixedBuild' }),
        makeSlot({ slotIndex: 2, participationMode: 'optimizedBuild' }),
        makeSlot({ slotIndex: 3, participationMode: 'externalSummary' }),
      ],
    })
    const descriptors = createGiSlotDescriptors(input)

    expect(descriptors[0].contributesToObjective).toBe(true)
    expect(descriptors[1].contributesToObjective).toBe(false)
    expect(descriptors[2].contributesToObjective).toBe(true)
    expect(descriptors[3].contributesToObjective).toBe(false)
  })

  test('fixed slots contribute to constraints but not objective', () => {
    const input = make4SlotInput({
      slots: [
        makeSlot({
          slotIndex: 0,
          role: 'on-field',
          participationMode: 'optimizedBuild',
        }),
        makeSlot({ slotIndex: 1, participationMode: 'fixedBuild' }),
        makeSlot({ slotIndex: 2, participationMode: 'fixedBuild' }),
        makeSlot({ slotIndex: 3, participationMode: 'fixedBuild' }),
      ],
    })
    const descriptors = createGiSlotDescriptors(input)

    // Fixed slots contribute to constraints (they're required, not optional)
    expect(descriptors[1].contributesToConstraints).toBe(true)
    expect(descriptors[1].contributesToObjective).toBe(false)
  })

  test('optional slot may remain empty', () => {
    const input = make4SlotInput({
      slots: [
        makeSlot({ slotIndex: 0, role: 'on-field' }),
        makeSlot({ slotIndex: 1 }),
        makeSlot({ slotIndex: 2 }),
        makeSlot({
          slotIndex: 3,
          requirement: 'optional',
          characterKey: undefined,
        }),
      ],
    })
    const descriptors = createGiSlotDescriptors(input)

    expect(descriptors[0].mayRemainEmpty).toBe(false)
    expect(descriptors[3].mayRemainEmpty).toBe(true)
  })

  test('optional slot does not contribute to constraints', () => {
    const input = make4SlotInput({
      slots: [
        makeSlot({ slotIndex: 0, role: 'on-field' }),
        makeSlot({ slotIndex: 1 }),
        makeSlot({ slotIndex: 2 }),
        makeSlot({
          slotIndex: 3,
          requirement: 'optional',
          participationMode: 'fixedBuild',
        }),
      ],
    })
    const descriptors = createGiSlotDescriptors(input)

    // Optional + fixedBuild → doesn't contribute to constraints
    expect(descriptors[3].contributesToConstraints).toBe(false)
    expect(descriptors[3].contributesToObjective).toBe(false)
  })

  test('role passthrough', () => {
    const input = make4SlotInput({
      slots: [
        makeSlot({ slotIndex: 0, role: 'on-field' }),
        makeSlot({ slotIndex: 1, role: 'off-field' }),
        makeSlot({ slotIndex: 2, role: 'off-field' }),
        makeSlot({ slotIndex: 3, role: 'off-field' }),
      ],
    })
    const descriptors = createGiSlotDescriptors(input)

    expect(descriptors[0].slotRole).toBe('on-field')
    expect(descriptors[1].slotRole).toBe('off-field')
  })

  test('participation mode matrix', () => {
    const modes = [
      'optimizedBuild',
      'optimizedOccupantAndBuild',
      'fixedBuild',
      'externalSummary',
    ] as const
    const input: GiTeamLayoutInput = {
      slots: modes.map((mode, i) =>
        makeSlot({ slotIndex: i, participationMode: mode })
      ),
    }
    const descriptors = createGiSlotDescriptors(input)

    expect(descriptors[0].participationMode).toBe('optimizedBuild')
    expect(descriptors[1].participationMode).toBe('optimizedOccupantAndBuild')
    expect(descriptors[2].participationMode).toBe('fixedBuild')
    expect(descriptors[3].participationMode).toBe('externalSummary')
  })

  test('satisfies LapicSlotDescriptor shape', () => {
    const descriptors = createGiSlotDescriptors(make4SlotInput())
    const _check: readonly LapicSlotDescriptor[] = descriptors
    expect(_check).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// createGiSharedTeamContext
// ---------------------------------------------------------------------------

describe('createGiSharedTeamContext', () => {
  test('uses default adapter semantic mode', () => {
    const ctx = createGiSharedTeamContext(make4SlotInput())
    expect(ctx.adapterSemanticMode).toBe(GI_ADAPTER_SEMANTIC_MODE)
  })

  test('overrides adapter semantic mode', () => {
    const ctx = createGiSharedTeamContext(
      make4SlotInput({ adapterSemanticMode: 'gi-canonical' })
    )
    expect(ctx.adapterSemanticMode).toBe('gi-canonical')
  })

  test('omits environmentDigest when not provided', () => {
    const ctx = createGiSharedTeamContext(make4SlotInput())
    expect(ctx.environmentDigest).toBeUndefined()
  })

  test('includes environmentDigest when provided', () => {
    const ctx = createGiSharedTeamContext(
      make4SlotInput({ environmentDigest: 'env-abc123' })
    )
    expect(ctx.environmentDigest).toBe('env-abc123')
  })

  test('omits sharedConditionalsDigest when not provided', () => {
    const ctx = createGiSharedTeamContext(make4SlotInput())
    expect(ctx.sharedConditionalsDigest).toBeUndefined()
  })

  test('includes sharedConditionalsDigest when provided', () => {
    const ctx = createGiSharedTeamContext(
      make4SlotInput({ sharedConditionalsDigest: 'cond-xyz789' })
    )
    expect(ctx.sharedConditionalsDigest).toBe('cond-xyz789')
  })

  test('empty aggregate facts by default', () => {
    const ctx = createGiSharedTeamContext(make4SlotInput())
    expect(ctx.aggregateFacts).toEqual({})
  })

  test('passes through aggregate facts', () => {
    const facts = {
      'pyro-count': 2,
      'geo-resonance': true,
      'team-element-diversity': 'rainbow',
    }
    const ctx = createGiSharedTeamContext(
      make4SlotInput({ aggregateFacts: facts })
    )
    expect(ctx.aggregateFacts).toEqual(facts)
  })

  test('empty metadata by default', () => {
    const ctx = createGiSharedTeamContext(make4SlotInput())
    expect(ctx.metadata).toEqual({})
  })

  test('passes through metadata', () => {
    const metadata = {
      adapterVersion: '0.1.0-draft',
      snapshotDigest: 'snap-123',
    }
    const ctx = createGiSharedTeamContext(make4SlotInput({ metadata }))
    expect(ctx.metadata).toEqual(metadata)
  })

  test('full context with all fields', () => {
    const input = make4SlotInput({
      adapterSemanticMode: 'gi-canonical',
      environmentDigest: 'env-digest',
      sharedConditionalsDigest: 'cond-digest',
      aggregateFacts: { 'pyro-count': 2 },
      metadata: { version: '1.0' },
    })
    const ctx = createGiSharedTeamContext(input)

    expect(ctx.adapterSemanticMode).toBe('gi-canonical')
    expect(ctx.environmentDigest).toBe('env-digest')
    expect(ctx.sharedConditionalsDigest).toBe('cond-digest')
    expect(ctx.aggregateFacts).toEqual({ 'pyro-count': 2 })
    expect(ctx.metadata).toEqual({ version: '1.0' })
  })
})

// ---------------------------------------------------------------------------
// Integration: all three factories together
// ---------------------------------------------------------------------------

describe('GI team layout integration', () => {
  test('all three factories produce consistent output for 4-slot team', () => {
    const input = make4SlotInput({
      aggregateFacts: { 'pyro-count': 2, 'geo-resonance': false },
      environmentDigest: 'enemy-override-digest',
    })

    const layout = createGiTeamLayoutDescriptor(input)
    const descriptors = createGiSlotDescriptors(input)
    const context = createGiSharedTeamContext(input)

    // Layout and descriptors agree on slot count
    expect(layout.slotCount).toBe(descriptors.length)

    // Layout slot IDs match descriptor slot IDs
    expect(layout.slotIds).toEqual(descriptors.map((d) => d.slotId))

    // Context carries environment digest
    expect(context.environmentDigest).toBe('enemy-override-digest')

    // All descriptors reference the character domain
    for (const d of descriptors) {
      expect(d.occupantDomainId).toBe(GI_CHARACTER_DOMAIN_ID)
    }
  })

  test('single-slot-optimized team (1 active + 3 locked)', () => {
    const input: GiTeamLayoutInput = {
      slots: [
        makeSlot({
          slotIndex: 0,
          role: 'on-field',
          participationMode: 'optimizedBuild',
        }),
        makeSlot({ slotIndex: 1, participationMode: 'fixedBuild' }),
        makeSlot({ slotIndex: 2, participationMode: 'fixedBuild' }),
        makeSlot({ slotIndex: 3, participationMode: 'fixedBuild' }),
      ],
    }

    const layout = createGiTeamLayoutDescriptor(input)
    const descriptors = createGiSlotDescriptors(input)

    expect(layout.slotCount).toBe(4)

    // Only slot 0 contributes to objective
    const objectiveSlots = descriptors.filter((d) => d.contributesToObjective)
    expect(objectiveSlots).toHaveLength(1)
    expect(objectiveSlots[0].slotId).toBe('gi-slot-0')
  })
})
