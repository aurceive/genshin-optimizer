/**
 * Tests for GI Exclusive Resource Claims & Actor Uniqueness (§4.3, §5.2, §6.1)
 */

import {
  GI_ARTIFACT_RESOURCE_KIND,
  GI_CHARACTER_UNIQUENESS_FAMILY,
  GI_WEAPON_RESOURCE_KIND,
  createGiArtifactExclusiveResourceClaims,
  createGiCharacterActorUniquenessClaim,
  createGiExclusiveClaimsForSlot,
  createGiWeaponExclusiveResourceClaim,
} from './exclusivity'

// ---------------------------------------------------------------------------
// createGiArtifactExclusiveResourceClaims
// ---------------------------------------------------------------------------

describe('createGiArtifactExclusiveResourceClaims', () => {
  test('produces one claim per artifact', () => {
    const ids = ['art-1', 'art-2', 'art-3', 'art-4', 'art-5']
    const claims = createGiArtifactExclusiveResourceClaims(ids, 'gi-slot-0')

    expect(claims).toHaveLength(5)
  })

  test('each claim has correct resource kind', () => {
    const claims = createGiArtifactExclusiveResourceClaims(
      ['art-1'],
      'gi-slot-0'
    )
    expect(claims[0].resourceKind).toBe(GI_ARTIFACT_RESOURCE_KIND)
  })

  test('each claim references the correct artifact ID', () => {
    const ids = ['flower-abc', 'plume-def']
    const claims = createGiArtifactExclusiveResourceClaims(ids, 'gi-slot-1')

    expect(claims[0].resourceId).toBe('flower-abc')
    expect(claims[1].resourceId).toBe('plume-def')
  })

  test('each claim is hardReserved', () => {
    const claims = createGiArtifactExclusiveResourceClaims(
      ['art-1', 'art-2'],
      'gi-slot-0'
    )
    for (const claim of claims) {
      expect(claim.reservationClass).toBe('hardReserved')
    }
  })

  test('each claim references the correct slot', () => {
    const claims = createGiArtifactExclusiveResourceClaims(
      ['art-1'],
      'gi-slot-2'
    )
    expect(claims[0].claimedBySlotId).toBe('gi-slot-2')
  })

  test('empty artifact list produces empty claims', () => {
    const claims = createGiArtifactExclusiveResourceClaims([], 'gi-slot-0')
    expect(claims).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// createGiWeaponExclusiveResourceClaim
// ---------------------------------------------------------------------------

describe('createGiWeaponExclusiveResourceClaim', () => {
  test('produces correct resource kind', () => {
    const claim = createGiWeaponExclusiveResourceClaim(
      'weapon-123',
      'gi-slot-0'
    )
    expect(claim.resourceKind).toBe(GI_WEAPON_RESOURCE_KIND)
  })

  test('references correct weapon ID', () => {
    const claim = createGiWeaponExclusiveResourceClaim(
      'weapon-abc',
      'gi-slot-1'
    )
    expect(claim.resourceId).toBe('weapon-abc')
  })

  test('is hardReserved', () => {
    const claim = createGiWeaponExclusiveResourceClaim(
      'weapon-123',
      'gi-slot-0'
    )
    expect(claim.reservationClass).toBe('hardReserved')
  })

  test('references correct slot', () => {
    const claim = createGiWeaponExclusiveResourceClaim(
      'weapon-123',
      'gi-slot-3'
    )
    expect(claim.claimedBySlotId).toBe('gi-slot-3')
  })
})

// ---------------------------------------------------------------------------
// createGiCharacterActorUniquenessClaim
// ---------------------------------------------------------------------------

describe('createGiCharacterActorUniquenessClaim', () => {
  test('uses character key as actor ID', () => {
    const claim = createGiCharacterActorUniquenessClaim('Hu Tao', 'gi-slot-0')
    expect(claim.actorId).toBe('Hu Tao')
  })

  test('uses gi:character-identity family', () => {
    const claim = createGiCharacterActorUniquenessClaim('Bennett', 'gi-slot-1')
    expect(claim.family).toBe(GI_CHARACTER_UNIQUENESS_FAMILY)
  })

  test('references correct slot', () => {
    const claim = createGiCharacterActorUniquenessClaim('Xingqiu', 'gi-slot-2')
    expect(claim.claimedBySlotId).toBe('gi-slot-2')
  })
})

// ---------------------------------------------------------------------------
// createGiExclusiveClaimsForSlot
// ---------------------------------------------------------------------------

describe('createGiExclusiveClaimsForSlot', () => {
  test('full slot: 5 artifacts + 1 weapon = 6 resource claims', () => {
    const result = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-0',
      characterKey: 'Hu Tao',
      artifactIds: ['art-1', 'art-2', 'art-3', 'art-4', 'art-5'],
      weaponId: 'staff-of-homa',
    })

    expect(result.resourceClaims).toHaveLength(6)

    const artifactClaims = result.resourceClaims.filter(
      (c) => c.resourceKind === GI_ARTIFACT_RESOURCE_KIND
    )
    const weaponClaims = result.resourceClaims.filter(
      (c) => c.resourceKind === GI_WEAPON_RESOURCE_KIND
    )

    expect(artifactClaims).toHaveLength(5)
    expect(weaponClaims).toHaveLength(1)
  })

  test('slot without weapon: only artifact claims', () => {
    const result = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-1',
      characterKey: 'Bennett',
      artifactIds: ['art-a', 'art-b'],
    })

    expect(result.resourceClaims).toHaveLength(2)
    for (const claim of result.resourceClaims) {
      expect(claim.resourceKind).toBe(GI_ARTIFACT_RESOURCE_KIND)
    }
  })

  test('actor uniqueness claim is always present', () => {
    const result = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-0',
      characterKey: 'Xiangling',
      artifactIds: [],
    })

    expect(result.actorUniquenessClaim.actorId).toBe('Xiangling')
    expect(result.actorUniquenessClaim.family).toBe(
      GI_CHARACTER_UNIQUENESS_FAMILY
    )
    expect(result.actorUniquenessClaim.claimedBySlotId).toBe('gi-slot-0')
  })

  test('all claims reference the same slot', () => {
    const result = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-2',
      characterKey: 'Zhongli',
      artifactIds: ['art-1', 'art-2', 'art-3'],
      weaponId: 'vortex-vanquisher',
    })

    for (const claim of result.resourceClaims) {
      expect(claim.claimedBySlotId).toBe('gi-slot-2')
    }
    expect(result.actorUniquenessClaim.claimedBySlotId).toBe('gi-slot-2')
  })
})

// ---------------------------------------------------------------------------
// Cross-slot conflict scenarios (integration-level)
// ---------------------------------------------------------------------------

describe('cross-slot conflict detection scenarios', () => {
  test('two slots sharing same artifact produce conflicting claims', () => {
    const slot0 = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-0',
      characterKey: 'Hu Tao',
      artifactIds: ['shared-artifact', 'art-2'],
      weaponId: 'weapon-a',
    })

    const slot1 = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-1',
      characterKey: 'Xiangling',
      artifactIds: ['shared-artifact', 'art-3'],
      weaponId: 'weapon-b',
    })

    // Find claims that reference the same resourceId across different slots
    const sharedClaims = slot0.resourceClaims.filter((c0) =>
      slot1.resourceClaims.some(
        (c1) =>
          c1.resourceKind === c0.resourceKind && c1.resourceId === c0.resourceId
      )
    )

    expect(sharedClaims).toHaveLength(1)
    expect(sharedClaims[0].resourceId).toBe('shared-artifact')
  })

  test('two slots sharing same weapon produce conflicting claims', () => {
    const slot0 = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-0',
      characterKey: 'Hu Tao',
      artifactIds: ['art-1'],
      weaponId: 'shared-weapon',
    })

    const slot1 = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-1',
      characterKey: 'Xiangling',
      artifactIds: ['art-2'],
      weaponId: 'shared-weapon',
    })

    const weaponConflicts = slot0.resourceClaims.filter((c0) =>
      slot1.resourceClaims.some(
        (c1) =>
          c1.resourceKind === GI_WEAPON_RESOURCE_KIND &&
          c1.resourceId === c0.resourceId
      )
    )

    expect(weaponConflicts).toHaveLength(1)
  })

  test('same character in two slots produce conflicting actor claims', () => {
    const slot0 = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-0',
      characterKey: 'Bennett',
      artifactIds: ['art-1'],
    })

    const slot1 = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-1',
      characterKey: 'Bennett',
      artifactIds: ['art-2'],
    })

    expect(slot0.actorUniquenessClaim.actorId).toBe(
      slot1.actorUniquenessClaim.actorId
    )
    expect(slot0.actorUniquenessClaim.family).toBe(
      slot1.actorUniquenessClaim.family
    )
    // Same actorId + same family across different slots = conflict
    expect(slot0.actorUniquenessClaim.claimedBySlotId).not.toBe(
      slot1.actorUniquenessClaim.claimedBySlotId
    )
  })

  test('different characters in different slots produce no conflict', () => {
    const slot0 = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-0',
      characterKey: 'Hu Tao',
      artifactIds: ['art-1', 'art-2'],
      weaponId: 'weapon-a',
    })

    const slot1 = createGiExclusiveClaimsForSlot({
      slotId: 'gi-slot-1',
      characterKey: 'Xiangling',
      artifactIds: ['art-3', 'art-4'],
      weaponId: 'weapon-b',
    })

    // No shared resource IDs
    const sharedClaims = slot0.resourceClaims.filter((c0) =>
      slot1.resourceClaims.some(
        (c1) =>
          c1.resourceKind === c0.resourceKind && c1.resourceId === c0.resourceId
      )
    )
    expect(sharedClaims).toHaveLength(0)

    // Different characters
    expect(slot0.actorUniquenessClaim.actorId).not.toBe(
      slot1.actorUniquenessClaim.actorId
    )
  })
})
