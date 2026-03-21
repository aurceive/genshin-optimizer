import { createLapicFinalOptimalitySummary } from '@genshin-optimizer/lapic/cert'
import {
  type LapicCandidateDescriptor,
  type LapicDiagnostic,
  createLapicDiagnostic,
} from '@genshin-optimizer/lapic/core'
import type { LapicFrontierBlock } from '@genshin-optimizer/lapic/storage'
import { LapicSessionFailureError } from '../session/completion'
import type { LapicSolveCompletionResult } from '../types'
import { createFinalOptimalityCertificate, createInfeasibilityCertificate } from './certificate'
import {
  createLapicSolveCheckpointState,
  createLapicSolveCursorPosition,
} from './checkpoint-state'
import {
  compareEvaluations,
  createCombinationStateId,
  hasExclusiveResourceConflict,
  normalizeFeasibilityResult,
  sortDomains,
  validateSolveOptions,
} from './combination'
import { createFrontierBlockForDomain, createFrontierIndexForSolve } from './frontier'
import { createFrontierJoinPlan } from './join-plan'
import { persistArtifact } from './persistence'
import {
  computeSubtreeSize,
  createPruningStatistics,
  restorePruningStatistics,
  snapshotPruningStatistics,
} from './pruning'
import {
  buildCandidateIndex,
  createResumableTopNTracker,
  restoreResumableTopNTracker,
} from './resumable-tracker'
import type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactCombinationEvaluation,
  LapicBoundedExactSolveOptions,
  LapicBoundedExactSolveOutcome,
} from './types'

async function failSolve(
  options: LapicBoundedExactSolveOptions,
  message: string,
  diagnostics: readonly LapicDiagnostic[]
): Promise<never> {
  return options.controller.fail('workerFailure', message, diagnostics)
}

// ---------------------------------------------------------------------------
// Frontier construction
// ---------------------------------------------------------------------------

interface FrontierSetupResult {
  readonly frontierBlocks: LapicFrontierBlock[]
  readonly frontierBlockIds: string[]
  readonly frontierIndex: ReturnType<typeof createFrontierIndexForSolve>
}

async function buildFrontierFromScratch(
  options: LapicBoundedExactSolveOptions,
  orderedDomains: ReturnType<typeof sortDomains>
): Promise<FrontierSetupResult> {
  const frontierBlocks: LapicFrontierBlock[] = []
  const frontierBlockIds: string[] = []

  options.controller.activate('frontier-build')
  for (const [domainIndex, domain] of orderedDomains.entries()) {
    const block = createFrontierBlockForDomain(options.problem, domain)
    frontierBlocks.push(block)
    frontierBlockIds.push(block.blockId)
    await persistArtifact(
      options,
      'frontier-block',
      block.blockId,
      `payload:${block.blockId}`,
      block,
      [options.problem.problemDigest]
    )
    options.controller.publishProgress({
      phase: 'frontier-build',
      completedUnits: domainIndex + 1,
      totalUnits: orderedDomains.length,
    })
  }

  const frontierIndex = createFrontierIndexForSolve(options.problem, frontierBlocks)
  await persistArtifact(
    options,
    'frontier-index',
    frontierIndex.indexId,
    `payload:${frontierIndex.indexId}`,
    frontierIndex,
    [options.problem.problemDigest, ...frontierBlockIds]
  )

  return { frontierBlocks, frontierBlockIds, frontierIndex }
}

async function rebuildFrontierForResume(
  options: LapicBoundedExactSolveOptions,
  orderedDomains: ReturnType<typeof sortDomains>,
  totalCombinationCount: number
): Promise<FrontierSetupResult> {
  const ckpt = options.resumeCheckpointState!
  if (ckpt.problemDigest !== options.problem.problemDigest)
    return failSolve(options, 'Checkpoint problemDigest does not match current problem.', [
      createLapicDiagnostic('error', 'SchemaViolation',
        'Checkpoint problemDigest does not match current problem.',
        ['resumeCheckpointState', 'problemDigest']),
    ])
  if (ckpt.totalCombinationCount !== totalCombinationCount)
    return failSolve(options, 'Checkpoint totalCombinationCount diverged.', [
      createLapicDiagnostic('error', 'SchemaViolation',
        'Checkpoint totalCombinationCount diverged.',
        ['resumeCheckpointState', 'totalCombinationCount']),
    ])

  const frontierBlocks: LapicFrontierBlock[] = []
  const frontierBlockIds: string[] = []
  for (const domain of orderedDomains) {
    const block = createFrontierBlockForDomain(options.problem, domain)
    frontierBlocks.push(block)
    frontierBlockIds.push(block.blockId)
  }

  const frontierIndex = createFrontierIndexForSolve(options.problem, frontierBlocks)
  return { frontierBlocks, frontierBlockIds, frontierIndex }
}

// ---------------------------------------------------------------------------
// Tracker setup
// ---------------------------------------------------------------------------

interface TrackerSetup {
  readonly tracker: ReturnType<typeof createResumableTopNTracker>
  readonly resumeFlatIndex: number
  readonly processedCombinationCount: number
  readonly pruningStats: ReturnType<typeof createPruningStatistics>
}

function setupTracker(
  options: LapicBoundedExactSolveOptions,
  orderedDomains: ReturnType<typeof sortDomains>
): TrackerSetup {
  const isResuming = options.resumeCheckpointState !== undefined
  const candidateIndex = buildCandidateIndex(orderedDomains)

  const tracker = isResuming
    ? restoreResumableTopNTracker(
        options.resumeCheckpointState!.trackerSnapshot,
        candidateIndex,
        options.compareEvaluations
      )
    : createResumableTopNTracker(options.problem.topN, options.compareEvaluations)

  const resumeFlatIndex = isResuming
    ? options.resumeCheckpointState!.cursorPosition.flatIndex
    : 0
  const processedCombinationCount = isResuming
    ? options.resumeCheckpointState!.visitedCombinationCount
    : 0

  const pruningStats = isResuming && options.resumeCheckpointState!.pruningStatistics
    ? restorePruningStatistics(options.resumeCheckpointState!.pruningStatistics)
    : createPruningStatistics()

  return { tracker, resumeFlatIndex, processedCombinationCount, pruningStats }
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

async function completeSolve(
  options: LapicBoundedExactSolveOptions,
  tracker: ReturnType<typeof createResumableTopNTracker>,
  frontierBlockIds: readonly string[]
): Promise<LapicSolveCompletionResult> {
  options.controller.activate('resolve-residual')
  options.controller.publishProgress({
    phase: 'resolve-residual',
    completedUnits: 1,
    totalUnits: 1,
  })

  if (tracker.isEmpty()) {
    const infeasibilityCertificate = createInfeasibilityCertificate(
      options,
      frontierBlockIds
    )
    await persistArtifact(
      options,
      'certificate',
      infeasibilityCertificate.certId,
      infeasibilityCertificate.evidenceDigest,
      infeasibilityCertificate,
      frontierBlockIds
    )
    options.controller.emitCertificate(infeasibilityCertificate)
    return options.controller.complete()
  }

  const winners = tracker.results()
  const finalCertificate = createFinalOptimalityCertificate(
    options,
    winners,
    frontierBlockIds
  )
  const finalOptimality = createLapicFinalOptimalitySummary(finalCertificate)
  if (!finalOptimality.ok)
    return failSolve(
      options,
      finalOptimality.diagnostics[0]?.message ??
        'Failed to summarize final optimality certificate.',
      finalOptimality.diagnostics
    )

  await persistArtifact(
    options,
    'certificate',
    finalCertificate.certId,
    finalCertificate.evidenceDigest,
    finalCertificate,
    frontierBlockIds
  )
  options.controller.emitCertificate(finalCertificate)
  return options.controller.complete(finalOptimality.value)
}

// ---------------------------------------------------------------------------
// Main solver
// ---------------------------------------------------------------------------

export async function executeLapicBoundedExactSolve(
  options: LapicBoundedExactSolveOptions
): Promise<LapicBoundedExactSolveOutcome> {
  try {
    const orderedDomains = sortDomains(options.problem)
    const orderedCandidates = orderedDomains.map((domain) => domain.candidates)
    const validation = validateSolveOptions(options, orderedCandidates)
    if (!validation.ok)
      return failSolve(
        options,
        validation.diagnostics[0]?.message ?? 'Invalid bounded solve options.',
        validation.diagnostics
      )

    const totalCombinationCount = validation.value
    const isResuming = options.resumeCheckpointState !== undefined

    options.controller.publishTrace('InitSession', `solve:${options.problem.problemDigest}`)

    // --- Frontier setup ---
    const { frontierBlocks, frontierBlockIds, frontierIndex } = isResuming
      ? await rebuildFrontierForResume(options, orderedDomains, totalCombinationCount)
      : await buildFrontierFromScratch(options, orderedDomains)

    const joinPlan = createFrontierJoinPlan(
      options.problem,
      orderedDomains,
      frontierBlocks,
      frontierIndex
    )
    if (!joinPlan.ok)
      return failSolve(
        options,
        joinPlan.diagnostics[0]?.message ??
          'Failed to build bounded frontier join plan from frontier-index summaries.',
        joinPlan.diagnostics
      )

    if (joinPlan.value.totalCombinationCount !== totalCombinationCount)
      return failSolve(
        options,
        'Frontier-index join plan cardinality diverged from the bounded domain cardinality.',
        [
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'Frontier-index join plan cardinality diverged from the bounded domain cardinality.',
            ['frontierIndex', 'exactSignatureGroups']
          ),
        ]
      )

    options.controller.activate('join')

    // --- Tracker setup ---
    const {
      tracker,
      resumeFlatIndex,
      processedCombinationCount: initialProcessed,
      pruningStats,
    } = setupTracker(options, orderedDomains)

    let processedCombinationCount = initialProcessed
    let currentFlatIndex = 0
    let pauseDetected = false

    // Build a comparator for bound-vs-threshold checks.
    const explicitComparator = options.compareEvaluations
    function isBoundBelowThreshold(
      boundValue: string,
      thresholdValue: string
    ): boolean {
      const boundEval: LapicBoundedExactCombinationEvaluation = {
        objectiveValue: boundValue,
        evidenceDigest: 'bound-check',
        orderingKey: [boundValue],
      }
      const thresholdEval: LapicBoundedExactCombinationEvaluation = {
        objectiveValue: thresholdValue,
        evidenceDigest: 'threshold-check',
        orderingKey: [thresholdValue],
      }
      const relation = compareEvaluations(
        boundEval, 'bound',
        thresholdEval, 'threshold',
        explicitComparator
      )
      return relation < 0
    }

    const visitCombination = async (
      domainIndex: number,
      partialCandidates: readonly LapicCandidateDescriptor[]
    ): Promise<void> => {
      if (pauseDetected) return

      if (domainIndex >= joinPlan.value.entries.length) {
        const thisFlatIndex = currentFlatIndex
        currentFlatIndex += 1

        // On resume, skip combinations that were already processed.
        if (thisFlatIndex < resumeFlatIndex) return

        processedCombinationCount += 1
        options.controller.publishProgress({
          phase: 'join',
          completedUnits: processedCombinationCount,
          totalUnits: totalCombinationCount,
        })

        if (hasExclusiveResourceConflict(partialCandidates)) return

        const combination: LapicBoundedExactCandidateCombination = {
          problem: options.problem,
          candidates: partialCandidates,
        }

        if (options.isCombinationFeasible) {
          const feasibility = normalizeFeasibilityResult(
            options.isCombinationFeasible(combination)
          )
          if (!feasibility.ok)
            return failSolve(
              options,
              feasibility.diagnostics[0]?.message ??
                'Failed to evaluate bounded solve feasibility.',
              feasibility.diagnostics
            )
          if (!feasibility.value) return
        }

        const evaluation = options.evaluateCombination(combination)
        if (!evaluation.ok)
          return failSolve(
            options,
            evaluation.diagnostics[0]?.message ??
              'Failed to evaluate bounded solve combination.',
            evaluation.diagnostics
          )

        const stateId = createCombinationStateId(options.problem, partialCandidates)
        tracker.insert({
          stateId,
          candidates: [...partialCandidates],
          evaluation: evaluation.value,
        })

        // Check for pause request at each safe-point.
        const sessionState = await options.controller.inspectSessionState()
        if (sessionState.summary.solveState === 'pausing') {
          pauseDetected = true
        }

        return
      }

      // --- Branch-and-bound pruning at intermediate recursion levels ---
      if (
        options.computeUpperBound &&
        tracker.isFull() &&
        domainIndex > 0  // At least one candidate already assigned
      ) {
        const threshold = tracker.currentThreshold()
        if (threshold !== undefined) {
          pruningStats.boundEvaluationCount += 1
          const bound = options.computeUpperBound({
            problem: options.problem,
            assignedCandidates: partialCandidates,
            assignedDomainCount: domainIndex,
            totalDomainCount: joinPlan.value.entries.length,
          })
          if (bound !== undefined && isBoundBelowThreshold(bound.upperBoundValue, threshold)) {
            // Prune entire subtree: skip all leaf combinations below this node.
            const subtreeSize = computeSubtreeSize(joinPlan.value, domainIndex)
            currentFlatIndex += subtreeSize
            pruningStats.prunedCombinationCount += subtreeSize
            pruningStats.prunedSubtreeCount += 1
            return
          }
        }
      }

      for (const plannedRow of joinPlan.value.entries[domainIndex]!.rows) {
        if (pauseDetected) return
        await visitCombination(domainIndex + 1, [
          ...partialCandidates,
          plannedRow.candidate,
        ])
      }
    }

    await visitCombination(0, [])

    // If a pause was requested during the join phase, persist checkpoint and return.
    if (pauseDetected) {
      options.controller.reachPauseSafePoint()
      const checkpointState = createLapicSolveCheckpointState(
        options.problem.problemDigest,
        processedCombinationCount,
        totalCombinationCount,
        tracker.snapshot(),
        createLapicSolveCursorPosition(currentFlatIndex),
        frontierBlockIds,
        snapshotPruningStatistics(pruningStats)
      )
      const checkpointContentHash =
        `solve-checkpoint:${options.problem.problemDigest}:${currentFlatIndex}`
      await persistArtifact(
        options,
        'solve-checkpoint',
        checkpointContentHash,
        `payload:${checkpointContentHash}`,
        checkpointState,
        [options.problem.problemDigest, ...frontierBlockIds]
      )
      return { paused: true, checkpointState }
    }

    return completeSolve(options, tracker, frontierBlockIds)
  } catch (error) {
    if (error instanceof LapicSessionFailureError) throw error
    const message = error instanceof Error ? error.message : 'Unknown bounded solve failure.'
    return failSolve(
      options,
      message,
      [createLapicDiagnostic('error', 'InternalBugDetected', message)]
    )
  }
}
