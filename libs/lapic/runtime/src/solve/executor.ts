import {
  type LapicCertificate,
  type LapicFinalOptimalityPayload,
  createLapicFinalOptimalitySummary,
} from '@genshin-optimizer/lapic/cert'
import {
  type LapicCandidateDescriptor,
  type LapicCanonicalProblem,
  type LapicDeterministicOrderingRelation,
  type LapicDiagnostic,
  type LapicValidationResult,
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicStateLayoutDescriptor,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import {
  type LapicArtifactKind,
  type LapicArtifactRef,
  type LapicFrontierBlock,
  createLapicArtifactWriteRequest,
  createLapicFrontierBlock,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import type { LapicSolveCompletionResult } from '../types'
import type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactCombinationEvaluation,
  LapicBoundedExactSolveOptions,
} from './types'

interface LapicBoundedExactBestCandidate {
  readonly stateId: string
  readonly candidates: readonly LapicCandidateDescriptor[]
  readonly evaluation: LapicBoundedExactCombinationEvaluation
}

function compareStringArrays(
  left: readonly string[],
  right: readonly string[]
): LapicDeterministicOrderingRelation {
  const sharedLength = Math.min(left.length, right.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const comparison = left[index]!.localeCompare(right[index]!)
    if (comparison < 0) return -1
    if (comparison > 0) return 1
  }

  if (left.length < right.length) return -1
  if (left.length > right.length) return 1
  return 0
}

function failure(message: string, path?: readonly string[]): LapicValidationResult<never> {
  return createLapicFailureResult([
    createLapicDiagnostic('error', 'SchemaViolation', message, path),
  ])
}

function compareEvaluations(
  left: LapicBoundedExactCombinationEvaluation,
  leftStateId: string,
  right: LapicBoundedExactCombinationEvaluation,
  rightStateId: string,
  explicitComparator?: LapicBoundedExactSolveOptions['compareEvaluations']
): LapicDeterministicOrderingRelation {
  if (explicitComparator) return explicitComparator(left, right)

  const leftOrderingKey = [...(left.orderingKey ?? [left.objectiveValue]), leftStateId]
  const rightOrderingKey = [...(right.orderingKey ?? [right.objectiveValue]), rightStateId]
  return compareStringArrays(leftOrderingKey, rightOrderingKey)
}

function createFrameAxisIdentity(problem: LapicCanonicalProblem) {
  return {
    axisKind: problem.teamLayout.frameAxisKind,
    frameIds: problem.frameAxis.map((frame) => frame.frameId),
  } as const
}

function createFrontierBlockForDomain(
  problem: LapicCanonicalProblem,
  slotId: string,
  candidateIds: readonly string[]
): LapicFrontierBlock {
  return createLapicFrontierBlock({
    blockId: `frontier:${problem.problemDigest}:${slotId}`,
    layout: createLapicStateLayoutDescriptor({
      layoutId: `layout:${problem.problemDigest}:${slotId}`,
      teamLayoutDigest: problem.provenance.teamLayoutDigest,
      slotIds: [slotId],
      frameAxisIdentity: createFrameAxisIdentity(problem),
      dominanceProjectionIds: [`dominance:${slotId}`],
    }),
    stateIds: candidateIds.map((candidateId) => `state:${slotId}:${candidateId}`),
    rowCount: candidateIds.length,
  })
}

async function persistArtifact(
  options: LapicBoundedExactSolveOptions,
  artifactKind: LapicArtifactKind,
  contentHash: string,
  payloadDigest: string,
  payload: unknown,
  dependencies: readonly string[]
): Promise<LapicArtifactRef> {
  const serializedPayload = JSON.stringify(payload)
  const commit = await options.artifactStore.write(
    createLapicArtifactWriteRequest(
      createLapicStorageEnvelope({
        artifactKind,
        schemaVersion: '0.1.0-draft',
        payloadEncoding: 'json',
        payloadLength: serializedPayload.length,
        contentHash,
        checksum: {
          algorithm: 'sha256',
          checksum: contentHash,
        },
        compressionCodec: 'none',
        creationEngineVersion: options.problem.engineVersion,
        arithmeticPolicyId: options.problem.arithmeticPolicyId,
        dependencyDigestSet: dependencies,
      }),
      payloadDigest
    )
  )
  options.controller.publishArtifact(commit.artifactRef)
  return commit.artifactRef
}

function createCombinationStateId(
  problem: LapicCanonicalProblem,
  candidates: readonly LapicCandidateDescriptor[]
): string {
  return `state:${problem.problemDigest}:${candidates
    .map((candidate) => `${candidate.slotId}:${candidate.candidateId}`)
    .join('|')}`
}

function validateSolveOptions(
  options: LapicBoundedExactSolveOptions,
  orderedCandidates: readonly (readonly LapicCandidateDescriptor[])[]
): LapicValidationResult<number> {
  if (options.problem.topN !== 1)
    return failure(
      'The bounded in-process solve slice currently supports only topN = 1.',
      ['problem', 'topN']
    )

  if (
    options.problem.potentialConfiguration &&
    options.problem.potentialConfiguration.solveMode !== 'current-only'
  )
    return failure(
      'The bounded in-process solve slice currently supports only current-only potential mode.',
      ['problem', 'potentialConfiguration', 'solveMode']
    )

  if (!orderedCandidates.length)
    return failure(
      'The bounded in-process solve slice requires at least one candidate domain.',
      ['problem', 'itemDomains']
    )

  const emptyDomainIndex = orderedCandidates.findIndex((candidates) => !candidates.length)
  if (emptyDomainIndex >= 0)
    return failure(
      'The bounded in-process solve slice requires all participating domains to be non-empty.',
      ['problem', 'itemDomains', String(emptyDomainIndex), 'candidates']
    )

  const combinationCount = orderedCandidates.reduce(
    (product, candidates) => product * candidates.length,
    1
  )

  if (
    options.maxCombinationCount !== undefined &&
    combinationCount > options.maxCombinationCount
  )
    return failure(
      'The bounded in-process solve slice exceeded maxCombinationCount.',
      ['maxCombinationCount']
    )

  return createLapicSuccessResult(combinationCount)
}

function hasExclusiveResourceConflict(
  candidates: readonly LapicCandidateDescriptor[]
): boolean {
  const seenClaims = new Set<string>()

  for (const candidate of candidates) {
    for (const claim of candidate.provenance.exclusiveResourceClaims) {
      const claimKey = [claim.resourceKind, claim.resourceId].join('|')
      if (seenClaims.has(claimKey)) return true
      seenClaims.add(claimKey)
    }
  }

  return false
}

function normalizeFeasibilityResult(
  result: boolean | LapicValidationResult<boolean>
): LapicValidationResult<boolean> {
  if (typeof result === 'boolean') return createLapicSuccessResult(result)
  return result
}

function createFinalOptimalityCertificate(
  options: LapicBoundedExactSolveOptions,
  winningStateId: string,
  winningEvaluation: LapicBoundedExactCombinationEvaluation,
  frontierBlockIds: readonly string[]
): LapicCertificate<LapicFinalOptimalityPayload> {
  return {
    certId: `cert:final:${options.problem.problemDigest}`,
    certKind: 'FinalOptimalityCert',
    schemaVersion: '0.1.0-draft',
    problemId: options.problem.problemId,
    arithmeticPolicyId: options.problem.arithmeticPolicyId,
    decisionClass: 'optimality-proof',
    referencedStateIds: [winningStateId],
    referencedBlockIds: [...frontierBlockIds],
    referencedRegionIds: [],
    referencedRelaxIds: [],
    incumbentDigest: winningEvaluation.objectiveValue,
    evidenceDigest: winningEvaluation.evidenceDigest,
    replayRecipe: {
      requiredIrObjects: [options.problem.objective.expressionDigest],
      requiredRegionPredicates: [],
      arithmeticMode: 'exact',
      replayPathKind: 'full-replay',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: 1,
    validationStatus: 'validated',
    payload: {
      winningStateId,
      optimalityGap: '0',
      finalThresholdDigest: `threshold:${options.problem.problemDigest}:top-1`,
      finalIncumbentSetDigest: `incumbent:${winningStateId}`,
      queueExhaustionSummaryDigest: `queue-exhausted:${options.problem.problemDigest}`,
      thresholdPruneSummaryDigest: `threshold-prune:none:${options.problem.problemDigest}`,
      escalatedReplaySummaryDigest: `replay:none:${options.problem.problemDigest}`,
      stableOrderCompletenessDigest: `stable-order:${winningStateId}`,
    },
  }
}

function createInfeasibilityCertificate(
  options: LapicBoundedExactSolveOptions,
  frontierBlockIds: readonly string[]
): LapicCertificate {
  return {
    certId: `cert:infeasible:${options.problem.problemDigest}`,
    certKind: 'InfeasibilityCert',
    schemaVersion: '0.1.0-draft',
    problemId: options.problem.problemId,
    arithmeticPolicyId: options.problem.arithmeticPolicyId,
    decisionClass: 'exact-prune',
    referencedStateIds: [],
    referencedBlockIds: [...frontierBlockIds],
    referencedRegionIds: [],
    referencedRelaxIds: [],
    evidenceDigest: `evidence:infeasible:${options.problem.problemDigest}`,
    replayRecipe: {
      requiredIrObjects: [options.problem.objective.expressionDigest],
      requiredRegionPredicates: [],
      arithmeticMode: 'exact',
      replayPathKind: 'full-replay',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: 1,
    validationStatus: 'validated',
    payload: {
      evidenceSourceClass: 'exactSymbolic',
      infeasibleConstraintDigests: options.problem.constraints.map(
        (constraint) => constraint.expressionDigest
      ),
      witnessDigest: `witness:infeasible:${options.problem.problemDigest}`,
      affectedBlockIds: [...frontierBlockIds],
      replayPathRequirement: 'bounded-cartesian-exhaustion',
    },
  }
}

function sortDomains(problem: LapicCanonicalProblem) {
  const slotOrder = new Map(
    problem.teamLayout.slotIds.map((slotId, index) => [slotId, index])
  )

  return [...problem.itemDomains].sort(
    (left, right) =>
      (slotOrder.get(left.slotId) ?? Number.MAX_SAFE_INTEGER) -
      (slotOrder.get(right.slotId) ?? Number.MAX_SAFE_INTEGER)
  )
}

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

    options.controller.publishTrace('InitSession', `solve:${options.problem.problemDigest}`)
    options.controller.activate('frontier-build')

    for (const [domainIndex, domain] of orderedDomains.entries()) {
      const block = createFrontierBlockForDomain(
        options.problem,
        domain.slotId,
        domain.candidates.map((candidate) => candidate.candidateId)
      )
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

    options.controller.activate('join')

    let processedCombinationCount = 0
    let bestCandidate: LapicBoundedExactBestCandidate | undefined

    const visitCombination = async (
      domainIndex: number,
      partialCandidates: readonly LapicCandidateDescriptor[]
    ): Promise<void> => {
      if (domainIndex >= orderedDomains.length) {
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

      for (const candidate of orderedDomains[domainIndex]!.candidates) {
        await visitCombination(domainIndex + 1, [...partialCandidates, candidate])
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
    const message = error instanceof Error ? error.message : 'Unknown bounded solve failure.'
    return failSolve(
      options,
      message,
      [createLapicDiagnostic('error', 'InternalBugDetected', message)]
    )
  }
}
