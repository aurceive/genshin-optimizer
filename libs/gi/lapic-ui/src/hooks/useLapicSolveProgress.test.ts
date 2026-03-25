import { renderHook } from '@testing-library/react'
import type { LapicProgressEvent } from '@genshin-optimizer/lapic/runtime'
import { useLapicSolveProgress } from './useLapicSolveProgress'

describe('useLapicSolveProgress', () => {
  // -----------------------------------------------------------------------
  // No progress
  // -----------------------------------------------------------------------
  it('returns placeholder when progress is undefined', () => {
    const { result } = renderHook(() =>
      useLapicSolveProgress(undefined, undefined)
    )
    expect(result.current.fraction).toBe('—')
    expect(result.current.ratio).toBeUndefined()
    expect(result.current.percentText).toBe('—')
    expect(result.current.elapsedText).toBe('—')
    expect(result.current.etaText).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // Fraction formatting
  // -----------------------------------------------------------------------
  it('formats fraction with known total', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 42,
      totalUnits: 1000,
    }
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, Date.now() - 10_000)
    )
    expect(result.current.fraction).toBe('42 / 1000')
  })

  it('formats fraction without total', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 42,
    }
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, Date.now())
    )
    expect(result.current.fraction).toBe('42')
  })

  // -----------------------------------------------------------------------
  // Ratio and percentage
  // -----------------------------------------------------------------------
  it('computes ratio and percentage', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 250,
      totalUnits: 1000,
    }
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, Date.now() - 5000)
    )
    expect(result.current.ratio).toBe(0.25)
    expect(result.current.percentText).toBe('25.0%')
  })

  it('returns undefined ratio when totalUnits is zero', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 0,
      totalUnits: 0,
    }
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, Date.now())
    )
    expect(result.current.ratio).toBeUndefined()
    expect(result.current.percentText).toBe('—')
  })

  it('returns undefined ratio when totalUnits is missing', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 100,
    }
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, Date.now())
    )
    expect(result.current.ratio).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // Elapsed time
  // -----------------------------------------------------------------------
  it('computes elapsed time', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 50,
      totalUnits: 100,
    }
    // Started 65 seconds ago
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, Date.now() - 65_000)
    )
    expect(result.current.elapsedSeconds).toBeGreaterThanOrEqual(64)
    expect(result.current.elapsedSeconds).toBeLessThanOrEqual(66)
    expect(result.current.elapsedText).toBe('1:05')
  })

  it('formats elapsed with hours', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 10,
      totalUnits: 100,
    }
    // Started 3661 seconds ago (1h 1m 1s)
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, Date.now() - 3_661_000)
    )
    expect(result.current.elapsedText).toBe('1:01:01')
  })

  it('returns dash for elapsed when startedAt is undefined', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 50,
      totalUnits: 100,
    }
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, undefined)
    )
    expect(result.current.elapsedSeconds).toBeUndefined()
    expect(result.current.elapsedText).toBe('—')
  })

  // -----------------------------------------------------------------------
  // ETA
  // -----------------------------------------------------------------------
  it('computes ETA when ratio and elapsed are available', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 500,
      totalUnits: 1000,
    }
    // Started 60 seconds ago, 50% done → ETA ~60s
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, Date.now() - 60_000)
    )
    expect(result.current.etaSeconds).toBeGreaterThanOrEqual(58)
    expect(result.current.etaSeconds).toBeLessThanOrEqual(62)
    expect(result.current.etaText).toMatch(/^~1:0[0-2]$/)
  })

  it('returns dash for ETA when ratio is zero', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 0,
      totalUnits: 1000,
    }
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, Date.now() - 5000)
    )
    expect(result.current.etaSeconds).toBeUndefined()
    expect(result.current.etaText).toBeUndefined()
  })

  it('returns undefined for ETA when startedAt is undefined', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 50,
      totalUnits: 100,
    }
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, undefined)
    )
    expect(result.current.etaText).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  it('handles 100% completion', () => {
    const progress: LapicProgressEvent = {
      sessionId: 's1',
      phase: 'join',
      completedUnits: 1000,
      totalUnits: 1000,
    }
    const { result } = renderHook(() =>
      useLapicSolveProgress(progress, Date.now() - 30_000)
    )
    expect(result.current.ratio).toBe(1)
    expect(result.current.percentText).toBe('100.0%')
    // ETA should be ~0 at 100%
    expect(result.current.etaSeconds).toBeLessThan(1)
  })
})
