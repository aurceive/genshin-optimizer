import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
  validateLapicExactSignatureGroupKey,
  validateLapicStateLayoutDescriptor,
} from '@genshin-optimizer/lapic/core'
import type { LapicDiagnostic, LapicValidationResult } from '@genshin-optimizer/lapic/core'
import { createLapicArtifactRefKey } from '../builders'
import type {
  LapicArtifactReadRequest,
  LapicArtifactReadResult,
  LapicArtifactRef,
  LapicArtifactWriteCommitResult,
  LapicArtifactWriteRequest,
  LapicBlockLayoutDescriptor,
  LapicBlockManifest,
  LapicDebugArtifactSummary,
  LapicDebugExportRequest,
  LapicFrontierBlock,
  LapicFrontierIndex,
} from '../types'
import { validateLapicStorageEnvelope } from './envelope'
import {
  createStorageFailure,
  hasUniqueValues,
  isLapicBlockLayoutKind,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
  validateArtifactKind,
} from './internal'

export function validateLapicArtifactRef(
  artifactRef: LapicArtifactRef
): LapicValidationResult<LapicArtifactRef> {
  if (!isRecord(artifactRef))
    return createStorageFailure('Artifact reference must be a record.', ['artifactRef'])

  if (!isNonEmptyString(artifactRef.artifactId))
    return createStorageFailure('Artifact id must be a non-empty string.', ['artifactId'])

  const kindValidation = validateArtifactKind(artifactRef.artifactKind, ['artifactKind'])
  if (!kindValidation.ok) return kindValidation

  if (!isNonEmptyString(artifactRef.contentHash))
    return createStorageFailure(
      'Artifact content hash must be a non-empty string.',
      ['contentHash']
    )

  return createLapicSuccessResult(artifactRef)
}

export function validateArtifactRefArray(
  artifactRefs: readonly LapicArtifactRef[],
  path: readonly string[]
): LapicValidationResult<readonly LapicArtifactRef[]> {
  const diagnostics: LapicDiagnostic[] = []
  const seenKeys = new Set<string>()

  artifactRefs.forEach((artifactRef, index) => {
    const validation = validateLapicArtifactRef(artifactRef)
    if (!validation.ok) {
      diagnostics.push(
        ...validation.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          path: [...path, String(index), ...(diagnostic.path ?? [])],
        }))
      )
      return
    }

    const key = createLapicArtifactRefKey(artifactRef)
    if (seenKeys.has(key))
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'Artifact references must be unique.',
          [...path, String(index)]
        )
      )
    else seenKeys.add(key)
  })

  return diagnostics.length
    ? createLapicFailureResult(diagnostics)
    : createLapicSuccessResult(artifactRefs)
}

export function validateLapicFrontierBlock(
  block: LapicFrontierBlock
): LapicValidationResult<LapicFrontierBlock> {
  if (!isRecord(block))
    return createStorageFailure('Frontier block must be a record.', ['frontierBlock'])

  if (!isNonEmptyString(block.blockId))
    return createStorageFailure('Block id must be a non-empty string.', ['blockId'])

  const layoutValidation = validateLapicStateLayoutDescriptor(block.layout)
  if (!layoutValidation.ok)
    return createLapicFailureResult(
      layoutValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['layout', ...(diagnostic.path ?? [])],
      }))
    )

  if (
    !Array.isArray(block.stateIds) ||
    !block.stateIds.every(isNonEmptyString) ||
    !hasUniqueValues(block.stateIds)
  )
    return createStorageFailure(
      'State ids must contain unique non-empty strings.',
      ['stateIds']
    )

  if (!Array.isArray(block.rows))
    return createStorageFailure('Frontier rows must be an array.', ['rows'])

  const rowStateIds = new Set<string>()
  for (const [index, row] of block.rows.entries()) {
    if (!isRecord(row))
      return createStorageFailure('Frontier rows must be records.', ['rows', String(index)])

    if (!isNonEmptyString(row.stateId))
      return createStorageFailure(
        'Frontier row stateId must be a non-empty string.',
        ['rows', String(index), 'stateId']
      )

    if (!isNonEmptyString(row.slotId))
      return createStorageFailure(
        'Frontier row slotId must be a non-empty string.',
        ['rows', String(index), 'slotId']
      )

    if (!isNonEmptyString(row.candidateId))
      return createStorageFailure(
        'Frontier row candidateId must be a non-empty string.',
        ['rows', String(index), 'candidateId']
      )

    if (!isNonEmptyString(row.candidateDigest))
      return createStorageFailure(
        'Frontier row candidateDigest must be a non-empty string.',
        ['rows', String(index), 'candidateDigest']
      )

    if (!isNonEmptyString(row.compatibilityDigest))
      return createStorageFailure(
        'Frontier row compatibilityDigest must be a non-empty string.',
        ['rows', String(index), 'compatibilityDigest']
      )

    if (!isNonEmptyString(row.rowDigest))
      return createStorageFailure(
        'Frontier row rowDigest must be a non-empty string.',
        ['rows', String(index), 'rowDigest']
      )

    const keyValidation = validateLapicExactSignatureGroupKey(row.exactSignatureGroupKey)
    if (!keyValidation.ok)
      return createLapicFailureResult(
        keyValidation.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          path: ['rows', String(index), 'exactSignatureGroupKey', ...(diagnostic.path ?? [])],
        }))
      )

    if (!block.stateIds.includes(row.stateId))
      return createStorageFailure(
        'Every frontier row stateId must be present in stateIds.',
        ['rows', String(index), 'stateId']
      )

    if (rowStateIds.has(row.stateId))
      return createStorageFailure(
        'Frontier row stateIds must be unique.',
        ['rows', String(index), 'stateId']
      )

    rowStateIds.add(row.stateId)
  }

  if (!isNonNegativeInteger(block.rowCount))
    return createStorageFailure('Row count must be a non-negative integer.', ['rowCount'])

  if (block.rowCount !== block.stateIds.length)
    return createStorageFailure('Row count must match the number of state ids.', ['rowCount'])

  if (block.rowCount !== block.rows.length)
    return createStorageFailure('Row count must match the number of frontier rows.', ['rowCount'])

  return createLapicSuccessResult(block)
}

export function validateLapicFrontierIndex(
  index: LapicFrontierIndex
): LapicValidationResult<LapicFrontierIndex> {
  if (!isRecord(index))
    return createStorageFailure('Frontier index must be a record.', ['frontierIndex'])

  if (!isNonEmptyString(index.indexId))
    return createStorageFailure('Index id must be a non-empty string.', ['indexId'])

  if (
    !Array.isArray(index.blockIds) ||
    !index.blockIds.every(isNonEmptyString) ||
    !hasUniqueValues(index.blockIds)
  )
    return createStorageFailure('Block ids must contain unique non-empty strings.', ['blockIds'])

  if (!isNonEmptyString(index.compatibilityDigest))
    return createStorageFailure(
      'Compatibility digest must be a non-empty string.',
      ['compatibilityDigest']
    )

  if (!Array.isArray(index.exactSignatureGroups))
    return createStorageFailure(
      'Exact-signature groups must be an array.',
      ['exactSignatureGroups']
    )

  const seenGroupDigests = new Set<string>()
  for (const [indexPosition, group] of index.exactSignatureGroups.entries()) {
    if (!isRecord(group))
      return createStorageFailure(
        'Exact-signature groups must be records.',
        ['exactSignatureGroups', String(indexPosition)]
      )

    if (!isNonEmptyString(group.groupDigest))
      return createStorageFailure(
        'Group digest must be a non-empty string.',
        ['exactSignatureGroups', String(indexPosition), 'groupDigest']
      )

    if (seenGroupDigests.has(group.groupDigest))
      return createStorageFailure(
        'Exact-signature group digests must be unique.',
        ['exactSignatureGroups', String(indexPosition), 'groupDigest']
      )
    seenGroupDigests.add(group.groupDigest)

    if (
      !Array.isArray(group.blockIds) ||
      !group.blockIds.every(isNonEmptyString) ||
      !hasUniqueValues(group.blockIds)
    )
      return createStorageFailure(
        'Exact-signature group blockIds must contain unique non-empty strings.',
        ['exactSignatureGroups', String(indexPosition), 'blockIds']
      )

    if (
      !Array.isArray(group.slotIds) ||
      !group.slotIds.every(isNonEmptyString) ||
      !hasUniqueValues(group.slotIds)
    )
      return createStorageFailure(
        'Exact-signature group slotIds must contain unique non-empty strings.',
        ['exactSignatureGroups', String(indexPosition), 'slotIds']
      )

    if (
      !Array.isArray(group.rowDigests) ||
      !group.rowDigests.every(isNonEmptyString) ||
      !hasUniqueValues(group.rowDigests)
    )
      return createStorageFailure(
        'Exact-signature group rowDigests must contain unique non-empty strings.',
        ['exactSignatureGroups', String(indexPosition), 'rowDigests']
      )

    if (!isNonNegativeInteger(group.rowCount))
      return createStorageFailure(
        'Exact-signature group rowCount must be a non-negative integer.',
        ['exactSignatureGroups', String(indexPosition), 'rowCount']
      )

    if (!isNonNegativeInteger(group.occupiedSlotMask))
      return createStorageFailure(
        'Exact-signature group occupiedSlotMask must be a non-negative integer.',
        ['exactSignatureGroups', String(indexPosition), 'occupiedSlotMask']
      )

    if (!isNonEmptyString(group.adapterSemanticMode))
      return createStorageFailure(
        'Exact-signature group adapterSemanticMode must be a non-empty string.',
        ['exactSignatureGroups', String(indexPosition), 'adapterSemanticMode']
      )

    if (!isNonEmptyString(group.frameAxisIdentityDigest))
      return createStorageFailure(
        'Exact-signature group frameAxisIdentityDigest must be a non-empty string.',
        ['exactSignatureGroups', String(indexPosition), 'frameAxisIdentityDigest']
      )

    if (
      group.discreteTeamModeKey !== undefined &&
      !isNonEmptyString(group.discreteTeamModeKey)
    )
      return createStorageFailure(
        'Exact-signature group discreteTeamModeKey must be a non-empty string when present.',
        ['exactSignatureGroups', String(indexPosition), 'discreteTeamModeKey']
      )

    if (group.rowCount !== group.rowDigests.length)
      return createStorageFailure(
        'Exact-signature group rowCount must match rowDigests length.',
        ['exactSignatureGroups', String(indexPosition), 'rowCount']
      )
  }

  return createLapicSuccessResult(index)
}

export function validateLapicBlockLayoutDescriptor(
  descriptor: LapicBlockLayoutDescriptor
): LapicValidationResult<LapicBlockLayoutDescriptor> {
  if (!isRecord(descriptor))
    return createStorageFailure(
      'Block layout descriptor must be a record.',
      ['blockLayoutDescriptor']
    )

  if (!isLapicBlockLayoutKind(descriptor.layoutKind))
    return createStorageFailure('Block layout kind must be supported.', ['layoutKind'])

  if (!isNonEmptyString(descriptor.stateOrderDigest))
    return createStorageFailure(
      'State order digest must be a non-empty string.',
      ['stateOrderDigest']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicBlockManifest(
  manifest: LapicBlockManifest
): LapicValidationResult<LapicBlockManifest> {
  if (!isRecord(manifest))
    return createStorageFailure('Block manifest must be a record.', ['blockManifest'])

  if (!isNonEmptyString(manifest.manifestId))
    return createStorageFailure('Manifest id must be a non-empty string.', ['manifestId'])

  const blockRefValidation = validateLapicArtifactRef(manifest.blockRef)
  if (!blockRefValidation.ok)
    return createLapicFailureResult(
      blockRefValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['blockRef', ...(diagnostic.path ?? [])],
      }))
    )

  if (
    !Array.isArray(manifest.lineageParentIds) ||
    !manifest.lineageParentIds.every(isNonEmptyString) ||
    !hasUniqueValues(manifest.lineageParentIds)
  )
    return createStorageFailure(
      'Lineage parent ids must contain unique non-empty strings.',
      ['lineageParentIds']
    )

  if (
    !Array.isArray(manifest.supersededByIds) ||
    !manifest.supersededByIds.every(isNonEmptyString) ||
    !hasUniqueValues(manifest.supersededByIds)
  )
    return createStorageFailure(
      'Superseded-by ids must contain unique non-empty strings.',
      ['supersededByIds']
    )

  return createLapicSuccessResult(manifest)
}

export function validateLapicArtifactReadRequest(
  request: LapicArtifactReadRequest
): LapicValidationResult<LapicArtifactReadRequest> {
  if (!isRecord(request))
    return createStorageFailure('Artifact read request must be a record.', ['artifactReadRequest'])

  const artifactRefValidation = validateLapicArtifactRef(request.artifactRef)
  if (!artifactRefValidation.ok)
    return createLapicFailureResult(
      artifactRefValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['artifactRef', ...(diagnostic.path ?? [])],
      }))
    )

  return createLapicSuccessResult(request)
}

export function validateLapicArtifactReadResult(
  result: LapicArtifactReadResult
): LapicValidationResult<LapicArtifactReadResult> {
  if (!isRecord(result))
    return createStorageFailure('Artifact read result must be a record.', ['artifactReadResult'])

  const envelopeValidation = validateLapicStorageEnvelope(result.envelope)
  if (!envelopeValidation.ok)
    return createLapicFailureResult(
      envelopeValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['envelope', ...(diagnostic.path ?? [])],
      }))
    )

  if (!isNonEmptyString(result.payloadDigest))
    return createStorageFailure('Payload digest must be a non-empty string.', ['payloadDigest'])

  return createLapicSuccessResult(result)
}

export function validateLapicArtifactWriteRequest(
  request: LapicArtifactWriteRequest
): LapicValidationResult<LapicArtifactWriteRequest> {
  if (!isRecord(request))
    return createStorageFailure('Artifact write request must be a record.', ['artifactWriteRequest'])

  const envelopeValidation = validateLapicStorageEnvelope(request.envelope)
  if (!envelopeValidation.ok)
    return createLapicFailureResult(
      envelopeValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['envelope', ...(diagnostic.path ?? [])],
      }))
    )

  if (!isNonEmptyString(request.payloadDigest))
    return createStorageFailure('Payload digest must be a non-empty string.', ['payloadDigest'])

  return createLapicSuccessResult(request)
}

export function validateLapicArtifactWriteCommitResult(
  result: LapicArtifactWriteCommitResult
): LapicValidationResult<LapicArtifactWriteCommitResult> {
  if (!isRecord(result))
    return createStorageFailure(
      'Artifact write commit result must be a record.',
      ['artifactWriteCommitResult']
    )

  const artifactRefValidation = validateLapicArtifactRef(result.artifactRef)
  if (!artifactRefValidation.ok)
    return createLapicFailureResult(
      artifactRefValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['artifactRef', ...(diagnostic.path ?? [])],
      }))
    )

  if (typeof result.committed !== 'boolean')
    return createStorageFailure('Committed flag must be a boolean.', ['committed'])

  return createLapicSuccessResult(result)
}

export function validateLapicDebugExportRequest(
  request: LapicDebugExportRequest
): LapicValidationResult<LapicDebugExportRequest> {
  if (!isRecord(request))
    return createStorageFailure('Debug export request must be a record.', ['debugExportRequest'])

  const artifactRefValidation = validateLapicArtifactRef(request.artifactRef)
  if (!artifactRefValidation.ok)
    return createLapicFailureResult(
      artifactRefValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['artifactRef', ...(diagnostic.path ?? [])],
      }))
    )

  if (!isNonEmptyString(request.viewKind))
    return createStorageFailure('View kind must be a non-empty string.', ['viewKind'])

  return createLapicSuccessResult(request)
}

export function validateLapicDebugArtifactSummary(
  summary: LapicDebugArtifactSummary
): LapicValidationResult<LapicDebugArtifactSummary> {
  if (!isRecord(summary))
    return createStorageFailure('Debug artifact summary must be a record.', ['debugArtifactSummary'])

  const artifactRefValidation = validateLapicArtifactRef(summary.artifactRef)
  if (!artifactRefValidation.ok)
    return createLapicFailureResult(
      artifactRefValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['artifactRef', ...(diagnostic.path ?? [])],
      }))
    )

  if (!isNonEmptyString(summary.summaryDigest))
    return createStorageFailure('Summary digest must be a non-empty string.', ['summaryDigest'])

  return createLapicSuccessResult(summary)
}
