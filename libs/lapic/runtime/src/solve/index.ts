// ---------------------------------------------------------------------------
// Public solve API surface
//
// Only types and functions that external consumers need are exported here.
// Internal modules (combination, frontier, certificate, join-plan,
// persistence, pruning) are used by the executor but not part of the
// package's public contract.  Internal tests import them directly from
// their implementation files.
// ---------------------------------------------------------------------------

export type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactCombinationEvaluation,
  LapicBoundedExactCombinationEvaluator,
  LapicBoundedExactEvaluationComparator,
  LapicBoundedExactFeasibilityEvaluator,
  LapicBoundedExactPartialBound,
  LapicBoundedExactPartialCombination,
  LapicBoundedExactSolveExecutor,
  LapicBoundedExactSolveOptions,
  LapicBoundedExactSolveOutcome,
  LapicBoundedExactSolvePauseResult,
  LapicBoundedExactUpperBoundEvaluator,
} from './types'

export { executeLapicBoundedExactSolve } from './executor'

export type {
  LapicSolveCheckpointState,
  LapicSolveCursorPosition,
  LapicTopNTrackerEntry,
  LapicTopNTrackerSnapshot,
} from './checkpoint-state'

export type { LapicDangerZoneConfig } from './danger-zone'
export { defaultLapicDangerZoneConfig } from './danger-zone'

export type { LapicPruningStatisticsSnapshot } from './pruning'

export type { JoinLegalityResult as LapicJoinLegalityResult } from './join-legality'
export {
  checkJoinLegality,
  mergeCompatibilitySignatures,
} from './join-legality'

export type {
  LapicJoinExecutorOptions,
  LapicJoinExecutorResult,
  LapicJoinExecutorStats,
  LapicJoinResult,
  LapicTeamCombinationEvaluation,
  LapicTeamObjectiveEvaluator,
} from './join-executor'
export { executeJoinPhase } from './join-executor'
