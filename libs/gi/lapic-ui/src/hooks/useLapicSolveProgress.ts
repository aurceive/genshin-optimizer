/**
 * Derived progress formatting hook.
 *
 * Takes raw `LapicProgressEvent` from `useLapicSolve` and produces
 * human-readable strings and computed metrics.
 */

import type { LapicProgressEvent } from '@genshin-optimizer/lapic/runtime'
import { useMemo } from 'react'

/**
 * Formatted progress information for display.
 */
export interface LapicFormattedProgress {
  /** "42 / 1000" or "—" when no data. */
  readonly fraction: string
  /** 0.0–1.0 or undefined before first event. */
  readonly ratio: number | undefined
  /** "4.2%" or "—". */
  readonly percentText: string
  /** Elapsed time in seconds since the solve started. */
  readonly elapsedSeconds: number | undefined
  /** Human-readable elapsed: "0:42" or "1:05:30". */
  readonly elapsedText: string
  /** Estimated remaining time in seconds (undefined if not enough data). */
  readonly etaSeconds: number | undefined
  /** Human-readable ETA: "~2:15", or undefined when not enough data. */
  readonly etaText: string | undefined
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const NO_PROGRESS: LapicFormattedProgress = {
  fraction: '—',
  ratio: undefined,
  percentText: '—',
  elapsedSeconds: undefined,
  elapsedText: '—',
  etaSeconds: undefined,
  etaText: undefined,
}

/**
 * Formats raw progress events for display.
 *
 * @param progress - Latest progress event from `useLapicSolve`, or undefined.
 * @param startedAt - Timestamp (ms) when the solve was started.
 * @returns Formatted progress object.
 */
export function useLapicSolveProgress(
  progress: LapicProgressEvent | undefined,
  startedAt: number | undefined
): LapicFormattedProgress {
  return useMemo(() => {
    if (!progress) return NO_PROGRESS

    const { completedUnits, totalUnits } = progress
    const fraction =
      totalUnits !== undefined
        ? `${completedUnits} / ${totalUnits}`
        : `${completedUnits}`

    const ratio =
      totalUnits !== undefined && totalUnits > 0
        ? completedUnits / totalUnits
        : undefined

    const percentText =
      ratio !== undefined ? `${(ratio * 100).toFixed(1)}%` : '—'

    const now = Date.now()
    const elapsedSeconds =
      startedAt !== undefined ? (now - startedAt) / 1000 : undefined

    const elapsedText =
      elapsedSeconds !== undefined ? formatDuration(elapsedSeconds) : '—'

    const etaSeconds =
      ratio !== undefined && ratio > 0 && elapsedSeconds !== undefined
        ? (elapsedSeconds / ratio) * (1 - ratio)
        : undefined

    const etaText =
      etaSeconds !== undefined ? `~${formatDuration(etaSeconds)}` : undefined

    return {
      fraction,
      ratio,
      percentText,
      elapsedSeconds,
      elapsedText,
      etaSeconds,
      etaText,
    }
  }, [progress, startedAt])
}
