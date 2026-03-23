/**
 * GI Team Layout Normalization (§3.1–3.6, §8.1)
 *
 * Factory functions that produce team-level descriptors for Genshin Impact's
 * ordered 4-member roster.  These bridge GI's concrete team representation
 * into the game-agnostic lapic type system.
 *
 * Three main factories:
 * - createGiTeamLayoutDescriptor — team shape and slot topology
 * - createGiSlotDescriptors — per-slot participation and ownership
 * - createGiSharedTeamContext — environment, resonance facts, adapter mode
 */

import type {
  LapicDigest,
  LapicSharedTeamContext,
  LapicSlotDescriptor,
  LapicSlotId,
  LapicSlotParticipationMode,
  LapicSlotRequirement,
  LapicTeamLayoutDescriptor,
} from '@genshin-optimizer/lapic/core'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** GI canonical team kind identifier. */
export const GI_TEAM_KIND = 'gi-ordered-roster' as const

/** GI team-level slot IDs. */
export const GI_TEAM_SLOT_IDS = [
  'gi-slot-0',
  'gi-slot-1',
  'gi-slot-2',
  'gi-slot-3',
] as const satisfies readonly LapicSlotId[]

/** GI canonical role taxonomy for team members. */
export const GI_SLOT_ROLE_TAXONOMY = ['on-field', 'off-field'] as const

/** Default character domain. */
export const GI_CHARACTER_DOMAIN_ID = 'gi:character' as const

/** Default adapter semantic mode. */
export const GI_ADAPTER_SEMANTIC_MODE = 'gi-legacy-compatibility' as const

// ---------------------------------------------------------------------------
// Input types — callers supply GI-specific team configuration
// ---------------------------------------------------------------------------

/**
 * Per-slot configuration supplied by the caller. The caller decides which
 * slot is actively optimized, which is locked to a fixed build, etc.
 */
export interface GiTeamSlotInput {
  /** Slot index (0-3). */
  readonly slotIndex: number
  /** Role hint — typically 'on-field' or 'off-field'. */
  readonly role: string
  /** Whether this slot is actively optimized or locked/external. */
  readonly participationMode: LapicSlotParticipationMode
  /** Whether the slot is required, optional, or fixed-external. */
  readonly requirement: LapicSlotRequirement
  /**
   * Character key occupying this slot (if any).
   * A slot with requirement='optional' may leave this undefined.
   */
  readonly characterKey?: string
}

/** Top-level input for creating GI team layout descriptors. */
export interface GiTeamLayoutInput {
  /** Per-slot configurations. Must have 1–4 entries. */
  readonly slots: readonly GiTeamSlotInput[]
  /**
   * Adapter semantic mode override.
   * @default GI_ADAPTER_SEMANTIC_MODE ('gi-legacy-compatibility')
   */
  readonly adapterSemanticMode?: string
  /** Digest of the environment (enemy override, domain conditions). */
  readonly environmentDigest?: LapicDigest
  /** Digest of shared conditionals (resonance activation, faction rules). */
  readonly sharedConditionalsDigest?: LapicDigest
  /**
   * Aggregate facts for the team: element counts, faction booleans, etc.
   * Keys are adapter-defined strings such as 'pyro-count', 'geo-resonance'.
   */
  readonly aggregateFacts?: Readonly<Record<string, string | number | boolean>>
  /** Arbitrary metadata entries (adapter version, snapshot digest, etc.). */
  readonly metadata?: Readonly<Record<string, string>>
}

// ---------------------------------------------------------------------------
// Factory: Team Layout Descriptor
// ---------------------------------------------------------------------------

/**
 * Create a `LapicTeamLayoutDescriptor` for a GI ordered team roster.
 *
 * The descriptor captures the team *shape* — how many slots, their IDs,
 * their order semantics, and the requirement level per slot.
 */
export function createGiTeamLayoutDescriptor(
  input: GiTeamLayoutInput
): LapicTeamLayoutDescriptor {
  const slotCount = input.slots.length
  const slotIds = input.slots.map((_, i) => GI_TEAM_SLOT_IDS[i] as LapicSlotId)
  const slotRequirements: Record<LapicSlotId, LapicSlotRequirement> = {}
  for (const slot of input.slots) {
    slotRequirements[GI_TEAM_SLOT_IDS[slot.slotIndex] as LapicSlotId] =
      slot.requirement
  }

  return {
    teamKind: GI_TEAM_KIND,
    slotCount,
    slotIds,
    slotRoleTaxonomy: [...GI_SLOT_ROLE_TAXONOMY],
    slotRequirements,
    slotOrderSemantics: 'semantic',
    frameAxisKind: 'implicit-single',
  }
}

// ---------------------------------------------------------------------------
// Factory: Slot Descriptors
// ---------------------------------------------------------------------------

/**
 * Create `LapicSlotDescriptor[]` for a GI team.
 *
 * Each descriptor captures per-slot participation, ownership model, and
 * whether the slot contributes to the objective or constraints.
 */
export function createGiSlotDescriptors(
  input: GiTeamLayoutInput
): readonly LapicSlotDescriptor[] {
  return input.slots.map((slot) => {
    const slotId = GI_TEAM_SLOT_IDS[slot.slotIndex] as LapicSlotId
    const isOptimized =
      slot.participationMode === 'optimizedBuild' ||
      slot.participationMode === 'optimizedOccupantAndBuild'
    const mayRemainEmpty = slot.requirement === 'optional'

    return {
      slotId,
      slotRole: slot.role,
      participationMode: slot.participationMode,
      occupantDomainId: GI_CHARACTER_DOMAIN_ID,
      equipmentOwnershipModel: 'hard-reserved-inventory' as const,
      contributesToObjective: isOptimized,
      contributesToConstraints: isOptimized || !mayRemainEmpty,
      mayRemainEmpty,
    }
  })
}

// ---------------------------------------------------------------------------
// Factory: Shared Team Context
// ---------------------------------------------------------------------------

/**
 * Create a `LapicSharedTeamContext` for a GI team.
 *
 * The context carries the adapter semantic mode, environment digest,
 * and aggregate facts that apply across all slots (resonance counts, etc.).
 */
export function createGiSharedTeamContext(
  input: GiTeamLayoutInput
): LapicSharedTeamContext {
  return {
    adapterSemanticMode: input.adapterSemanticMode ?? GI_ADAPTER_SEMANTIC_MODE,
    ...(input.environmentDigest !== undefined
      ? { environmentDigest: input.environmentDigest }
      : {}),
    ...(input.sharedConditionalsDigest !== undefined
      ? { sharedConditionalsDigest: input.sharedConditionalsDigest }
      : {}),
    aggregateFacts: input.aggregateFacts ?? {},
    metadata: input.metadata ?? {},
  }
}
