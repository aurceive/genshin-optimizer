import type {
  LapicArithmeticPolicyId,
  LapicBlockId,
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
  readonly contradictionWitnessDigest?: LapicDigest
  readonly selectedArm: 'left' | 'right'
  readonly validityRegionId: LapicRegionId
}

export interface LapicInfeasibilityPayload {
  readonly infeasibleConstraintDigests: readonly LapicDigest[]
  readonly witnessDigest: LapicDigest
}

export interface LapicBoundPrunePayload {
  readonly thresholdDigest: LapicDigest
  readonly boundSourceClass: LapicEvidenceSourceClass
  readonly boundValue: string
  readonly potentialDecisionBasis?: LapicPotentialDecisionBasis
  readonly dangerZoneRecord?: LapicDangerZoneHandlingRecord
}

export interface LapicDominancePayload {
  readonly dominatingStateId: LapicStateId
  readonly dominatedStateId: LapicStateId
  readonly comparisonDigest: LapicDigest
  readonly potentialComparisonDigest?: LapicDigest
}

export interface LapicFinalOptimalityPayload {
  readonly winningStateId: LapicStateId
  readonly optimalityGap: string
  readonly finalThresholdDigest: LapicDigest
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

export type LapicCertificateValidator = (
  certificate: LapicCertificate
) => LapicValidationResult<LapicCertificate>

export interface LapicCertSkeletonMarker {
  readonly packageName: typeof lapicCertPackageName
  readonly schemaVersion: LapicCertSchemaVersion
}

export const lapicCertSkeleton: LapicCertSkeletonMarker = {
  packageName: lapicCertPackageName,
  schemaVersion: lapicCertSchemaVersion,
}
