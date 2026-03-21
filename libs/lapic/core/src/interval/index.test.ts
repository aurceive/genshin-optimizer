import { describe, expect, it } from 'vitest'
import {
  LAPIC_INTERVAL_EMPTY,
  LAPIC_INTERVAL_REAL,
  lapicInterval,
  lapicIntervalIsEmpty,
  lapicIntervalIsPoint,
  lapicIntervalPoint,
} from './types'
import {
  lapicIntervalAdd,
  lapicIntervalAffine,
  lapicIntervalMax,
  lapicIntervalMaxN,
  lapicIntervalMin,
  lapicIntervalMinN,
  lapicIntervalMul,
  lapicIntervalNeg,
  lapicIntervalPiecewiseAffine,
  lapicIntervalProduct,
  lapicIntervalResistanceTransform,
  lapicIntervalSaturate,
  lapicIntervalScale,
  lapicIntervalSub,
  lapicIntervalSum,
  lapicIntervalThresholdSelect,
} from './arithmetic'

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

describe('LapicInterval types', () => {
  it('creates point intervals', () => {
    const p = lapicIntervalPoint(3)
    expect(p.lo).toBe(3)
    expect(p.hi).toBe(3)
    expect(lapicIntervalIsPoint(p)).toBe(true)
    expect(lapicIntervalIsEmpty(p)).toBe(false)
  })

  it('detects empty intervals', () => {
    expect(lapicIntervalIsEmpty(LAPIC_INTERVAL_EMPTY)).toBe(true)
    expect(lapicIntervalIsEmpty(lapicInterval(5, 3))).toBe(true)
    expect(lapicIntervalIsEmpty(lapicInterval(1, 2))).toBe(false)
  })

  it('creates intervals clamping to empty', () => {
    const iv = lapicInterval(10, 5)
    expect(lapicIntervalIsEmpty(iv)).toBe(true)
  })

  it('REAL interval spans full line', () => {
    expect(LAPIC_INTERVAL_REAL.lo).toBe(-Infinity)
    expect(LAPIC_INTERVAL_REAL.hi).toBe(Infinity)
  })
})

// ---------------------------------------------------------------------------
// Basic arithmetic
// ---------------------------------------------------------------------------

describe('interval arithmetic', () => {
  it('adds intervals', () => {
    const r = lapicIntervalAdd(lapicInterval(1, 3), lapicInterval(2, 5))
    expect(r.lo).toBe(3)
    expect(r.hi).toBe(8)
  })

  it('subtracts intervals', () => {
    const r = lapicIntervalSub(lapicInterval(5, 10), lapicInterval(1, 3))
    expect(r.lo).toBe(2)
    expect(r.hi).toBe(9)
  })

  it('negates intervals', () => {
    const r = lapicIntervalNeg(lapicInterval(2, 5))
    expect(r.lo).toBe(-5)
    expect(r.hi).toBe(-2)
  })

  it('scales intervals by positive scalar', () => {
    const r = lapicIntervalScale(3, lapicInterval(1, 4))
    expect(r.lo).toBe(3)
    expect(r.hi).toBe(12)
  })

  it('scales intervals by negative scalar', () => {
    const r = lapicIntervalScale(-2, lapicInterval(1, 4))
    expect(r.lo).toBe(-8)
    expect(r.hi).toBe(-2)
  })

  it('multiplies positive intervals', () => {
    const r = lapicIntervalMul(lapicInterval(2, 3), lapicInterval(4, 5))
    expect(r.lo).toBe(8)
    expect(r.hi).toBe(15)
  })

  it('multiplies intervals with mixed signs', () => {
    const r = lapicIntervalMul(lapicInterval(-2, 3), lapicInterval(-1, 4))
    expect(r.lo).toBe(-8)
    expect(r.hi).toBe(12)
  })

  it('sums N intervals', () => {
    const r = lapicIntervalSum([
      lapicInterval(1, 2),
      lapicInterval(3, 4),
      lapicInterval(5, 6),
    ])
    expect(r.lo).toBe(9)
    expect(r.hi).toBe(12)
  })

  it('computes product of N intervals', () => {
    const r = lapicIntervalProduct([
      lapicIntervalPoint(2),
      lapicIntervalPoint(3),
      lapicIntervalPoint(5),
    ])
    expect(r.lo).toBe(30)
    expect(r.hi).toBe(30)
  })

  it('propagates empty through add', () => {
    const r = lapicIntervalAdd(lapicInterval(1, 3), LAPIC_INTERVAL_EMPTY)
    expect(lapicIntervalIsEmpty(r)).toBe(true)
  })

  it('propagates empty through mul', () => {
    const r = lapicIntervalMul(LAPIC_INTERVAL_EMPTY, lapicInterval(2, 5))
    expect(lapicIntervalIsEmpty(r)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Min / Max
// ---------------------------------------------------------------------------

describe('interval min/max', () => {
  it('computes min of two intervals', () => {
    const r = lapicIntervalMin(lapicInterval(1, 5), lapicInterval(3, 7))
    expect(r.lo).toBe(1)
    expect(r.hi).toBe(5)
  })

  it('computes max of two intervals', () => {
    const r = lapicIntervalMax(lapicInterval(1, 5), lapicInterval(3, 7))
    expect(r.lo).toBe(3)
    expect(r.hi).toBe(7)
  })

  it('computes minN', () => {
    const r = lapicIntervalMinN([
      lapicInterval(2, 8),
      lapicInterval(1, 5),
      lapicInterval(4, 10),
    ])
    expect(r.lo).toBe(1)
    expect(r.hi).toBe(5)
  })

  it('computes maxN', () => {
    const r = lapicIntervalMaxN([
      lapicInterval(2, 8),
      lapicInterval(1, 5),
      lapicInterval(4, 10),
    ])
    expect(r.lo).toBe(4)
    expect(r.hi).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Affine form
// ---------------------------------------------------------------------------

describe('interval affine', () => {
  it('computes affine combination', () => {
    // 10 + 2*[1,3] + (-1)*[2,4] = [10+2-4, 10+6-2] = [8, 14]
    const r = lapicIntervalAffine(10, [
      { coeff: 2, interval: lapicInterval(1, 3) },
      { coeff: -1, interval: lapicInterval(2, 4) },
    ])
    expect(r.lo).toBe(8)
    expect(r.hi).toBe(14)
  })
})

// ---------------------------------------------------------------------------
// Saturate
// ---------------------------------------------------------------------------

describe('interval saturate', () => {
  it('saturates above cap', () => {
    const r = lapicIntervalSaturate(lapicInterval(5, 10), 8)
    expect(r.lo).toBe(5)
    expect(r.hi).toBe(8)
  })

  it('no-op when below cap', () => {
    const r = lapicIntervalSaturate(lapicInterval(1, 3), 10)
    expect(r.lo).toBe(1)
    expect(r.hi).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Resistance transform
// ---------------------------------------------------------------------------

describe('interval resistance transform', () => {
  it('handles negative resistance (res < 0)', () => {
    // res = -0.2 → 1 − (−0.2)/2 = 1.1
    const r = lapicIntervalResistanceTransform(lapicIntervalPoint(-0.2))
    expect(r.lo).toBeCloseTo(1.1)
    expect(r.hi).toBeCloseTo(1.1)
  })

  it('handles mid-range resistance (0 ≤ res < 0.75)', () => {
    // res = 0.3 → 1 − 0.3 = 0.7
    const r = lapicIntervalResistanceTransform(lapicIntervalPoint(0.3))
    expect(r.lo).toBeCloseTo(0.7)
    expect(r.hi).toBeCloseTo(0.7)
  })

  it('handles high resistance (res ≥ 0.75)', () => {
    // res = 1.0 → 1/(4+1) = 0.2
    const r = lapicIntervalResistanceTransform(lapicIntervalPoint(1.0))
    expect(r.lo).toBeCloseTo(0.2)
    expect(r.hi).toBeCloseTo(0.2)
  })

  it('handles interval spanning regimes', () => {
    // [-0.2, 1.0] → function is decreasing → [f(1.0), f(-0.2)] = [0.2, 1.1]
    const r = lapicIntervalResistanceTransform(lapicInterval(-0.2, 1.0))
    expect(r.lo).toBeCloseTo(0.2)
    expect(r.hi).toBeCloseTo(1.1)
  })
})

// ---------------------------------------------------------------------------
// Piecewise-affine
// ---------------------------------------------------------------------------

describe('interval piecewise affine', () => {
  const segments = [
    { breakpoint: 0, slope: 1, intercept: 0 },   // y = x for [0, 10)
    { breakpoint: 10, slope: 0.5, intercept: 10 }, // y = 0.5*(x-10)+10 for [10, ∞)
  ]

  it('evaluates within first segment', () => {
    const r = lapicIntervalPiecewiseAffine(lapicInterval(2, 5), segments)
    expect(r.lo).toBeCloseTo(2)
    expect(r.hi).toBeCloseTo(5)
  })

  it('evaluates within second segment', () => {
    // x=12 → 0.5*(12-10)+10 = 11, x=20 → 0.5*(20-10)+10 = 15
    const r = lapicIntervalPiecewiseAffine(lapicInterval(12, 20), segments)
    expect(r.lo).toBeCloseTo(11)
    expect(r.hi).toBeCloseTo(15)
  })

  it('evaluates spanning breakpoint', () => {
    // x=5 → 5, x=15 → 0.5*(15-10)+10 = 12.5, at breakpoint x=10 → 10
    const r = lapicIntervalPiecewiseAffine(lapicInterval(5, 15), segments)
    expect(r.lo).toBeCloseTo(5)
    expect(r.hi).toBeCloseTo(12.5)
  })
})

// ---------------------------------------------------------------------------
// Threshold select
// ---------------------------------------------------------------------------

describe('interval threshold select', () => {
  it('selects then branch when guard above threshold', () => {
    const r = lapicIntervalThresholdSelect(
      lapicInterval(5, 10),  // guard entirely ≥ 3
      3,
      lapicInterval(100, 200), // then
      lapicInterval(0, 1)      // else
    )
    expect(r.lo).toBe(100)
    expect(r.hi).toBe(200)
  })

  it('selects else branch when guard below threshold', () => {
    const r = lapicIntervalThresholdSelect(
      lapicInterval(0, 2),     // guard entirely < 3
      3,
      lapicInterval(100, 200), // then
      lapicInterval(0, 1)      // else
    )
    expect(r.lo).toBe(0)
    expect(r.hi).toBe(1)
  })

  it('returns hull when guard straddles threshold', () => {
    const r = lapicIntervalThresholdSelect(
      lapicInterval(1, 5),     // guard straddles 3
      3,
      lapicInterval(100, 200), // then
      lapicInterval(0, 1)      // else
    )
    expect(r.lo).toBe(0)
    expect(r.hi).toBe(200)
  })
})