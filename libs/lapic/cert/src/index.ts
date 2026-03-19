import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicArithmeticPolicyId,
  LapicBlockId,
  LapicDiagnostic,
  LapicDigest,
  LapicPotentialParticipationMode,
  LapicPotentialSolveMode,
  LapicProblemId,
  LapicRegionId,
  LapicRelaxId,
  LapicSchemaVersion,
  LapicStateId,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'

export const lapicCertPackageName = 'lapic-cert'
export const lapicCertSchemaVersion = '0.1.0-draft'

export type LapicCertSchemaVersion = typeof lapicCertSchemaVersion
export type LapicCertificateKind =
  | 'BranchReachabilityCert'
  | 'InfeasibilityCert'
  | 'BoundPruneCert'
  | 'DominanceCert'
  | 'FinalOptimalityCert'
export type LapicCertificateDecisionClass =
  | 'exact-prune'
  | 'relaxation-prune'
  | 'dominance-prune'
  | 'optimality-proof'
export type LapicCertificateValidationStatus =
  | 'unvalidated'
  | 'validated'
  | 'rejected'

export interface LapicReplayRecipe {
  readonly requiredIrObjects: readonly LapicDigest[]
  readonly requiredRegionPredicates: readonly string[]
  readonly requiredUpgradeFrontierDigests?: readonly LapicDigest[]
  readonly arithmeticMode: string
  readonly replayPathKind: string
  readonly exactComparisonRule: string
  readonly expectedVerdict: LapicReplayVerdict
}

export interface LapicPotentialDecisionBasis {
  readonly solveMode: LapicPotentialSolveMode
  readonly participationMode: LapicPotentialParticipationMode
  readonly envelopeDigest?: LapicDigest
  readonly envelopeKind?: string
}

export interface LapicBranchReachabilityPayload {
  readonly branchPredicateDigest: LapicDigest
  readonly exactBoundsDigest?: LapicDigest
  readonly contradictionWitnessDigest?: LapicDigest
  readonly selectedArm: 'left' | 'right'
  readonly validityRegionId: LapicRegionId
}

export interface LapicInfeasibilityPayload {
  readonly evidenceSourceClass: LapicEvidenceSourceClass
  readonly infeasibleConstraintDigests: readonly LapicDigest[]
  readonly witnessDigest: LapicDigest
  readonly affectedStateIds?: readonly LapicStateId[]
  readonly affectedBlockIds?: readonly LapicBlockId[]
  readonly replayPathRequirement: string
}

export interface LapicBoundPrunePayload {
  readonly thresholdDigest: LapicDigest
  readonly boundSourceClass: LapicEvidenceSourceClass
  readonly boundValue: string
  readonly tieBreakExclusionDigest?: LapicDigest
  readonly validityRegionId: LapicRegionId
  readonly numericDiagnosticsDigest: LapicDigest
  readonly potentialDecisionBasis?: LapicPotentialDecisionBasis
  readonly dangerZoneRecord: LapicDangerZoneHandlingRecord
}

export interface LapicDominancePayload {
  readonly dominatingStateId: LapicStateId
  readonly dominatedStateId: LapicStateId
  readonly comparisonDigest: LapicDigest
  readonly exactSignatureGroupKeyDigest: LapicDigest
  readonly compatibilityInclusionDigest: LapicDigest
  readonly monotoneProjectionDigest: LapicDigest
  readonly upperBoundProfileDigest: LapicDigest
  readonly strengthComparisonDigest: LapicDigest
  readonly potentialComparisonDigest?: LapicDigest
}

export interface LapicFinalOptimalityPayload {
  readonly winningStateId: LapicStateId
  readonly optimalityGap: string
  readonly finalThresholdDigest: LapicDigest
  readonly finalIncumbentSetDigest: LapicDigest
  readonly queueExhaustionSummaryDigest: LapicDigest
  readonly thresholdPruneSummaryDigest: LapicDigest
  readonly escalatedReplaySummaryDigest: LapicDigest
  readonly stableOrderCompletenessDigest: LapicDigest
  readonly rankingParticipationMode?: LapicPotentialParticipationMode
  readonly potentialDecisionBasis?: LapicPotentialDecisionBasis
}

export interface LapicBaseCertificate {
  readonly certId: string
  readonly certKind: LapicCertificateKind
  readonly schemaVersion: LapicSchemaVersion | LapicCertSchemaVersion
  readonly problemId: LapicProblemId
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
  readonly decisionClass: LapicCertificateDecisionClass
  readonly referencedStateIds: readonly LapicStateId[]
  readonly referencedBlockIds: readonly LapicBlockId[]
  readonly referencedRegionIds: readonly LapicRegionId[]
  readonly referencedRelaxIds: readonly LapicRelaxId[]
  readonly incumbentDigest?: LapicDigest
  readonly evidenceDigest: LapicDigest
  readonly replayRecipe: LapicReplayRecipe
  readonly emittedAtStep: number
  readonly validationStatus: LapicCertificateValidationStatus
}

export type LapicCertificatePayload =
  | LapicBranchReachabilityPayload
  | LapicInfeasibilityPayload
  | LapicBoundPrunePayload
  | LapicDominancePayload
  | LapicFinalOptimalityPayload

export interface LapicCertificate<TPayload extends LapicCertificatePayload = LapicCertificatePayload>
  extends LapicBaseCertificate {
  readonly payload: TPayload
}

export interface LapicThresholdSensitiveDecisionMetadata {
  readonly thresholdDigest: LapicDigest
  readonly exactReplayRequired: boolean
  readonly dangerZoneDetected: boolean
}

export interface LapicFinalOptimalitySummary {
  readonly winnerStateId: LapicStateId
  readonly winnerDigest: LapicDigest
  readonly certId: string
  readonly decisionMetadata: LapicThresholdSensitiveDecisionMetadata
}

export type LapicEvidenceSourceClass =
  | 'exactSymbolic'
  | 'exactCategorical'
  | 'relaxationDerived'
  | 'providerDerived'
  | 'verificationReplay'

export interface LapicEvidenceDigestReference {
  readonly evidenceDigest: LapicDigest
  readonly sourceClass: LapicEvidenceSourceClass
}

export interface LapicDangerZoneHandlingRecord {
  readonly triggered: boolean
  readonly verificationReplayInvoked: boolean
  readonly explanation?: string
}

export interface LapicProviderEvidenceReference {
  readonly providerKind: string
  readonly providerDigest: LapicDigest
  readonly deterministicProfileId: string
}

export interface LapicEvidenceBundleManifest {
  readonly evidenceDigests: readonly LapicEvidenceDigestReference[]
  readonly thresholdSnapshotDigest: LapicDigest
  readonly providerEvidence: readonly LapicProviderEvidenceReference[]
}

export type LapicReplayMode = 'single-certificate' | 'block-level' | 'full-solve'
export type LapicReplayVerdict = 'matched' | 'mismatched' | 'inconclusive'

export interface LapicReplayEnvironmentDescriptor {
  readonly engineVersion: string
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
  readonly providerProfileId?: string
}

export interface LapicReplayRequest {
  readonly mode: LapicReplayMode
  readonly certificateIds?: readonly string[]
  readonly blockIds?: readonly LapicBlockId[]
  readonly problemId: LapicProblemId
  readonly environment: LapicReplayEnvironmentDescriptor
}

export interface LapicReplayMismatch {
  readonly reason: string
  readonly expectedDigest?: LapicDigest
  readonly actualDigest?: LapicDigest
}

export interface LapicReplayResult {
  readonly reproducedVerdict: LapicReplayVerdict
  readonly validationOutcome: LapicCertificateValidationStatus
  readonly arithmeticModeUsed: string
  readonly mismatchExplanation?: LapicReplayMismatch
  readonly referencedEvidenceDigests: readonly LapicDigest[]
  readonly referencedUpgradeFrontierDigests?: readonly LapicDigest[]
  readonly providerPathUsed?: string
  readonly exactReplayInvoked: boolean
}

export interface LapicProviderEvidenceDescriptor {
  readonly providerKind: string
  readonly evidenceDigest: LapicDigest
  readonly payloadEncoding: string
}

export interface LapicDeterministicProfileDescriptor {
  readonly providerKind: string
  readonly profileId: string
  readonly configDigest: LapicDigest
}

export interface LapicProviderReplayEligibility {
  readonly eligible: boolean
  readonly reason?: string
}

export interface LapicCertificateSummary {
  readonly certId: string
  readonly certKind: LapicCertificateKind
  readonly decisionClass: LapicCertificateDecisionClass
  readonly validationStatus: LapicCertificateValidationStatus
  readonly emittedAtStep: number
  readonly evidenceDigest: LapicDigest
  readonly referencedStateCount: number
  readonly referencedBlockCount: number
  readonly referencedRegionCount: number
  readonly referencedRelaxCount: number
  readonly thresholdDigest?: LapicDigest
  readonly potentialParticipationMode?: LapicPotentialParticipationMode
}

export interface LapicThresholdSensitiveDecisionCounters {
  readonly thresholdSensitiveCertificateIds: readonly string[]
  readonly exactReplayRequiredCount: number
  readonly dangerZoneDetectedCount: number
}

export interface LapicCertificateReplayCoverageSummary {
  readonly replayedCertificateIds: readonly string[]
  readonly missingCertificateIds: readonly string[]
  readonly matchedReplayCount: number
  readonly mismatchedReplayCount: number
  readonly inconclusiveReplayCount: number
}

export interface LapicReplayMismatchSummary {
  readonly mismatchCount: number
  readonly reasons: readonly string[]
  readonly referencedEvidenceDigests: readonly LapicDigest[]
}

export interface LapicFinalOptimalityRollup {
  readonly winnerStateId: LapicStateId
  readonly certIds: readonly string[]
  readonly winnerEvidenceDigests: readonly LapicDigest[]
  readonly thresholdDigests: readonly LapicDigest[]
}

export type LapicCertificateValidator = (
  certificate: LapicCertificate
) => LapicValidationResult<LapicCertificate>

export function validateLapicPotentialDecisionBasis(
  decisionBasis: LapicPotentialDecisionBasis
): LapicValidationResult<LapicPotentialDecisionBasis> {
  const diagnostics: LapicDiagnostic[] = []

  if (!decisionBasis.solveMode)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'solveMode must not be empty.',
        ['solveMode']
      )
    )

  if (!decisionBasis.participationMode)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'participationMode must not be empty.',
        ['participationMode']
      )
    )

  if (
    (decisionBasis.envelopeDigest && !decisionBasis.envelopeKind) ||
    (!decisionBasis.envelopeDigest && decisionBasis.envelopeKind)
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'envelopeDigest and envelopeKind must either both be present or both be omitted.',
        ['envelopeDigest']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(decisionBasis)
}

export function validateLapicBranchReachabilityPayload(
  payload: LapicBranchReachabilityPayload
): LapicValidationResult<LapicBranchReachabilityPayload> {
  const diagnostics: LapicDiagnostic[] = []

  if (!payload.branchPredicateDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'branchPredicateDigest must not be empty.',
        ['branchPredicateDigest']
      )
    )

  if (!payload.validityRegionId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'validityRegionId must not be empty.',
        ['validityRegionId']
      )
    )

  if (!payload.exactBoundsDigest && !payload.contradictionWitnessDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'BranchReachability payload requires exactBoundsDigest or contradictionWitnessDigest.',
        ['contradictionWitnessDigest']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(payload)
}

export function validateLapicInfeasibilityPayload(
  payload: LapicInfeasibilityPayload
): LapicValidationResult<LapicInfeasibilityPayload> {
  const diagnostics: LapicDiagnostic[] = []

  if (!payload.witnessDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'witnessDigest must not be empty.',
        ['witnessDigest']
      )
    )

  if (!payload.replayPathRequirement)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'replayPathRequirement must not be empty.',
        ['replayPathRequirement']
      )
    )

  if (
    !payload.affectedStateIds?.length &&
    !payload.affectedBlockIds?.length
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'Infeasibility payload must name affectedStateIds or affectedBlockIds.',
        ['affectedStateIds']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(payload)
}

export function validateLapicBoundPrunePayload(
  payload: LapicBoundPrunePayload
): LapicValidationResult<LapicBoundPrunePayload> {
  const diagnostics: LapicDiagnostic[] = []

  if (!payload.thresholdDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'thresholdDigest must not be empty.',
        ['thresholdDigest']
      )
    )

  if (!payload.boundValue)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'boundValue must not be empty.',
        ['boundValue']
      )
    )

  if (!payload.validityRegionId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'validityRegionId must not be empty.',
        ['validityRegionId']
      )
    )

  if (!payload.numericDiagnosticsDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'numericDiagnosticsDigest must not be empty.',
        ['numericDiagnosticsDigest']
      )
    )

  if (
    payload.potentialDecisionBasis &&
    !validateLapicPotentialDecisionBasis(payload.potentialDecisionBasis).ok
  )
    diagnostics.push(
      ...validateLapicPotentialDecisionBasis(payload.potentialDecisionBasis)
        .diagnostics
    )

  if (
    payload.dangerZoneRecord.triggered &&
    !payload.dangerZoneRecord.explanation
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'dangerZoneRecord.explanation must be provided when triggered is true.',
        ['dangerZoneRecord', 'explanation']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(payload)
}

export function validateLapicDominancePayload(
  payload: LapicDominancePayload
): LapicValidationResult<LapicDominancePayload> {
  const diagnostics: LapicDiagnostic[] = []

  ;[
    ['dominatingStateId', payload.dominatingStateId],
    ['dominatedStateId', payload.dominatedStateId],
    ['comparisonDigest', payload.comparisonDigest],
    ['exactSignatureGroupKeyDigest', payload.exactSignatureGroupKeyDigest],
    ['compatibilityInclusionDigest', payload.compatibilityInclusionDigest],
    ['monotoneProjectionDigest', payload.monotoneProjectionDigest],
    ['upperBoundProfileDigest', payload.upperBoundProfileDigest],
    ['strengthComparisonDigest', payload.strengthComparisonDigest],
  ].forEach(([fieldName, value]) => {
    if (!value)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          `${fieldName} must not be empty.`,
          [fieldName]
        )
      )
  })

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(payload)
}

export function validateLapicFinalOptimalityPayload(
  payload: LapicFinalOptimalityPayload
): LapicValidationResult<LapicFinalOptimalityPayload> {
  const diagnostics: LapicDiagnostic[] = []

  ;[
    ['winningStateId', payload.winningStateId],
    ['optimalityGap', payload.optimalityGap],
    ['finalThresholdDigest', payload.finalThresholdDigest],
    ['finalIncumbentSetDigest', payload.finalIncumbentSetDigest],
    ['queueExhaustionSummaryDigest', payload.queueExhaustionSummaryDigest],
    ['thresholdPruneSummaryDigest', payload.thresholdPruneSummaryDigest],
    ['escalatedReplaySummaryDigest', payload.escalatedReplaySummaryDigest],
    ['stableOrderCompletenessDigest', payload.stableOrderCompletenessDigest],
  ].forEach(([fieldName, value]) => {
    if (!value)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          `${fieldName} must not be empty.`,
          [fieldName]
        )
      )
  })

  if (
    payload.potentialDecisionBasis &&
    !payload.rankingParticipationMode
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'rankingParticipationMode must be present when potentialDecisionBasis is present.',
        ['rankingParticipationMode']
      )
    )

  if (
    payload.potentialDecisionBasis &&
    payload.rankingParticipationMode &&
    payload.potentialDecisionBasis.participationMode !==
      payload.rankingParticipationMode
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'rankingParticipationMode must match potentialDecisionBasis.participationMode.',
        ['rankingParticipationMode']
      )
    )

  if (
    payload.potentialDecisionBasis &&
    !validateLapicPotentialDecisionBasis(payload.potentialDecisionBasis).ok
  )
    diagnostics.push(
      ...validateLapicPotentialDecisionBasis(payload.potentialDecisionBasis)
        .diagnostics
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(payload)
}

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

export function validateLapicEvidenceBundleManifest(
  manifest: LapicEvidenceBundleManifest
): LapicValidationResult<LapicEvidenceBundleManifest> {
  const diagnostics: LapicDiagnostic[] = []

  if (!manifest.evidenceDigests.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'evidenceDigests must not be empty.',
        ['evidenceDigests']
      )
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
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'engineVersion must not be empty.',
        ['engineVersion']
      )
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
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'problemId must not be empty.',
        ['problemId']
      )
    )

  const environmentValidation = validateLapicReplayEnvironmentDescriptor(
    request.environment
  )
  if (!environmentValidation.ok)
    diagnostics.push(...environmentValidation.diagnostics)

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

function isDecisionClassCompatible(
  certKind: LapicCertificateKind,
  decisionClass: LapicCertificateDecisionClass
): boolean {
  switch (certKind) {
    case 'BranchReachabilityCert':
      return decisionClass === 'exact-prune'
    case 'InfeasibilityCert':
      return (
        decisionClass === 'exact-prune' ||
        decisionClass === 'relaxation-prune'
      )
    case 'BoundPruneCert':
      return (
        decisionClass === 'exact-prune' ||
        decisionClass === 'relaxation-prune'
      )
    case 'DominanceCert':
      return decisionClass === 'dominance-prune'
    case 'FinalOptimalityCert':
      return decisionClass === 'optimality-proof'
  }
}

export function validateLapicCertificate(
  certificate: LapicCertificate
): LapicValidationResult<LapicCertificate> {
  const diagnostics: LapicDiagnostic[] = []

  if (!certificate.certId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'certId must not be empty.',
        ['certId']
      )
    )

  if (!certificate.problemId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'problemId must not be empty.',
        ['problemId']
      )
    )

  if (!certificate.arithmeticPolicyId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'arithmeticPolicyId must not be empty.',
        ['arithmeticPolicyId']
      )
    )

  if (!certificate.evidenceDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'evidenceDigest must not be empty.',
        ['evidenceDigest']
      )
    )

  if (!isDecisionClassCompatible(certificate.certKind, certificate.decisionClass))
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'decisionClass is incompatible with certKind.',
        ['decisionClass'],
        {
          certKind: certificate.certKind,
          decisionClass: certificate.decisionClass,
        }
      )
    )

  const replayRecipeValidation = validateLapicReplayRecipe(certificate.replayRecipe)
  if (!replayRecipeValidation.ok)
    diagnostics.push(...replayRecipeValidation.diagnostics)

  switch (certificate.certKind) {
    case 'BranchReachabilityCert':
      if (!('selectedArm' in certificate.payload))
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'BranchReachabilityCert payload shape is invalid.',
            ['payload']
          )
        )
      else {
        const payloadValidation = validateLapicBranchReachabilityPayload(
          certificate.payload
        )
        if (!payloadValidation.ok)
          diagnostics.push(...payloadValidation.diagnostics)
      }
      break
    case 'InfeasibilityCert':
      if (!('witnessDigest' in certificate.payload))
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'InfeasibilityCert payload shape is invalid.',
            ['payload']
          )
        )
      else {
        const payloadValidation = validateLapicInfeasibilityPayload(
          certificate.payload
        )
        if (!payloadValidation.ok)
          diagnostics.push(...payloadValidation.diagnostics)
      }
      break
    case 'BoundPruneCert':
      if (!('thresholdDigest' in certificate.payload))
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'BoundPruneCert payload shape is invalid.',
            ['payload']
          )
        )
      else {
        const payloadValidation = validateLapicBoundPrunePayload(
          certificate.payload
        )
        if (!payloadValidation.ok)
          diagnostics.push(...payloadValidation.diagnostics)
      }
      break
    case 'DominanceCert':
      if (!('dominatingStateId' in certificate.payload))
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'DominanceCert payload shape is invalid.',
            ['payload']
          )
        )
      else {
        const payloadValidation = validateLapicDominancePayload(
          certificate.payload
        )
        if (!payloadValidation.ok)
          diagnostics.push(...payloadValidation.diagnostics)
      }
      break
    case 'FinalOptimalityCert':
      if (!('winningStateId' in certificate.payload))
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'FinalOptimalityCert payload shape is invalid.',
            ['payload']
          )
        )
      else {
        const payloadValidation = validateLapicFinalOptimalityPayload(
          certificate.payload
        )
        if (!payloadValidation.ok)
          diagnostics.push(...payloadValidation.diagnostics)
      }
      break
  }

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(certificate)
}

export function createLapicCertificateSummary(
  certificate: LapicCertificate
): LapicValidationResult<LapicCertificateSummary> {
  const validation = validateLapicCertificate(certificate)
  if (!validation.ok) return validation

  let thresholdDigest: LapicDigest | undefined
  let potentialParticipationMode: LapicPotentialParticipationMode | undefined

  if (certificate.certKind === 'BoundPruneCert') {
    thresholdDigest = certificate.payload.thresholdDigest
    potentialParticipationMode =
      certificate.payload.potentialDecisionBasis?.participationMode
  }

  if (certificate.certKind === 'FinalOptimalityCert') {
    thresholdDigest = certificate.payload.finalThresholdDigest
    potentialParticipationMode = certificate.payload.rankingParticipationMode
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
    thresholdDigest,
    potentialParticipationMode,
  })
}

function createLapicThresholdSensitiveDecisionMetadataFromCertificate(
  certificate: LapicCertificate
): LapicValidationResult<LapicThresholdSensitiveDecisionMetadata | null> {
  switch (certificate.certKind) {
    case 'BoundPruneCert':
      return createLapicThresholdSensitiveDecisionMetadata(
        certificate.payload.thresholdDigest,
        certificate.replayRecipe.arithmeticMode === 'exact',
        certificate.payload.dangerZoneRecord.triggered
      )
    case 'FinalOptimalityCert':
      return createLapicThresholdSensitiveDecisionMetadata(
        certificate.payload.finalThresholdDigest,
        certificate.replayRecipe.arithmeticMode === 'exact',
        false
      )
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

export function createLapicReplayCoverageSummary(
  certificates: readonly LapicCertificate[],
  replayResultsByCertificateId: Readonly<
    Record<string, LapicReplayResult | undefined>
  >
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

export interface LapicCertSkeletonMarker {
  readonly packageName: typeof lapicCertPackageName
  readonly schemaVersion: LapicCertSchemaVersion
}

export const lapicCertSkeleton: LapicCertSkeletonMarker = {
  packageName: lapicCertPackageName,
  schemaVersion: lapicCertSchemaVersion,
}
