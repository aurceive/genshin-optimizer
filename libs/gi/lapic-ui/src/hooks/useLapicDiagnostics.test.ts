import { renderHook } from '@testing-library/react'
import type {
  LapicFailureRecord,
  LapicTraceEvent,
} from '@genshin-optimizer/lapic/runtime'
import { useLapicDiagnostics } from './useLapicDiagnostics'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTraceEvent(tag: string, digest = 'digest-000'): LapicTraceEvent {
  return {
    sessionId: 'session-1',
    tag: tag as LapicTraceEvent['tag'],
    eventDigest: digest,
  }
}

function makeFailureRecord(
  failureClass: string,
  message: string,
  diagnostics: LapicFailureRecord['diagnostics'] = []
): LapicFailureRecord {
  return {
    sessionId: 'session-1',
    failureClass: failureClass as LapicFailureRecord['failureClass'],
    message,
    diagnostics,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLapicDiagnostics', () => {
  it('returns empty state for empty diagnostics array', () => {
    const { result } = renderHook(() => useLapicDiagnostics([]))
    expect(result.current.entries).toEqual([])
    expect(result.current.errorCount).toBe(0)
    expect(result.current.warningCount).toBe(0)
    expect(result.current.infoCount).toBe(0)
    expect(result.current.hasEntries).toBe(false)
    expect(result.current.hasErrors).toBe(false)
  })

  // -----------------------------------------------------------------------
  // Trace events
  // -----------------------------------------------------------------------
  it('classifies trace events as info', () => {
    const events: (LapicTraceEvent | LapicFailureRecord)[] = [
      makeTraceEvent('Progress', 'd1'),
      makeTraceEvent('ReportFailure', 'd2'),
    ]
    const { result } = renderHook(() => useLapicDiagnostics(events))

    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[0].severity).toBe('info')
    expect(result.current.entries[0].isFailure).toBe(false)
    expect(result.current.entries[0].failureClass).toBeUndefined()
    expect(result.current.entries[0].summary).toContain('Progress')
    expect(result.current.infoCount).toBe(2)
    expect(result.current.hasEntries).toBe(true)
    expect(result.current.hasErrors).toBe(false)
  })

  it('generates unique keys for trace events', () => {
    const events: (LapicTraceEvent | LapicFailureRecord)[] = [
      makeTraceEvent('Progress', 'd1'),
      makeTraceEvent('Progress', 'd2'),
    ]
    const { result } = renderHook(() => useLapicDiagnostics(events))
    const keys = result.current.entries.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  // -----------------------------------------------------------------------
  // Failure records
  // -----------------------------------------------------------------------
  it('classifies failure records with error diagnostics as errors', () => {
    const events: (LapicTraceEvent | LapicFailureRecord)[] = [
      makeFailureRecord('evaluationFailure', 'Evaluation failed', [
        {
          severity: 'error',
          code: 'EVAL_ERROR',
          message: 'Division by zero',
          path: ['evaluator'],
        },
      ]),
    ]
    const { result } = renderHook(() => useLapicDiagnostics(events))

    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].severity).toBe('error')
    expect(result.current.entries[0].isFailure).toBe(true)
    expect(result.current.entries[0].failureClass).toBe('evaluationFailure')
    expect(result.current.entries[0].summary).toBe('Evaluation failed')
    expect(result.current.entries[0].details).toEqual([
      '[error] EVAL_ERROR: Division by zero',
    ])
    expect(result.current.errorCount).toBe(1)
    expect(result.current.hasErrors).toBe(true)
  })

  it('classifies failure records with warning diagnostics as warnings', () => {
    const events: (LapicTraceEvent | LapicFailureRecord)[] = [
      makeFailureRecord('boundsLoose', 'Bounds are loose', [
        {
          severity: 'warning',
          code: 'LOOSE_BOUNDS',
          message: 'FIR bounds may be loose',
          path: ['bounds'],
        },
      ]),
    ]
    const { result } = renderHook(() => useLapicDiagnostics(events))
    expect(result.current.entries[0].severity).toBe('warning')
    expect(result.current.warningCount).toBe(1)
  })

  it('classifies failure records with no error/warning diagnostics as info', () => {
    const events: (LapicTraceEvent | LapicFailureRecord)[] = [
      makeFailureRecord('informational', 'Info message', [
        {
          severity: 'info',
          code: 'INFO_001',
          message: 'Some informational message',
          path: [],
        },
      ]),
    ]
    const { result } = renderHook(() => useLapicDiagnostics(events))
    expect(result.current.entries[0].severity).toBe('info')
    expect(result.current.infoCount).toBe(1)
  })

  it('classifies failure records with empty diagnostics as info', () => {
    const events: (LapicTraceEvent | LapicFailureRecord)[] = [
      makeFailureRecord('unknown', 'Unknown failure'),
    ]
    const { result } = renderHook(() => useLapicDiagnostics(events))
    expect(result.current.entries[0].severity).toBe('info')
    expect(result.current.entries[0].details).toEqual([])
  })

  // -----------------------------------------------------------------------
  // Mixed events
  // -----------------------------------------------------------------------
  it('correctly counts mixed event types', () => {
    const events: (LapicTraceEvent | LapicFailureRecord)[] = [
      makeTraceEvent('Progress', 'd1'),
      makeFailureRecord('err1', 'Error', [
        { severity: 'error', code: 'E1', message: 'm1', path: [] },
      ]),
      makeFailureRecord('warn1', 'Warning', [
        { severity: 'warning', code: 'W1', message: 'm2', path: [] },
      ]),
      makeTraceEvent('ReportFailure', 'd2'),
      makeFailureRecord('err2', 'Another error', [
        { severity: 'error', code: 'E2', message: 'm3', path: [] },
      ]),
    ]
    const { result } = renderHook(() => useLapicDiagnostics(events))

    expect(result.current.entries).toHaveLength(5)
    expect(result.current.errorCount).toBe(2)
    expect(result.current.warningCount).toBe(1)
    expect(result.current.infoCount).toBe(2)
    expect(result.current.hasEntries).toBe(true)
    expect(result.current.hasErrors).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Raw event preservation
  // -----------------------------------------------------------------------
  it('preserves raw event in entries', () => {
    const trace = makeTraceEvent('Progress', 'd1')
    const failure = makeFailureRecord('e1', 'msg', [])
    const events: (LapicTraceEvent | LapicFailureRecord)[] = [trace, failure]

    const { result } = renderHook(() => useLapicDiagnostics(events))
    expect(result.current.entries[0].raw).toBe(trace)
    expect(result.current.entries[1].raw).toBe(failure)
  })

  // -----------------------------------------------------------------------
  // Error priority in mixed diagnostics
  // -----------------------------------------------------------------------
  it('prioritizes error over warning in mixed-severity failure', () => {
    const events: (LapicTraceEvent | LapicFailureRecord)[] = [
      makeFailureRecord('mixed', 'Mixed severity', [
        { severity: 'warning', code: 'W1', message: 'warn', path: [] },
        { severity: 'error', code: 'E1', message: 'err', path: [] },
        { severity: 'info', code: 'I1', message: 'info', path: [] },
      ]),
    ]
    const { result } = renderHook(() => useLapicDiagnostics(events))
    expect(result.current.entries[0].severity).toBe('error')
    expect(result.current.entries[0].details).toHaveLength(3)
  })
})
