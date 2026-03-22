import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import { validateLapicCheckpointClosureVerificationResult } from '@genshin-optimizer/lapic/storage'
import type {
  LapicAuditReport,
  LapicAuditReportRequest,
  LapicCertificateReplayCoverageSummary,
  LapicCheckpointClosureAuditSummary,
  LapicPotentialAuditSummary,
} from '../types'
import {
  createDebugFailure,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from '../validation/internal'

export function validateLapicAuditReportRequest(
  request: LapicAuditReportRequest
): LapicValidationResult<LapicAuditReportRequest> {
  if (!isRecord(request))
    return createDebugFailure('Audit report request must be a record.', [
      'auditReportRequest',
    ])

  if (!isNonEmptyString(request.sessionId))
    return createDebugFailure('Session id must be a non-empty string.', [
      'sessionId',
    ])

  if (!isBoolean(request.includeReplayCoverage))
    return createDebugFailure('includeReplayCoverage must be boolean.', [
      'includeReplayCoverage',
    ])

  if (
    request.includePotentialAudit !== undefined &&
    !isBoolean(request.includePotentialAudit)
  )
    return createDebugFailure(
      'includePotentialAudit must be boolean when present.',
      ['includePotentialAudit']
    )

  return createLapicSuccessResult(request)
}

export function validateLapicCertificateReplayCoverageSummary(
  summary: LapicCertificateReplayCoverageSummary
): LapicValidationResult<LapicCertificateReplayCoverageSummary> {
  if (!isRecord(summary))
    return createDebugFailure(
      'Certificate replay coverage summary must be a record.',
      ['certificateReplayCoverageSummary']
    )

  if (
    !Array.isArray(summary.replayedCertificateIds) ||
    !summary.replayedCertificateIds.every(isNonEmptyString) ||
    !Array.isArray(summary.missingCertificateIds) ||
    !summary.missingCertificateIds.every(isNonEmptyString)
  )
    return createDebugFailure(
      'Replay coverage id lists must contain non-empty strings.',
      ['certificateReplayCoverageSummary']
    )

  return createLapicSuccessResult(summary)
}

export function validateLapicCheckpointClosureAuditSummary(
  summary: LapicCheckpointClosureAuditSummary
): LapicValidationResult<LapicCheckpointClosureAuditSummary> {
  if (!isRecord(summary))
    return createDebugFailure(
      'Checkpoint closure audit summary must be a record.',
      ['checkpointClosureAuditSummary']
    )

  const verificationValidation =
    validateLapicCheckpointClosureVerificationResult(summary.verification)
  if (!verificationValidation.ok)
    return createDebugFailure(
      'Verification must be a valid checkpoint verification result.',
      ['verification']
    )

  return createLapicSuccessResult(summary)
}

export function validateLapicPotentialAuditSummary(
  summary: LapicPotentialAuditSummary
): LapicValidationResult<LapicPotentialAuditSummary> {
  if (!isRecord(summary))
    return createDebugFailure('Potential audit summary must be a record.', [
      'potentialAuditSummary',
    ])

  if (
    !isNonNegativeInteger(summary.rankingRelevantCertificateCount) ||
    !isNonNegativeInteger(summary.auxiliaryOnlyOutputCount) ||
    !isNonNegativeInteger(summary.graphOutputCount)
  )
    return createDebugFailure(
      'Potential audit counters must be non-negative integers.',
      ['potentialAuditSummary']
    )

  return createLapicSuccessResult(summary)
}

export function validateLapicAuditReport(
  report: LapicAuditReport
): LapicValidationResult<LapicAuditReport> {
  if (!isRecord(report))
    return createDebugFailure('Audit report must be a record.', ['auditReport'])

  if (!isNonEmptyString(report.session.identity.sessionId))
    return createDebugFailure(
      'Audit report must include a valid session summary.',
      ['session']
    )

  if (!Array.isArray(report.traceEvents))
    return createDebugFailure('Trace events must be an array.', ['traceEvents'])

  return createLapicSuccessResult(report)
}
