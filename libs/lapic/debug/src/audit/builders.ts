import type { LapicDigest } from '@genshin-optimizer/lapic/core'
import type {
  LapicArtifactRef,
  LapicCheckpointClosureVerificationResult,
} from '@genshin-optimizer/lapic/storage'
import type {
  LapicAuditReportRequest,
  LapicCertificateReplayCoverageSummary,
  LapicCheckpointClosureAuditSummary,
} from '../types'

export function createLapicAuditReportRequest(
  sessionId: string,
  includeReplayCoverage: boolean,
  includePotentialAudit = false
): LapicAuditReportRequest {
  return {
    sessionId,
    includeReplayCoverage,
    includePotentialAudit,
  }
}

export function createLapicCertificateReplayCoverageSummary(
  replayedCertificateIds: readonly string[],
  missingCertificateIds: readonly string[]
): LapicCertificateReplayCoverageSummary {
  return {
    replayedCertificateIds: [...replayedCertificateIds],
    missingCertificateIds: [...missingCertificateIds],
  }
}

export function createLapicCheckpointClosureAuditSummary(
  verification: LapicCheckpointClosureVerificationResult
): LapicCheckpointClosureAuditSummary {
  return { verification }
}

export function createLapicHarnessReportManifest(
  reportDigest: LapicDigest,
  relatedArtifacts: readonly LapicArtifactRef[]
) {
  return {
    reportDigest,
    relatedArtifacts: [...relatedArtifacts],
  }
}
