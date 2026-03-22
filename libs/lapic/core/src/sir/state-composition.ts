import type {
  LapicCandidateDescriptor,
  LapicCanonicalProblem,
  LapicFrameAxisIdentity,
} from '../types'

/**
 * Derive the canonical frame-axis identity from a problem descriptor.
 *
 * This is the single source of truth for frame-axis identity throughout
 * the SIR layer — runtime frontier builders and adapters should call
 * this instead of constructing the identity inline.
 */
export function createFrameAxisIdentity(
  problem: LapicCanonicalProblem
): LapicFrameAxisIdentity {
  return {
    axisKind: problem.teamLayout.frameAxisKind,
    frameIds: problem.frameAxis.map((frame) => frame.frameId),
  }
}

/**
 * Build a deterministic state identifier from a problem and a fully
 * assigned set of candidates.  The resulting string is used as the
 * canonical key for top-N tracking and certificate cross-referencing.
 */
export function createCombinationStateId(
  problem: LapicCanonicalProblem,
  candidates: readonly LapicCandidateDescriptor[]
): string {
  return `state:${problem.problemDigest}:${candidates
    .map((candidate) => `${candidate.slotId}:${candidate.candidateId}`)
    .join('|')}`
}

/**
 * Check whether a set of candidates contains conflicting exclusive-
 * resource claims (e.g. the same weapon equipped by two characters).
 *
 * Returns `true` when at least one resource key appears more than
 * once, indicating an infeasible combination.
 */
export function hasExclusiveResourceConflict(
  candidates: readonly LapicCandidateDescriptor[]
): boolean {
  const seenClaims = new Set<string>()

  for (const candidate of candidates) {
    for (const claim of candidate.provenance.exclusiveResourceClaims) {
      const claimKey = [claim.resourceKind, claim.resourceId].join('|')
      if (seenClaims.has(claimKey)) return true
      seenClaims.add(claimKey)
    }
  }

  return false
}
