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
  buildCandidateIndex,
  createResumableTopNTracker,
  restoreResumableTopNTracker,
} from './resumable-tracker'
import type {
  LapicBoundedExactCandidateCombination,
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
    const frontierBlockIds: string[] = []
    const frontierBlocks: LapicFrontierBlock[] = []

    options.controller.publishTrace('InitSession', `solve:${options.problem.problemDigest}`)

    if (isResuming) {
      // On resume we skip frontier-build: blocks were already built.
      // Validate checkpoint consistency.
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

      // Rebuild frontier blocks locally (they were already persisted in the original run).
      for (const domain of orderedDomains) {
        const block = createFrontierBlockForDomain(options.problem, domain)
        frontierBlocks.push(block)
        frontierBlockIds.push(block.blockId)
      }
    } else {
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
    }

    const frontierIndex = createFrontierIndexForSolve(options.problem, frontierBlocks)
    if (!isResuming) {
      await persistArtifact(
        options,
        'frontier-index',
        frontierIndex.indexId,
        `payload:${frontierIndex.indexId}`,
        frontierIndex,
        [options.problem.problemDigest, ...frontierBlockIds]
      )
    }

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

    // Restore or create the tracker.
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
    let processedCombinationCount = isResuming
      ? options.resumeCheckpointState!.visitedCombinationCount
      : 0

    // Flat enumeration counter used to skip already-visited combinations on resume.
    let currentFlatIndex = 0
    let pauseDetected = false

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

      for (const plannedRow of joinPlan.value.entries[domainIndex]!.rows) {
        if (pauseDetected) return
        await visitCombination(domainIndex + 1, [
          ...partialCandidates,
          plannedRow.candidate,
        ])
      }
    }

    await visitCombination(0, [])

    // If a pause was requested during the join phase, emit checkpoint and return.
    if (pauseDetected) {
      options.controller.reachPauseSafePoint()
      const checkpointState = createLapicSolveCheckpointState(
        options.problem.problemDigest,
        processedCombinationCount,
        totalCombinationCount,
        tracker.snapshot(),
        createLapicSolveCursorPosition(currentFlatIndex),
        frontierBlockIds
      )
      return { paused: true, checkpointState }
    }

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
