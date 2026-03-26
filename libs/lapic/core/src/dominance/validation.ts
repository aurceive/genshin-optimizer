/**
 * Validation helpers for dominance primitives.
 */

import { isDominated } from './compare'
import type {
  LapicDominanceVector,
  LapicSkylineGroupResult,
  LapicSkylineSummary,
} from './types'

/**
 * Returns `true` when every dimension is finite and the vector is non-empty.
 */
export function isValidDominanceVector(vector: LapicDominanceVector): boolean {
  return (
    vector.dimensions.length > 0 &&
    vector.dimensions.every((d) => Number.isFinite(d))
  )
}

/**
 * Validates the skyline invariant: no kept entry is dominated by another
 * kept entry.
 */
export function validateSkylineResult(
  result: LapicSkylineGroupResult
): boolean {
  for (let i = 0; i < result.kept.length; i++) {
    for (let j = i + 1; j < result.kept.length; j++) {
      const a = result.kept[i]!
      const b = result.kept[j]!
      if (
        isDominated(a.dimensions, b.dimensions) ||
        isDominated(b.dimensions, a.dimensions)
      ) {
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
