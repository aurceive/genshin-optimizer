/**
 * Pairwise dominance comparison for skyline filtering (§9.3).
 *
 * Full dominance of A over B requires all four conditions:
 *   1. Same exact signature group (handled by grouping, not here).
 *   2. A[i] >= B[i] for all i, A[j] > B[j] for at least one j.
 *   3. A.upperBound[i] >= B.upperBound[i] for all i (when provided).
 *   4. Same branchRegionDigest (when present on either vector).
 *
 * Conditions 3 and 4 are optional guards that narrow the dominance
 * relation.  When the corresponding fields are absent, the conditions
 * are assumed satisfied (backward-compatible default).
 */

import type { LapicDominanceVector } from './types'

/**
 * Returns `true` when vector `a` strictly dominates vector `b`
 * on the monotone sufficient statistics (condition 2 only).
 *
 * `a[i] >= b[i]` for all i, and `a[j] > b[j]` for at least one j.
 * Returns `false` for equal vectors (Pareto-equivalent — both kept).
 * Returns `false` when dimension counts differ (incomparable).
 */
export function isDominated(
  a: readonly number[],
  b: readonly number[]
): boolean {
  if (a.length !== b.length || a.length === 0) return false

  let strictlyBetter = false
  for (let i = 0; i < a.length; i++) {
    if (a[i]! < b[i]!) return false
    if (a[i]! > b[i]!) strictlyBetter = true
  }
  return strictlyBetter
}

/**
 * Checks whether the upper-bound guard (condition 3) holds:
 * dominator must have >= upper bounds on every dimension.
 *
 * Returns `true` when condition 3 is satisfied (dominance valid).
 * Returns `true` when either vector lacks upper bounds (additive-safe default).
 */
export function isUpperBoundGuardSatisfied(
  dominator: LapicDominanceVector,
  dominated: LapicDominanceVector
): boolean {
  if (!dominator.upperBoundDimensions || !dominated.upperBoundDimensions)
    return true
  if (
    dominator.upperBoundDimensions.length !==
    dominated.upperBoundDimensions.length
  )
    return false

  for (let i = 0; i < dominator.upperBoundDimensions.length; i++) {
    if (dominator.upperBoundDimensions[i]! < dominated.upperBoundDimensions[i]!)
      return false
  }
  return true
}

/**
 * Checks whether the branch-region guard (condition 4) holds:
 * vectors with different branchRegionDigests are incomparable.
 *
 * Returns `true` when condition 4 is satisfied (dominance valid).
 * Returns `true` when neither vector carries a digest (region-agnostic).
 */
export function isBranchRegionGuardSatisfied(
  a: LapicDominanceVector,
  b: LapicDominanceVector
): boolean {
  if (a.branchRegionDigest === undefined && b.branchRegionDigest === undefined)
    return true
  return a.branchRegionDigest === b.branchRegionDigest
}

/**
 * Full dominance check incorporating all four conditions (§9.3).
 *
 * Returns `true` when `dominator` fully dominates `dominated`:
 *   - Condition 2: Pareto-dominates on `dimensions`
 *   - Condition 3: upper-bound guard satisfied (when data present)
 *   - Condition 4: branch-region guard satisfied (when data present)
 *
 * Condition 1 (compatibility) is assumed satisfied by the caller
 * (vectors come from the same exact signature group).
 */
export function isFullyDominated(
  dominator: LapicDominanceVector,
  dominated: LapicDominanceVector
): boolean {
  if (!isDominated(dominator.dimensions, dominated.dimensions)) return false
  if (!isUpperBoundGuardSatisfied(dominator, dominated)) return false
  if (!isBranchRegionGuardSatisfied(dominator, dominated)) return false
  return true
}
