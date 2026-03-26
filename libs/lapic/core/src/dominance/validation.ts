/**
 * Validation helpers for dominance primitives.
 */

import { isFullyDominated } from './compare'
import type {
  LapicDominanceVector,
  LapicSkylineGroupResult,
  LapicSkylineSummary,
} from './types'

/**
 * Returns `true` when every dimension is finite, the vector is non-empty,
 * and optional upper-bound dimensions (if present) are valid.
 */
export function isValidDominanceVector(vector: LapicDominanceVector): boolean {
  if (
    vector.dimensions.length === 0 ||
    !vector.dimensions.every((d) => Number.isFinite(d))
  )
    return false

  if (vector.upperBoundDimensions) {
    if (vector.upperBoundDimensions.length !== vector.dimensions.length)
      return false
    if (!vector.upperBoundDimensions.every((d) => Number.isFinite(d)))
      return false
    // Upper bounds must be >= corresponding point values
    for (let i = 0; i < vector.dimensions.length; i++) {
      if (vector.upperBoundDimensions[i]! < vector.dimensions[i]!) return false
    }
  }

  return true
}

/**
 * Validates the skyline invariant: no kept entry is fully dominated
 * by another kept entry (all four conditions checked).
 */
export function validateSkylineResult(
  result: LapicSkylineGroupResult
): boolean {
  for (let i = 0; i < result.kept.length; i++) {
    for (let j = i + 1; j < result.kept.length; j++) {
      const a = result.kept[i]!
      const b = result.kept[j]!
      if (isFullyDominated(a, b) || isFullyDominated(b, a)) {
        return false
      }
    }
  }
  return true
}

/**
 * Validates that the summary counts are self-consistent.
 */
export function isValidSkylineSummary(summary: LapicSkylineSummary): boolean {
  return (
    summary.totalRows >= 0 &&
    summary.keptRows >= 0 &&
    summary.dominatedCount >= 0 &&
    summary.groupCount >= 0 &&
    summary.keptRows + summary.dominatedCount === summary.totalRows
  )
}
