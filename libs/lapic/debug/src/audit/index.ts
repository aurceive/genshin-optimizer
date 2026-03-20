import {
  createLapicCertificateSummary,
} from '@genshin-optimizer/lapic/cert'
import type { LapicCertificate } from '@genshin-optimizer/lapic/cert'
import {
  createLapicCheckpointClosureInventory,
  createLapicDebugArtifactSummary,
  scanLapicArtifactIntegrity,
} from '@genshin-optimizer/lapic/storage'
import type {
  LapicArtifactRef,
  LapicArtifactStore,
  LapicCheckpointClosureVerificationResult,
} from '@genshin-optimizer/lapic/storage'
import type {
  LapicAuditReport,
  LapicAuditReportRequest,
  LapicCheckpointClosureAuditReport,
  LapicPotentialAuditSummary,
} from '../types'
import {
  createLapicCertificateReplayCoverageSummary,
  createLapicCheckpointClosureAuditSummary,
} from './builders'
import { compareLapicTraceEvents } from './internal'

export function createLapicPotentialAuditSummary(
  certificates: readonly LapicCertificate[],
  graphOutputCount: number
): LapicPotentialAuditSummary {
  let rankingRelevantCertificateCount = 0
  let auxiliaryOnlyOutputCount = 0

  certificates.forEach((certificate) => {
    const summaryResult = createLapicCertificateSummary(certificate)
    if (!summaryResult.ok) return

    const participationMode = summaryResult.value.potentialParticipationMode
    if (!participationMode) return

    if (
      participationMode === 'full-ranking' ||
      participationMode === 'rerank' ||
      participationMode === 'governed-bonus'
    )
      rankingRelevantCertificateCount += 1
    else if (participationMode === 'auxiliary-only') auxiliaryOnlyOutputCount += 1
  })

  return {
    rankingRelevantCertificateCount,
    auxiliaryOnlyOutputCount,
    graphOutputCount,
  }
}

export async function createLapicCheckpointClosureAuditReport(
  store: LapicArtifactStore,
  verification: LapicCheckpointClosureVerificationResult,
  artifactRefs: readonly LapicArtifactRef[]
): Promise<LapicCheckpointClosureAuditReport> {
  const integrityScan = await scanLapicArtifactIntegrity(store, { artifactRefs })

  return {
    closure: createLapicCheckpointClosureAuditSummary(verification),
    integrityScan,
  }
}

export async function createLapicAuditReport(
  store: LapicArtifactStore,
  request: LapicAuditReportRequest,
  session: LapicAuditReport['session'],
  traceEvents: LapicAuditReport['traceEvents'],
  certificates: readonly LapicCertificate[],
  artifactRefs: readonly LapicArtifactRef[]
): Promise<LapicAuditReport> {
  const integrityScan = await scanLapicArtifactIntegrity(store, { artifactRefs })
  let replayCoverage: LapicAuditReport['replayCoverage']
  let potentialAuditSummary: LapicPotentialAuditSummary | undefined

  if (request.includeReplayCoverage)
    replayCoverage = createLapicReplayCoverageFromCertificates(
      certificates,
      certificates
        .filter((certificate) => certificate.validationStatus === 'validated')
        .map((certificate) => certificate.certId)
    )

  if (request.includePotentialAudit)
    potentialAuditSummary = createLapicPotentialAuditSummary(certificates, 0)

  return {
    session,
    traceEvents: [...traceEvents].sort(compareLapicTraceEvents),
    integrityScan,
    ...(replayCoverage
      ? {
          replayCoverage: createLapicCertificateReplayCoverageSummary(
            replayCoverage.replayedCertificateIds,
            replayCoverage.missingCertificateIds
          ),
        }
      : {}),
    ...(potentialAuditSummary !== undefined ? { potentialAuditSummary } : {}),
  }
}

export function createLapicReplayCoverageFromCertificates(
  certificates: readonly LapicCertificate[],
  replayedCertificateIds: readonly string[]
) {
  const allIds = certificates.map((certificate) => certificate.certId)
  const replayed = [...replayedCertificateIds].sort((left, right) =>
    left.localeCompare(right)
  )
  const missing = allIds
    .filter((certId) => !replayed.includes(certId))
    .sort((left, right) => left.localeCompare(right))

  return createLapicCertificateReplayCoverageSummary(replayed, missing)
}

export function createLapicCheckpointInventoryDebugSummary(
  checkpointId: string,
  requiredArtifacts: readonly LapicArtifactRef[],
  missingArtifacts: readonly LapicArtifactRef[]
) {
  return createLapicCheckpointClosureInventory(
    checkpointId,
    requiredArtifacts,
    missingArtifacts
  )
}

export function createLapicArtifactDebugSummary(
  artifactRef: LapicArtifactRef,
  summaryDigest: string
) {
  return createLapicDebugArtifactSummary(artifactRef, summaryDigest)
}
