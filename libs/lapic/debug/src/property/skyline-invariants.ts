/**
 * Skyline soundness property invariants (§9.3).
 *
 * These properties verify that the skyline filter never produces
 * false pruning and is structurally sound.
 */

import {
  type LapicDominanceVector,
  computeSkyline,
  isDominated,
  validateSkylineResult,
} from '@genshin-optimizer/lapic/core'
import type fc from 'fast-check'

/**
 * Property: the skyline never drops a non-dominated row.
 *
 * For every entry in the original set that is NOT dominated by any
 * other entry, the entry must appear in the kept set.
 */
export function propSkylineNeverDropsNonDominated(
  entries: readonly LapicDominanceVector[]
): boolean {
  const result = computeSkyline(entries)
  const keptIds = new Set(result.kept.map((k) => k.candidateId))

  for (const entry of entries) {
    const dominatedBySomeone = entries.some(
      (other) =>
        other.candidateId !== entry.candidateId &&
        isDominated(other.dimensions, entry.dimensions)
    )
    if (!dominatedBySomeone && !keptIds.has(entry.candidateId)) {
      return false
    }
  }
  return true
}

/**
 * Property: no kept row is dominated by another kept row.
 */
export function propSkylineKeptSetIsAntichain(
  entries: readonly LapicDominanceVector[]
): boolean {
  return validateSkylineResult(computeSkyline(entries))
}

/**
 * Property: skyline is idempotent — re-running on the kept set
 * produces the same kept set with zero dominated pairs.
 */
export function propSkylineIdempotent(
  entries: readonly LapicDominanceVector[]
): boolean {
  const first = computeSkyline(entries)
  const second = computeSkyline(first.kept)
  return (
    second.kept.length === first.kept.length &&
    second.dominatedPairs.length === 0
  )
}

/**
 * Property: every dominated entry has at least one dominator in the
 * kept set.
 */
export function propEveryDominatedHasKeptDominator(
  entries: readonly LapicDominanceVector[]
): boolean {
  const result = computeSkyline(entries)
  const keptIds = new Set(result.kept.map((k) => k.candidateId))

  for (const pair of result.dominatedPairs) {
    if (!keptIds.has(pair.dominatorCandidateId)) {
      // The dominator was itself dominated — check transitively that
      // SOME kept entry dominates the dominated candidate.
      const dominatedEntry = entries.find(
        (e) => e.candidateId === pair.dominatedCandidateId
      )
      if (!dominatedEntry) return false
      const hasKeptDominator = result.kept.some((k) =>
        isDominated(k.dimensions, dominatedEntry.dimensions)
      )
      if (!hasKeptDominator) return false
    }
  }
  return true
}

/**
 * Arbitrary: generates a list of dominance vectors with consistent
 * dimension count and unique candidate IDs.
 */
export function arbDominanceVectors(
  fcLib: typeof fc,
  options?: { maxEntries?: number; maxDimensions?: number }
): fc.Arbitrary<LapicDominanceVector[]> {
  const maxEntries = options?.maxEntries ?? 20
  const maxDimensions = options?.maxDimensions ?? 5
  return fcLib.integer({ min: 1, max: maxDimensions }).chain((dimCount) =>
    fcLib.array(
      fcLib.record({
        candidateId: fcLib.uuid(),
        dimensions: fcLib.array(fcLib.integer({ min: 0, max: 100 }), {
          minLength: dimCount,
          maxLength: dimCount,
        }),
      }),
      { minLength: 0, maxLength: maxEntries }
    )
  )
}
