/**
 * Trace-view export family (lapic-debug-api.md §4.2)
 *
 * Trace query, trace event projection, phase summary,
 * threshold lineage view, and failure timeline view.
 */

import type { LapicDigest, LapicStateId } from '@genshin-optimizer/lapic/core'
import type {
  LapicFailureRecord,
  LapicProgressEvent,
  LapicTraceEvent,
} from '@genshin-optimizer/lapic/runtime'

// ---------------------------------------------------------------------------
// Trace Event Projection — filter/transform over raw trace events
// ---------------------------------------------------------------------------

/** Projection kind controlling what trace event fields are retained. */
export type LapicTraceEventProjectionKind =
  | 'full'
  | 'summary-only'
  | 'failures-only'
  | 'threshold-sensitive-only'
  | 'certificate-emissions-only'

/**
 * Describes a projection over trace events to filter or transform
 * the raw trace stream into a focused view.
 */
export interface LapicTraceEventProjection {
  readonly projectionKind: LapicTraceEventProjectionKind
  readonly filterSessionId?: string
  readonly filterPhase?: string
  readonly filterStateIds?: readonly LapicStateId[]
  readonly maxEventCount?: number
}

/**
 * Result of applying a trace event projection.
 */
export interface LapicTraceEventProjectionResult {
  readonly projection: LapicTraceEventProjection
  readonly events: readonly LapicTraceEvent[]
  readonly totalEventCount: number
  readonly truncated: boolean
}

// ---------------------------------------------------------------------------
// Trace Query — request for structured trace data
// ---------------------------------------------------------------------------

export interface LapicTraceQuery {
  readonly sessionId: string
  readonly includeFailures: boolean
  readonly projection?: LapicTraceEventProjection
}

// ---------------------------------------------------------------------------
// Phase Summary — aggregated summary of a solve phase
// ---------------------------------------------------------------------------

export interface LapicPhaseSummary {
  readonly sessionId: string
  readonly phase: string
  readonly progressEvents: readonly LapicProgressEvent[]
}

// ---------------------------------------------------------------------------
// Threshold Lineage View — tracks threshold evolution across certificates
// ---------------------------------------------------------------------------

export interface LapicThresholdLineageView {
  readonly thresholdDigest: LapicDigest
  readonly relatedCertificates: readonly string[]
}

// ---------------------------------------------------------------------------
// Failure Timeline View — chronological failure record
// ---------------------------------------------------------------------------

export interface LapicFailureTimelineView {
  readonly failures: readonly LapicFailureRecord[]
}

// ---------------------------------------------------------------------------
// Composite trace view result
// ---------------------------------------------------------------------------

export interface LapicTraceViewResult {
  readonly query: LapicTraceQuery
  readonly phases: readonly LapicPhaseSummary[]
  readonly thresholdLineage: readonly LapicThresholdLineageView[]
  readonly failureTimeline: LapicFailureTimelineView
  readonly projectionResult?: LapicTraceEventProjectionResult
}
