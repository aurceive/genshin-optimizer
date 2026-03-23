/**
 * GI Team Capability & Aggregate Facts (§4.2, §4.4, §5.2)
 *
 * Extracts team-level semantic information from GI character composition:
 * - Element count facts for resonance activation
 * - Resonance activation predicates (2+ of same element, or 4 unique)
 * - Team buff capability facts with interaction scopes
 * - Aggregate obligations (minimum element requirements)
 * - Compatibility rules (character/weapon/artifact uniqueness)
 */

import type {
  LapicAggregateCountFact,
  LapicAggregateObligation,
  LapicCapabilityFact,
  LapicCompatibilityRule,
  LapicInteractionScope,
} from '@genshin-optimizer/lapic/core'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** GI canonical element keys. */
export const GI_ELEMENT_KEYS = [
  'anemo',
  'geo',
  'electro',
  'dendro',
  'hydro',
  'pyro',
  'cryo',
] as const

export type GiElementKey = (typeof GI_ELEMENT_KEYS)[number]

/** Counter ID prefix for per-element character counts. */
export const GI_ELEMENT_COUNT_PREFIX = 'gi:element-count:' as const

/** Counter ID for unique element count. */
export const GI_UNIQUE_ELEMENT_COUNT_ID = 'gi:unique-element-count' as const

/** Capability ID prefix for resonance activation. */
export const GI_RESONANCE_CAPABILITY_PREFIX = 'gi:resonance:' as const

/** Capability ID for "rainbow" resonance (4 unique elements). */
export const GI_RAINBOW_RESONANCE_CAPABILITY_ID =
  'gi:resonance:protective-canopy' as const

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Minimal character description needed for team context extraction. */
export interface GiTeamMemberDescriptor {
  /** Character key (e.g., 'HuTao', 'Bennett'). */
  readonly characterKey: string
  /** Character's element. */
  readonly element: GiElementKey
  /** Character's weapon type (for compatibility rule descriptions). */
  readonly weaponType?: string
}

/** Input for a team buff capability fact. */
export interface GiTeamBuffInput {
  /** Capability identifier (e.g., 'gi:buff:bennett-q-atk'). */
  readonly capabilityId: string
  /** Source character providing the buff. */
  readonly sourceCharacterKey: string
  /** Scope of the buff's effect. */
  readonly scope: LapicInteractionScope
  /** Buff value (flat amount, percentage, or boolean activation). */
  readonly value: string | number | boolean
}

// ---------------------------------------------------------------------------
// Element Count Facts
// ---------------------------------------------------------------------------

/**
 * Extract per-element character count facts from a team composition.
 * Each element present in the team produces a count fact.
 */
export function extractGiElementCountFacts(
  members: readonly GiTeamMemberDescriptor[]
): readonly LapicAggregateCountFact[] {
  const counts = new Map<GiElementKey, number>()

  for (const member of members) {
    counts.set(member.element, (counts.get(member.element) ?? 0) + 1)
  }

  const facts: LapicAggregateCountFact[] = []

  for (const element of GI_ELEMENT_KEYS) {
    const count = counts.get(element) ?? 0
    if (count > 0) {
      facts.push({
        counterId: `${GI_ELEMENT_COUNT_PREFIX}${element}`,
        value: count,
      })
    }
  }

  // Also emit unique element count
  facts.push({
    counterId: GI_UNIQUE_ELEMENT_COUNT_ID,
    value: counts.size,
  })

  return facts
}

// ---------------------------------------------------------------------------
// Resonance Facts
// ---------------------------------------------------------------------------

/**
 * Derive resonance activation capability facts from element counts.
 *
 * GI resonance rules:
 * - 2+ characters of the same element → elemental resonance active
 * - 4 unique elements → Protective Canopy (rainbow) resonance
 * - At least 4 team members required for any resonance to activate
 */
export function extractGiResonanceFacts(
  members: readonly GiTeamMemberDescriptor[]
): readonly LapicCapabilityFact[] {
  if (members.length < 4) return []

  const counts = new Map<GiElementKey, number>()
  for (const member of members) {
    counts.set(member.element, (counts.get(member.element) ?? 0) + 1)
  }

  const facts: LapicCapabilityFact[] = []

  // Per-element resonance: 2+ of same element
  for (const [element, count] of counts) {
    if (count >= 2) {
      facts.push({
        capabilityId: `${GI_RESONANCE_CAPABILITY_PREFIX}${element}`,
        scope: 'all-occupied-slots',
        value: true,
      })
    }
  }

  // Rainbow resonance: 4 unique elements
  if (counts.size >= 4) {
    facts.push({
      capabilityId: GI_RAINBOW_RESONANCE_CAPABILITY_ID,
      scope: 'all-occupied-slots',
      value: true,
    })
  }

  return facts
}

// ---------------------------------------------------------------------------
// Team Buff Capabilities
// ---------------------------------------------------------------------------

/**
 * Normalize team buff inputs into capability facts with explicit scopes.
 * Each buff input produces one capability fact.
 */
export function extractGiTeamBuffCapabilities(
  buffs: readonly GiTeamBuffInput[]
): readonly LapicCapabilityFact[] {
  return buffs.map((buff) => ({
    capabilityId: buff.capabilityId,
    scope: buff.scope,
    value: buff.value,
  }))
}

// ---------------------------------------------------------------------------
// Aggregate Obligations
// ---------------------------------------------------------------------------

/**
 * Create aggregate obligations for team element requirements.
 *
 * Each obligation specifies a minimum count for a given element.
 * For example, requiring 2+ pyro characters for pyro resonance.
 */
export function createGiTeamAggregateObligations(
  requirements: readonly {
    readonly element: GiElementKey
    readonly minimumCount: number
  }[]
): readonly LapicAggregateObligation[] {
  return requirements.map((req) => ({
    counterId: `${GI_ELEMENT_COUNT_PREFIX}${req.element}`,
    minimumRequired: req.minimumCount,
  }))
}

// ---------------------------------------------------------------------------
// Compatibility Rules
// ---------------------------------------------------------------------------

/** Standard GI compatibility rules for team composition. */
export function createGiTeamCompatibilityRules(): readonly LapicCompatibilityRule[] {
  return [
    {
      ruleId: 'gi:character-uniqueness',
      description:
        'Each character may appear in at most one team slot. Enforced via actor uniqueness family gi:character-identity.',
      signatureDigest: 'gi:rule:character-uniqueness:v1',
    },
    {
      ruleId: 'gi:weapon-exclusivity',
      description:
        'Each weapon is a concrete inventory item. Two slots cannot equip the same weapon instance. Enforced via hardReserved resource claims on gi:weapon.',
      signatureDigest: 'gi:rule:weapon-exclusivity:v1',
    },
    {
      ruleId: 'gi:artifact-exclusivity',
      description:
        'Each artifact is a concrete inventory item. Two slots cannot equip the same artifact instance. Enforced via hardReserved resource claims on gi:artifact.',
      signatureDigest: 'gi:rule:artifact-exclusivity:v1',
    },
  ]
}
