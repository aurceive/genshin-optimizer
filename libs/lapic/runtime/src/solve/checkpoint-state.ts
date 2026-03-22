import type { LapicBoundedExactCombinationEvaluation } from './types'
import type { LapicPruningStatisticsSnapshot } from './pruning'

/**
 * Entry in a serialized TopN tracker snapshot.
 * Stores enough to rebuild the tracker without re-evaluating combinations.
 */
export interface LapicTopNTrackerEntry {
  readonly stateId: string
  readonly candidateIds: readonly string[]
  readonly evaluation: LapicBoundedExactCombinationEvaluation
}

/**
 * Serializable snapshot of a TopN tracker's current ranked entries.
 */
export interface LapicTopNTrackerSnapshot {
  readonly topN: number
  readonly entries: readonly LapicTopNTrackerEntry[]
}

/**
 * Cursor position within a bounded cartesian enumeration.
 * `flatIndex` is the 0-based ordinal of the next combination to process.
 */
export interface LapicSolveCursorPosition {
  readonly flatIndex: number
}

/**
 * Full serializable checkpoint of a bounded-exact solve in progress.
 * Captures everything needed to resume the join phase from where it stopped.
 */
export interface LapicSolveCheckpointState {
  readonly checkpointKind: 'solve-position'
  readonly problemDigest: string
  readonly visitedCombinationCount: number
  readonly totalCombinationCount: number
  readonly trackerSnapshot: LapicTopNTrackerSnapshot
  readonly cursorPosition: LapicSolveCursorPosition
  readonly frontierBlockIds: readonly string[]
  readonly phase: 'join'
  readonly pruningStatistics?: LapicPruningStatisticsSnapshot
  readonly pruneCertificateIds?: readonly string[]
  readonly branchReachabilityCertificateIds?: readonly string[]
}

export function createLapicSolveCheckpointState(
  problemDigest: string,
  visitedCombinationCount: number,
  totalCombinationCount: number,
  trackerSnapshot: LapicTopNTrackerSnapshot,
  cursorPosition: LapicSolveCursorPosition,
  frontierBlockIds: readonly string[],
  pruningStatistics?: LapicPruningStatisticsSnapshot,
  pruneCertificateIds?: readonly string[],
  branchReachabilityCertificateIds?: readonly string[]
): LapicSolveCheckpointState {
  return {
    checkpointKind: 'solve-position',
    problemDigest,
    visitedCombinationCount,
    totalCombinationCount,
    trackerSnapshot,
    cursorPosition,
    frontierBlockIds: [...frontierBlockIds],
    phase: 'join',
    pruningStatistics,
    pruneCertificateIds: pruneCertificateIds ? [...pruneCertificateIds] : undefined,
    branchReachabilityCertificateIds: branchReachabilityCertificateIds
      ? [...branchReachabilityCertificateIds]
      : undefined,
  }
}

export function createLapicTopNTrackerSnapshot(
  topN: number,
  entries: readonly LapicTopNTrackerEntry[]
): LapicTopNTrackerSnapshot {
  return { topN, entries: [...entries] }
}

export function createLapicSolveCursorPosition(
  flatIndex: number
): LapicSolveCursorPosition {
  return { flatIndex }
}
