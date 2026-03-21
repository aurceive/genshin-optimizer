import {
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicDigest, LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicCertificate,
  LapicCertificateReplayCoverageSummary,
  LapicReplayMismatchSummary,
  LapicReplayResult,
} from '../types'
import { validateLapicCertificate } from '../validation'
import { validateLapicReplayResult } from './validation'

export function createLapicReplayCoverageSummary(
  certificates: readonly LapicCertificate[],
  replayResultsByCertificateId: Readonly<Record<string, LapicReplayResult | undefined>>
): LapicValidationResult<LapicCertificateReplayCoverageSummary> {
  const replayedCertificateIds: string[] = []
  const missingCertificateIds: string[] = []
  let matchedReplayCount = 0
  let mismatchedReplayCount = 0
  let inconclusiveReplayCount = 0

  for (const certificate of certificates) {
    const validation = validateLapicCertificate(certificate)
    if (!validation.ok) return validation

    const replayResult = replayResultsByCertificateId[certificate.certId]
    if (!replayResult) {
      missingCertificateIds.push(certificate.certId)
      continue
    }

    const replayValidation = validateLapicReplayResult(replayResult)
    if (!replayValidation.ok) return replayValidation

    replayedCertificateIds.push(certificate.certId)
    switch (replayResult.reproducedVerdict) {
      case 'matched':
        matchedReplayCount += 1
        break
      case 'mismatched':
        mismatchedReplayCount += 1
        break
      case 'inconclusive':
        inconclusiveReplayCount += 1
        break
    }
  }

  return createLapicSuccessResult({
    replayedCertificateIds,
    missingCertificateIds,
    matchedReplayCount,
    mismatchedReplayCount,
    inconclusiveReplayCount,
  })
}

export function summarizeLapicReplayMismatch(
  replayResults: readonly LapicReplayResult[]
): LapicValidationResult<LapicReplayMismatchSummary> {
  const reasons = new Set<string>()
  const referencedEvidenceDigests = new Set<LapicDigest>()
  let mismatchCount = 0

  for (const replayResult of replayResults) {
    const validation = validateLapicReplayResult(replayResult)
    if (!validation.ok) return validation
    if (replayResult.reproducedVerdict !== 'mismatched') continue

    mismatchCount += 1
    if (replayResult.mismatchExplanation?.reason)
      reasons.add(replayResult.mismatchExplanation.reason)
    replayResult.referencedEvidenceDigests.forEach((digest) =>
      referencedEvidenceDigests.add(digest)
    )
  }

  return createLapicSuccessResult({
    mismatchCount,
    reasons: [...reasons],
    referencedEvidenceDigests: [...referencedEvidenceDigests],
  })
}
