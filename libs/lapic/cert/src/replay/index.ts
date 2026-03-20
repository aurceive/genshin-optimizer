import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicDiagnostic, LapicDigest, LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicCertificate,
  LapicCertificateReplayCoverageSummary,
  LapicEvidenceBundleManifest,
  LapicReplayEnvironmentDescriptor,
  LapicReplayMismatchSummary,
  LapicReplayRecipe,
  LapicReplayRequest,
  LapicReplayResult,
} from '../types'
import { validateLapicCertificate } from '../validation'

export function validateLapicReplayRecipe(
  replayRecipe: LapicReplayRecipe
): LapicValidationResult<LapicReplayRecipe> {
  const diagnostics: LapicDiagnostic[] = []

  if (!replayRecipe.requiredIrObjects.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'replayRecipe.requiredIrObjects must not be empty.',
        ['replayRecipe', 'requiredIrObjects']
      )
    )

  if (!replayRecipe.arithmeticMode)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'replayRecipe.arithmeticMode must not be empty.',
        ['replayRecipe', 'arithmeticMode']
      )
    )

  if (!replayRecipe.replayPathKind)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'replayRecipe.replayPathKind must not be empty.',
        ['replayRecipe', 'replayPathKind']
      )
    )

  if (!replayRecipe.exactComparisonRule)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'replayRecipe.exactComparisonRule must not be empty.',
        ['replayRecipe', 'exactComparisonRule']
      )
    )

  if (!replayRecipe.expectedVerdict)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'replayRecipe.expectedVerdict must not be empty.',
        ['replayRecipe', 'expectedVerdict']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(replayRecipe)
}

export function validateLapicEvidenceBundleManifest(
  manifest: LapicEvidenceBundleManifest
): LapicValidationResult<LapicEvidenceBundleManifest> {
  const diagnostics: LapicDiagnostic[] = []

  if (!manifest.evidenceDigests.length)
    diagnostics.push(
      createLapicDiagnostic('error', 'SchemaViolation', 'evidenceDigests must not be empty.', ['evidenceDigests'])
    )

  if (!manifest.thresholdSnapshotDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'thresholdSnapshotDigest must not be empty.',
        ['thresholdSnapshotDigest']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(manifest)
}

export function validateLapicReplayEnvironmentDescriptor(
  environment: LapicReplayEnvironmentDescriptor
): LapicValidationResult<LapicReplayEnvironmentDescriptor> {
  const diagnostics: LapicDiagnostic[] = []

  if (!environment.engineVersion)
    diagnostics.push(
      createLapicDiagnostic('error', 'SchemaViolation', 'engineVersion must not be empty.', ['engineVersion'])
    )

  if (!environment.arithmeticPolicyId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'arithmeticPolicyId must not be empty.',
        ['arithmeticPolicyId']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(environment)
}

export function validateLapicReplayRequest(
  request: LapicReplayRequest
): LapicValidationResult<LapicReplayRequest> {
  const diagnostics: LapicDiagnostic[] = []

  if (!request.problemId)
    diagnostics.push(
      createLapicDiagnostic('error', 'SchemaViolation', 'problemId must not be empty.', ['problemId'])
    )

  const environmentValidation = validateLapicReplayEnvironmentDescriptor(request.environment)
  if (!environmentValidation.ok) diagnostics.push(...environmentValidation.diagnostics)

  if (request.mode === 'single-certificate' && !request.certificateIds?.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'single-certificate replay mode requires certificateIds.',
        ['certificateIds']
      )
    )

  if (request.mode === 'block-level' && !request.blockIds?.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'block-level replay mode requires blockIds.',
        ['blockIds']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(request)
}

export function validateLapicReplayResult(
  replayResult: LapicReplayResult
): LapicValidationResult<LapicReplayResult> {
  const diagnostics: LapicDiagnostic[] = []

  if (!replayResult.arithmeticModeUsed)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'arithmeticModeUsed must not be empty.',
        ['arithmeticModeUsed']
      )
    )

  if (!replayResult.referencedEvidenceDigests.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'referencedEvidenceDigests must not be empty.',
        ['referencedEvidenceDigests']
      )
    )

  if (
    replayResult.reproducedVerdict === 'mismatched' &&
    !replayResult.mismatchExplanation
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'mismatched replay results must include mismatchExplanation.',
        ['mismatchExplanation']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(replayResult)
}

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
