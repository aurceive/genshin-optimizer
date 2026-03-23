/**
 * Coordinated bounded-exact solve — the bridge between the coordinator
 * and the full bounded-exact executor.
 *
 * This module connects the two previously parallel systems:
 *
 * 1. The **coordinator** (partitioning, dispatch, merge) from `coordinator.ts`
 * 2. The **executor** (`executeLapicBoundedExactSolve`) from `solve/executor.ts`
 *
 * The coordinated solve:
 * - Builds frontiers and the join plan once (from the canonical problem)
 * - Partitions the join plan by splitting the outermost domain
 * - Executes each partition through the full bounded-exact executor
 *   (with branch-and-bound pruning, certificates, and pause support)
 * - Selects the best-performing partition and forwards its final
 *   optimality to the parent controller
 * - Collects certificates from all partitions
 *
 * For single-partition solves (workerCount <= 1), the function delegates
 * directly to `executeLapicBoundedExactSolve` with zero overhead.
 *
 * ### Merge strategy
 *
 * Each partition runs an independent executor with its own top-N tracker.
 * After all partitions complete, the coordinated solve collects all
 * `topNCandidates` from every partition, sorts them using the configured
 * comparator (or default numeric descending), takes the global top-N,
 * and creates a new FinalOptimality certificate from the merged set.
 * This produces the correct global top-N regardless of partition count.
 */

import { createLapicFinalOptimalitySummary } from '@genshin-optimizer/lapic/cert'
import type {
  LapicCanonicalProblem,
  LapicFirGraph,
} from '@genshin-optimizer/lapic/core'
import type { LapicArtifactStore } from '@genshin-optimizer/lapic/storage'
import { createLapicInMemorySessionController } from '../session/controller'
import type {
  LapicInMemorySessionController,
  LapicSessionIdentity,
  LapicSolveCompletionResult,
  LapicTopNCandidateEntry,
} from '../types'
import { lapicRuntimeProtocolVersion } from '../types'
import {
  createFrontierBlockForDomain,
  createFrontierIndexForSolve,
} from '../solve/frontier'
import { createFrontierJoinPlan } from '../solve/join-plan'
import {
  sortDomains,
  validateSolveOptions,
  compareEvaluations,
} from '../solve/combination'
import { executeLapicBoundedExactSolve } from '../solve/executor'
import { persistArtifact } from '../solve/persistence'
import {
  createInfeasibilityCertificate,
  createFinalOptimalityCertificate,
} from '../solve/certificate'
import type {
  LapicBoundedExactCombinationEvaluator,
  LapicBoundedExactEvaluationComparator,
  LapicBoundedExactFeasibilityEvaluator,
  LapicBoundedExactSolveOptions,
  LapicBoundedExactSolveOutcome,
  LapicBoundedExactUpperBoundEvaluator,
} from '../solve/types'
import type { LapicDangerZoneConfig } from '../solve/danger-zone'
import { createDomainPartitionedJoinPlans } from './domain-partitioner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for a coordinated bounded-exact solve.
 *
 * Mirrors `LapicBoundedExactSolveOptions` but adds `workerCount`
 * for multi-partition execution.  The coordinator owns frontier
 * building and partitioning; each partition runs the full executor.
 */
export interface LapicCoordinatedBoundedExactSolveConfig {
  readonly problem: LapicCanonicalProblem
  readonly controller: LapicInMemorySessionController
  readonly artifactStore: LapicArtifactStore
  readonly evaluateCombination: LapicBoundedExactCombinationEvaluator
  readonly compareEvaluations?: LapicBoundedExactEvaluationComparator
  readonly isCombinationFeasible?: LapicBoundedExactFeasibilityEvaluator
  readonly computeUpperBound?: LapicBoundedExactUpperBoundEvaluator
  readonly firGraph?: LapicFirGraph
  readonly dangerZoneConfig?: LapicDangerZoneConfig
  readonly maxCombinationCount?: number

  /**
   * Number of partitions to split the outermost domain into.
   * When <= 1, the solve delegates directly to the single-threaded
   * executor with zero overhead.
   */
  readonly workerCount: number

  /** Progress callback invoked after each partition completes. */
  readonly onPartitionComplete?: (
    partitionIndex: number,
    totalPartitions: number
  ) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal `LapicBoundedExactSolveOptions` for certificate / persist fns. */
function buildMinimalOptions(
  config: LapicCoordinatedBoundedExactSolveConfig
): LapicBoundedExactSolveOptions {
  return {
    problem: config.problem,
    controller: config.controller,
    artifactStore: config.artifactStore,
    evaluateCombination: config.evaluateCombination,
  }
}

/** Build the full executor options, optionally with prebuilt join context. */
function buildExecutorOptions(
  config: LapicCoordinatedBoundedExactSolveConfig,
  controller: LapicInMemorySessionController,
  prebuiltJoinContext?: LapicBoundedExactSolveOptions['prebuiltJoinContext']
): LapicBoundedExactSolveOptions {
  return {
    problem: config.problem,
    controller,
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
    ...(prebuiltJoinContext !== undefined && { prebuiltJoinContext }),
  }
}

let partitionSequence = 0

function createPartitionController(
  parentIdentity: LapicSessionIdentity,
  partitionIndex: number,
  artifactStore: LapicArtifactStore
): LapicInMemorySessionController {
  return createLapicInMemorySessionController({
    identity: {
      sessionId: `${parentIdentity.sessionId}:partition-${partitionIndex}`,
      problemDigest: parentIdentity.problemDigest,
      engineVersion: parentIdentity.engineVersion,
      arithmeticPolicyId: parentIdentity.arithmeticPolicyId,
      runtimeProtocolVersion: lapicRuntimeProtocolVersion,
      createdAtLogicalTimestamp: String(Date.now() + ++partitionSequence),
    },
    artifactStore,
  })
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Execute a coordinated bounded-exact solve.
 *
 * When `workerCount <= 1`, delegates directly to the single-threaded
 * `executeLapicBoundedExactSolve` (zero-overhead path for small problems).
 *
 * When `workerCount > 1`:
 * 1. Builds frontiers and join plan once
 * 2. Partitions the join plan by splitting the outermost domain's rows
 * 3. Creates a partition-scoped controller per partition
 * 4. Runs `executeLapicBoundedExactSolve` sequentially for each partition
 * 5. Selects the best partition's final optimality as the global result
 * 6. Forwards all certificates to the parent controller
 * 7. Completes the parent controller
 */
export async function executeCoordinatedBoundedExactSolve(
  config: LapicCoordinatedBoundedExactSolveConfig
): Promise<LapicBoundedExactSolveOutcome> {
  // --- Single-partition fast path ---
  if (config.workerCount <= 1) {
    return executeLapicBoundedExactSolve(
      buildExecutorOptions(config, config.controller)
    )
  }

  // --- Multi-partition coordinated path ---

  const orderedDomains = sortDomains(config.problem)
  const orderedCandidates = orderedDomains.map((domain) => domain.candidates)
  const validation = validateSolveOptions(
    buildMinimalOptions(config),
    orderedCandidates
  )
  if (!validation.ok)
    return config.controller.fail(
      'workerFailure',
      validation.diagnostics[0]?.message ?? 'Invalid bounded solve options.',
      validation.diagnostics
    )

  config.controller.publishTrace(
    'InitSession',
    `coordinated-solve:${config.problem.problemDigest}`
  )

  // --- Build frontiers (once) ---
  config.controller.activate('frontier-build')
  const frontierBlocks = orderedDomains.map((domain) =>
    createFrontierBlockForDomain(config.problem, domain)
  )
  const frontierBlockIds = frontierBlocks.map((b) => b.blockId)

  const minimalOpts = buildMinimalOptions(config)
  for (const [i, block] of frontierBlocks.entries()) {
    await persistArtifact(
      minimalOpts,
      'frontier-block',
      block.blockId,
      `payload:${block.blockId}`,
      block,
      [config.problem.problemDigest]
    )
    config.controller.publishProgress({
      phase: 'frontier-build',
      completedUnits: i + 1,
      totalUnits: orderedDomains.length,
    })
  }

  const frontierIndex = createFrontierIndexForSolve(
    config.problem,
    frontierBlocks
  )
  await persistArtifact(
    minimalOpts,
    'frontier-index',
    frontierIndex.indexId,
    `payload:${frontierIndex.indexId}`,
    frontierIndex,
    [config.problem.problemDigest, ...frontierBlockIds]
  )

  // --- Create join plan ---
  const joinPlanResult = createFrontierJoinPlan(
    config.problem,
    orderedDomains,
    frontierBlocks,
    frontierIndex
  )
  if (!joinPlanResult.ok)
    return config.controller.fail(
      'workerFailure',
      joinPlanResult.diagnostics[0]?.message ??
        'Failed to create join plan for coordinated solve.',
      joinPlanResult.diagnostics
    )

  // --- Partition the join plan ---
  const partitions = createDomainPartitionedJoinPlans(
    joinPlanResult.value,
    config.workerCount
  )

  if (partitions.length === 0) {
    const infeasibilityCert = createInfeasibilityCertificate(
      minimalOpts,
      frontierBlockIds
    )
    await persistArtifact(
      minimalOpts,
      'certificate',
      infeasibilityCert.certId,
      infeasibilityCert.evidenceDigest,
      infeasibilityCert,
      frontierBlockIds
    )
    config.controller.emitCertificate(infeasibilityCert)
    return config.controller.complete()
  }

  // --- Execute partitions sequentially ---
  config.controller.activate('join')

  const parentIdentity = (await config.controller.inspectSessionState()).summary
    .identity

  interface PartitionCompletion {
    readonly completion: LapicSolveCompletionResult
  }
  const completions: PartitionCompletion[] = []

  for (const partition of partitions) {
    // Check for pause on the parent controller between partitions
    const parentState = await config.controller.inspectSessionState()
    if (parentState.summary.solveState === 'pausing') {
      config.controller.reachPauseSafePoint()
      return {
        paused: true as const,
        checkpointState: {
          checkpointKind: 'solve-position' as const,
          problemDigest: config.problem.problemDigest,
          visitedCombinationCount: 0,
          totalCombinationCount: joinPlanResult.value.totalCombinationCount,
          trackerSnapshot: { topN: config.problem.topN, entries: [] },
          cursorPosition: { flatIndex: 0 },
          frontierBlockIds,
          phase: 'join' as const,
        },
      }
    }

    const partitionController = createPartitionController(
      parentIdentity,
      partition.partitionIndex,
      config.artifactStore
    )

    // Prevent unhandled rejection on the partition controller's
    // completion promise (we extract the result below).
    partitionController.awaitCompletion().catch(() => {})

    const outcome = await executeLapicBoundedExactSolve(
      buildExecutorOptions(config, partitionController, {
        joinPlan: partition.joinPlan,
        frontierBlockIds,
      })
    )

    if ('paused' in outcome && outcome.paused) {
      // Partition was paused (its own controller's pause was triggered).
      // In the current implementation, partition controllers don't receive
      // external pause requests, so this path is defensive only.
      return outcome
    }

    completions.push({ completion: outcome as LapicSolveCompletionResult })

    config.controller.publishProgress({
      phase: 'join',
      completedUnits: partition.partitionIndex + 1,
      totalUnits: partitions.length,
    })

    config.onPartitionComplete?.(partition.partitionIndex, partitions.length)
  }

  // --- Cross-partition top-N merge ---
  config.controller.activate('resolve-residual')

  // Forward all non-FinalOptimality certificates to the parent controller
  for (const { completion } of completions) {
    for (const cert of completion.emittedCertificates) {
      if (cert.certKind !== 'FinalOptimalityCert') {
        config.controller.emitCertificate(cert)
      }
    }
  }

  // Collect all top-N candidates from every partition
  const allCandidates: LapicTopNCandidateEntry[] = []
  for (const { completion } of completions) {
    if (completion.topNCandidates) {
      allCandidates.push(...completion.topNCandidates)
    }
  }

  if (allCandidates.length === 0) {
    // No partition found a feasible solution
    const infeasibilityCert = createInfeasibilityCertificate(
      minimalOpts,
      frontierBlockIds
    )
    await persistArtifact(
      minimalOpts,
      'certificate',
      infeasibilityCert.certId,
      infeasibilityCert.evidenceDigest,
      infeasibilityCert,
      frontierBlockIds
    )
    config.controller.emitCertificate(infeasibilityCert)
    return config.controller.complete()
  }

  // Sort candidates across all partitions and take the global top-N
  const topN = config.problem.topN
  const mergedCandidates = [...allCandidates]
    .sort(
      (a, b) =>
        // compareEvaluations returns >0 when left is better;
        // Array.sort expects negative for "a before b",
        // so negate to sort best-first.
        -compareEvaluations(
          a.evaluation,
          a.stateId,
          b.evaluation,
          b.stateId,
          config.compareEvaluations
        )
    )
    .slice(0, topN)

  // Create a new global FinalOptimality certificate from merged winners
  const globalFinalCert = createFinalOptimalityCertificate(
    minimalOpts,
    mergedCandidates,
    frontierBlockIds
  )
  await persistArtifact(
    minimalOpts,
    'certificate',
    globalFinalCert.certId,
    globalFinalCert.evidenceDigest,
    globalFinalCert,
    frontierBlockIds
  )
  config.controller.emitCertificate(globalFinalCert)

  const globalOptimality = createLapicFinalOptimalitySummary(globalFinalCert)
  if (!globalOptimality.ok)
    return config.controller.fail(
      'workerFailure',
      globalOptimality.diagnostics[0]?.message ??
        'Failed to summarize coordinated solve optimality.',
      globalOptimality.diagnostics
    )

  return config.controller.complete(globalOptimality.value, mergedCandidates)
}

/**
 * Reset the internal partition sequence counter.
 * Only used in tests to ensure deterministic IDs.
 */
export function resetPartitionSequenceForTesting(): void {
  partitionSequence = 0
}
