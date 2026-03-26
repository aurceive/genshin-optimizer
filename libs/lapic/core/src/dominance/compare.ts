/**
 * Pairwise dominance comparison for skyline filtering (§9.3).
 *
 * State A dominates state B iff:
 *   A[i] >= B[i] for every dimension i, AND
 *   A[i] >  B[i] for at least one dimension i.
 *
 * Both vectors must have the same length (same exact signature group).
 * Vectors with different lengths are treated as incomparable.
 */

/**
 * Returns `true` when vector `a` strictly dominates vector `b`:
 * `a[i] >= b[i]` for all i, and `a[j] > b[j]` for at least one j.
 *
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
