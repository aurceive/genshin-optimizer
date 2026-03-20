import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import { createLapicArtifactRefKey } from '../builders'
import type {
  LapicCheckpointClosureInventory,
  LapicCheckpointClosureVerificationResult,
  LapicCheckpointManifest,
  LapicClosureExportDescriptor,
  LapicClosureImportDescriptor,
  LapicClosureMaterializationRequest,
} from '../types'
import { validateArtifactRefArray } from './artifacts'
import { createStorageFailure, isBoolean, isNonEmptyString, isRecord } from './internal'

export function validateLapicCheckpointManifest(
  manifest: LapicCheckpointManifest
): LapicValidationResult<LapicCheckpointManifest> {
  if (!isRecord(manifest))
    return createStorageFailure('Checkpoint manifest must be a record.', ['checkpointManifest'])

  if (!isNonEmptyString(manifest.checkpointId))
    return createStorageFailure('Checkpoint id must be a non-empty string.', ['checkpointId'])

  if (!Array.isArray(manifest.artifactRefs))
    return createStorageFailure('Checkpoint artifact refs must be an array.', ['artifactRefs'])

  const artifactValidation = validateArtifactRefArray(manifest.artifactRefs, ['artifactRefs'])
  if (!artifactValidation.ok) return artifactValidation

  if (!isNonEmptyString(manifest.closureDigest))
    return createStorageFailure('Closure digest must be a non-empty string.', ['closureDigest'])

  return createLapicSuccessResult(manifest)
}

export function validateLapicCheckpointClosureInventory(
  inventory: LapicCheckpointClosureInventory
): LapicValidationResult<LapicCheckpointClosureInventory> {
  if (!isRecord(inventory))
    return createStorageFailure(
      'Checkpoint closure inventory must be a record.',
      ['checkpointClosureInventory']
    )

  if (!isNonEmptyString(inventory.checkpointId))
    return createStorageFailure('Checkpoint id must be a non-empty string.', ['checkpointId'])

  const requiredValidation = validateArtifactRefArray(
    inventory.requiredArtifacts,
    ['requiredArtifacts']
  )
  if (!requiredValidation.ok) return requiredValidation

  const missingValidation = validateArtifactRefArray(
    inventory.missingArtifacts,
    ['missingArtifacts']
  )
  if (!missingValidation.ok) return missingValidation

  const requiredKeys = new Set(inventory.requiredArtifacts.map(createLapicArtifactRefKey))
  const missingOutsideClosure = inventory.missingArtifacts.filter(
    (artifactRef) => !requiredKeys.has(createLapicArtifactRefKey(artifactRef))
  )

  if (missingOutsideClosure.length)
    return createStorageFailure(
      'Missing artifacts must be a subset of required artifacts.',
      ['missingArtifacts']
    )

  return createLapicSuccessResult(inventory)
}

export function validateLapicClosureMaterializationRequest(
  request: LapicClosureMaterializationRequest
): LapicValidationResult<LapicClosureMaterializationRequest> {
  if (!isRecord(request))
    return createStorageFailure(
      'Closure materialization request must be a record.',
      ['closureMaterializationRequest']
    )

  if (!isNonEmptyString(request.checkpointId))
    return createStorageFailure('Checkpoint id must be a non-empty string.', ['checkpointId'])

  return validateArtifactRefArray(request.artifactRefs, ['artifactRefs']).ok
    ? createLapicSuccessResult(request)
    : createStorageFailure(
        'Artifact refs must contain unique valid artifact references.',
        ['artifactRefs']
      )
}

export function validateLapicCheckpointClosureVerificationResult(
  result: LapicCheckpointClosureVerificationResult
): LapicValidationResult<LapicCheckpointClosureVerificationResult> {
  if (!isRecord(result))
    return createStorageFailure(
      'Checkpoint closure verification result must be a record.',
      ['checkpointClosureVerificationResult']
    )

  if (!isNonEmptyString(result.checkpointId))
    return createStorageFailure('Checkpoint id must be a non-empty string.', ['checkpointId'])

  if (!isBoolean(result.resumable))
    return createStorageFailure('Resumable must be a boolean.', ['resumable'])

  if (!isBoolean(result.replayable))
    return createStorageFailure('Replayable must be a boolean.', ['replayable'])

  if (!Array.isArray(result.diagnostics) || !result.diagnostics.every(isNonEmptyString))
    return createStorageFailure('Diagnostics must contain non-empty strings.', ['diagnostics'])

  return createLapicSuccessResult(result)
}

export function validateLapicClosureExportDescriptor(
  descriptor: LapicClosureExportDescriptor
): LapicValidationResult<LapicClosureExportDescriptor> {
  if (!isRecord(descriptor))
    return createStorageFailure(
      'Closure export descriptor must be a record.',
      ['closureExportDescriptor']
    )

  if (!isNonEmptyString(descriptor.checkpointId))
    return createStorageFailure('Checkpoint id must be a non-empty string.', ['checkpointId'])

  if (!isNonEmptyString(descriptor.exportDigest))
    return createStorageFailure('Export digest must be a non-empty string.', ['exportDigest'])

  return createLapicSuccessResult(descriptor)
}

export function validateLapicClosureImportDescriptor(
  descriptor: LapicClosureImportDescriptor
): LapicValidationResult<LapicClosureImportDescriptor> {
  if (!isRecord(descriptor))
    return createStorageFailure(
      'Closure import descriptor must be a record.',
      ['closureImportDescriptor']
    )

  if (!isNonEmptyString(descriptor.checkpointId))
    return createStorageFailure('Checkpoint id must be a non-empty string.', ['checkpointId'])

  if (!isNonEmptyString(descriptor.importDigest))
    return createStorageFailure('Import digest must be a non-empty string.', ['importDigest'])

  return createLapicSuccessResult(descriptor)
}