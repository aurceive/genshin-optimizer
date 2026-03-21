import type {
  LapicCandidateDescriptor,
  LapicCanonicalProblem,
  LapicDeterministicOrderingRelation,
  LapicDigest,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicArtifactStore } from '@genshin-optimizer/lapic/storage'
import type {
  LapicInMemorySessionController,
  LapicSolveCompletionResult,
} from '../types'
import type { LapicSolveCheckpointState } from './checkpoint-state'

export interface LapicBoundedExactCandidateCombination {
  readonly problem: LapicCanonicalProblem
  readonly candidates: readonly LapicCandidateDescriptor[]
}

export interface LapicBoundedExactCombinationEvaluation {
  readonly objectiveValue: string
  readonly evidenceDigest: LapicDigest
  readonly orderingKey?: readonly string[]
}

export type LapicBoundedExactCombinationEvaluator = (
  combination: LapicBoundedExactCandidateCombination
) => LapicValidationResult<LapicBoundedExactCombinationEvaluation>

export type LapicBoundedExactFeasibilityEvaluator = (
  combination: LapicBoundedExactCandidateCombination
) => boolean | LapicValidationResult<boolean>

export type LapicBoundedExactEvaluationComparator = (
  left: LapicBoundedExactCombinationEvaluation,
  right: LapicBoundedExactCombinationEvaluation
) => LapicDeterministicOrderingRelation

export interface LapicBoundedExactSolveOptions {
  readonly problem: LapicCanonicalProblem
  readonly controller: LapicInMemorySessionController
  readonly artifactStore: LapicArtifactStore
  readonly evaluateCombination: LapicBoundedExactCombinationEvaluator
  readonly compareEvaluations?: LapicBoundedExactEvaluationComparator
  readonly isCombinationFeasible?: LapicBoundedExactFeasibilityEvaluator
  readonly maxCombinationCount?: number
  /** When provided, the executor resumes from the given checkpoint state
   *  instead of starting a fresh solve. Frontier blocks are NOT rebuilt. */
  readonly resumeCheckpointState?: LapicSolveCheckpointState
}

/**
 * Result of a solve that was paused before completion.
 * Contains the checkpoint state needed to resume later.
 */
export interface LapicBoundedExactSolvePauseResult {
  readonly paused: true
  readonly checkpointState: LapicSolveCheckpointState
}

export type LapicBoundedExactSolveOutcome =
  | LapicSolveCompletionResult
  | LapicBoundedExactSolvePauseResult

export type LapicBoundedExactSolveExecutor = (
  options: LapicBoundedExactSolveOptions
) => Promise<LapicBoundedExactSolveOutcome>
