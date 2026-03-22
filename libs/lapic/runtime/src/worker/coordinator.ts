/**
 * Multi-worker coordinator for the lapic bounded-exact solver.
 *
 * Orchestrates the solve across multiple workers by:
 * 1. Partitioning the join plan's flat-index space
 * 2. Dispatching partitions to workers via the transport layer
 * 3. Collecting per-worker top-N results
 * 4. Merging results deterministically into a global top-N
 *
 * The coordinator guarantees that the final top-N is identical
 * regardless of worker count (determinism invariant).
 */

import type { LapicCandidateDescriptor, LapicCanonicalProblem } from '@genshin-optimizer/lapic/core'
import {
  createCombinationStateId,
  hasExclusiveResourceConflict,
} from '@genshin-optimizer/lapic/core'
import type { LapicFrontierJoinPlan } from '../solve/join-plan'
import type {
  LapicBoundedExactCombinationEvaluation,
  LapicBoundedExactCombinationEvaluator,
  LapicBoundedExactEvaluationComparator,
  LapicBoundedExactFeasibilityEvaluator,
} from '../solve/types'
import { compareEvaluations, normalizeFeasibilityResult } from '../solve/combination'
import {
  createWorkerPartitionPlan,
  decodeFlatIndex,
  type LapicPartitionConfig,
  type LapicWorkerPartitionPlan,
} from './partitioner'
import type {
  LapicInProcessWorkResult,
  LapicWorkerResultEntry,
  LapicWorkerResultMessage,
  LapicWorkerTransport,
} from './transport'
import { createInProcessTransport } from './transport'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for a coordinated multi-worker solve.
 */
export interface LapicCoordinatedSolveConfig {
  readonly problem: LapicCanonicalProblem
  readonly joinPlan: LapicFrontierJoinPlan
  readonly evaluateCombination: LapicBoundedExactCombinationEvaluator
  readonly compareEvaluations?: LapicBoundedExactEvaluationComparator
  readonly isCombinationFeasible?: LapicBoundedExactFeasibilityEvaluator
  readonly transport: LapicWorkerTransport
  readonly partitionConfig: LapicPartitionConfig
  readonly topN: number
  /** Optional progress callback invoked after each partition completes. */
  readonly onPartitionComplete?: (partitionIndex: number, total: number) => void
}

/**
 * Result of a coordinated multi-worker solve.
 */
export interface LapicCoordinatedSolveResult {
  readonly topCandidates: readonly LapicWorkerResultEntry[]
  readonly totalEvaluatedCount: number
  readonly totalVisitedCount: number
  readonly workerCount: number
  readonly partitionPlan: LapicWorkerPartitionPlan
  readonly perWorkerResults: readonly LapicWorkerResultMessage[]
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

/**
 * Merge per-worker top-N results into a global top-N.
 *
 * All entries are collected, sorted by evaluation in descending order,
 * and truncated to `topN`. The sort is deterministic: ties are broken
 * by stateId (lexicographic) to ensure worker-count independence.
 */
export function mergeWorkerResults(
  perWorkerResults: readonly LapicWorkerResultMessage[],
  topN: number,
  explicitComparator?: LapicBoundedExactEvaluationComparator
): readonly LapicWorkerResultEntry[] {
  const allEntries: LapicWorkerResultEntry[] = []

  for (const result of perWorkerResults) {
    for (const entry of result.topCandidates) {
      allEntries.push(entry)
    }
  }

  if (allEntries.length === 0) return []

  allEntries.sort((a, b) => {
    const relation = compareEvaluations(
      a.evaluation, 'exact',
      b.evaluation, 'exact',
      explicitComparator
    )
    if (relation !== 0) return -relation
    // Deterministic tie-break by stateId
    return a.stateId < b.stateId ? -1 : a.stateId > b.stateId ? 1 : 0
  })

  // Deduplicate by stateId (same combination may appear if partitions overlap
  // due to pruning boundary rounding — defensive)
  const seen = new Set<string>()
  const deduplicated: LapicWorkerResultEntry[] = []
  for (const entry of allEntries) {
    if (seen.has(entry.stateId)) continue
    seen.add(entry.stateId)
    deduplicated.push(entry)
    if (deduplicated.length >= topN) break
  }

  return deduplicated
}

// ---------------------------------------------------------------------------
// In-process partition executor
// ---------------------------------------------------------------------------

/**
 * Create an in-process executor function that evaluates combinations
 * within a flat-index range. This is the work body that runs inside
 * each in-process "worker".
 */
export function createInProcessPartitionExecutor(
  problem: LapicCanonicalProblem,
  joinPlan: LapicFrontierJoinPlan,
  evaluateCombination: LapicBoundedExactCombinationEvaluator,
  topN: number,
  compareEvals?: LapicBoundedExactEvaluationComparator,
  isFeasible?: LapicBoundedExactFeasibilityEvaluator
): (startFlatIndex: number, endFlatIndex: number) => LapicInProcessWorkResult {
  return (startFlatIndex: number, endFlatIndex: number): LapicInProcessWorkResult => {
    const entries: LapicWorkerResultEntry[] = []
    let evaluatedCount = 0
    const visitedCount = endFlatIndex - startFlatIndex

    for (let flatIndex = startFlatIndex; flatIndex < endFlatIndex; flatIndex++) {
      const domainIndices = decodeFlatIndex(joinPlan, flatIndex)

      const candidates: LapicCandidateDescriptor[] = []
      for (let d = 0; d < joinPlan.entries.length; d++) {
        candidates.push(joinPlan.entries[d]!.rows[domainIndices[d]!]!.candidate)
      }

      if (hasExclusiveResourceConflict(candidates)) continue

      const combination = { problem, candidates }

      if (isFeasible) {
        const feasibility = normalizeFeasibilityResult(isFeasible(combination))
        if (!feasibility.ok) continue
        if (!feasibility.value) continue
      }

      const evaluation = evaluateCombination(combination)
      if (!evaluation.ok) continue

      evaluatedCount++

      const stateId = createCombinationStateId(problem, candidates)
      const entry: LapicWorkerResultEntry = {
        stateId,
        candidates: [...candidates],
        evaluation: evaluation.value,
      }

      // Maintain a local top-N buffer
      entries.push(entry)
      if (entries.length > topN * 2) {
        entries.sort((a, b) => {
          const relation = compareEvaluations(
            a.evaluation, 'exact',
            b.evaluation, 'exact',
            compareEvals
          )
          if (relation !== 0) return -relation
          return a.stateId < b.stateId ? -1 : a.stateId > b.stateId ? 1 : 0
        })
        entries.length = topN
      }
    }

    // Final sort and trim
    entries.sort((a, b) => {
      const relation = compareEvaluations(
        a.evaluation, 'exact',
        b.evaluation, 'exact',
        compareEvals
      )
      if (relation !== 0) return -relation
      return a.stateId < b.stateId ? -1 : a.stateId > b.stateId ? 1 : 0
    })
    if (entries.length > topN) entries.length = topN

    return { topCandidates: entries, evaluatedCount, visitedCount }
  }
}

// ---------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------

/**
 * Execute a coordinated multi-worker solve.
 *
 * Steps:
 * 1. Partition the join plan's flat-index space across workers
 * 2. Dispatch each partition to the transport layer
 * 3. Collect results and merge into global top-N
 *
 * The function guarantees deterministic results regardless of
 * worker count (the exit gate for Phase 4).
 */
export async function executeCoordinatedSolve(
  config: LapicCoordinatedSolveConfig
): Promise<LapicCoordinatedSolveResult> {
  const partitionPlan = createWorkerPartitionPlan(
    config.joinPlan,
    config.partitionConfig
  )

  if (partitionPlan.totalCombinationCount === 0) {
    return {
      topCandidates: [],
      totalEvaluatedCount: 0,
      totalVisitedCount: 0,
      workerCount: 0,
      partitionPlan,
      perWorkerResults: [],
    }
  }

  const perWorkerResults: LapicWorkerResultMessage[] = []
  let totalEvaluatedCount = 0
  let totalVisitedCount = 0

  // Dispatch partitions sequentially (in-process) or could be parallel
  // for real worker backends. The transport abstracts this.
  for (const partition of partitionPlan.partitions) {
    const result = await config.transport.dispatch({
      tag: 'StartWork',
      sessionId: config.problem.problemDigest,
      partitionIndex: partition.partitionIndex,
      startFlatIndex: partition.startFlatIndex,
      endFlatIndex: partition.endFlatIndex,
    })

    perWorkerResults.push(result)
    totalEvaluatedCount += result.evaluatedCount
    totalVisitedCount += result.visitedCount

    config.onPartitionComplete?.(
      partition.partitionIndex,
      partitionPlan.workerCount
    )
  }

  const topCandidates = mergeWorkerResults(
    perWorkerResults,
    config.topN,
    config.compareEvaluations
  )

  return {
    topCandidates,
    totalEvaluatedCount,
    totalVisitedCount,
    workerCount: partitionPlan.workerCount,
    partitionPlan,
    perWorkerResults,
  }
}

/**
 * Convenience: create a fully wired in-process coordinated solve.
 * Useful for testing the coordinator and verifying determinism.
 */
export function createInProcessCoordinatedSolve(
  config: Omit<LapicCoordinatedSolveConfig, 'transport'>
): Promise<LapicCoordinatedSolveResult> {
  const executor = createInProcessPartitionExecutor(
    config.problem,
    config.joinPlan,
    config.evaluateCombination,
    config.topN,
    config.compareEvaluations,
    config.isCombinationFeasible
  )

  const transport = createInProcessTransport(executor)

  return executeCoordinatedSolve({
    ...config,
    transport,
  })
}
