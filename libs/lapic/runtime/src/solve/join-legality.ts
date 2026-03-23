/**
 * Join legality oracle for multi-slot team composition.
 *
 * Implements the legality conditions from architecture spec §5.3:
 * two partial states are join-compatible only if ALL of the following hold:
 *
 * 1. Their occupied slot sets do not conflict.
 * 2. Their hardReserved resource claims do not conflict on any concrete
 *    exclusive identity.
 * 3. Their summaryReserved claims do not conflict on any logical actor
 *    or declared semantic exclusivity family.
 * 4. No nonReserving contribution treats concrete exclusive inventory
 *    identity.
 * 5. Their actor uniqueness families do not conflict.
 * 6. Their semantic mode and frame-axis identities are join-compatible.
 * 7. Their combined aggregate counts and capability facts do not violate
 *    any hard team rule.
 */

import type {
  LapicAggregateCountFact,
  LapicAggregateObligation,
  LapicCapabilityFact,
  LapicCompatibilitySignature,
  LapicCompatibilityToggle,
  LapicResourceClaim,
} from '@genshin-optimizer/lapic/core'

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type JoinLegalityViolationKind =
  | 'occupiedSlotConflict'
  | 'hardReservedResourceConflict'
  | 'summaryReservedConflict'
  | 'nonReservingConcreteViolation'
  | 'actorUniquenessConflict'
  | 'semanticModeIncompatible'
  | 'frameAxisIncompatible'
  | 'aggregateObligationUnsatisfied'
  | 'capabilityObligationUnsatisfied'
  | 'branchToggleIncompatible'

export interface JoinLegalityViolation {
  readonly kind: JoinLegalityViolationKind
  readonly message: string
}

export interface JoinLegalityResult {
  readonly legal: boolean
  readonly violations: readonly JoinLegalityViolation[]
}

// ---------------------------------------------------------------------------
// Individual legality checks
// ---------------------------------------------------------------------------

function checkOccupiedSlotConflict(
  a: LapicCompatibilitySignature,
  b: LapicCompatibilitySignature
): JoinLegalityViolation | undefined {
  if ((a.occupiedSlotMask & b.occupiedSlotMask) !== 0) {
    return {
      kind: 'occupiedSlotConflict',
      message: `Occupied slot masks overlap: 0b${a.occupiedSlotMask.toString(2)} & 0b${b.occupiedSlotMask.toString(2)}`,
    }
  }
  return undefined
}

function checkHardReservedResourceConflicts(
  a: LapicCompatibilitySignature,
  b: LapicCompatibilitySignature
): JoinLegalityViolation | undefined {
  const hardClaimsA = a.exclusiveResourceClaims.filter(
    (c) => c.reservationClass === 'hardReserved'
  )
  const hardClaimsB = b.exclusiveResourceClaims.filter(
    (c) => c.reservationClass === 'hardReserved'
  )

  for (const claimA of hardClaimsA) {
    for (const claimB of hardClaimsB) {
      if (
        claimA.resourceKind === claimB.resourceKind &&
        claimA.resourceId === claimB.resourceId
      ) {
        return {
          kind: 'hardReservedResourceConflict',
          message: `hardReserved conflict on ${claimA.resourceKind}:${claimA.resourceId} (slots ${claimA.claimedBySlotId} vs ${claimB.claimedBySlotId})`,
        }
      }
    }
  }
  return undefined
}

function checkSummaryReservedConflicts(
  a: LapicCompatibilitySignature,
  b: LapicCompatibilitySignature
): JoinLegalityViolation | undefined {
  const summaryClaimsA = a.exclusiveResourceClaims.filter(
    (c) => c.reservationClass === 'summaryReserved'
  )
  const summaryClaimsB = b.exclusiveResourceClaims.filter(
    (c) => c.reservationClass === 'summaryReserved'
  )

  for (const claimA of summaryClaimsA) {
    for (const claimB of summaryClaimsB) {
      if (
        claimA.resourceKind === claimB.resourceKind &&
        claimA.resourceId === claimB.resourceId
      ) {
        return {
          kind: 'summaryReservedConflict',
          message: `summaryReserved conflict on ${claimA.resourceKind}:${claimA.resourceId} (slots ${claimA.claimedBySlotId} vs ${claimB.claimedBySlotId})`,
        }
      }
    }
  }
  return undefined
}

function checkNonReservingConcreteViolation(
  claims: readonly LapicResourceClaim[]
): JoinLegalityViolation | undefined {
  for (const claim of claims) {
    if (claim.reservationClass === 'nonReserving') {
      // nonReserving claims must not reference concrete exclusive
      // inventory identity — check if any other claim on the same
      // resource is hardReserved (indicating concrete identity)
      const concreteExists = claims.some(
        (other) =>
          other !== claim &&
          other.resourceKind === claim.resourceKind &&
          other.resourceId === claim.resourceId &&
          other.reservationClass === 'hardReserved'
      )
      if (concreteExists) {
        return {
          kind: 'nonReservingConcreteViolation',
          message: `nonReserving claim on ${claim.resourceKind}:${claim.resourceId} conflicts with a hardReserved claim on the same identity`,
        }
      }
    }
  }
  return undefined
}

function checkActorUniquenessConflicts(
  a: LapicCompatibilitySignature,
  b: LapicCompatibilitySignature
): JoinLegalityViolation | undefined {
  for (const claimA of a.actorUniquenessClaims) {
    for (const claimB of b.actorUniquenessClaims) {
      if (
        claimA.family === claimB.family &&
        claimA.actorId === claimB.actorId
      ) {
        return {
          kind: 'actorUniquenessConflict',
          message: `Actor uniqueness conflict: ${claimA.actorId} in family ${claimA.family} (slots ${claimA.claimedBySlotId} vs ${claimB.claimedBySlotId})`,
        }
      }
    }
  }
  return undefined
}

function checkSemanticModeCompatibility(
  a: LapicCompatibilitySignature,
  b: LapicCompatibilitySignature
): JoinLegalityViolation | undefined {
  if (a.adapterSemanticMode !== b.adapterSemanticMode) {
    return {
      kind: 'semanticModeIncompatible',
      message: `Adapter semantic modes differ: '${a.adapterSemanticMode}' vs '${b.adapterSemanticMode}'`,
    }
  }
  return undefined
}

function checkFrameAxisCompatibility(
  a: LapicCompatibilitySignature,
  b: LapicCompatibilitySignature
): JoinLegalityViolation | undefined {
  const axisA = a.frameAxisIdentity
  const axisB = b.frameAxisIdentity
  if (axisA.axisKind !== axisB.axisKind) {
    return {
      kind: 'frameAxisIncompatible',
      message: `Frame axis kinds differ: '${axisA.axisKind}' vs '${axisB.axisKind}'`,
    }
  }
  if (axisA.frameIds.length !== axisB.frameIds.length) {
    return {
      kind: 'frameAxisIncompatible',
      message: `Frame axis lengths differ: ${axisA.frameIds.length} vs ${axisB.frameIds.length}`,
    }
  }
  for (let i = 0; i < axisA.frameIds.length; i++) {
    if (axisA.frameIds[i] !== axisB.frameIds[i]) {
      return {
        kind: 'frameAxisIncompatible',
        message: `Frame axis differs at index ${i}: '${axisA.frameIds[i]}' vs '${axisB.frameIds[i]}'`,
      }
    }
  }
  return undefined
}

function mergeAggregateCounts(
  a: readonly LapicAggregateCountFact[],
  b: readonly LapicAggregateCountFact[]
): LapicAggregateCountFact[] {
  const merged = new Map<string, number>()
  for (const fact of a) {
    merged.set(fact.counterId, (merged.get(fact.counterId) ?? 0) + fact.value)
  }
  for (const fact of b) {
    merged.set(fact.counterId, (merged.get(fact.counterId) ?? 0) + fact.value)
  }
  return [...merged.entries()].map(([counterId, value]) => ({
    counterId,
    value,
  }))
}

function mergeAggregateObligations(
  a: readonly LapicAggregateObligation[],
  b: readonly LapicAggregateObligation[]
): LapicAggregateObligation[] {
  const merged = new Map<string, number>()
  for (const obl of a) {
    merged.set(
      obl.counterId,
      Math.max(merged.get(obl.counterId) ?? 0, obl.minimumRequired)
    )
  }
  for (const obl of b) {
    merged.set(
      obl.counterId,
      Math.max(merged.get(obl.counterId) ?? 0, obl.minimumRequired)
    )
  }
  return [...merged.entries()].map(([counterId, minimumRequired]) => ({
    counterId,
    minimumRequired,
  }))
}

function checkAggregateObligations(
  a: LapicCompatibilitySignature,
  b: LapicCompatibilitySignature
): JoinLegalityViolation | undefined {
  const combinedCounts = mergeAggregateCounts(
    a.aggregateCounts,
    b.aggregateCounts
  )
  const combinedObligations = mergeAggregateObligations(
    a.remainingAggregateObligations,
    b.remainingAggregateObligations
  )

  for (const obligation of combinedObligations) {
    const achieved =
      combinedCounts.find((c) => c.counterId === obligation.counterId)?.value ??
      0
    if (achieved < obligation.minimumRequired) {
      return {
        kind: 'aggregateObligationUnsatisfied',
        message: `Aggregate obligation unsatisfied for '${obligation.counterId}': achieved ${achieved}, required ${obligation.minimumRequired}`,
      }
    }
  }
  return undefined
}

function mergeCapabilities(
  a: readonly LapicCapabilityFact[],
  b: readonly LapicCapabilityFact[]
): LapicCapabilityFact[] {
  return [...a, ...b]
}

function isCapabilitySatisfied(
  required: LapicCapabilityFact,
  provided: readonly LapicCapabilityFact[]
): boolean {
  return provided.some(
    (p) =>
      p.capabilityId === required.capabilityId &&
      p.value === required.value &&
      isCapabilityScopeCompatible(required.scope, p.scope)
  )
}

function isCapabilityScopeCompatible(
  requiredScope: string,
  providedScope: string
): boolean {
  // A team-wide or all-occupied-slots scope satisfies any slot-scoped
  // requirement. Exact self-only scope only satisfies self-only.
  if (providedScope === requiredScope) return true
  if (
    providedScope === 'all-occupied-slots' ||
    providedScope === 'team-aggregate'
  )
    return true
  return false
}

function checkCapabilityObligations(
  a: LapicCompatibilitySignature,
  b: LapicCompatibilitySignature
): JoinLegalityViolation | undefined {
  const allProvided = mergeCapabilities(
    a.providedCapabilityFacts,
    b.providedCapabilityFacts
  )

  for (const required of a.remainingRequiredCapabilityFacts) {
    if (!isCapabilitySatisfied(required, allProvided)) {
      return {
        kind: 'capabilityObligationUnsatisfied',
        message: `Capability '${required.capabilityId}' required but not provided`,
      }
    }
  }
  for (const required of b.remainingRequiredCapabilityFacts) {
    if (!isCapabilitySatisfied(required, allProvided)) {
      return {
        kind: 'capabilityObligationUnsatisfied',
        message: `Capability '${required.capabilityId}' required but not provided`,
      }
    }
  }
  return undefined
}

function checkBranchToggleCompatibility(
  a: LapicCompatibilitySignature,
  b: LapicCompatibilitySignature
): JoinLegalityViolation | undefined {
  for (const toggleA of a.branchCompatibilityToggles) {
    for (const toggleB of b.branchCompatibilityToggles) {
      if (
        toggleA.toggleId === toggleB.toggleId &&
        toggleA.enabled !== toggleB.enabled
      ) {
        return {
          kind: 'branchToggleIncompatible',
          message: `Branch toggle '${toggleA.toggleId}' conflict: ${toggleA.enabled} vs ${toggleB.enabled}`,
        }
      }
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether two compatibility signatures are join-legal per §5.3.
 *
 * Returns a result with `legal: true` when all 7 legality conditions hold,
 * or `legal: false` with the list of violations detected.
 *
 * This is the pairwise oracle. For N-way joins, apply pairwise checks
 * between each new partial state and the accumulated joined state.
 */
export function checkJoinLegality(
  a: LapicCompatibilitySignature,
  b: LapicCompatibilitySignature
): JoinLegalityResult {
  const violations: JoinLegalityViolation[] = []

  const checks = [
    checkOccupiedSlotConflict(a, b),
    checkHardReservedResourceConflicts(a, b),
    checkSummaryReservedConflicts(a, b),
    checkNonReservingConcreteViolation([
      ...a.exclusiveResourceClaims,
      ...b.exclusiveResourceClaims,
    ]),
    checkActorUniquenessConflicts(a, b),
    checkSemanticModeCompatibility(a, b),
    checkFrameAxisCompatibility(a, b),
    checkAggregateObligations(a, b),
    checkCapabilityObligations(a, b),
    checkBranchToggleCompatibility(a, b),
  ]

  for (const result of checks) {
    if (result) violations.push(result)
  }

  return { legal: violations.length === 0, violations }
}

/**
 * Merge two compatible signatures into a combined signature representing
 * the joined state. Call only after `checkJoinLegality()` returns legal.
 */
export function mergeCompatibilitySignatures(
  a: LapicCompatibilitySignature,
  b: LapicCompatibilitySignature
): LapicCompatibilitySignature {
  const allProvided = mergeCapabilities(
    a.providedCapabilityFacts,
    b.providedCapabilityFacts
  )

  // Remaining required = those from both sides that are still not satisfied
  const remainingRequired = [
    ...a.remainingRequiredCapabilityFacts,
    ...b.remainingRequiredCapabilityFacts,
  ].filter((req) => !isCapabilitySatisfied(req, allProvided))

  // Merge aggregate obligations: after join, subtract achieved from required
  const combinedCounts = mergeAggregateCounts(
    a.aggregateCounts,
    b.aggregateCounts
  )
  const combinedObligations = mergeAggregateObligations(
    a.remainingAggregateObligations,
    b.remainingAggregateObligations
  )
  const remainingObligations = combinedObligations.filter((obl) => {
    const achieved =
      combinedCounts.find((c) => c.counterId === obl.counterId)?.value ?? 0
    return achieved < obl.minimumRequired
  })

  // Merge toggles: deduplicate by toggleId (values must match per legality)
  const toggleMap = new Map<string, LapicCompatibilityToggle>()
  for (const t of a.branchCompatibilityToggles) toggleMap.set(t.toggleId, t)
  for (const t of b.branchCompatibilityToggles) toggleMap.set(t.toggleId, t)

  return {
    schemaVersion: a.schemaVersion,
    occupiedSlotMask: a.occupiedSlotMask | b.occupiedSlotMask,
    actorUniquenessClaims: [
      ...a.actorUniquenessClaims,
      ...b.actorUniquenessClaims,
    ],
    exclusiveResourceClaims: [
      ...a.exclusiveResourceClaims,
      ...b.exclusiveResourceClaims,
    ],
    aggregateCounts: combinedCounts,
    remainingAggregateObligations: remainingObligations,
    providedCapabilityFacts: allProvided,
    remainingRequiredCapabilityFacts: remainingRequired,
    branchCompatibilityToggles: [...toggleMap.values()],
    frameAxisIdentity: a.frameAxisIdentity,
    adapterSemanticMode: a.adapterSemanticMode,
  }
}
