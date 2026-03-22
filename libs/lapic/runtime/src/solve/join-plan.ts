import {
  type LapicCandidateDescriptor,
  type LapicCanonicalProblem,
  type LapicValidationResult,
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicFrontierBlock,
  LapicFrontierIndex,
  LapicFrontierStateRow,
} from '@genshin-optimizer/lapic/storage'

export interface LapicFrontierJoinPlanRow {
  readonly row: LapicFrontierStateRow
  readonly candidate: LapicCandidateDescriptor
}

export interface LapicFrontierJoinPlanEntry {
  readonly slotId: string
  readonly blockIds: readonly string[]
  readonly groupDigests: readonly string[]
  readonly rows: readonly LapicFrontierJoinPlanRow[]
}

export interface LapicFrontierJoinPlan {
  readonly entries: readonly LapicFrontierJoinPlanEntry[]
  readonly totalCombinationCount: number
}

function failure(
  message: string,
  path?: readonly string[]
): LapicValidationResult<never> {
  return createLapicFailureResult([
    createLapicDiagnostic('error', 'SchemaViolation', message, path),
  ])
}

function createExpectedOccupiedSlotMask(
  problem: LapicCanonicalProblem,
  slotId: string
): number {
  const slotIndex = problem.teamLayout.slotIds.indexOf(slotId)
  if (slotIndex < 0)
    throw new Error(`Slot '${slotId}' is not present in teamLayout.slotIds.`)
  return 1 << slotIndex
}

export function createFrontierJoinPlan(
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
        if (row.slotId !== domain.slotId || !rowDigests.has(row.rowDigest))
          continue

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
      throw new Error(
        'Expected validated frontier join entry before extraction.'
      )
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
