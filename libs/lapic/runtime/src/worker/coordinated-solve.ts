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
import { createLapicWorkScheduler } from '../scheduler/scheduler'
import type { LapicWorkUnitEnvelope } from '../types'
import type {
  LapicPartitionDispatcher,
  LapicPartitionDispatchConfig,
  LapicPartitionCompletedResponse,
} from './partition-dispatch'
import { createInProcessPartitionDispatcher } from './partition-dispatch'

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

  /**
   * Optional partition dispatcher to use for executing partitions.
   *
   * When provided, the coordinated solve dispatches each partition
   * through this interface instead of calling the executor directly.
   * This enables transparent switching between in-process execution
   * and MessagePort-based worker threads.
   *
   * When omitted, an in-process dispatcher is created automatically
   * from the config's evaluator callbacks.
   */
  readonly dispatcher?: LapicPartitionDispatcher

  /** Progress callback invoked after each partition completes. */
  readonly onPartitionComplete?: (
    partitionIndex: number,
    totalPartitions: number
  ) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the incumbent threshold from the running best-N candidates.
 * Returns the worst (N-th) candidate's objective value when we have
 * at least `topN` candidates, or `undefined` otherwise.
 */
/** @internal Exported for unit testing. */
export function computeIncumbentThreshold(
  candidates: readonly LapicTopNCandidateEntry[],
  topN: number
): string | undefined {
  if (candidates.length < topN) return undefined
  // candidates are sorted best-first; the last entry is the worst in top-N
  return candidates[candidates.length - 1]!.evaluation.objectiveValue
}

/**
 * Merge new candidates into the running best set, sort by evaluation,
 * and truncate to the top N.
 */
/** @internal Exported for unit testing. */
export function mergeAndTruncateCandidates(
  existing: readonly LapicTopNCandidateEntry[],
  incoming: readonly LapicTopNCandidateEntry[],
  topN: number,
  comparator?: LapicBoundedExactEvaluationComparator
): LapicTopNCandidateEntry[] {
  return [...existing, ...incoming]
    .sort(
      (a, b) =>
        -compareEvaluations(
          a.evaluation,
          a.stateId,
          b.evaluation,
          b.stateId,
          comparator
        )
    )
    .slice(0, topN)
}

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

/** Extract a `LapicPartitionDispatchConfig` from the coordinated solve config. */
function extractDispatchConfig(
  config: LapicCoordinatedBoundedExactSolveConfig
): LapicPartitionDispatchConfig {
  return {
    problem: config.problem,
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
  }
}

/** Build the full executor options, optionally with prebuilt join context. */
function buildExecutorOptions(
  config: LapicCoordinatedBoundedExactSolveConfig,
  controller: LapicInMemorySessionController,
  prebuiltJoinContext?: LapicBoundedExactSolveOptions['prebuiltJoinContext'],
  initialIncumbentThreshold?: string
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
    ...(initialIncumbentThreshold !== undefined && {
      initialIncumbentThreshold,
    }),
  }
}

/**
 * Create a work unit envelope for a partition.
 *
 * All partitions receive equal priority with the partition index
 * encoded in `residualCostDigest` and `deterministicTieBreakDigest`.
 * Because the scheduler orders by these digests lexicographically,
 * partitions are dispatched in ascending index order — matching the
 * current sequential execution contract.
 */
function createPartitionWorkUnit(
  partitionIndex: number,
  problemDigest: string
): LapicWorkUnitEnvelope {
  const idx = String(partitionIndex).padStart(8, '0')
  return {
    workUnitId: `partition:${problemDigest}:${partitionIndex}`,
    kind: 'SolvePartition',
    determinismClass: 'pure-deterministic',
    priority: {
      upperBoundOrderingDigest: '0',
      uncertaintyGapDigest: '0',
      residualCostDigest: idx,
      deterministicTieBreakDigest: idx,
      costModelVersion: '1.0.0',
    },
    retryPolicy: {
      maxAttempts: 1,
      replaySafe: true,
    },
  }
}

function createPartitionController(
  parentIdentity: LapicSessionIdentity,
  partitionIndex: number,
  artifactStore: LapicArtifactStore,
  sequenceCounter: { value: number }
): LapicInMemorySessionController {
  return createLapicInMemorySessionController({
    identity: {
      sessionId: `${parentIdentity.sessionId}:partition-${partitionIndex}`,
      problemDigest: parentIdentity.problemDigest,
      engineVersion: parentIdentity.engineVersion,
      arithmeticPolicyId: parentIdentity.arithmeticPolicyId,
      runtimeProtocolVersion: lapicRuntimeProtocolVersion,
      createdAtLogicalTimestamp: String(Date.now() + ++sequenceCounter.value),
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

  // --- Execute partitions via scheduler with incumbent sharing ---
  config.controller.activate('join')

  const parentIdentity = (await config.controller.inspectSessionState()).summary
    .identity

  // Create the partition dispatcher — use the provided one or default
  // to in-process (calls executeLapicBoundedExactSolve directly).
  const dispatcher =
    config.dispatcher ??
    createInProcessPartitionDispatcher(extractDispatchConfig(config))

  interface PartitionDispatchOutcome {
    readonly response: LapicPartitionCompletedResponse
  }
  const dispatchOutcomes: PartitionDispatchOutcome[] = []
  // Running best-N candidates across completed partitions.
  // The worst entry's objective value becomes the initial incumbent
  // threshold for the next partition, enabling early pruning.
  let runningBestCandidates: LapicTopNCandidateEntry[] = []

  // Partition-local sequence counter — scoped to this coordinated
  // solve invocation to avoid global mutable state.
  const sequenceCounter = { value: 0 }

  // Pre-compute aggregate combination count for progress forwarding.
  // Each partition's joinPlan.totalCombinationCount gives the upper-bound
  // combination count for that partition; the sum is the global total.
  const totalCombinationsAll = partitions.reduce(
    (sum, p) => sum + p.joinPlan.totalCombinationCount,
    0
  )
  let completedCombinationsBefore = 0

  // Create scheduler and enqueue all partitions
  const scheduler = createLapicWorkScheduler()
  const partitionsByWorkUnitId = new Map<string, (typeof partitions)[number]>()
  for (const partition of partitions) {
    const workUnit = createPartitionWorkUnit(
      partition.partitionIndex,
      config.problem.problemDigest
    )
    scheduler.enqueue(workUnit)
    partitionsByWorkUnitId.set(workUnit.workUnitId, partition)
  }

  // Dispatch loop — scheduler provides deterministic ordering
  try {
    while (scheduler.queueDepth > 0) {
      // Check for pause on the parent controller between partitions
      const parentState = await config.controller.inspectSessionState()
      if (parentState.summary.solveState === 'pausing') {
        // Cancel all remaining queued partitions
        for (const item of scheduler.getItemsByStatus('queued')) {
          scheduler.cancel(item.workUnit.workUnitId)
        }
        config.controller.reachPauseSafePoint()
        // Checkpoint represents progress up to this point: zero
        // visited combinations because no partition is mid-execution
        // (the pause was detected between partitions).  Resuming from
        // this checkpoint restarts the coordinated solve from scratch.
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

      const scheduledItem = scheduler.dequeue()!
      const partition = partitionsByWorkUnitId.get(
        scheduledItem.workUnit.workUnitId
      )!

      const partitionController = createPartitionController(
        parentIdentity,
        partition.partitionIndex,
        config.artifactStore,
        sequenceCounter
      )

      // Prevent unhandled rejection on the partition controller's
      // completion promise (we extract the result below).
      partitionController.awaitCompletion().catch(() => {})

      // Forward partition-level combination progress to the parent
      // controller so that subscribers (e.g. the UI) see granular
      // updates instead of only partition-completion jumps.
      const offset = completedCombinationsBefore
      let lastPartitionCompletedUnits = 0
      const unsubPartitionProgress = partitionController.subscribeProgress(
        (event) => {
          if (event.phase === 'join') {
            lastPartitionCompletedUnits = event.completedUnits
            config.controller.publishProgress({
              phase: 'join',
              completedUnits: offset + event.completedUnits,
              totalUnits: totalCombinationsAll,
            })
          }
        }
      )

      // Compute the incumbent threshold from the running best-N.
      // When we have at least topN candidates, the worst entry's
      // objective value becomes the threshold — any subtree that
      // can't beat it is provably outside the global top-N.
      const incumbentThreshold = computeIncumbentThreshold(
        runningBestCandidates,
        config.problem.topN
      )

      try {
        const response = await dispatcher.dispatch({
          partitionIndex: partition.partitionIndex,
          controller: partitionController,
          joinPlan: partition.joinPlan,
          frontierBlockIds,
          initialIncumbentThreshold: incumbentThreshold,
        })

        unsubPartitionProgress.unsubscribe()

        if (response.kind === 'paused') {
          // Partition was paused — cancel remaining work and propagate
          scheduler.cancel(scheduledItem.workUnit.workUnitId)
          for (const item of scheduler.getItemsByStatus('queued')) {
            scheduler.cancel(item.workUnit.workUnitId)
          }
          return {
            paused: true as const,
            checkpointState: response.checkpointState,
          }
        }

        scheduler.complete(scheduledItem.workUnit.workUnitId)
        dispatchOutcomes.push({ response })

        // Update running best-N with this partition's candidates
        if (response.topNCandidates) {
          runningBestCandidates = mergeAndTruncateCandidates(
            runningBestCandidates,
            response.topNCandidates,
            config.problem.topN,
            config.compareEvaluations
          )
        }

        // Advance the combination offset for the next partition.
        // Use actual evaluated count (from last progress event) rather
        // than the theoretical totalCombinationCount, which would
        // inflate the running total when B&B prunes large subtrees.
        completedCombinationsBefore += lastPartitionCompletedUnits

        config.controller.publishProgress({
          phase: 'join',
          completedUnits: completedCombinationsBefore,
          totalUnits: totalCombinationsAll,
        })

        config.onPartitionComplete?.(
          partition.partitionIndex,
          partitions.length
        )
      } catch (error) {
        unsubPartitionProgress.unsubscribe()
        scheduler.fail(scheduledItem.workUnit.workUnitId)
        // Cancel all remaining queued partitions
        for (const item of scheduler.getItemsByStatus('queued')) {
          scheduler.cancel(item.workUnit.workUnitId)
        }
        const wrapped = new Error(
          `Partition ${partition.partitionIndex}/${partitions.length} failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        throw wrapped
      }
    }
  } finally {
    await dispatcher.shutdown()
  }

  // --- Cross-partition top-N merge ---
  config.controller.activate('resolve-residual')

  // Forward all non-FinalOptimality certificates to the parent controller
  for (const { response } of dispatchOutcomes) {
    for (const cert of response.emittedCertificates) {
      if (cert.certKind !== 'FinalOptimalityCert') {
        config.controller.emitCertificate(cert)
      }
    }
  }

  // Collect all top-N candidates from every partition
  const allCandidates: LapicTopNCandidateEntry[] = []
  for (const { response } of dispatchOutcomes) {
    if (response.topNCandidates) {
      allCandidates.push(...response.topNCandidates)
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
