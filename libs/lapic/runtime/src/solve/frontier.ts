import {
  type LapicCanonicalProblem,
  type LapicDominanceVectorContext,
  type LapicExactSignatureGroupKey,
  type LapicSkylineSummary,
  computeSkyline,
  createFrameAxisIdentity,
  createLapicCompatibilitySignature,
  createLapicExactSignatureGroupKeyFromCompatibilitySignature,
  createLapicExactSignatureGroupOrderingKey,
  createLapicStateLayoutDescriptor,
  deriveDominanceVariableOrder,
  extractDominanceVector,
} from '@genshin-optimizer/lapic/core'
import {
  type LapicFrontierBlock,
  type LapicFrontierGroupSummary,
  type LapicFrontierIndex,
  type LapicFrontierStateRow,
  createLapicFrontierBlock,
  createLapicFrontierIndex,
} from '@genshin-optimizer/lapic/storage'
import type { LapicFirDomainVariableMap } from '../fir-bound'

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

export function createFrontierBlockForDomain(
  problem: LapicCanonicalProblem,
  domain: LapicCanonicalProblem['itemDomains'][number],
  domainVariableMap?: LapicFirDomainVariableMap
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
      exclusiveResourceKeys: [
        ...exactSignatureGroupKey.value.exclusiveResourceKeys,
      ],
      frameAxisIdentityDigest:
        exactSignatureGroupKey.value.frameAxisIdentityDigest,
      adapterSemanticMode: exactSignatureGroupKey.value.adapterSemanticMode,
      ...(exactSignatureGroupKey.value.discreteTeamModeKey
        ? {
            discreteTeamModeKey:
              exactSignatureGroupKey.value.discreteTeamModeKey,
          }
        : {}),
    }

    const compatibilityDigest = [
      `mask:${compatibilitySignature.occupiedSlotMask}`,
      `mode:${compatibilitySignature.adapterSemanticMode}`,
      `frame:${frameAxisIdentityDigest}`,
      ...compatibilitySignature.exclusiveResourceClaims.map(
        (claim) =>
          `${claim.resourceKind}|${claim.resourceId}|${claim.claimedBySlotId}`
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

  const { filteredRows, skylineSummary } = applySkylineCompression(
    rows,
    domainVariableMap
  )

  return createLapicFrontierBlock({
    blockId: `frontier:${problem.problemDigest}:${domain.slotId}`,
    layout: createLapicStateLayoutDescriptor({
      layoutId: `layout:${problem.problemDigest}:${domain.slotId}`,
      teamLayoutDigest: problem.provenance.teamLayoutDigest,
      slotIds: [domain.slotId],
      frameAxisIdentity,
      dominanceProjectionIds: [`dominance:${domain.slotId}`],
    }),
    stateIds: filteredRows.map((row) => row.stateId),
    rows: filteredRows,
    rowCount: filteredRows.length,
    ...(skylineSummary ? { skylineSummary } : {}),
  })
}

/**
 * Applies skyline compression to frontier rows when a domain variable
 * map is available.  Falls back to keeping all rows (no filtering)
 * when the map is missing or empty.
 */
function applySkylineCompression(
  rows: readonly LapicFrontierStateRow[],
  domainVariableMap: LapicFirDomainVariableMap | undefined
): {
  filteredRows: readonly LapicFrontierStateRow[]
  skylineSummary: LapicSkylineSummary | undefined
} {
  if (!domainVariableMap || domainVariableMap.candidateVariables.size === 0) {
    return { filteredRows: rows, skylineSummary: undefined }
  }

  const variableOrder = deriveDominanceVariableOrder(
    domainVariableMap.candidateVariables
  )
  if (variableOrder.length === 0) {
    return { filteredRows: rows, skylineSummary: undefined }
  }

  // Group rows by serialized exactSignatureGroupKey
  const groups = new Map<string, LapicFrontierStateRow[]>()
  for (const row of rows) {
    const keyResult = createLapicExactSignatureGroupOrderingKey(
      row.exactSignatureGroupKey
    )
    const groupKey = keyResult.ok ? keyResult.value.join('|') : row.candidateId
    const group = groups.get(groupKey)
    if (group) {
      group.push(row)
    } else {
      groups.set(groupKey, [row])
    }
  }

  const keptRows: LapicFrontierStateRow[] = []
  let totalDominated = 0

  for (const groupRows of groups.values()) {
    // Extract dominance vectors for this group's candidates
    const entries = groupRows.map((row) => {
      const vars =
        domainVariableMap.candidateVariables.get(row.candidateId) ??
        new Map<string, number>()

      // Build condition 3+4 context when data is available
      const context: LapicDominanceVectorContext = {
        ...(domainVariableMap.candidateUpperBoundVariables
          ? {
              upperBoundVariables:
                domainVariableMap.candidateUpperBoundVariables.get(
                  row.candidateId
                ),
            }
          : {}),
        ...(domainVariableMap.candidateBranchRegionDigests
          ? {
              branchRegionDigest:
                domainVariableMap.candidateBranchRegionDigests.get(
                  row.candidateId
                ),
            }
          : {}),
      }

      const hasContext =
        context.upperBoundVariables !== undefined ||
        context.branchRegionDigest !== undefined

      return {
        ...extractDominanceVector(
          row.candidateId,
          vars,
          variableOrder,
          hasContext ? context : undefined
        ),
        row,
      }
    })

    const result = computeSkyline(entries)
    for (const kept of result.kept) {
      keptRows.push(kept.row)
    }
    totalDominated += result.dominatedPairs.length
  }

  return {
    filteredRows: keptRows,
    skylineSummary: {
      totalRows: rows.length,
      keptRows: keptRows.length,
      dominatedCount: totalDominated,
      groupCount: groups.size,
    },
  }
}

function createFrontierCompatibilityDigest(
  problem: LapicCanonicalProblem,
  groups: readonly LapicFrontierGroupSummary[]
): string {
  const orderedGroupDigests = groups
    .map(
      (group) =>
        `${group.groupDigest}|${group.rowCount}|${group.slotIds.join('|')}`
    )
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
      const existing: LapicFrontierGroupAccumulator = groups.get(
        groupDigest
      ) ?? {
        groupDigest,
        blockIds: new Set<string>(),
        slotIds: new Set<string>(),
        rowDigests: new Set<string>(),
        occupiedSlotMask: row.exactSignatureGroupKey.occupiedSlotMask,
        adapterSemanticMode: row.exactSignatureGroupKey.adapterSemanticMode,
        frameAxisIdentityDigest:
          row.exactSignatureGroupKey.frameAxisIdentityDigest,
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
    .map(
      (group) =>
        ({
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
        }) satisfies LapicFrontierGroupSummary
    )
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
    compatibilityDigest: createFrontierCompatibilityDigest(
      problem,
      exactSignatureGroups
    ),
    exactSignatureGroups,
  })
}
