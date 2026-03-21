/**
 * Closed interval type for admissible bound computation.
 *
 * Invariant: lo ≤ hi for non-empty intervals.
 * An empty interval is represented by lo > hi (conventionally +Inf / -Inf).
 */
export interface LapicInterval {
  readonly lo: number
  readonly hi: number
}

/** Canonical empty interval. */
export const LAPIC_INTERVAL_EMPTY: LapicInterval = {
  lo: Infinity,
  hi: -Infinity,
}

/** Entire real line. */
export const LAPIC_INTERVAL_REAL: LapicInterval = {
  lo: -Infinity,
  hi: Infinity,
}

/** Point interval [v, v]. */
export function lapicIntervalPoint(v: number): LapicInterval {
  return { lo: v, hi: v }
}

/** Check if an interval is empty (lo > hi). */
export function lapicIntervalIsEmpty(iv: LapicInterval): boolean {
  return iv.lo > iv.hi
}

/** Check if an interval is a point (lo === hi and non-empty). */
export function lapicIntervalIsPoint(iv: LapicInterval): boolean {
  return iv.lo === iv.hi && Number.isFinite(iv.lo)
}

/** Create an interval [lo, hi], returning EMPTY if lo > hi. */
export function lapicInterval(lo: number, hi: number): LapicInterval {
  if (lo > hi) return LAPIC_INTERVAL_EMPTY
  return { lo, hi }
}