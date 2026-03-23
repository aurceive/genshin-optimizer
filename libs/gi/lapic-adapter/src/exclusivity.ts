/**
 * GI Exclusive Resource Claims & Actor Uniqueness (§4.3, §5.2, §6.1)
 *
 * GI uses hard-reserved inventory: each artifact and weapon is a concrete
 * inventory item that can only be equipped by one character at a time.
 * Characters themselves are unique — the same character cannot appear in
 * two team slots.
 *
 * This module provides factory functions that produce the claim descriptors
 * consumed by the join legality oracle during team composition.
 */

import type {
  LapicActorUniquenessClaim,
  LapicResourceClaim,
  LapicSlotId,
} from '@genshin-optimizer/lapic/core'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** GI resource kind for artifact inventory items. */
export const GI_ARTIFACT_RESOURCE_KIND = 'gi:artifact' as const

/** GI resource kind for weapon inventory items. */
export const GI_WEAPON_RESOURCE_KIND = 'gi:weapon' as const

/** GI actor uniqueness family for character identity. */
export const GI_CHARACTER_UNIQUENESS_FAMILY = 'gi:character-identity' as const

// ---------------------------------------------------------------------------
// Artifact Claims
// ---------------------------------------------------------------------------

/**
 * Create exclusive resource claims for a set of artifacts equipped by one
 * character slot.  Each artifact is a concrete inventory item with
 * `hardReserved` reservation — no other slot may claim the same artifact.
 */
export function createGiArtifactExclusiveResourceClaims(
  artifactIds: readonly string[],
  slotId: LapicSlotId
): readonly LapicResourceClaim[] {
  return artifactIds.map((artifactId) => ({
    resourceKind: GI_ARTIFACT_RESOURCE_KIND,
    resourceId: artifactId,
    claimedBySlotId: slotId,
    reservationClass: 'hardReserved' as const,
  }))
}

// ---------------------------------------------------------------------------
// Weapon Claims
// ---------------------------------------------------------------------------

/**
 * Create an exclusive resource claim for a weapon equipped by one character
 * slot.  Weapons are concrete inventory items with `hardReserved` reservation.
 */
export function createGiWeaponExclusiveResourceClaim(
  weaponId: string,
  slotId: LapicSlotId
): LapicResourceClaim {
  return {
    resourceKind: GI_WEAPON_RESOURCE_KIND,
    resourceId: weaponId,
    claimedBySlotId: slotId,
    reservationClass: 'hardReserved' as const,
  }
}

// ---------------------------------------------------------------------------
// Character Actor Uniqueness
// ---------------------------------------------------------------------------

/**
 * Create an actor uniqueness claim for a character occupying a team slot.
 * The `gi:character-identity` family prevents the same character from
 * appearing in multiple slots within a single team.
 */
export function createGiCharacterActorUniquenessClaim(
  characterKey: string,
  slotId: LapicSlotId
): LapicActorUniquenessClaim {
  return {
    actorId: characterKey,
    family: GI_CHARACTER_UNIQUENESS_FAMILY,
    claimedBySlotId: slotId,
  }
}

// ---------------------------------------------------------------------------
// Combined Slot Claims
// ---------------------------------------------------------------------------

/** Input describing the equipment of a single team slot. */
export interface GiSlotEquipmentInput {
  /** Team slot ID (e.g., 'gi-slot-0'). */
  readonly slotId: LapicSlotId
  /** Character key occupying this slot. */
  readonly characterKey: string
  /** IDs of artifacts equipped by the character. */
  readonly artifactIds: readonly string[]
  /** ID of the weapon equipped by the character (if any). */
  readonly weaponId?: string
}

/** Combined exclusive claims and actor uniqueness claims for one slot. */
export interface GiSlotExclusiveClaims {
  readonly resourceClaims: readonly LapicResourceClaim[]
  readonly actorUniquenessClaim: LapicActorUniquenessClaim
}

/**
 * Create all exclusive resource claims and the actor uniqueness claim for
 * a single GI team slot.  This is the top-level entry point that aggregates
 * artifact claims, weapon claim, and character uniqueness.
 */
export function createGiExclusiveClaimsForSlot(
  input: GiSlotEquipmentInput
): GiSlotExclusiveClaims {
  const artifactClaims = createGiArtifactExclusiveResourceClaims(
    input.artifactIds,
    input.slotId
  )

  const weaponClaim = input.weaponId
    ? [createGiWeaponExclusiveResourceClaim(input.weaponId, input.slotId)]
    : []

  return {
    resourceClaims: [...artifactClaims, ...weaponClaim],
    actorUniquenessClaim: createGiCharacterActorUniquenessClaim(
      input.characterKey,
      input.slotId
    ),
  }
}
