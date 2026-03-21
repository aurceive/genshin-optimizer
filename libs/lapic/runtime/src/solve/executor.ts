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
  type LapicExactSignatureGroupKey,
  type LapicValidationResult,
  createLapicCompatibilitySignature,
  createLapicDiagnostic,
  createLapicExactSignatureGroupKeyFromCompatibilitySignature,
  createLapicExactSignatureGroupOrderingKey,
  createLapicFailureResult,
  createLapicStateLayoutDescriptor,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import {
  type LapicArtifactKind,
  type LapicArtifactRef,
  type LapicFrontierBlock,
  type LapicFrontierGroupSummary,
  type LapicFrontierIndex,
  type LapicFrontierStateRow,
  createLapicArtifactWriteRequest,
  createLapicFrontierBlock,
  createLapicFrontierIndex,
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

interface LapicFrontierGroupAccumulator {
  readonly groupDigest: string
  readonly blockIds: Set<string>
  readonly slotIds: Set<string>
  readonly rowDigests: Set<string>
  readonly occupiedSlotMask: number
  readonly adapterSemanticMode: string
  readonly frameAxisIdentityDigest: string
  readonly discreteTeamModeKey?: string
}

interface LapicFrontierJoinPlanRow {
  readonly row: LapicFrontierStateRow
  readonly candidate: LapicCandidateDescriptor
}

interface LapicFrontierJoinPlanEntry {
  readonly slotId: string
  readonly blockIds: readonly string[]
  readonly groupDigests: readonly string[]
  readonly rows: readonly LapicFrontierJoinPlanRow[]
}

interface LapicFrontierJoinPlan {
  readonly entries: readonly LapicFrontierJoinPlanEntry[]
  readonly totalCombinationCount: number
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
  domain: LapicCanonicalProblem['itemDomains'][number]
): LapicFrontierBlock {
  const slotIndex = problem.teamLayout.slotIds.indexOf(domain.slotId)
  const occupiedSlotMask = slotIndex >= 0 ? 1 << slotIndex : 0
  const frameAxisIdentity = createFrameAxisIdentity(problem)
  const frameAxisIdentityDigest =
    problem.provenance.frameAxisDigest ??
    `frame-axis:${problem.problemDigest}:${frameAxisIdentity.frameIds.join('|')}`
  const rows: LapicFrontierStateRow[] = domain.candidates.map((candidate) => {
    const stateId = `state:${domain.slotId}:${candidate.candidateId}`
    const compatibilitySignature = createLapicCompatibilitySignature({
      occupiedSlotMask,
      actorUniquenessClaims: [],
      exclusiveResourceClaims: candidate.provenance.exclusiveResourceClaims,
      aggregateCounts: candidate.discreteCounters,
      remainingAggregateObligations: [],
      providedCapabilityFacts: [],
      remainingRequiredCapabilityFacts: [],
      branchCompatibilityToggles: [],
      frameAxisIdentity,
      adapterSemanticMode: problem.sharedTeamContext.adapterSemanticMode,
    })
    const exactSignatureGroupKey =
      createLapicExactSignatureGroupKeyFromCompatibilitySignature({
        compatibilitySignature,
        frameAxisIdentityDigest,
        discreteTeamModeKey: domain.slotId,
      })

    if (!exactSignatureGroupKey.ok)
      throw new Error(
        exactSignatureGroupKey.diagnostics[0]?.message ??
          'Failed to derive exact signature group key for frontier row.'
      )

    const rowExactSignatureGroupKey: LapicExactSignatureGroupKey = {
      occupiedSlotMask: exactSignatureGroupKey.value.occupiedSlotMask,
      actorIds: [...exactSignatureGroupKey.value.actorIds],
      exclusiveResourceKeys: [...exactSignatureGroupKey.value.exclusiveResourceKeys],
      frameAxisIdentityDigest: exactSignatureGroupKey.value.frameAxisIdentityDigest,
      adapterSemanticMode: exactSignatureGroupKey.value.adapterSemanticMode,
      ...(exactSignatureGroupKey.value.discreteTeamModeKey
        ? { discreteTeamModeKey: exactSignatureGroupKey.value.discreteTeamModeKey }
        : {}),
    }

    const compatibilityDigest = [
      `mask:${compatibilitySignature.occupiedSlotMask}`,
      `mode:${compatibilitySignature.adapterSemanticMode}`,
      `frame:${frameAxisIdentityDigest}`,
      ...compatibilitySignature.exclusiveResourceClaims.map(
        (claim) => `${claim.resourceKind}|${claim.resourceId}|${claim.claimedBySlotId}`
      ),
      ...compatibilitySignature.aggregateCounts.map(
        (count) => `${count.counterId}|${count.value}`
      ),
    ].join(',')

    return {
      stateId,
      slotId: domain.slotId,
      candidateId: candidate.candidateId,
      candidateDigest: candidate.additiveFeatureDigest,
      compatibilityDigest: `compat:${problem.problemDigest}:${domain.slotId}:${candidate.candidateId}:${compatibilityDigest}`,
      exactSignatureGroupKey: rowExactSignatureGroupKey,
      rowDigest: `row:${problem.problemDigest}:${domain.slotId}:${candidate.candidateId}:${candidate.additiveFeatureDigest}`,
    }
  })

  return createLapicFrontierBlock({
    blockId: `frontier:${problem.problemDigest}:${domain.slotId}`,
    layout: createLapicStateLayoutDescriptor({
      layoutId: `layout:${problem.problemDigest}:${domain.slotId}`,
      teamLayoutDigest: problem.provenance.teamLayoutDigest,
      slotIds: [domain.slotId],
      frameAxisIdentity,
      dominanceProjectionIds: [`dominance:${domain.slotId}`],
    }),
    stateIds: rows.map((row) => row.stateId),
    rows,
    rowCount: rows.length,
  })
}

function createFrontierCompatibilityDigest(
  problem: LapicCanonicalProblem,
  groups: readonly LapicFrontierGroupSummary[]
): string {
  const orderedGroupDigests = groups
    .map((group) => `${group.groupDigest}|${group.rowCount}|${group.slotIds.join('|')}`)
    .sort()

  return `frontier-index:${problem.problemDigest}:${orderedGroupDigests.join(',')}`
}

function createFrontierGroupSummaries(
  problem: LapicCanonicalProblem,
  blocks: readonly LapicFrontierBlock[]
): readonly LapicFrontierGroupSummary[] {
  const groups = new Map<string, LapicFrontierGroupAccumulator>()

  for (const block of blocks) {
    for (const row of block.rows) {
      const orderingKey = createLapicExactSignatureGroupOrderingKey(
        row.exactSignatureGroupKey
      )

      if (!orderingKey.ok)
        throw new Error(
          orderingKey.diagnostics[0]?.message ??
            'Failed to derive frontier group ordering key.'
        )

      const groupDigest = `frontier-group:${problem.problemDigest}:${orderingKey.value.join('|')}`
      const existing: LapicFrontierGroupAccumulator =
        groups.get(groupDigest) ?? {
          groupDigest,
          blockIds: new Set<string>(),
          slotIds: new Set<string>(),
          rowDigests: new Set<string>(),
          occupiedSlotMask: row.exactSignatureGroupKey.occupiedSlotMask,
          adapterSemanticMode: row.exactSignatureGroupKey.adapterSemanticMode,
          frameAxisIdentityDigest: row.exactSignatureGroupKey.frameAxisIdentityDigest,
          ...(row.exactSignatureGroupKey.discreteTeamModeKey
            ? {
                discreteTeamModeKey:
                  row.exactSignatureGroupKey.discreteTeamModeKey,
              }
            : {}),
        }

      existing.blockIds.add(block.blockId)
      existing.slotIds.add(row.slotId)
      existing.rowDigests.add(row.rowDigest)
      groups.set(groupDigest, existing)
    }
  }

  return [...groups.values()]
    .map((group) => ({
      groupDigest: group.groupDigest,
      blockIds: [...group.blockIds].sort(),
      slotIds: [...group.slotIds].sort(),
      rowDigests: [...group.rowDigests].sort(),
      rowCount: group.rowDigests.size,
      occupiedSlotMask: group.occupiedSlotMask,
      adapterSemanticMode: group.adapterSemanticMode,
      frameAxisIdentityDigest: group.frameAxisIdentityDigest,
      ...(group.discreteTeamModeKey
        ? { discreteTeamModeKey: group.discreteTeamModeKey }
        : {}),
    }) satisfies LapicFrontierGroupSummary)
    .sort((left, right) => left.groupDigest.localeCompare(right.groupDigest))
}

function createFrontierIndexForSolve(
  problem: LapicCanonicalProblem,
  blocks: readonly LapicFrontierBlock[]
): LapicFrontierIndex {
  const exactSignatureGroups = createFrontierGroupSummaries(problem, blocks)
  return createLapicFrontierIndex({
    indexId: `frontier-index:${problem.problemDigest}`,
    blockIds: blocks.map((block) => block.blockId),
    compatibilityDigest: createFrontierCompatibilityDigest(problem, exactSignatureGroups),
    exactSignatureGroups,
  })
}

function createExpectedOccupiedSlotMask(
  problem: LapicCanonicalProblem,
  slotId: string
): number {
  const slotIndex = problem.teamLayout.slotIds.indexOf(slotId)
  return slotIndex >= 0 ? 1 << slotIndex : 0
}

function createFrontierJoinPlan(
  problem: LapicCanonicalProblem,
  domains: readonly LapicCanonicalProblem['itemDomains'][number][],
  blocks: readonly LapicFrontierBlock[],
  frontierIndex: LapicFrontierIndex
): LapicValidationResult<LapicFrontierJoinPlan> {
  const blockById = new Map(blocks.map((block) => [block.blockId, block]))
  let sharedAdapterSemanticMode: string | undefined
  let sharedFrameAxisIdentityDigest: string | undefined

  const entriesResult = domains.map((domain, domainIndex) => {
    const slotGroups = frontierIndex.exactSignatureGroups.filter((group) =>
      group.slotIds.includes(domain.slotId)
    )

    if (!slotGroups.length)
      return failure(
        'The bounded join seam requires frontier-index coverage for every participating slot.',
        ['frontierIndex', 'exactSignatureGroups', String(domainIndex)]
      )

    const expectedOccupiedSlotMask = createExpectedOccupiedSlotMask(
      problem,
      domain.slotId
    )
    const rowDigests = new Set<string>()
    const blockIds = new Set<string>()
    const groupDigests = new Set<string>()

    for (const [groupIndex, group] of slotGroups.entries()) {
      if (group.slotIds.some((slotId) => slotId !== domain.slotId))
        return failure(
          'The bounded join seam currently requires slot-local exact-signature groups.',
          [
            'frontierIndex',
            'exactSignatureGroups',
            String(groupIndex),
            'slotIds',
          ]
        )

      if (group.occupiedSlotMask !== expectedOccupiedSlotMask)
        return failure(
          'Frontier group occupiedSlotMask does not match its participating slot.',
          [
            'frontierIndex',
            'exactSignatureGroups',
            String(groupIndex),
            'occupiedSlotMask',
          ]
        )

      if (
        sharedAdapterSemanticMode !== undefined &&
        group.adapterSemanticMode !== sharedAdapterSemanticMode
      )
        return failure(
          'The bounded join seam requires a single adapter semantic mode across frontier groups.',
          [
            'frontierIndex',
            'exactSignatureGroups',
            String(groupIndex),
            'adapterSemanticMode',
          ]
        )

      if (
        sharedFrameAxisIdentityDigest !== undefined &&
        group.frameAxisIdentityDigest !== sharedFrameAxisIdentityDigest
      )
        return failure(
          'The bounded join seam requires a single frame-axis identity across frontier groups.',
          [
            'frontierIndex',
            'exactSignatureGroups',
            String(groupIndex),
            'frameAxisIdentityDigest',
          ]
        )

      sharedAdapterSemanticMode ??= group.adapterSemanticMode
      sharedFrameAxisIdentityDigest ??= group.frameAxisIdentityDigest

      groupDigests.add(group.groupDigest)
      for (const blockId of group.blockIds) blockIds.add(blockId)
      for (const rowDigest of group.rowDigests) {
        if (rowDigests.has(rowDigest))
          return failure(
            'The bounded join seam does not allow duplicate row digests within a slot group partition.',
            [
              'frontierIndex',
              'exactSignatureGroups',
              String(groupIndex),
              'rowDigests',
            ]
          )
        rowDigests.add(rowDigest)
      }
    }

    const candidateById = new Map(
      domain.candidates.map((candidate) => [candidate.candidateId, candidate])
    )
    const resolvedRows: LapicFrontierJoinPlanRow[] = []
    const seenResolvedRowDigests = new Set<string>()

    for (const blockId of [...blockIds].sort()) {
      const block = blockById.get(blockId)
      if (!block)
        return failure(
          'Frontier-index references a frontier block that is not available to the runtime join seam.',
          ['frontierIndex', 'blockIds']
        )

      for (const row of block.rows) {
        if (row.slotId !== domain.slotId || !rowDigests.has(row.rowDigest)) continue

        if (seenResolvedRowDigests.has(row.rowDigest))
          return failure(
            'The bounded join seam encountered the same frontier row more than once.',
            ['frontierBlocks', block.blockId, 'rows']
          )

        const candidate = candidateById.get(row.candidateId)
        if (!candidate)
          return failure(
            'Frontier row references a candidate that is not present in the bounded domain.',
            ['frontierBlocks', block.blockId, 'rows']
          )

        seenResolvedRowDigests.add(row.rowDigest)
        resolvedRows.push({ row, candidate })
      }
    }

    if (seenResolvedRowDigests.size !== rowDigests.size)
      return failure(
        'The bounded join seam could not resolve every frontier-index row digest back to a stored frontier row.',
        ['frontierIndex', 'exactSignatureGroups']
      )

    return createLapicSuccessResult({
      slotId: domain.slotId,
      blockIds: [...blockIds].sort(),
      groupDigests: [...groupDigests].sort(),
      rows: resolvedRows,
    } satisfies LapicFrontierJoinPlanEntry)
  })

  const firstFailure = entriesResult.find((entry) => !entry.ok)
  if (firstFailure && !firstFailure.ok) return firstFailure

  const entries = entriesResult.map((entry) => {
    if (!entry.ok)
      throw new Error('Expected validated frontier join entry before extraction.')
    return entry.value
  })

  return createLapicSuccessResult({
    entries,
    totalCombinationCount: entries.reduce(
      (product, entry) => product * entry.rows.length,
      1
    ),
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
    const message = error instanceof Error ? error.message : 'Unknown bounded solve failure.'
    return failSolve(
      options,
      message,
      [createLapicDiagnostic('error', 'InternalBugDetected', message)]
    )
  }
}
