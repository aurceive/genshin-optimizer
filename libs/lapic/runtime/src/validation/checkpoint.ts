import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicCheckpointCompletionResult,
  LapicCheckpointExportDescriptor,
  LapicCheckpointImportDescriptor,
  LapicCheckpointRequest,
  LapicPauseToCheckpointTransitionSummary,
} from '../types'
import {
  createRuntimeFailure,
  isBoolean,
  isNonEmptyString,
  isRecord,
} from './internal'

export function validateLapicCheckpointRequest(
  request: LapicCheckpointRequest
): LapicValidationResult<LapicCheckpointRequest> {
  if (!isRecord(request))
    return createRuntimeFailure(
      'Checkpoint request must be a record.',
      ['checkpointRequest']
    )

  if (!isNonEmptyString(request.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', ['sessionId'])

  if (!isNonEmptyString(request.checkpointId))
    return createRuntimeFailure(
      'Checkpoint id must be a non-empty string.',
      ['checkpointId']
    )

  return createLapicSuccessResult(request)
}

export function validateLapicCheckpointExportDescriptor(
  descriptor: LapicCheckpointExportDescriptor
): LapicValidationResult<LapicCheckpointExportDescriptor> {
  if (!isRecord(descriptor))
    return createRuntimeFailure(
      'Checkpoint export descriptor must be a record.',
      ['checkpointExportDescriptor']
    )

  if (!isNonEmptyString(descriptor.closure.checkpointId))
    return createRuntimeFailure(
      'Closure checkpoint id must be a non-empty string.',
      ['closure', 'checkpointId']
    )

  if (!isNonEmptyString(descriptor.closure.exportDigest))
    return createRuntimeFailure(
      'Closure export digest must be a non-empty string.',
      ['closure', 'exportDigest']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicCheckpointImportDescriptor(
  descriptor: LapicCheckpointImportDescriptor
): LapicValidationResult<LapicCheckpointImportDescriptor> {
  if (!isRecord(descriptor))
    return createRuntimeFailure(
      'Checkpoint import descriptor must be a record.',
      ['checkpointImportDescriptor']
    )

  if (!isNonEmptyString(descriptor.closure.checkpointId))
    return createRuntimeFailure(
      'Closure checkpoint id must be a non-empty string.',
      ['closure', 'checkpointId']
    )

  if (!isNonEmptyString(descriptor.closure.importDigest))
    return createRuntimeFailure(
      'Closure import digest must be a non-empty string.',
      ['closure', 'importDigest']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicCheckpointCompletionResult(
  result: LapicCheckpointCompletionResult
): LapicValidationResult<LapicCheckpointCompletionResult> {
  if (!isRecord(result))
    return createRuntimeFailure(
      'Checkpoint completion result must be a record.',
      ['checkpointCompletionResult']
    )

  if (!isNonEmptyString(result.checkpointId))
    return createRuntimeFailure(
      'Checkpoint id must be a non-empty string.',
      ['checkpointId']
    )

  if (!isBoolean(result.verification.resumable))
    return createRuntimeFailure(
      'Verification resumable must be boolean.',
      ['verification', 'resumable']
    )

  return createLapicSuccessResult(result)
}

export function validateLapicPauseToCheckpointTransitionSummary(
  summary: LapicPauseToCheckpointTransitionSummary
): LapicValidationResult<LapicPauseToCheckpointTransitionSummary> {
  if (!isRecord(summary))
    return createRuntimeFailure(
      'Pause-to-checkpoint summary must be a record.',
      ['pauseToCheckpointTransitionSummary']
    )

  if (!isNonEmptyString(summary.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', ['sessionId'])

  return validateLapicCheckpointCompletionResult(summary.checkpoint).ok
    ? createLapicSuccessResult(summary)
    : createRuntimeFailure('Checkpoint result must be valid.', ['checkpoint'])
}
