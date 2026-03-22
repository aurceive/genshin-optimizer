/**
 * Numeric danger-zone detection for bound-based pruning.
 *
 * When the gap between a computed upper bound and the incumbent threshold
 * is too small, floating-point errors can cause incorrect pruning.
 * The danger-zone detector identifies such borderline cases.
 *
 * Per architecture §10.3, when a danger zone is detected the executor
 * MUST either escalate (recompute, verify, or replay in exact arithmetic)
 * or decline to prune.  Silent acceptance is forbidden.
 */

import type { LapicDangerZoneHandlingRecord } from '@genshin-optimizer/lapic/cert'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configures the numeric safety margins that determine when a
 * bound-vs-threshold gap is considered a danger zone.
 *
 * A danger zone is triggered when EITHER:
 *  - `absoluteGap < safeMarginAbsolute`, OR
 *  - `relativeGap < safeMarginRatio`
 *
 * where `relativeGap = absoluteGap / max(|threshold|, 1)`.
 */
export interface LapicDangerZoneConfig {
  /** Relative safe margin. Default: 1e-9 */
  readonly safeMarginRatio: number
  /** Absolute safe margin. Default: 1e-12 */
  readonly safeMarginAbsolute: number
}

export const defaultLapicDangerZoneConfig: LapicDangerZoneConfig = {
  safeMarginRatio: 1e-9,
  safeMarginAbsolute: 1e-12,
}

// ---------------------------------------------------------------------------
// Detection result
// ---------------------------------------------------------------------------

export interface LapicDangerZoneDetectionResult {
  /** Whether a danger zone was triggered. */
  readonly triggered: boolean
  /** Absolute distance between bound and threshold. */
  readonly absoluteGap: number
  /** Relative distance: absoluteGap / max(|threshold|, 1). */
  readonly relativeGap: number
  /** Human-readable explanation when triggered. */
  readonly explanation?: string
}

// ---------------------------------------------------------------------------
// Detection logic
// ---------------------------------------------------------------------------

/**
 * Detect whether a bound-prune decision falls within the numeric
 * danger zone.  The bound value should already be known to be
 * below the threshold (i.e. the caller has already determined
 * that pruning is *logically* justified).  This function checks
 * whether the gap is *numerically* safe.
 */
export function detectBoundPruneDangerZone(
  boundValue: string,
  thresholdValue: string,
  config: LapicDangerZoneConfig = defaultLapicDangerZoneConfig
): LapicDangerZoneDetectionResult {
  const bound = parseFloat(boundValue)
  const threshold = parseFloat(thresholdValue)

  // Non-finite values are always dangerous.
  if (!isFinite(bound) || !isFinite(threshold)) {
    return {
      triggered: true,
      absoluteGap: NaN,
      relativeGap: NaN,
      explanation:
        `Non-finite values detected: bound=${boundValue}, threshold=${thresholdValue}`,
    }
  }

  const absoluteGap = Math.abs(bound - threshold)
  const relativeGap = absoluteGap / Math.max(Math.abs(threshold), 1)

  const absoluteTriggered = absoluteGap < config.safeMarginAbsolute
  const relativeTriggered = relativeGap < config.safeMarginRatio

  if (absoluteTriggered || relativeTriggered) {
    const reasons: string[] = []
    if (absoluteTriggered) {
      reasons.push(
        `absoluteGap=${absoluteGap.toExponential(4)} < safeMarginAbsolute=${config.safeMarginAbsolute}`
      )
    }
    if (relativeTriggered) {
      reasons.push(
        `relativeGap=${relativeGap.toExponential(4)} < safeMarginRatio=${config.safeMarginRatio}`
      )
    }
    return {
      triggered: true,
      absoluteGap,
      relativeGap,
      explanation: `Danger zone: ${reasons.join('; ')}`,
    }
  }

  return { triggered: false, absoluteGap, relativeGap }
}

// ---------------------------------------------------------------------------
// Record builder
// ---------------------------------------------------------------------------

/**
 * Create the danger-zone handling record for a BoundPruneCert payload
 * based on a detection result and the executor's response.
 */
export function buildDangerZoneRecord(
  detection: LapicDangerZoneDetectionResult,
  verificationReplayInvoked: boolean
): LapicDangerZoneHandlingRecord {
  return {
    triggered: detection.triggered,
    verificationReplayInvoked,
    ...(detection.explanation !== undefined
      ? { explanation: detection.explanation }
      : {}),
  }
}
