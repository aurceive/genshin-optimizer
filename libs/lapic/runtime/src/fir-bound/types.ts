import type {
  LapicFirGraph,
  LapicFirVariableId,
} from '@genshin-optimizer/lapic/core'

/**
 * Maps each candidate in a domain to the F-IR variable values
 * it contributes. Used to construct interval environments for
 * admissible upper-bound computation.
 *
 * Each variable ID should belong to at most one domain.
 * The F-IR graph handles cross-domain relationships (e.g., sums)
 * via its DAG structure.
 */
export interface LapicFirDomainVariableMap {
  /** Domain identifier (must match `problem.itemDomains[i].domainId`). */
  readonly domainId: string
  /** candidateId → (variableId → numeric value). */
  readonly candidateVariables: ReadonlyMap<
    string,
    ReadonlyMap<LapicFirVariableId, number>
  >
  /**
   * Per-candidate upper-bound variable values (condition 3, §9.3).
   * candidateId → (variableId → upper-bound numeric value).
   * When provided, skyline compression verifies that the dominator's
   * upper bounds are >= the dominated candidate's upper bounds.
   *
   * For additive F-IR models this is implied by point-value dominance
   * and may be omitted. Required for non-additive interaction models.
   */
  readonly candidateUpperBoundVariables?: ReadonlyMap<
    string,
    ReadonlyMap<LapicFirVariableId, number>
  >
  /**
   * Per-candidate branch-region digest (condition 4, §9.3).
   * candidateId → branch-region digest string.
   * Candidates with different digests are incomparable — skyline
   * compression never asserts dominance across branch regions.
   */
  readonly candidateBranchRegionDigests?: ReadonlyMap<string, string>
}

/**
 * Configuration for creating an F-IR interval bound provider.
 */
export interface LapicFirBoundProviderConfig {
  /** Pre-compiled F-IR graph for the objective function. */
  readonly graph: LapicFirGraph
  /** Variable maps for each domain in the problem. */
  readonly domainVariableMaps: readonly LapicFirDomainVariableMap[]
  /** Global constants not tied to any domain (e.g., base stats). */
  readonly globalConstants?: ReadonlyMap<LapicFirVariableId, number>
  /**
   * Converts a numeric upper bound to a string for ordering-key
   * comparison with evaluations. Default: `String(value)`.
   */
  readonly formatUpperBound?: (value: number) => string
}
