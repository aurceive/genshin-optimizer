/**
 * Interval arithmetic operations.
 *
 * Every operation preserves the enclosure property:
 *   if x ∈ X and y ∈ Y, then f(x,y) ∈ f(X,Y).
 *
 * Operations on empty intervals propagate emptiness.
 */

import type { LapicInterval } from './types'
import {
  LAPIC_INTERVAL_EMPTY,
  lapicInterval,
  lapicIntervalIsEmpty,
  lapicIntervalPoint,
} from './types'

// ---------------------------------------------------------------------------
// Basic arithmetic
// ---------------------------------------------------------------------------

/** [a,b] + [c,d] = [a+c, b+d] */
export function lapicIntervalAdd(a: LapicInterval, b: LapicInterval): LapicInterval {
  if (lapicIntervalIsEmpty(a) || lapicIntervalIsEmpty(b)) return LAPIC_INTERVAL_EMPTY
  return lapicInterval(a.lo + b.lo, a.hi + b.hi)
}

/** Sum of N intervals. */
export function lapicIntervalSum(intervals: readonly LapicInterval[]): LapicInterval {
  let lo = 0
  let hi = 0
  for (const iv of intervals) {
    if (lapicIntervalIsEmpty(iv)) return LAPIC_INTERVAL_EMPTY
    lo += iv.lo
    hi += iv.hi
  }
  return lapicInterval(lo, hi)
}

/** [a,b] − [c,d] = [a−d, b−c] */
export function lapicIntervalSub(a: LapicInterval, b: LapicInterval): LapicInterval {
  if (lapicIntervalIsEmpty(a) || lapicIntervalIsEmpty(b)) return LAPIC_INTERVAL_EMPTY
  return lapicInterval(a.lo - b.hi, a.hi - b.lo)
}

/** −[a,b] = [−b, −a] */
export function lapicIntervalNeg(a: LapicInterval): LapicInterval {
  if (lapicIntervalIsEmpty(a)) return LAPIC_INTERVAL_EMPTY
  return lapicInterval(-a.hi, -a.lo)
}

/** c · [a,b]  where c is a scalar. */
export function lapicIntervalScale(c: number, a: LapicInterval): LapicInterval {
  if (lapicIntervalIsEmpty(a)) return LAPIC_INTERVAL_EMPTY
  if (c >= 0) return lapicInterval(c * a.lo, c * a.hi)
  return lapicInterval(c * a.hi, c * a.lo)
}

/**
 * [a,b] × [c,d]:
 * min/max of {a·c, a·d, b·c, b·d}
 */
export function lapicIntervalMul(a: LapicInterval, b: LapicInterval): LapicInterval {
  if (lapicIntervalIsEmpty(a) || lapicIntervalIsEmpty(b)) return LAPIC_INTERVAL_EMPTY
  const p1 = a.lo * b.lo
  const p2 = a.lo * b.hi
  const p3 = a.hi * b.lo
  const p4 = a.hi * b.hi
  return lapicInterval(
    Math.min(p1, p2, p3, p4),
    Math.max(p1, p2, p3, p4)
  )
}

/** Product of N intervals. */
export function lapicIntervalProduct(intervals: readonly LapicInterval[]): LapicInterval {
  if (intervals.length === 0) return lapicIntervalPoint(1)
  let result = intervals[0]!
  for (let i = 1; i < intervals.length; i++) {
    result = lapicIntervalMul(result, intervals[i]!)
  }
  return result
}

// ---------------------------------------------------------------------------
// Min / Max
// ---------------------------------------------------------------------------

/** min([a,b], [c,d]) = [min(a,c), min(b,d)] */
export function lapicIntervalMin(a: LapicInterval, b: LapicInterval): LapicInterval {
  if (lapicIntervalIsEmpty(a) || lapicIntervalIsEmpty(b)) return LAPIC_INTERVAL_EMPTY
  return lapicInterval(Math.min(a.lo, b.lo), Math.min(a.hi, b.hi))
}

/** min of N intervals. */
export function lapicIntervalMinN(intervals: readonly LapicInterval[]): LapicInterval {
  if (intervals.length === 0) return LAPIC_INTERVAL_EMPTY
  let lo = intervals[0]!.lo
  let hi = intervals[0]!.hi
  for (let i = 1; i < intervals.length; i++) {
    const iv = intervals[i]!
    if (lapicIntervalIsEmpty(iv)) return LAPIC_INTERVAL_EMPTY
    lo = Math.min(lo, iv.lo)
    hi = Math.min(hi, iv.hi)
  }
  return lapicInterval(lo, hi)
}

/** max([a,b], [c,d]) = [max(a,c), max(b,d)] */
export function lapicIntervalMax(a: LapicInterval, b: LapicInterval): LapicInterval {
  if (lapicIntervalIsEmpty(a) || lapicIntervalIsEmpty(b)) return LAPIC_INTERVAL_EMPTY
  return lapicInterval(Math.max(a.lo, b.lo), Math.max(a.hi, b.hi))
}

/** max of N intervals. */
export function lapicIntervalMaxN(intervals: readonly LapicInterval[]): LapicInterval {
  if (intervals.length === 0) return LAPIC_INTERVAL_EMPTY
  let lo = intervals[0]!.lo
  let hi = intervals[0]!.hi
  for (let i = 1; i < intervals.length; i++) {
    const iv = intervals[i]!
    if (lapicIntervalIsEmpty(iv)) return LAPIC_INTERVAL_EMPTY
    lo = Math.max(lo, iv.lo)
    hi = Math.max(hi, iv.hi)
  }
  return lapicInterval(lo, hi)
}

// ---------------------------------------------------------------------------
// Affine form
// ---------------------------------------------------------------------------

/** bias + Σ coeff_i · interval_i */
export function lapicIntervalAffine(
  bias: number,
  terms: readonly { readonly coeff: number; readonly interval: LapicInterval }[]
): LapicInterval {
  let lo = bias
  let hi = bias
  for (const { coeff, interval } of terms) {
    if (lapicIntervalIsEmpty(interval)) return LAPIC_INTERVAL_EMPTY
    const scaled = lapicIntervalScale(coeff, interval)
    lo += scaled.lo
    hi += scaled.hi
  }
  return lapicInterval(lo, hi)
}

// ---------------------------------------------------------------------------
// Saturate
// ---------------------------------------------------------------------------

/** min(x, cap):  [min(a, cap), min(b, cap)] */
export function lapicIntervalSaturate(
  iv: LapicInterval,
  cap: number
): LapicInterval {
  if (lapicIntervalIsEmpty(iv)) return LAPIC_INTERVAL_EMPTY
  return lapicInterval(Math.min(iv.lo, cap), Math.min(iv.hi, cap))
}

// ---------------------------------------------------------------------------
// Resistance transform (Genshin)
// ---------------------------------------------------------------------------

/**
 * Point evaluation of the GI resistance transform:
 *   res < 0      → 1 − res/2
 *   0 ≤ res < 0.75 → 1 − res
 *   res ≥ 0.75   → 1 / (4·res + 1)
 */
function resistancePointEval(res: number): number {
  if (res < 0) return 1 - res / 2
  if (res < 0.75) return 1 - res
  return 1 / (4 * res + 1)
}

/**
 * Interval enclosure for the GI resistance transform.
 *
 * The function is monotonically decreasing everywhere, so the enclosure
 * is simply [f(hi), f(lo)].
 */
export function lapicIntervalResistanceTransform(iv: LapicInterval): LapicInterval {
  if (lapicIntervalIsEmpty(iv)) return LAPIC_INTERVAL_EMPTY
  const fLo = resistancePointEval(iv.lo)
  const fHi = resistancePointEval(iv.hi)
  return lapicInterval(Math.min(fLo, fHi), Math.max(fLo, fHi))
}

// ---------------------------------------------------------------------------
// Piecewise-affine kernel
// ---------------------------------------------------------------------------

/**
 * Point evaluation of a piecewise-affine function.
 * Segments must be sorted by breakpoint.
 * The last segment extends to +∞.
 */
function piecewiseAffinePointEval(
  x: number,
  segments: readonly { readonly breakpoint: number; readonly slope: number; readonly intercept: number }[]
): number {
  let seg = segments[0]!
  for (let i = 1; i < segments.length; i++) {
    if (x >= segments[i]!.breakpoint) {
      seg = segments[i]!
    } else {
      break
    }
  }
  return seg.slope * (x - seg.breakpoint) + seg.intercept
}

/**
 * Interval enclosure for piecewise-affine kernel.
 *
 * Conservative approach: evaluate at all breakpoints within [lo, hi]
 * plus endpoints, then take the envelope.
 */
export function lapicIntervalPiecewiseAffine(
  iv: LapicInterval,
  segments: readonly { readonly breakpoint: number; readonly slope: number; readonly intercept: number }[]
): LapicInterval {
  if (lapicIntervalIsEmpty(iv) || segments.length === 0) return LAPIC_INTERVAL_EMPTY

  let lo = Infinity
  let hi = -Infinity

  // Evaluate at input endpoints
  const atLo = piecewiseAffinePointEval(iv.lo, segments)
  const atHi = piecewiseAffinePointEval(iv.hi, segments)
  lo = Math.min(lo, atLo, atHi)
  hi = Math.max(hi, atLo, atHi)

  // Evaluate at interior breakpoints (potential slope changes)
  for (const seg of segments) {
    if (seg.breakpoint > iv.lo && seg.breakpoint < iv.hi) {
      const v = piecewiseAffinePointEval(seg.breakpoint, segments)
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
  }

  return lapicInterval(lo, hi)
}

// ---------------------------------------------------------------------------
// Threshold select
// ---------------------------------------------------------------------------

/**
 * Interval enclosure for thresholdSelect:
 *   guard >= threshold ? thenIv : elseIv
 *
 * If guard is entirely above threshold → thenIv.
 * If guard is entirely below threshold → elseIv.
 * Otherwise → hull of both branches.
 */
export function lapicIntervalThresholdSelect(
  guardIv: LapicInterval,
  threshold: number,
  thenIv: LapicInterval,
  elseIv: LapicInterval
): LapicInterval {
  if (lapicIntervalIsEmpty(guardIv)) return LAPIC_INTERVAL_EMPTY

  const guardAbove = guardIv.lo >= threshold
  const guardBelow = guardIv.hi < threshold

  if (guardAbove) return thenIv
  if (guardBelow) return elseIv

  // Guard straddles threshold — must consider both branches
  if (lapicIntervalIsEmpty(thenIv) && lapicIntervalIsEmpty(elseIv))
    return LAPIC_INTERVAL_EMPTY
  if (lapicIntervalIsEmpty(thenIv)) return elseIv
  if (lapicIntervalIsEmpty(elseIv)) return thenIv

  return lapicInterval(
    Math.min(thenIv.lo, elseIv.lo),
    Math.max(thenIv.hi, elseIv.hi)
  )
}