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
 * Extracts a {@link LapicDominanceVector} for a single candidate.
 *
 * Missing variables receive value `0` (no contribution in the additive
 * F-IR model).
 */
export function extractDominanceVector(
  candidateId: string,
  candidateVariables: ReadonlyMap<string, number>,
  variableOrder: readonly string[]
): LapicDominanceVector {
  return {
    candidateId,
    dimensions: variableOrder.map((v) => candidateVariables.get(v) ?? 0),
  }
}
