/**
 * Hook for formatting raw lapic diagnostics into UI-friendly records.
 *
 * Transforms `LapicSolveState.diagnostics` (mixed `LapicTraceEvent` and
 * `LapicFailureRecord` entries) into a structured list suitable for rendering.
 */

import { useMemo } from 'react'
import type {
  LapicTraceEvent,
  LapicFailureRecord,
} from '@genshin-optimizer/lapic/runtime'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Severity level for display.
 * Trace events are always 'info'; failure records carry severity from their diagnostics.
 */
export type LapicDiagnosticDisplaySeverity = 'error' | 'warning' | 'info'

/**
 * A single diagnostic entry formatted for display.
 */
export interface LapicDiagnosticEntry {
  /** Unique key for React list rendering. */
  readonly key: string
  /** Display severity. */
  readonly severity: LapicDiagnosticDisplaySeverity
  /** Short summary. */
  readonly summary: string
  /** Failure class (only for failure records). */
  readonly failureClass: string | undefined
  /** Detailed diagnostic messages (only for failure records). */
  readonly details: readonly string[]
  /** Whether this entry represents a failure (vs. trace). */
  readonly isFailure: boolean
  /** Original event for advanced inspection. */
  readonly raw: LapicTraceEvent | LapicFailureRecord
}

/**
 * Aggregated diagnostics state.
 */
export interface LapicDiagnosticsState {
  /** All entries in chronological order. */
  readonly entries: readonly LapicDiagnosticEntry[]
  /** Number of errors. */
  readonly errorCount: number
  /** Number of warnings. */
  readonly warningCount: number
  /** Number of info/trace entries. */
  readonly infoCount: number
  /** Whether there are any entries. */
  readonly hasEntries: boolean
  /** Whether there are any errors. */
  readonly hasErrors: boolean
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isFailureRecord(
  event: LapicTraceEvent | LapicFailureRecord
): event is LapicFailureRecord {
  return 'failureClass' in event
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatEntry(
  event: LapicTraceEvent | LapicFailureRecord,
  index: number
): LapicDiagnosticEntry {
  if (isFailureRecord(event)) {
    // Determine severity from diagnostics
    const hasError = event.diagnostics.some((d) => d.severity === 'error')
    const hasWarning = event.diagnostics.some((d) => d.severity === 'warning')
    const severity: LapicDiagnosticDisplaySeverity = hasError
      ? 'error'
      : hasWarning
        ? 'warning'
        : 'info'

    return {
      key: `failure-${index}-${event.failureClass}`,
      severity,
      summary: event.message,
      failureClass: event.failureClass,
      details: event.diagnostics.map(
        (d) => `[${d.severity}] ${d.code}: ${d.message}`
      ),
      isFailure: true,
      raw: event,
    }
  }

  // Trace event
  return {
    key: `trace-${index}-${event.tag}`,
    severity: 'info',
    summary: `Trace: ${event.tag}`,
    failureClass: undefined,
    details: [],
    isFailure: false,
    raw: event,
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Transforms raw diagnostics from `useLapicSolve` into display-friendly records.
 *
 * @param diagnostics - Raw diagnostic events from `LapicSolveState.diagnostics`.
 * @returns Structured diagnostics state with counts and formatted entries.
 */
export function useLapicDiagnostics(
  diagnostics: readonly (LapicTraceEvent | LapicFailureRecord)[]
): LapicDiagnosticsState {
  return useMemo(() => {
    const entries = diagnostics.map(formatEntry)
    const errorCount = entries.filter((e) => e.severity === 'error').length
    const warningCount = entries.filter((e) => e.severity === 'warning').length
    const infoCount = entries.filter((e) => e.severity === 'info').length

    return {
      entries,
      errorCount,
      warningCount,
      infoCount,
      hasEntries: entries.length > 0,
      hasErrors: errorCount > 0,
    }
  }, [diagnostics])
}
