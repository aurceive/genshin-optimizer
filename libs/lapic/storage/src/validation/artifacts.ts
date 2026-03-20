import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
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

  if (!isNonNegativeInteger(block.rowCount))
    return createStorageFailure('Row count must be a non-negative integer.', ['rowCount'])

  if (block.rowCount !== block.stateIds.length)
    return createStorageFailure('Row count must match the number of state ids.', ['rowCount'])

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