/**
 * Skyline (Pareto frontier) filter for a single exact signature group (§9.3).
 *
 * Given a set of dominance vectors, removes every vector that is
 * strictly dominated by at least one other vector in the set.
 * Dominance is checked using all four conditions (§9.3):
 *   1. Compatibility (implicit — same group)
 *   2. Monotone statistics (dimensions)
 *   3. Upper-bound guard (upperBoundDimensions, when present)
 *   4. Branch-region guard (branchRegionDigest, when present)
 *
 * Complexity: O(n²) pairwise comparison, acceptable for per-slot
 * frontier sizes.
 *
 * Deterministic: stable input order → stable output order.
 */

import { isFullyDominated } from './compare'
import type {
  LapicDominanceVector,
  LapicDominatedPair,
  LapicSkylineGroupResult,
} from './types'

/**
 * Computes the skyline of `entries` within a single exact signature group.
 *
 * @returns The non-dominated (kept) entries and the list of dominated pairs.
 */
export function computeSkyline<T extends LapicDominanceVector>(
  entries: readonly T[]
): LapicSkylineGroupResult<T> {
  if (entries.length <= 1) {
    return { kept: entries, dominatedPairs: [] }
  }

  const dominated = new Set<number>()
  const dominatedPairs: LapicDominatedPair[] = []

  for (let i = 0; i < entries.length; i++) {
    if (dominated.has(i)) continue
    for (let j = i + 1; j < entries.length; j++) {
      if (dominated.has(j)) continue

      const ei = entries[i]!
      const ej = entries[j]!

      if (isFullyDominated(ei, ej)) {
        dominated.add(j)
        dominatedPairs.push({
          dominatorCandidateId: ei.candidateId,
          dominatedCandidateId: ej.candidateId,
        })
      } else if (isFullyDominated(ej, ei)) {
        dominated.add(i)
        dominatedPairs.push({
          dominatorCandidateId: ej.candidateId,
          dominatedCandidateId: ei.candidateId,
        })
        break
      }
    }
  }

  const kept = entries.filter((_, index) => !dominated.has(index))
  return { kept, dominatedPairs }
}
