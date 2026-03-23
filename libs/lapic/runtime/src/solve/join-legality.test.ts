/**
 * Unit tests for the join legality oracle.
 *
 * Tests cover all 7 legality conditions from architecture spec §5.3,
 * plus edge cases for empty signatures, multi-slot compositions,
 * and the signature merge helper.
 */

import type { LapicCompatibilitySignature } from '@genshin-optimizer/lapic/core'
import {
  checkJoinLegality,
  mergeCompatibilitySignatures,
} from './join-legality'

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

function emptySignature(
  slotMask: number,
  overrides?: Partial<LapicCompatibilitySignature>
): LapicCompatibilitySignature {
  return {
    schemaVersion: '0.1.0-draft',
    occupiedSlotMask: slotMask,
    actorUniquenessClaims: [],
    exclusiveResourceClaims: [],
    aggregateCounts: [],
    remainingAggregateObligations: [],
    providedCapabilityFacts: [],
    remainingRequiredCapabilityFacts: [],
    branchCompatibilityToggles: [],
    frameAxisIdentity: { axisKind: 'none', frameIds: [] },
    adapterSemanticMode: 'gi-legacy-validated',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// §5.3 Condition 1: Occupied slot sets do not conflict
// ---------------------------------------------------------------------------

describe('checkJoinLegality — occupied slot conflict', () => {
  it('allows non-overlapping slot masks', () => {
    const a = emptySignature(0b0001) // slot 0
    const b = emptySignature(0b0010) // slot 1
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('rejects overlapping slot masks', () => {
    const a = emptySignature(0b0011) // slots 0,1
    const b = emptySignature(0b0010) // slot 1
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: 'occupiedSlotConflict' })
    )
  })
})

// ---------------------------------------------------------------------------
// §5.3 Condition 2: hardReserved resource conflicts
// ---------------------------------------------------------------------------

describe('checkJoinLegality — hardReserved resource conflicts', () => {
  it('allows different hardReserved resources', () => {
    const a = emptySignature(0b0001, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'weapon-1',
          claimedBySlotId: 'slot-0',
          reservationClass: 'hardReserved',
        },
      ],
    })
    const b = emptySignature(0b0010, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'weapon-2',
          claimedBySlotId: 'slot-1',
          reservationClass: 'hardReserved',
        },
      ],
    })
    expect(checkJoinLegality(a, b).legal).toBe(true)
  })

  it('rejects same weapon in two slots', () => {
    const a = emptySignature(0b0001, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'weapon-1',
          claimedBySlotId: 'slot-0',
          reservationClass: 'hardReserved',
        },
      ],
    })
    const b = emptySignature(0b0010, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'weapon-1',
          claimedBySlotId: 'slot-1',
          reservationClass: 'hardReserved',
        },
      ],
    })
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: 'hardReservedResourceConflict' })
    )
  })

  it('ignores cross-reservation-class: hardReserved vs summaryReserved on same id', () => {
    const a = emptySignature(0b0001, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'weapon-1',
          claimedBySlotId: 'slot-0',
          reservationClass: 'hardReserved',
        },
      ],
    })
    const b = emptySignature(0b0010, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'weapon-1',
          claimedBySlotId: 'slot-1',
          reservationClass: 'summaryReserved',
        },
      ],
    })
    // hardReserved vs summaryReserved on same resource is caught by the
    // nonReservingConcreteViolation check, not the hard-vs-hard check
    const result = checkJoinLegality(a, b)
    expect(
      result.violations.some((v) => v.kind === 'hardReservedResourceConflict')
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// §5.3 Condition 3: summaryReserved conflicts
// ---------------------------------------------------------------------------

describe('checkJoinLegality — summaryReserved conflicts', () => {
  it('rejects duplicate summaryReserved claims on same resource', () => {
    const a = emptySignature(0b0001, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:actor',
          resourceId: 'bennett',
          claimedBySlotId: 'slot-0',
          reservationClass: 'summaryReserved',
        },
      ],
    })
    const b = emptySignature(0b0010, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:actor',
          resourceId: 'bennett',
          claimedBySlotId: 'slot-1',
          reservationClass: 'summaryReserved',
        },
      ],
    })
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: 'summaryReservedConflict' })
    )
  })
})

// ---------------------------------------------------------------------------
// §5.3 Condition 4: nonReserving concrete exclusivity
// ---------------------------------------------------------------------------

describe('checkJoinLegality — nonReserving concrete violation', () => {
  it('rejects nonReserving claim alongside hardReserved on same identity', () => {
    const a = emptySignature(0b0001, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'weapon-1',
          claimedBySlotId: 'slot-0',
          reservationClass: 'hardReserved',
        },
      ],
    })
    const b = emptySignature(0b0010, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'weapon-1',
          claimedBySlotId: 'slot-1',
          reservationClass: 'nonReserving',
        },
      ],
    })
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: 'nonReservingConcreteViolation' })
    )
  })

  it('allows nonReserving claim when no hardReserved exists for same id', () => {
    const a = emptySignature(0b0001, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'weapon-2',
          claimedBySlotId: 'slot-0',
          reservationClass: 'hardReserved',
        },
      ],
    })
    const b = emptySignature(0b0010, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'weapon-1',
          claimedBySlotId: 'slot-1',
          reservationClass: 'nonReserving',
        },
      ],
    })
    const result = checkJoinLegality(a, b)
    expect(
      result.violations.some((v) => v.kind === 'nonReservingConcreteViolation')
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// §5.3 Condition 5: Actor uniqueness families
// ---------------------------------------------------------------------------

describe('checkJoinLegality — actor uniqueness', () => {
  it('rejects same character in two slots', () => {
    const a = emptySignature(0b0001, {
      actorUniquenessClaims: [
        {
          actorId: 'diluc',
          family: 'gi:character-identity',
          claimedBySlotId: 'slot-0',
        },
      ],
    })
    const b = emptySignature(0b0010, {
      actorUniquenessClaims: [
        {
          actorId: 'diluc',
          family: 'gi:character-identity',
          claimedBySlotId: 'slot-1',
        },
      ],
    })
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: 'actorUniquenessConflict' })
    )
  })

  it('allows different actors in the same family', () => {
    const a = emptySignature(0b0001, {
      actorUniquenessClaims: [
        {
          actorId: 'diluc',
          family: 'gi:character-identity',
          claimedBySlotId: 'slot-0',
        },
      ],
    })
    const b = emptySignature(0b0010, {
      actorUniquenessClaims: [
        {
          actorId: 'bennett',
          family: 'gi:character-identity',
          claimedBySlotId: 'slot-1',
        },
      ],
    })
    expect(checkJoinLegality(a, b).legal).toBe(true)
  })

  it('allows same actor ID in different families', () => {
    const a = emptySignature(0b0001, {
      actorUniquenessClaims: [
        {
          actorId: 'entity-1',
          family: 'gi:character-identity',
          claimedBySlotId: 'slot-0',
        },
      ],
    })
    const b = emptySignature(0b0010, {
      actorUniquenessClaims: [
        {
          actorId: 'entity-1',
          family: 'gi:weapon-identity',
          claimedBySlotId: 'slot-1',
        },
      ],
    })
    expect(checkJoinLegality(a, b).legal).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// §5.3 Condition 6: Semantic mode and frame-axis compatibility
// ---------------------------------------------------------------------------

describe('checkJoinLegality — semantic mode and frame axis', () => {
  it('rejects differing adapter semantic modes', () => {
    const a = emptySignature(0b0001, {
      adapterSemanticMode: 'gi-legacy-validated',
    })
    const b = emptySignature(0b0010, {
      adapterSemanticMode: 'gi-canonical',
    })
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: 'semanticModeIncompatible' })
    )
  })

  it('rejects differing frame axis kinds', () => {
    const a = emptySignature(0b0001, {
      frameAxisIdentity: { axisKind: 'none', frameIds: [] },
    })
    const b = emptySignature(0b0010, {
      frameAxisIdentity: { axisKind: 'explicit', frameIds: ['f1', 'f2'] },
    })
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: 'frameAxisIncompatible' })
    )
  })

  it('rejects differing frame IDs even with same axis kind', () => {
    const a = emptySignature(0b0001, {
      frameAxisIdentity: { axisKind: 'explicit', frameIds: ['f1', 'f2'] },
    })
    const b = emptySignature(0b0010, {
      frameAxisIdentity: { axisKind: 'explicit', frameIds: ['f1', 'f3'] },
    })
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: 'frameAxisIncompatible' })
    )
  })
})

// ---------------------------------------------------------------------------
// §5.3 Condition 7a: Aggregate obligation satisfaction
// ---------------------------------------------------------------------------

describe('checkJoinLegality — aggregate obligations', () => {
  it('satisfies when combined counts meet obligation', () => {
    const a = emptySignature(0b0001, {
      aggregateCounts: [{ counterId: 'pyro', value: 1 }],
      remainingAggregateObligations: [
        { counterId: 'pyro', minimumRequired: 2 },
      ],
    })
    const b = emptySignature(0b0010, {
      aggregateCounts: [{ counterId: 'pyro', value: 1 }],
      remainingAggregateObligations: [],
    })
    expect(checkJoinLegality(a, b).legal).toBe(true)
  })

  it('rejects when combined counts fall short', () => {
    const a = emptySignature(0b0001, {
      aggregateCounts: [{ counterId: 'pyro', value: 1 }],
      remainingAggregateObligations: [
        { counterId: 'pyro', minimumRequired: 3 },
      ],
    })
    const b = emptySignature(0b0010, {
      aggregateCounts: [{ counterId: 'pyro', value: 1 }],
      remainingAggregateObligations: [],
    })
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: 'aggregateObligationUnsatisfied' })
    )
  })

  it('handles obligations from both sides', () => {
    const a = emptySignature(0b0001, {
      aggregateCounts: [{ counterId: 'pyro', value: 2 }],
      remainingAggregateObligations: [
        { counterId: 'pyro', minimumRequired: 2 },
      ],
    })
    const b = emptySignature(0b0010, {
      aggregateCounts: [{ counterId: 'pyro', value: 1 }],
      remainingAggregateObligations: [
        { counterId: 'pyro', minimumRequired: 4 },
      ],
    })
    // Combined pyro = 3, but obligation requires 4
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// §5.3 Condition 7b: Capability obligation satisfaction
// ---------------------------------------------------------------------------

describe('checkJoinLegality — capability obligations', () => {
  it('satisfies when required capability is provided', () => {
    const a = emptySignature(0b0001, {
      remainingRequiredCapabilityFacts: [
        {
          capabilityId: 'shieldProvider',
          scope: 'all-occupied-slots',
          value: true,
        },
      ],
    })
    const b = emptySignature(0b0010, {
      providedCapabilityFacts: [
        {
          capabilityId: 'shieldProvider',
          scope: 'all-occupied-slots',
          value: true,
        },
      ],
    })
    expect(checkJoinLegality(a, b).legal).toBe(true)
  })

  it('rejects when required capability is not provided', () => {
    const a = emptySignature(0b0001, {
      remainingRequiredCapabilityFacts: [
        {
          capabilityId: 'shieldProvider',
          scope: 'all-occupied-slots',
          value: true,
        },
      ],
    })
    const b = emptySignature(0b0010)
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: 'capabilityObligationUnsatisfied' })
    )
  })

  it('satisfies requirement scoped to slot when provider is team-wide', () => {
    const a = emptySignature(0b0001, {
      remainingRequiredCapabilityFacts: [
        {
          capabilityId: 'healProvider',
          scope: 'specific-target-slot',
          targetSlotId: 'slot-0',
          value: true,
        },
      ],
    })
    const b = emptySignature(0b0010, {
      providedCapabilityFacts: [
        {
          capabilityId: 'healProvider',
          scope: 'all-occupied-slots',
          value: true,
        },
      ],
    })
    expect(checkJoinLegality(a, b).legal).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Branch compatibility toggles
// ---------------------------------------------------------------------------

describe('checkJoinLegality — branch toggles', () => {
  it('allows matching toggles', () => {
    const a = emptySignature(0b0001, {
      branchCompatibilityToggles: [
        { toggleId: 'use-resonance', enabled: true },
      ],
    })
    const b = emptySignature(0b0010, {
      branchCompatibilityToggles: [
        { toggleId: 'use-resonance', enabled: true },
      ],
    })
    expect(checkJoinLegality(a, b).legal).toBe(true)
  })

  it('rejects conflicting toggles', () => {
    const a = emptySignature(0b0001, {
      branchCompatibilityToggles: [
        { toggleId: 'use-resonance', enabled: true },
      ],
    })
    const b = emptySignature(0b0010, {
      branchCompatibilityToggles: [
        { toggleId: 'use-resonance', enabled: false },
      ],
    })
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ kind: 'branchToggleIncompatible' })
    )
  })
})

// ---------------------------------------------------------------------------
// Multi-slot composition scenarios
// ---------------------------------------------------------------------------

describe('checkJoinLegality — multi-slot compositions', () => {
  it('allows a clean 4-slot team with no conflicts', () => {
    const slots = [0b0001, 0b0010, 0b0100, 0b1000]
    const characters = ['diluc', 'bennett', 'xingqiu', 'zhongli']
    const signatures = slots.map((mask, i) =>
      emptySignature(mask, {
        actorUniquenessClaims: [
          {
            actorId: characters[i]!,
            family: 'gi:character-identity',
            claimedBySlotId: `slot-${i}`,
          },
        ],
        aggregateCounts: [
          {
            counterId: characters[i] === 'diluc' ? 'pyro' : 'other',
            value: 1,
          },
        ],
      })
    )

    // Pairwise check all pairs
    for (let i = 0; i < signatures.length; i++) {
      for (let j = i + 1; j < signatures.length; j++) {
        expect(checkJoinLegality(signatures[i]!, signatures[j]!).legal).toBe(
          true
        )
      }
    }
  })

  it('detects weapon conflict in a 3-slot composition via incremental merge', () => {
    const s0 = emptySignature(0b0001, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'primordial-jade',
          claimedBySlotId: 'slot-0',
          reservationClass: 'hardReserved',
        },
      ],
    })
    const s1 = emptySignature(0b0010)
    const s2 = emptySignature(0b0100, {
      exclusiveResourceClaims: [
        {
          resourceKind: 'gi:weapon',
          resourceId: 'primordial-jade',
          claimedBySlotId: 'slot-2',
          reservationClass: 'hardReserved',
        },
      ],
    })

    // s0 + s1 is fine
    const join01 = checkJoinLegality(s0, s1)
    expect(join01.legal).toBe(true)

    // Merge s0 + s1
    const merged01 = mergeCompatibilitySignatures(s0, s1)

    // merged01 + s2 should detect the weapon conflict
    const joinFinal = checkJoinLegality(merged01, s2)
    expect(joinFinal.legal).toBe(false)
    expect(joinFinal.violations).toContainEqual(
      expect.objectContaining({ kind: 'hardReservedResourceConflict' })
    )
  })

  it('reports multiple violations simultaneously', () => {
    const a = emptySignature(0b0001, {
      actorUniquenessClaims: [
        {
          actorId: 'diluc',
          family: 'gi:character-identity',
          claimedBySlotId: 'slot-0',
        },
      ],
      branchCompatibilityToggles: [{ toggleId: 'mode', enabled: true }],
    })
    const b = emptySignature(0b0001, {
      actorUniquenessClaims: [
        {
          actorId: 'diluc',
          family: 'gi:character-identity',
          claimedBySlotId: 'slot-1',
        },
      ],
      branchCompatibilityToggles: [{ toggleId: 'mode', enabled: false }],
    })
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(false)
    // Should report at least 3: slot overlap, actor conflict, toggle conflict
    expect(result.violations.length).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// Edge case: empty signatures
// ---------------------------------------------------------------------------

describe('checkJoinLegality — edge cases', () => {
  it('empty signatures with non-overlapping masks are always legal', () => {
    const a = emptySignature(0b0001)
    const b = emptySignature(0b0010)
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('two completely empty signatures (mask 0) are legal', () => {
    const a = emptySignature(0)
    const b = emptySignature(0)
    const result = checkJoinLegality(a, b)
    expect(result.legal).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// mergeCompatibilitySignatures
// ---------------------------------------------------------------------------

describe('mergeCompatibilitySignatures', () => {
  it('combines slot masks with bitwise OR', () => {
    const a = emptySignature(0b0001)
    const b = emptySignature(0b0010)
    const merged = mergeCompatibilitySignatures(a, b)
    expect(merged.occupiedSlotMask).toBe(0b0011)
  })

  it('concatenates actor uniqueness claims', () => {
    const a = emptySignature(0b0001, {
      actorUniquenessClaims: [
        {
          actorId: 'diluc',
          family: 'gi:character-identity',
          claimedBySlotId: 'slot-0',
        },
      ],
    })
    const b = emptySignature(0b0010, {
      actorUniquenessClaims: [
        {
          actorId: 'bennett',
          family: 'gi:character-identity',
          claimedBySlotId: 'slot-1',
        },
      ],
    })
    const merged = mergeCompatibilitySignatures(a, b)
    expect(merged.actorUniquenessClaims).toHaveLength(2)
  })

  it('sums aggregate counts for the same counter', () => {
    const a = emptySignature(0b0001, {
      aggregateCounts: [{ counterId: 'pyro', value: 1 }],
    })
    const b = emptySignature(0b0010, {
      aggregateCounts: [{ counterId: 'pyro', value: 2 }],
    })
    const merged = mergeCompatibilitySignatures(a, b)
    const pyroCt = merged.aggregateCounts.find((c) => c.counterId === 'pyro')
    expect(pyroCt?.value).toBe(3)
  })

  it('removes satisfied capability requirements after merge', () => {
    const a = emptySignature(0b0001, {
      remainingRequiredCapabilityFacts: [
        {
          capabilityId: 'shieldProvider',
          scope: 'all-occupied-slots',
          value: true,
        },
      ],
    })
    const b = emptySignature(0b0010, {
      providedCapabilityFacts: [
        {
          capabilityId: 'shieldProvider',
          scope: 'all-occupied-slots',
          value: true,
        },
      ],
    })
    const merged = mergeCompatibilitySignatures(a, b)
    expect(merged.remainingRequiredCapabilityFacts).toHaveLength(0)
    expect(merged.providedCapabilityFacts).toHaveLength(1)
  })

  it('deduplicates branch toggles by ID', () => {
    const a = emptySignature(0b0001, {
      branchCompatibilityToggles: [{ toggleId: 'mode', enabled: true }],
    })
    const b = emptySignature(0b0010, {
      branchCompatibilityToggles: [{ toggleId: 'mode', enabled: true }],
    })
    const merged = mergeCompatibilitySignatures(a, b)
    expect(merged.branchCompatibilityToggles).toHaveLength(1)
  })
})
