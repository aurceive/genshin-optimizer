/**
 * Certificate Audit Validators
 *
 * Per cert-api.md §2, the cert package owns certificate validators.
 * This module provides certificate-focused audit validation:
 * structural completeness, evidence coverage, and replay recipe
 * integrity checks against the certificate model contract.
 */

import type {
  LapicDiagnostic,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicCertificate, LapicCertificateKind } from '../types'

// ---------------------------------------------------------------------------
// Structural completeness audit
// ---------------------------------------------------------------------------

/**
 * Result of a certificate structural audit. Reports which required
 * fields are present, which are missing, and overall completeness.
 */
export interface LapicCertificateAuditResult {
  readonly certificateId: string
  readonly certKind: LapicCertificateKind
  readonly structurallyComplete: boolean
  readonly hasEvidencePayload: boolean
  readonly hasReplayRecipe: boolean
  readonly hasValidTimestamps: boolean
  readonly missingFields: readonly string[]
}

/**
 * Audit a single certificate for structural completeness.
 * Does NOT verify evidence correctness — only that all required
 * fields are present and have valid shapes.
 */
export function auditCertificateStructure(
  certificate: LapicCertificate
): LapicCertificateAuditResult {
  const missingFields: string[] = []

  if (!certificate.certId) missingFields.push('certId')
  if (!certificate.certKind) missingFields.push('certKind')
  if (!certificate.decisionClass) missingFields.push('decisionClass')
  if (!certificate.problemId) missingFields.push('problemId')
  if (!certificate.arithmeticPolicyId) missingFields.push('arithmeticPolicyId')

  const hasEvidencePayload =
    certificate.payload !== undefined && certificate.payload !== null
  if (!hasEvidencePayload) missingFields.push('payload')

  const hasEvidenceDigest =
    typeof certificate.evidenceDigest === 'string' &&
    certificate.evidenceDigest.length > 0
  if (!hasEvidenceDigest) missingFields.push('evidenceDigest')

  const hasReplayRecipe =
    certificate.replayRecipe !== undefined && certificate.replayRecipe !== null
  if (!hasReplayRecipe) missingFields.push('replayRecipe')

  const hasValidTimestamps =
    typeof certificate.emittedAtStep === 'number' &&
    certificate.emittedAtStep >= 0
  if (!hasValidTimestamps) missingFields.push('emittedAtStep')

  return {
    certificateId: certificate.certId ?? '<missing>',
    certKind: certificate.certKind ?? ('unknown' as LapicCertificateKind),
    structurallyComplete: missingFields.length === 0,
    hasEvidencePayload,
    hasReplayRecipe,
    hasValidTimestamps,
    missingFields,
  }
}

// ---------------------------------------------------------------------------
// Batch audit
// ---------------------------------------------------------------------------

/** Summary of batch certificate audits. */
export interface LapicCertificateBatchAuditSummary {
  readonly totalCertificates: number
  readonly structurallyComplete: number
  readonly withEvidencePayload: number
  readonly withReplayRecipe: number
  readonly withValidTimestamps: number
  readonly auditResults: readonly LapicCertificateAuditResult[]
}

/**
 * Audit a batch of certificates and produce a summary.
 */
export function auditCertificateBatch(
  certificates: readonly LapicCertificate[]
): LapicCertificateBatchAuditSummary {
  const auditResults = certificates.map(auditCertificateStructure)

  return {
    totalCertificates: certificates.length,
    structurallyComplete: auditResults.filter((r) => r.structurallyComplete)
      .length,
    withEvidencePayload: auditResults.filter((r) => r.hasEvidencePayload)
      .length,
    withReplayRecipe: auditResults.filter((r) => r.hasReplayRecipe).length,
    withValidTimestamps: auditResults.filter((r) => r.hasValidTimestamps)
      .length,
    auditResults,
  }
}

// ---------------------------------------------------------------------------
// Validation interface
// ---------------------------------------------------------------------------

/**
 * Validate that a certificate collection meets minimum audit
 * thresholds for a governed milestone.
 */
export function validateCertificateAuditThreshold(
  summary: LapicCertificateBatchAuditSummary,
  requiredCompletenessRatio: number
): LapicValidationResult<LapicCertificateBatchAuditSummary> {
  const diagnostics: LapicDiagnostic[] = []

  if (summary.totalCertificates === 0) {
    return createLapicFailureResult([
      createLapicDiagnostic(
        'error',
        'EmptyBatch',
        'Certificate batch is empty'
      ),
    ])
  }

  const completenessRatio =
    summary.structurallyComplete / summary.totalCertificates
  if (completenessRatio < requiredCompletenessRatio) {
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InsufficientCompleteness',
        `Structural completeness ratio ${(completenessRatio * 100).toFixed(1)}% is below required ${(requiredCompletenessRatio * 100).toFixed(1)}%`
      )
    )
  }

  const evidenceRatio = summary.withEvidencePayload / summary.totalCertificates
  if (evidenceRatio < 1.0) {
    diagnostics.push(
      createLapicDiagnostic(
        'warning',
        'MissingEvidence',
        `${summary.totalCertificates - summary.withEvidencePayload} certificate(s) lack evidence payloads`
      )
    )
  }

  const replayRatio = summary.withReplayRecipe / summary.totalCertificates
  if (replayRatio < 1.0) {
    diagnostics.push(
      createLapicDiagnostic(
        'warning',
        'MissingReplayRecipe',
        `${summary.totalCertificates - summary.withReplayRecipe} certificate(s) lack replay recipes`
      )
    )
  }

  if (diagnostics.some((d) => d.severity === 'error'))
    return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(summary, diagnostics)
}
