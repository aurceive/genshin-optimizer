import {
  type LapicCanonicalProblem,
  type LapicExactSignatureGroupKey,
  createLapicCompatibilitySignature,
  createLapicExactSignatureGroupKeyFromCompatibilitySignature,
  createLapicExactSignatureGroupOrderingKey,
  createLapicStateLayoutDescriptor,
} from '@genshin-optimizer/lapic/core'
import {
  type LapicFrontierBlock,
  type LapicFrontierGroupSummary,
  type LapicFrontierIndex,
  type LapicFrontierStateRow,
  createLapicFrontierBlock,
  createLapicFrontierIndex,
} from '@genshin-optimizer/lapic/storage'

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

export function createFrameAxisIdentity(problem: LapicCanonicalProblem) {
  return {
    axisKind: problem.teamLayout.frameAxisKind,
    frameIds: problem.frameAxis.map((frame) => frame.frameId),
  } as const
}

export function createFrontierBlockForDomain(
  problem: LapicCanonicalProblem,
  domain: LapicCanonicalProblem['itemDomains'][number]
): LapicFrontierBlock {
  const slotIndex = problem.teamLayout.slotIds.indexOf(domain.slotId)
  if (slotIndex < 0)
    throw new Error(
      `Slot '${domain.slotId}' is not present in teamLayout.slotIds.`
    )
  const occupiedSlotMask = 1 << slotIndex
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

export function createFrontierIndexForSolve(
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
