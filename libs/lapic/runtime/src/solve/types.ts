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
}

export type LapicBoundedExactSolveExecutor = (
  options: LapicBoundedExactSolveOptions
) => Promise<LapicSolveCompletionResult>
