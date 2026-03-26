/**
 * Extracts a dominance comparison vector from a candidate's F-IR
 * variable contributions.
 *
 * The variable map comes from `LapicFirDomainVariableMap.candidateVariables`
 * (runtime fir-bound); this module accepts the raw Map to stay
 * dependency-free from the runtime package.
 */

import type { LapicDominanceVector } from './types'

/**
 * Derives the canonical variable ordering for a domain.
 *
 * All candidates in a domain contribute to the same set of F-IR
 * variables.  Sorting by variable ID gives a deterministic dimension
 * order for pairwise comparison.
 */
export function deriveDominanceVariableOrder(
  allCandidateVariables: ReadonlyMap<string, ReadonlyMap<string, number>>
): readonly string[] {
  const ids = new Set<string>()
  for (const vars of allCandidateVariables.values()) {
    for (const varId of vars.keys()) {
      ids.add(varId)
    }
  }
  return [...ids].sort()
}

/**
 * Optional context for enriching dominance vectors with condition 3+4 data.
 */
export interface LapicDominanceVectorContext {
  /**
   * Upper-bound values per variable (condition 3).
   * Must use the same variable IDs as `candidateVariables`.
   * When absent, condition 3 is assumed satisfied (additive-safe default).
   */
  readonly upperBoundVariables?: ReadonlyMap<string, number> | undefined
  /**
   * Branch-region digest (condition 4).
   * Vectors with different digests are incomparable.
   * When absent, the candidate is region-agnostic.
   */
  readonly branchRegionDigest?: string | undefined
}

/**
 * Extracts a {@link LapicDominanceVector} for a single candidate.
 *
 * Missing variables receive value `0` (no contribution in the additive
 * F-IR model).  Optional `context` enriches the vector with upper-bound
 * and branch-region data for conditions 3 and 4.
 */
export function extractDominanceVector(
  candidateId: string,
  candidateVariables: ReadonlyMap<string, number>,
  variableOrder: readonly string[],
  context?: LapicDominanceVectorContext
): LapicDominanceVector {
  const dimensions = variableOrder.map((v) => candidateVariables.get(v) ?? 0)

  const upperBoundDimensions = context?.upperBoundVariables
    ? variableOrder.map((v) => context.upperBoundVariables!.get(v) ?? 0)
    : undefined

  return {
    candidateId,
    dimensions,
    ...(upperBoundDimensions ? { upperBoundDimensions } : {}),
    ...(context?.branchRegionDigest
      ? { branchRegionDigest: context.branchRegionDigest }
      : {}),
  }
}
