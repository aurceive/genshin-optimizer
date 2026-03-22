import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicDiagnostic,
  LapicDigest,
  LapicPotentialParticipationMode,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicBoundPrunePayload,
  LapicCertificate,
  LapicCertificateSummary,
  LapicFinalOptimalityPayload,
  LapicFinalOptimalityRollup,
  LapicFinalOptimalitySummary,
  LapicThresholdSensitiveDecisionCounters,
  LapicThresholdSensitiveDecisionMetadata,
} from '../types'
import { validateLapicCertificate } from '../validation'

export function createLapicThresholdSensitiveDecisionMetadata(
  thresholdDigest: LapicDigest,
  exactReplayRequired: boolean,
  dangerZoneDetected: boolean
): LapicValidationResult<LapicThresholdSensitiveDecisionMetadata> {
  return validateLapicThresholdSensitiveDecisionMetadata({
    thresholdDigest,
    exactReplayRequired,
    dangerZoneDetected,
  })
}

export function validateLapicThresholdSensitiveDecisionMetadata(
  metadata: LapicThresholdSensitiveDecisionMetadata
): LapicValidationResult<LapicThresholdSensitiveDecisionMetadata> {
  const diagnostics: LapicDiagnostic[] = []

  if (!metadata.thresholdDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'thresholdDigest must not be empty.',
        ['thresholdDigest']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(metadata)
}

export function createLapicCertificateSummary(
  certificate: LapicCertificate
): LapicValidationResult<LapicCertificateSummary> {
  const validation = validateLapicCertificate(certificate)
  if (!validation.ok) return validation

  let thresholdDigest: LapicDigest | undefined
  let potentialParticipationMode: LapicPotentialParticipationMode | undefined

  if (certificate.certKind === 'BoundPruneCert') {
    const payload = certificate.payload as LapicBoundPrunePayload
    thresholdDigest = payload.thresholdDigest
    potentialParticipationMode =
      payload.potentialDecisionBasis?.participationMode
  }

  if (certificate.certKind === 'FinalOptimalityCert') {
    const payload = certificate.payload as LapicFinalOptimalityPayload
    thresholdDigest = payload.finalThresholdDigest
    potentialParticipationMode = payload.rankingParticipationMode
  }

  return createLapicSuccessResult({
    certId: certificate.certId,
    certKind: certificate.certKind,
    decisionClass: certificate.decisionClass,
    validationStatus: certificate.validationStatus,
    emittedAtStep: certificate.emittedAtStep,
    evidenceDigest: certificate.evidenceDigest,
    referencedStateCount: certificate.referencedStateIds.length,
    referencedBlockCount: certificate.referencedBlockIds.length,
    referencedRegionCount: certificate.referencedRegionIds.length,
    referencedRelaxCount: certificate.referencedRelaxIds.length,
    ...(thresholdDigest !== undefined ? { thresholdDigest } : {}),
    ...(potentialParticipationMode !== undefined
      ? { potentialParticipationMode }
      : {}),
  })
}

function createLapicThresholdSensitiveDecisionMetadataFromCertificate(
  certificate: LapicCertificate
): LapicValidationResult<LapicThresholdSensitiveDecisionMetadata | null> {
  switch (certificate.certKind) {
    case 'BoundPruneCert': {
      const payload = certificate.payload as LapicBoundPrunePayload
      return createLapicThresholdSensitiveDecisionMetadata(
        payload.thresholdDigest,
        certificate.replayRecipe.arithmeticMode === 'exact',
        payload.dangerZoneRecord.triggered
      )
    }
    case 'FinalOptimalityCert': {
      const payload = certificate.payload as LapicFinalOptimalityPayload
      return createLapicThresholdSensitiveDecisionMetadata(
        payload.finalThresholdDigest,
        certificate.replayRecipe.arithmeticMode === 'exact',
        false
      )
    }
    default:
      return createLapicSuccessResult(null)
  }
}

export function createLapicThresholdSensitiveDecisionCounters(
  certificates: readonly LapicCertificate[]
): LapicValidationResult<LapicThresholdSensitiveDecisionCounters> {
  const thresholdSensitiveCertificateIds: string[] = []
  let exactReplayRequiredCount = 0
  let dangerZoneDetectedCount = 0

  for (const certificate of certificates) {
    const validation = validateLapicCertificate(certificate)
    if (!validation.ok) return validation

    const metadataResult =
      createLapicThresholdSensitiveDecisionMetadataFromCertificate(certificate)
    if (!metadataResult.ok) return metadataResult
    if (!metadataResult.value) continue

    thresholdSensitiveCertificateIds.push(certificate.certId)
    if (metadataResult.value.exactReplayRequired) exactReplayRequiredCount += 1
    if (metadataResult.value.dangerZoneDetected) dangerZoneDetectedCount += 1
  }

  return createLapicSuccessResult({
    thresholdSensitiveCertificateIds,
    exactReplayRequiredCount,
    dangerZoneDetectedCount,
  })
}

export function createLapicFinalOptimalitySummary(
  certificate: LapicCertificate<LapicFinalOptimalityPayload>
): LapicValidationResult<LapicFinalOptimalitySummary> {
  const validation = validateLapicCertificate(certificate)
  if (!validation.ok) return validation

  const decisionMetadata = createLapicThresholdSensitiveDecisionMetadata(
    certificate.payload.finalThresholdDigest,
    certificate.replayRecipe.arithmeticMode === 'exact',
    certificate.payload.potentialDecisionBasis !== undefined
  )
  if (!decisionMetadata.ok) return decisionMetadata

  return createLapicSuccessResult({
    winnerStateId: certificate.payload.winningStateId,
    winnerDigest: certificate.evidenceDigest,
    certId: certificate.certId,
    decisionMetadata: decisionMetadata.value,
  })
}

export function createLapicFinalOptimalityRollup(
  certificates: readonly LapicCertificate<LapicFinalOptimalityPayload>[]
): LapicValidationResult<LapicFinalOptimalityRollup> {
  if (!certificates.length)
    return createLapicFailureResult([
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'Final optimality rollup requires at least one certificate.',
        ['certificates']
      ),
    ])

  const winnerStateId = certificates[0]!.payload.winningStateId
  const certIds: string[] = []
  const winnerEvidenceDigests: LapicDigest[] = []
  const thresholdDigests: LapicDigest[] = []

  for (const certificate of certificates) {
    const validation = validateLapicCertificate(certificate)
    if (!validation.ok) return validation

    if (certificate.certKind !== 'FinalOptimalityCert')
      return createLapicFailureResult([
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'Final optimality rollup accepts only FinalOptimalityCert certificates.',
          ['certKind']
        ),
      ])

    if (certificate.payload.winningStateId !== winnerStateId)
      return createLapicFailureResult([
        createLapicDiagnostic(
          'error',
          'InvariantViolation',
          'All final optimality certificates in a rollup must agree on winningStateId.',
          ['payload', 'winningStateId'],
          {
            expectedWinnerStateId: winnerStateId,
            actualWinnerStateId: certificate.payload.winningStateId,
          }
        ),
      ])

    certIds.push(certificate.certId)
    winnerEvidenceDigests.push(certificate.evidenceDigest)
    thresholdDigests.push(certificate.payload.finalThresholdDigest)
  }

  return createLapicSuccessResult({
    winnerStateId,
    certIds,
    winnerEvidenceDigests,
    thresholdDigests,
  })
}
