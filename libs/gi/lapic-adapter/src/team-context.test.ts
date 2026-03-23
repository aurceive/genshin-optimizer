/**
 * Tests for GI Team Capability & Aggregate Facts (§4.2, §4.4, §5.2)
 */

import {
  GI_ELEMENT_COUNT_PREFIX,
  GI_RAINBOW_RESONANCE_CAPABILITY_ID,
  GI_RESONANCE_CAPABILITY_PREFIX,
  GI_UNIQUE_ELEMENT_COUNT_ID,
  createGiTeamAggregateObligations,
  createGiTeamCompatibilityRules,
  extractGiElementCountFacts,
  extractGiResonanceFacts,
  extractGiTeamBuffCapabilities,
} from './team-context'
import type { GiTeamBuffInput, GiTeamMemberDescriptor } from './team-context'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMember(
  characterKey: string,
  element: GiTeamMemberDescriptor['element']
): GiTeamMemberDescriptor {
  return { characterKey, element }
}

// ---------------------------------------------------------------------------
// extractGiElementCountFacts
// ---------------------------------------------------------------------------

describe('extractGiElementCountFacts', () => {
  test('single pyro character → pyro-count 1', () => {
    const facts = extractGiElementCountFacts([makeMember('HuTao', 'pyro')])

    const pyroCt = facts.find(
      (f) => f.counterId === `${GI_ELEMENT_COUNT_PREFIX}pyro`
    )
    expect(pyroCt).toBeDefined()
    expect(pyroCt!.value).toBe(1)
  })

  test('2 pyro characters → pyro-count 2', () => {
    const facts = extractGiElementCountFacts([
      makeMember('HuTao', 'pyro'),
      makeMember('Xiangling', 'pyro'),
    ])

    const pyroCt = facts.find(
      (f) => f.counterId === `${GI_ELEMENT_COUNT_PREFIX}pyro`
    )
    expect(pyroCt!.value).toBe(2)
  })

  test('mixed team: correct per-element counts', () => {
    const facts = extractGiElementCountFacts([
      makeMember('HuTao', 'pyro'),
      makeMember('Xingqiu', 'hydro'),
      makeMember('Zhongli', 'geo'),
      makeMember('Bennett', 'pyro'),
    ])

    const pyro = facts.find(
      (f) => f.counterId === `${GI_ELEMENT_COUNT_PREFIX}pyro`
    )
    const hydro = facts.find(
      (f) => f.counterId === `${GI_ELEMENT_COUNT_PREFIX}hydro`
    )
    const geo = facts.find(
      (f) => f.counterId === `${GI_ELEMENT_COUNT_PREFIX}geo`
    )

    expect(pyro!.value).toBe(2)
    expect(hydro!.value).toBe(1)
    expect(geo!.value).toBe(1)
  })

  test('emits unique element count', () => {
    const facts = extractGiElementCountFacts([
      makeMember('HuTao', 'pyro'),
      makeMember('Xingqiu', 'hydro'),
      makeMember('Zhongli', 'geo'),
      makeMember('Bennett', 'pyro'),
    ])

    const unique = facts.find((f) => f.counterId === GI_UNIQUE_ELEMENT_COUNT_ID)
    expect(unique!.value).toBe(3) // pyro, hydro, geo
  })

  test('does not emit facts for absent elements', () => {
    const facts = extractGiElementCountFacts([makeMember('HuTao', 'pyro')])

    const hydro = facts.find(
      (f) => f.counterId === `${GI_ELEMENT_COUNT_PREFIX}hydro`
    )
    expect(hydro).toBeUndefined()
  })

  test('empty team → only unique count (0)', () => {
    const facts = extractGiElementCountFacts([])

    expect(facts).toHaveLength(1)
    expect(facts[0].counterId).toBe(GI_UNIQUE_ELEMENT_COUNT_ID)
    expect(facts[0].value).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// extractGiResonanceFacts
// ---------------------------------------------------------------------------

describe('extractGiResonanceFacts', () => {
  test('2 pyro in 4-member team → pyro resonance active', () => {
    const facts = extractGiResonanceFacts([
      makeMember('HuTao', 'pyro'),
      makeMember('Xiangling', 'pyro'),
      makeMember('Xingqiu', 'hydro'),
      makeMember('Zhongli', 'geo'),
    ])

    const pyroRes = facts.find(
      (f) => f.capabilityId === `${GI_RESONANCE_CAPABILITY_PREFIX}pyro`
    )
    expect(pyroRes).toBeDefined()
    expect(pyroRes!.value).toBe(true)
    expect(pyroRes!.scope).toBe('all-occupied-slots')
  })

  test('4 unique elements → rainbow resonance', () => {
    const facts = extractGiResonanceFacts([
      makeMember('Kazuha', 'anemo'),
      makeMember('Xingqiu', 'hydro'),
      makeMember('Raiden', 'electro'),
      makeMember('Bennett', 'pyro'),
    ])

    const rainbow = facts.find(
      (f) => f.capabilityId === GI_RAINBOW_RESONANCE_CAPABILITY_ID
    )
    expect(rainbow).toBeDefined()
    expect(rainbow!.value).toBe(true)
  })

  test('3-member team → no resonance (requires 4)', () => {
    const facts = extractGiResonanceFacts([
      makeMember('HuTao', 'pyro'),
      makeMember('Xiangling', 'pyro'),
      makeMember('Xingqiu', 'hydro'),
    ])

    expect(facts).toHaveLength(0)
  })

  test('4 characters, 2 pairs → dual resonance', () => {
    const facts = extractGiResonanceFacts([
      makeMember('HuTao', 'pyro'),
      makeMember('Bennett', 'pyro'),
      makeMember('Xingqiu', 'hydro'),
      makeMember('Yelan', 'hydro'),
    ])

    const pyroRes = facts.find(
      (f) => f.capabilityId === `${GI_RESONANCE_CAPABILITY_PREFIX}pyro`
    )
    const hydroRes = facts.find(
      (f) => f.capabilityId === `${GI_RESONANCE_CAPABILITY_PREFIX}hydro`
    )
    expect(pyroRes).toBeDefined()
    expect(hydroRes).toBeDefined()
  })

  test('4 same-element characters → single resonance, no rainbow', () => {
    const facts = extractGiResonanceFacts([
      makeMember('HuTao', 'pyro'),
      makeMember('Xiangling', 'pyro'),
      makeMember('Bennett', 'pyro'),
      makeMember('Yanfei', 'pyro'),
    ])

    const pyroRes = facts.find(
      (f) => f.capabilityId === `${GI_RESONANCE_CAPABILITY_PREFIX}pyro`
    )
    const rainbow = facts.find(
      (f) => f.capabilityId === GI_RAINBOW_RESONANCE_CAPABILITY_ID
    )
    expect(pyroRes).toBeDefined()
    expect(rainbow).toBeUndefined() // Only 1 unique element
  })

  test('no duplicate elements among 4 → rainbow only, no elemental resonance', () => {
    const facts = extractGiResonanceFacts([
      makeMember('Kazuha', 'anemo'),
      makeMember('Xingqiu', 'hydro'),
      makeMember('Raiden', 'electro'),
      makeMember('Zhongli', 'geo'),
    ])

    // No elemental resonance (no 2+ of same element)
    const elementalResonances = facts.filter(
      (f) =>
        f.capabilityId.startsWith(GI_RESONANCE_CAPABILITY_PREFIX) &&
        f.capabilityId !== GI_RAINBOW_RESONANCE_CAPABILITY_ID
    )
    expect(elementalResonances).toHaveLength(0)

    // Rainbow resonance present
    const rainbow = facts.find(
      (f) => f.capabilityId === GI_RAINBOW_RESONANCE_CAPABILITY_ID
    )
    expect(rainbow).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// extractGiTeamBuffCapabilities
// ---------------------------------------------------------------------------

describe('extractGiTeamBuffCapabilities', () => {
  test('normalizes buff inputs into capability facts', () => {
    const buffs: GiTeamBuffInput[] = [
      {
        capabilityId: 'gi:buff:bennett-q-atk',
        sourceCharacterKey: 'Bennett',
        scope: 'all-occupied-slots',
        value: 1200,
      },
    ]

    const facts = extractGiTeamBuffCapabilities(buffs)

    expect(facts).toHaveLength(1)
    expect(facts[0].capabilityId).toBe('gi:buff:bennett-q-atk')
    expect(facts[0].scope).toBe('all-occupied-slots')
    expect(facts[0].value).toBe(1200)
  })

  test('preserves scope distinctions', () => {
    const buffs: GiTeamBuffInput[] = [
      {
        capabilityId: 'gi:buff:self-buff',
        sourceCharacterKey: 'HuTao',
        scope: 'self-only',
        value: true,
      },
      {
        capabilityId: 'gi:buff:team-buff',
        sourceCharacterKey: 'Bennett',
        scope: 'all-occupied-slots',
        value: 1200,
      },
      {
        capabilityId: 'gi:buff:enemy-debuff',
        sourceCharacterKey: 'Zhongli',
        scope: 'enemy-or-environment-aggregate',
        value: -0.2,
      },
    ]

    const facts = extractGiTeamBuffCapabilities(buffs)

    expect(facts[0].scope).toBe('self-only')
    expect(facts[1].scope).toBe('all-occupied-slots')
    expect(facts[2].scope).toBe('enemy-or-environment-aggregate')
  })

  test('empty buffs → empty facts', () => {
    const facts = extractGiTeamBuffCapabilities([])
    expect(facts).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// createGiTeamAggregateObligations
// ---------------------------------------------------------------------------

describe('createGiTeamAggregateObligations', () => {
  test('creates obligation for 2+ pyro', () => {
    const obligations = createGiTeamAggregateObligations([
      { element: 'pyro', minimumCount: 2 },
    ])

    expect(obligations).toHaveLength(1)
    expect(obligations[0].counterId).toBe(`${GI_ELEMENT_COUNT_PREFIX}pyro`)
    expect(obligations[0].minimumRequired).toBe(2)
  })

  test('creates multiple obligations', () => {
    const obligations = createGiTeamAggregateObligations([
      { element: 'pyro', minimumCount: 2 },
      { element: 'hydro', minimumCount: 1 },
    ])

    expect(obligations).toHaveLength(2)
  })

  test('empty requirements → empty obligations', () => {
    const obligations = createGiTeamAggregateObligations([])
    expect(obligations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// createGiTeamCompatibilityRules
// ---------------------------------------------------------------------------

describe('createGiTeamCompatibilityRules', () => {
  test('produces 3 standard rules', () => {
    const rules = createGiTeamCompatibilityRules()
    expect(rules).toHaveLength(3)
  })

  test('includes character uniqueness rule', () => {
    const rules = createGiTeamCompatibilityRules()
    const charRule = rules.find((r) => r.ruleId === 'gi:character-uniqueness')
    expect(charRule).toBeDefined()
    expect(charRule!.description).toContain('character')
  })

  test('includes weapon exclusivity rule', () => {
    const rules = createGiTeamCompatibilityRules()
    const weaponRule = rules.find((r) => r.ruleId === 'gi:weapon-exclusivity')
    expect(weaponRule).toBeDefined()
    expect(weaponRule!.description).toContain('weapon')
  })

  test('includes artifact exclusivity rule', () => {
    const rules = createGiTeamCompatibilityRules()
    const artRule = rules.find((r) => r.ruleId === 'gi:artifact-exclusivity')
    expect(artRule).toBeDefined()
    expect(artRule!.description).toContain('artifact')
  })

  test('all rules have non-empty signatureDigest', () => {
    const rules = createGiTeamCompatibilityRules()
    for (const rule of rules) {
      expect(rule.signatureDigest.length).toBeGreaterThan(0)
    }
  })
})
