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
import type { LapicFrontierJoinPlan } from './join-plan'

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

/**
 * Pre-built join context for partition-scoped execution.
 *
 * When provided, the executor skips frontier construction and join-plan
 * creation, using the pre-built plan directly. This enables the
 * coordinated solve to build frontiers once, partition the join plan,
 * and dispatch each partition to a separate executor instance.
 */
export interface LapicPrebuiltJoinContext {
  /** The (possibly partitioned) join plan to execute. */
  readonly joinPlan: LapicFrontierJoinPlan
  /** Frontier block IDs referenced by certificates and checkpoints. */
  readonly frontierBlockIds: readonly string[]
}

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
  /**
   * Pre-built join context for partition-scoped execution.
   * When provided, the executor skips frontier construction and
   * join-plan creation, using the supplied plan and frontier
   * block IDs directly. Used by the coordinated solve.
   */
  readonly prebuiltJoinContext?: LapicPrebuiltJoinContext
  /**
   * Initial incumbent threshold for branch-and-bound pruning.
   * When provided, the executor prunes subtrees whose upper bound
   * falls below this value even before the top-N tracker is full.
   * Used by the coordinated solve to share the best-known objective
   * value from completed partitions with subsequent partitions.
   */
  readonly initialIncumbentThreshold?: string
  /**
   * When true, the executor skips creation, validation, and persistence
   * of intermediate certificates (BoundPruneCert, DominanceCert,
   * BranchReachabilityCert) during the solve.  The final
   * FinalOptimalityCert is still emitted with empty reference arrays.
   *
   * This dramatically reduces memory pressure and GC overhead for large
   * problems where the caller does not need a full certificate chain
   * (e.g. UI-driven solves that only consume the top-N candidates).
   */
  readonly skipIntermediateCertificates?: boolean
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
