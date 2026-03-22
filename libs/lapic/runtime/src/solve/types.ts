import type {
  LapicCandidateDescriptor,
  LapicCanonicalProblem,
  LapicDeterministicOrderingRelation,
  LapicDigest,
  LapicFirGraph,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicArtifactStore } from '@genshin-optimizer/lapic/storage'
import type {
  LapicInMemorySessionController,
  LapicSolveCompletionResult,
} from '../types'
import type { LapicSolveCheckpointState } from './checkpoint-state'
import type { LapicDangerZoneConfig } from './danger-zone'

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

/**
 * Describes a partial candidate assignment at an intermediate
 * recursion depth during the join search.
 */
export interface LapicBoundedExactPartialCombination {
  readonly problem: LapicCanonicalProblem
  readonly assignedCandidates: readonly LapicCandidateDescriptor[]
  readonly assignedDomainCount: number
  readonly totalDomainCount: number
}

/**
 * Admissible upper bound for a partial assignment.
 * The `upperBoundValue` must be an admissible (over-)estimate:
 * no feasible completion of the partial assignment can exceed it.
 */
export interface LapicBoundedExactPartialBound {
  readonly upperBoundValue: string
  readonly evidenceDigest: LapicDigest
}

/**
 * Callback that computes an admissible upper bound for a
 * partial candidate assignment.  Returns `undefined` when
 * no useful bound can be established (the subtree is not pruned).
 */
export type LapicBoundedExactUpperBoundEvaluator = (
  partial: LapicBoundedExactPartialCombination
) => LapicBoundedExactPartialBound | undefined

export interface LapicBoundedExactSolveOptions {
  readonly problem: LapicCanonicalProblem
  readonly controller: LapicInMemorySessionController
  readonly artifactStore: LapicArtifactStore
  readonly evaluateCombination: LapicBoundedExactCombinationEvaluator
  readonly compareEvaluations?: LapicBoundedExactEvaluationComparator
  readonly isCombinationFeasible?: LapicBoundedExactFeasibilityEvaluator
  readonly computeUpperBound?: LapicBoundedExactUpperBoundEvaluator
  readonly maxCombinationCount?: number
  /** When provided, the executor runs A-IR branch reachability
   *  analysis on the graph and emits BranchReachabilityCerts
   *  for all statically forced branches. */
  readonly firGraph?: LapicFirGraph
  /** Numeric danger-zone detection configuration for bound-based pruning.
   *  When configured, the executor checks whether the bound-threshold gap
   *  is within a danger zone and declines to prune if so (conservative). */
  readonly dangerZoneConfig?: LapicDangerZoneConfig
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
