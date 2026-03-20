import type {
  LapicActorUniquenessClaim,
  LapicDeterministicOrderingRelation,
  LapicResourceClaim,
} from '../types'

export function createLapicActorUniquenessClaimOrderingKey(
  claim: LapicActorUniquenessClaim
): string {
  return [claim.family, claim.actorId, claim.claimedBySlotId].join('|')
}

export function createLapicResourceClaimOrderingKey(claim: LapicResourceClaim): string {
  return [
    claim.reservationClass,
    claim.resourceKind,
    claim.resourceId,
    claim.claimedBySlotId,
  ].join('|')
}

export function compareLapicStringArrays(
  left: readonly string[],
  right: readonly string[]
): LapicDeterministicOrderingRelation {
  const sharedLength = Math.min(left.length, right.length)

  for (let index = 0; index < sharedLength; index += 1) {
    if (left[index]! < right[index]!) return -1
    if (left[index]! > right[index]!) return 1
  }

  if (left.length < right.length) return -1
  if (left.length > right.length) return 1

  return 0
}