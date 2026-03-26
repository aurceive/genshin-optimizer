/**
 * Dominance comparison primitives for skyline frontier compression (§9.3).
 *
 * A candidate's dominance vector is the ordered tuple of its monotone
 * sufficient statistics.  Two vectors are comparable only when they
 * share the same group key (exactSignatureGroupKey digest) and the
 * same dimension count.
 */

/**
 * A candidate's position in the dominance comparison space.
 * Each dimension corresponds to one F-IR variable contributed by the
 * candidate within its domain.
 */
export interface LapicDominanceVector {
  readonly candidateId: string
  readonly dimensions: readonly number[]
}

/**
 * Records a single dominance relationship: `dominatorCandidateId`
 * dominates `dominatedCandidateId` within the same exact signature group.
 */
export interface LapicDominatedPair {
  readonly dominatorCandidateId: string
  readonly dominatedCandidateId: string
}

/**
 * Result of running the skyline filter on one exact signature group.
 */
export interface LapicSkylineGroupResult<
  T extends LapicDominanceVector = LapicDominanceVector,
> {
  readonly kept: readonly T[]
  readonly dominatedPairs: readonly LapicDominatedPair[]
}

/**
 * Aggregate statistics recorded on the frontier block after
 * skyline compression (§8.3 skylineSummary).
 */
export interface LapicSkylineSummary {
  readonly totalRows: number
  readonly keptRows: number
  readonly dominatedCount: number
  readonly groupCount: number
}
