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
  type LapicBoundedExactBestCandidate,
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
import type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactSolveOptions,
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
): Promise<LapicSolveCompletionResult> {
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
    const frontierBlockIds: string[] = []
    const frontierBlocks: LapicFrontierBlock[] = []

    options.controller.publishTrace('InitSession', `solve:${options.problem.problemDigest}`)
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

    let processedCombinationCount = 0
    let bestCandidate: LapicBoundedExactBestCandidate | undefined

    const visitCombination = async (
      domainIndex: number,
      partialCandidates: readonly LapicCandidateDescriptor[]
    ): Promise<void> => {
      if (domainIndex >= joinPlan.value.entries.length) {
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
        if (
          !bestCandidate ||
          compareEvaluations(
            bestCandidate.evaluation,
            bestCandidate.stateId,
            evaluation.value,
            stateId,
            options.compareEvaluations
          ) < 0
        )
          bestCandidate = {
            stateId,
            candidates: [...partialCandidates],
            evaluation: evaluation.value,
          }

        return
      }

      for (const plannedRow of joinPlan.value.entries[domainIndex]!.rows) {
        await visitCombination(domainIndex + 1, [
          ...partialCandidates,
          plannedRow.candidate,
        ])
      }
    }

    await visitCombination(0, [])

    options.controller.activate('resolve-residual')
    options.controller.publishProgress({
      phase: 'resolve-residual',
      completedUnits: 1,
      totalUnits: 1,
    })

    if (!bestCandidate) {
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

    const finalCertificate = createFinalOptimalityCertificate(
      options,
      bestCandidate.stateId,
      bestCandidate.evaluation,
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
