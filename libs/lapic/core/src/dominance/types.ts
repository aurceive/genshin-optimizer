/**
 * Dominance comparison primitives for skyline frontier compression (§9.3).
 *
 * A candidate's dominance vector is the ordered tuple of its monotone
 * sufficient statistics.  Two vectors are comparable only when they
 * share the same group key (exactSignatureGroupKey digest) and the
 * same dimension count.
 *
 * Full dominance requires four conditions (§9.3):
 *   1. Compatibility — same exact signature group key (handled by grouping).
 *   2. Monotone statistics — a[i] >= b[i] for all i (dimensions).
 *   3. Upper-bound guard — a's upper bound >= b's upper bound on all dims.
 *   4. Branch-region guard — same branch region (incomparable across regions).
 */

/**
 * A candidate's position in the dominance comparison space.
 * Each dimension corresponds to one F-IR variable contributed by the
 * candidate within its domain.
 */
export interface LapicDominanceVector {
  readonly candidateId: string
  /** Monotone sufficient statistics (condition 2). */
  readonly dimensions: readonly number[]
  /**
   * Upper-bound dimensions for condition 3 (§9.3).
   * When present, the dominator must also have >= upper bounds on every
   * dimension for dominance to hold.  Must have the same length as
   * `dimensions` when provided.
   *
   * For additive F-IR models, condition 3 is mathematically implied
   * by condition 2 (a >= b pointwise ⇒ a+c >= b+c for any completion c).
   * This field enables condition 3 for non-additive or interaction models
   * where the implication does not hold.
   *
   * When absent, condition 3 is assumed satisfied (additive-safe default).
   */
  readonly upperBoundDimensions?: readonly number[]
  /**
   * Branch-region digest for condition 4 (§9.3).
   * Candidates with different branch-region digests are treated as
   * incomparable — dominance is never asserted across branch regions.
   *
   * When absent, the candidate is considered region-agnostic and can
   * be compared with any other candidate in the same group.
   */
  readonly branchRegionDigest?: string
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
