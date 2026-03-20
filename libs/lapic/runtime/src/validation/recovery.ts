import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicFailedSessionSummary,
  LapicFailureClass,
  LapicFailureRecord,
  LapicRecoveryEligibilityClassification,
} from '../types'
import {
  createRuntimeFailure,
  isBoolean,
  isNonEmptyString,
  isRecord,
  lapicFailureClasses,
} from './internal'
import { validateLapicSessionSummary } from './session'

export function validateLapicFailureRecord(
  failure: LapicFailureRecord
): LapicValidationResult<LapicFailureRecord> {
  if (!isRecord(failure))
    return createRuntimeFailure('Failure record must be a record.', ['failureRecord'])

  if (!isNonEmptyString(failure.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', ['sessionId'])

  if (
    !isNonEmptyString(failure.failureClass) ||
    !lapicFailureClasses.includes(failure.failureClass as LapicFailureClass)
  )
    return createRuntimeFailure('Failure class must be supported.', ['failureClass'])

  if (!isNonEmptyString(failure.message))
    return createRuntimeFailure('Message must be a non-empty string.', ['message'])

  if (!Array.isArray(failure.diagnostics))
    return createRuntimeFailure('Diagnostics must be an array.', ['diagnostics'])

  return createLapicSuccessResult(failure)
}

export function validateLapicFailedSessionSummary(
  summary: LapicFailedSessionSummary
): LapicValidationResult<LapicFailedSessionSummary> {
  if (!isRecord(summary))
    return createRuntimeFailure(
      'Failed session summary must be a record.',
      ['failedSessionSummary']
    )

  const sessionValidation = validateLapicSessionSummary(summary.summary)
  if (!sessionValidation.ok) return sessionValidation

  return validateLapicFailureRecord(summary.failure).ok
    ? createLapicSuccessResult(summary)
    : createRuntimeFailure('Failure record must be valid.', ['failure'])
}

export function validateLapicRecoveryEligibilityClassification(
  classification: LapicRecoveryEligibilityClassification
): LapicValidationResult<LapicRecoveryEligibilityClassification> {
  if (!isRecord(classification))
    return createRuntimeFailure(
      'Recovery eligibility classification must be a record.',
      ['recoveryEligibilityClassification']
    )

  if (!isBoolean(classification.eligible))
    return createRuntimeFailure('Eligible must be boolean.', ['eligible'])

  if (!isNonEmptyString(classification.reason))
    return createRuntimeFailure('Reason must be a non-empty string.', ['reason'])

  return createLapicSuccessResult(classification)
}
