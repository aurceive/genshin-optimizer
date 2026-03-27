/**
 * Unified partition dispatch contract.
 *
 * Defines a single interface that both in-process execution and
 * MessagePort-based worker communication implement.  The coordinated
 * solve dispatches partition work through this contract, remaining
 * agnostic to whether the executor runs in the same thread, a Web
 * Worker, or a Node worker_thread.
 *
 * Two concrete implementations:
 *
 * - **In-process** (`createInProcessPartitionDispatcher`):
 *   calls `executeLapicBoundedExactSolve` directly in the caller's
 *   thread.  Zero-overhead for small problems and testing.
 *
 * - **MessagePort** (`createMessagePortPartitionDispatcher` in
 *   `message-port.ts`): serializes the partition descriptor,
 *   sends it to a worker thread, and awaits the response.
 */

import type { LapicCertificate } from '@genshin-optimizer/lapic/cert'
import type {
  LapicCanonicalProblem,
  LapicFirGraph,
} from '@genshin-optimizer/lapic/core'
import type { LapicArtifactStore } from '@genshin-optimizer/lapic/storage'
import type { LapicFrontierJoinPlan } from '../solve/join-plan'
import type {
  LapicBoundedExactCombinationEvaluator,
  LapicBoundedExactEvaluationComparator,
  LapicBoundedExactFeasibilityEvaluator,
  LapicBoundedExactUpperBoundEvaluator,
} from '../solve/types'
import type { LapicSolveCheckpointState } from '../solve/checkpoint-state'
import type { LapicDangerZoneConfig } from '../solve/danger-zone'
import type {
  LapicInMemorySessionController,
  LapicTopNCandidateEntry,
} from '../types'
import { executeLapicBoundedExactSolve } from '../solve/executor'

// ---------------------------------------------------------------------------
// Dispatch contract
// ---------------------------------------------------------------------------

/**
 * Describes a single partition to be dispatched for execution.
 *
 * Contains the partition-specific data that varies per dispatch.
 * Shared configuration (evaluators, problem definition, etc.)
 * is captured at dispatcher creation time.
 */
export interface LapicPartitionDispatchRequest {
  readonly partitionIndex: number
  readonly controller: LapicInMemorySessionController
  readonly joinPlan: LapicFrontierJoinPlan
  readonly frontierBlockIds: readonly string[]
  readonly initialIncumbentThreshold?: string | undefined
  /** Polled at safe points for cross-partition threshold sharing. */
  readonly getExternalIncumbentThreshold?: () => string | undefined
  /** Called when the partition's local incumbent improves. */
  readonly onIncumbentImproved?: (threshold: string) => void
}

/**
 * Result of a completed partition dispatch.
 */
export interface LapicPartitionCompletedResponse {
  readonly kind: 'completed'
  readonly topNCandidates?: readonly LapicTopNCandidateEntry[] | undefined
  readonly emittedCertificates: readonly LapicCertificate[]
}

/**
 * Result of a paused partition dispatch.
 */
export interface LapicPartitionPausedResponse {
  readonly kind: 'paused'
  readonly checkpointState: LapicSolveCheckpointState
}

/**
 * Discriminated union of partition dispatch outcomes.
 */
export type LapicPartitionDispatchResponse =
  | LapicPartitionCompletedResponse
  | LapicPartitionPausedResponse

/**
 * Unified dispatch interface for partition execution.
 *
 * Implementations may run the executor in-process or in a
 * separate thread/worker.  The coordinated solve uses this
 * interface exclusively, enabling transparent backend switching.
 */
export interface LapicPartitionDispatcher {
  /**
   * Dispatch a partition for execution and await the result.
   */
  dispatch(
    request: LapicPartitionDispatchRequest
  ): Promise<LapicPartitionDispatchResponse>

  /**
   * Release any resources held by this dispatcher.
   * Called once when the coordinated solve completes.
   */
  shutdown(): Promise<void>
}

// ---------------------------------------------------------------------------
// Shared configuration for partition dispatchers
// ---------------------------------------------------------------------------

/**
 * Configuration shared across all partitions.
 *
 * Captured at dispatcher creation time so that each `dispatch()`
 * call only needs the partition-specific request.  For in-process
 * dispatch, these callbacks are called directly.  For MessagePort
 * dispatch, the worker thread holds its own copy of these values
 * (initialized at worker startup), and this config is unused on
 * the main thread side.
 */
export interface LapicPartitionDispatchConfig {
  readonly problem: LapicCanonicalProblem
  readonly artifactStore: LapicArtifactStore
  readonly evaluateCombination: LapicBoundedExactCombinationEvaluator
  readonly compareEvaluations?: LapicBoundedExactEvaluationComparator
  readonly isCombinationFeasible?: LapicBoundedExactFeasibilityEvaluator
  readonly computeUpperBound?: LapicBoundedExactUpperBoundEvaluator
  readonly firGraph?: LapicFirGraph
  readonly dangerZoneConfig?: LapicDangerZoneConfig
  readonly maxCombinationCount?: number
  /**
   * When true, the in-process executor yields the event loop between
   * top-level domain iterations, allowing port messages from remote
   * workers to be processed.  Has no effect on MessagePort dispatchers.
   */
  readonly cooperativeYield?: boolean
}

// ---------------------------------------------------------------------------
// In-process implementation
// ---------------------------------------------------------------------------

/**
 * Create a partition dispatcher that runs the bounded-exact executor
 * directly in the calling thread.
 *
 * Each `dispatch()` call invokes `executeLapicBoundedExactSolve`
 * with the partition's prebuilt join context and incumbent threshold.
 * This is the default backend used by the coordinated solve.
 */
export function createInProcessPartitionDispatcher(
  config: LapicPartitionDispatchConfig
): LapicPartitionDispatcher {
  return {
    async dispatch(
      request: LapicPartitionDispatchRequest
    ): Promise<LapicPartitionDispatchResponse> {
      const outcome = await executeLapicBoundedExactSolve({
        problem: config.problem,
        controller: request.controller,
        artifactStore: config.artifactStore,
        evaluateCombination: config.evaluateCombination,
        ...(config.compareEvaluations !== undefined && {
          compareEvaluations: config.compareEvaluations,
        }),
        ...(config.isCombinationFeasible !== undefined && {
          isCombinationFeasible: config.isCombinationFeasible,
        }),
        ...(config.computeUpperBound !== undefined && {
          computeUpperBound: config.computeUpperBound,
        }),
        ...(config.firGraph !== undefined && { firGraph: config.firGraph }),
        ...(config.dangerZoneConfig !== undefined && {
          dangerZoneConfig: config.dangerZoneConfig,
        }),
        ...(config.maxCombinationCount !== undefined && {
          maxCombinationCount: config.maxCombinationCount,
        }),
        ...(config.cooperativeYield !== undefined && {
          cooperativeYield: config.cooperativeYield,
        }),
        prebuiltJoinContext: {
          joinPlan: request.joinPlan,
          frontierBlockIds: request.frontierBlockIds,
        },
        ...(request.initialIncumbentThreshold !== undefined && {
          initialIncumbentThreshold: request.initialIncumbentThreshold,
        }),
        ...(request.getExternalIncumbentThreshold !== undefined && {
          getExternalIncumbentThreshold: request.getExternalIncumbentThreshold,
        }),
        ...(request.onIncumbentImproved !== undefined && {
          onIncumbentImproved: request.onIncumbentImproved,
        }),
      })

      if ('paused' in outcome) {
        return { kind: 'paused', checkpointState: outcome.checkpointState }
      }

      return {
        kind: 'completed',
        topNCandidates: outcome.topNCandidates,
        emittedCertificates: outcome.emittedCertificates,
      }
    },

    async shutdown(): Promise<void> {
      // In-process dispatcher has no resources to release.
    },
  }
}
