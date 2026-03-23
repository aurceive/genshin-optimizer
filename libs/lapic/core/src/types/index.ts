import type {
  LapicActorId,
  LapicArithmeticPolicyId,
  LapicCandidateId,
  LapicCapabilityId,
  LapicConstraintId,
  LapicCounterId,
  LapicDigest,
  LapicDigestSet,
  LapicDomainId,
  LapicEngineVersion,
  LapicFrameId,
  LapicMetadataKey,
  LapicObjectiveId,
  LapicProblemDigest,
  LapicProblemId,
  LapicResourceId,
  LapicSlotId,
  LapicStateId,
} from '../identity'
import type { LapicCompatibilitySignatureSchemaVersion } from '../schema'
export type LapicPotentialSolveMode =
  | 'current-only'
  | 'current-plus-governed-bonus'
  | 'potential-aware-rerank'
  | 'full-potential-aware-exact'
export type LapicPotentialParticipationMode =
  | 'auxiliary-only'
  | 'governed-bonus'
  | 'rerank'
  | 'full-ranking'
export type LapicPotentialDescriptorKind =
  | 'explicit-frontier'
  | 'exact-combinatorial'
  | 'certified-upper-envelope'
  | 'bounded-hybrid'
export type LapicPotentialExactnessPolicy =
  | 'exact-only'
  | 'certified-envelope-allowed'
export type LapicGraphOutputExactness =
  | 'exact'
  | 'upper-envelope'
  | 'lower-envelope'
  | 'mixed'

export type LapicDiagnosticSeverity = 'error' | 'warning' | 'info'
export type LapicErrorCode =
  | 'SchemaViolation'
  | 'NormalizationFailure'
  | 'UnsupportedOperator'
  | 'InvariantViolation'
  | 'DeterminismViolation'
  | 'InternalBugDetected'

export interface LapicDiagnostic {
  readonly severity: LapicDiagnosticSeverity
  readonly code: LapicErrorCode | string
  readonly message: string
  readonly path?: readonly string[]
  readonly details?: Readonly<Record<string, string | number | boolean | null>>
}

export interface LapicSuccess<T> {
  readonly ok: true
  readonly value: T
  readonly diagnostics: readonly LapicDiagnostic[]
}

export interface LapicFailure {
  readonly ok: false
  readonly diagnostics: readonly LapicDiagnostic[]
}

export type LapicValidationResult<T> = LapicSuccess<T> | LapicFailure

export type LapicSlotParticipationMode =
  | 'optimizedBuild'
  | 'optimizedOccupantAndBuild'
  | 'fixedBuild'
  | 'externalSummary'

export type LapicSlotRequirement = 'required' | 'optional' | 'fixed-external'
export type LapicSlotOrderSemantics = 'semantic' | 'canonical-only'
export type LapicFrameAxisKind = 'none' | 'implicit-single' | 'explicit'
export type LapicEquipmentOwnershipModel =
  | 'none'
  | 'hard-reserved-inventory'
  | 'summary-reserved'
  | 'non-reserving-summary'
export type LapicResourceReservationClass =
  | 'hardReserved'
  | 'summaryReserved'
  | 'nonReserving'

export interface LapicTeamLayoutDescriptor {
  readonly teamKind: string
  readonly slotCount: number
  readonly slotIds: readonly LapicSlotId[]
  readonly slotRoleTaxonomy: readonly string[]
  readonly slotRequirements: Readonly<Record<LapicSlotId, LapicSlotRequirement>>
  readonly slotOrderSemantics: LapicSlotOrderSemantics
  readonly frameAxisKind: LapicFrameAxisKind
}

export interface LapicSlotDescriptor {
  readonly slotId: LapicSlotId
  readonly slotRole: string
  readonly participationMode: LapicSlotParticipationMode
  readonly occupantDomainId: LapicDomainId
  readonly equipmentOwnershipModel: LapicEquipmentOwnershipModel
  readonly contributesToObjective: boolean
  readonly contributesToConstraints: boolean
  readonly mayRemainEmpty: boolean
}

export interface LapicSharedTeamContext {
  readonly adapterSemanticMode: string
  readonly environmentDigest?: LapicDigest
  readonly sharedConditionalsDigest?: LapicDigest
  readonly aggregateFacts: Readonly<Record<string, string | number | boolean>>
  readonly metadata: Readonly<Record<LapicMetadataKey, string>>
}

export interface LapicFrameDescriptor {
  readonly frameId: LapicFrameId
  readonly order: number
  readonly semanticTags: readonly string[]
  readonly weight?: string
  readonly conditionalDigests: readonly LapicDigest[]
  readonly bonusDigests: readonly LapicDigest[]
  readonly constraintDigests: readonly LapicDigest[]
}

export type LapicInteractionScope =
  | 'self-only'
  | 'specific-target-slot'
  | 'all-occupied-slots'
  | 'all-occupied-slots-except-source'
  | 'team-aggregate'
  | 'enemy-or-environment-aggregate'

export interface LapicCapabilityFact {
  readonly capabilityId: LapicCapabilityId
  readonly scope: LapicInteractionScope
  readonly targetSlotId?: LapicSlotId
  readonly value: string | number | boolean
}

export interface LapicAggregateCountFact {
  readonly counterId: LapicCounterId
  readonly value: number
}

export interface LapicAggregateObligation {
  readonly counterId: LapicCounterId
  readonly minimumRequired: number
}

export interface LapicResourceClaim {
  readonly resourceKind: string
  readonly resourceId: LapicResourceId
  readonly claimedBySlotId: LapicSlotId
  readonly reservationClass: LapicResourceReservationClass
}

export interface LapicActorUniquenessClaim {
  readonly actorId: LapicActorId
  readonly family: string
  readonly claimedBySlotId: LapicSlotId
}

export interface LapicCompatibilityToggle {
  readonly toggleId: string
  readonly enabled: boolean
}

export interface LapicFrameAxisIdentity {
  readonly axisKind: LapicFrameAxisKind
  readonly frameIds: readonly LapicFrameId[]
}

export interface LapicCompatibilitySignature {
  readonly schemaVersion: LapicCompatibilitySignatureSchemaVersion
  readonly occupiedSlotMask: number
  readonly actorUniquenessClaims: readonly LapicActorUniquenessClaim[]
  readonly exclusiveResourceClaims: readonly LapicResourceClaim[]
  readonly aggregateCounts: readonly LapicAggregateCountFact[]
  readonly remainingAggregateObligations: readonly LapicAggregateObligation[]
  readonly providedCapabilityFacts: readonly LapicCapabilityFact[]
  readonly remainingRequiredCapabilityFacts: readonly LapicCapabilityFact[]
  readonly branchCompatibilityToggles: readonly LapicCompatibilityToggle[]
  readonly frameAxisIdentity: LapicFrameAxisIdentity
  readonly adapterSemanticMode: string
}

export interface LapicExactSignatureGroupKey {
  readonly occupiedSlotMask: number
  readonly actorIds: readonly LapicActorId[]
  readonly exclusiveResourceKeys: readonly string[]
  readonly frameAxisIdentityDigest: LapicDigest
  readonly adapterSemanticMode: string
  readonly discreteTeamModeKey?: string
}

export interface LapicSlotCandidateProvenance {
  readonly slotId: LapicSlotId
  readonly sourceEntityId: string
  readonly sourceRecordDigests: readonly LapicDigest[]
  readonly buildVariantId?: string
  readonly exclusiveResourceClaims: readonly LapicResourceClaim[]
  readonly concreteInventoryBacked: boolean
  readonly featureExtractionDigest: LapicDigest
}

export interface LapicTeamProvenance {
  readonly teamLayoutDigest: LapicDigest
  readonly sharedTeamContextDigest: LapicDigest
  readonly frameAxisDigest?: LapicDigest
  readonly crossSlotRuleDescriptorVersion: string
  readonly compatibilitySignatureSchemaVersion: LapicCompatibilitySignatureSchemaVersion
  readonly slotProvenance: readonly LapicSlotCandidateProvenance[]
}

export type LapicObjectiveKind =
  | 'single-slot'
  | 'weighted-aggregate'
  | 'frame-weighted'
  | 'lexicographic-tuple'

export interface LapicCanonicalObjective {
  readonly objectiveId: LapicObjectiveId
  readonly objectiveKind: LapicObjectiveKind
  readonly expressionDigest: LapicDigest
  readonly targetSlotIds: readonly LapicSlotId[]
  readonly frameIds: readonly LapicFrameId[]
}

export interface LapicCanonicalConstraint {
  readonly constraintId: LapicConstraintId
  readonly kind: string
  readonly expressionDigest: LapicDigest
  readonly hard: boolean
}

export interface LapicOrderingPolicy {
  readonly tieBreakDimensions: readonly string[]
  readonly canonicalCandidateOrdering: readonly string[]
  readonly potentialParticipationMode?: LapicPotentialParticipationMode
  readonly potentialTieBreakDimensions?: readonly string[]
}

export interface LapicAuxiliaryOutputDescriptor {
  readonly kind: string
  readonly payloadDigest: LapicDigest
  readonly participatesInOrdering?: boolean
}

export interface LapicGraphAuxiliaryOutputDescriptor
  extends LapicAuxiliaryOutputDescriptor {
  readonly xAxisKind: string
  readonly yAxisKind: string
  readonly graphExactness: LapicGraphOutputExactness
}

export interface LapicUpgradeFrontierDescriptor {
  readonly frontierDigest: LapicDigest
  readonly descriptorKind: LapicPotentialDescriptorKind
  readonly legalityConstraintDigests: readonly LapicDigest[]
  readonly orderingRelevant: boolean
  readonly hiddenStateDigest?: LapicDigest
}

export interface LapicPotentialSummaryDescriptor {
  readonly summaryKind: string
  readonly summaryDigest: LapicDigest
  readonly orderingRelevant: boolean
}

export interface LapicPotentialConfiguration {
  readonly solveMode: LapicPotentialSolveMode
  readonly participationMode: LapicPotentialParticipationMode
  readonly exactnessPolicy: LapicPotentialExactnessPolicy
  readonly upgradeFrontiers: readonly LapicUpgradeFrontierDescriptor[]
  readonly rankingSummaryKinds: readonly string[]
  readonly graphOutputKinds: readonly string[]
}

export interface LapicAdapterMetadata {
  readonly adapterKind: string
  readonly adapterVersion: string
  readonly sourceSnapshotDigests: LapicDigestSet
  readonly supportedPotentialSolveModes?: readonly LapicPotentialSolveMode[]
  readonly declaredUnsupportedFeatures: readonly string[]
  readonly metadata: Readonly<Record<LapicMetadataKey, string>>
}

export interface LapicCandidateDescriptor {
  readonly candidateId: LapicCandidateId
  readonly sourceRecordDigest: LapicDigest
  readonly domainId: LapicDomainId
  readonly slotId: LapicSlotId
  readonly additiveFeatureDigest: LapicDigest
  readonly discreteCounters: readonly LapicAggregateCountFact[]
  readonly categoricalSignatureDigest: LapicDigest
  readonly potentialFrontier?: LapicUpgradeFrontierDescriptor
  readonly potentialSummaries?: readonly LapicPotentialSummaryDescriptor[]
  readonly provenance: LapicSlotCandidateProvenance
}

export interface LapicCandidateDomain {
  readonly domainId: LapicDomainId
  readonly slotId: LapicSlotId
  readonly candidates: readonly LapicCandidateDescriptor[]
}

export interface LapicCompatibilityRule {
  readonly ruleId: string
  readonly description: string
  readonly signatureDigest: LapicDigest
}

export interface LapicCanonicalProblem {
  readonly problemId: LapicProblemId
  readonly problemDigest: LapicProblemDigest
  readonly engineVersion: LapicEngineVersion
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
  readonly teamLayout: LapicTeamLayoutDescriptor
  readonly slotDescriptors: readonly LapicSlotDescriptor[]
  readonly sharedTeamContext: LapicSharedTeamContext
  readonly frameAxis: readonly LapicFrameDescriptor[]
  readonly itemDomains: readonly LapicCandidateDomain[]
  readonly compatibilityRules: readonly LapicCompatibilityRule[]
  readonly objective: LapicCanonicalObjective
  readonly constraints: readonly LapicCanonicalConstraint[]
  readonly topN: number
  readonly orderingPolicy: LapicOrderingPolicy
  readonly potentialConfiguration?: LapicPotentialConfiguration
  readonly auxiliaryOutputs: readonly LapicAuxiliaryOutputDescriptor[]
  readonly adapterMetadata: LapicAdapterMetadata
  readonly provenance: LapicTeamProvenance
}

export interface LapicProblemNormalizationInput {
  readonly teamLayout: LapicTeamLayoutDescriptor
  readonly slotDescriptors: readonly LapicSlotDescriptor[]
  readonly sharedTeamContext: LapicSharedTeamContext
  readonly frameAxis?: readonly LapicFrameDescriptor[]
  readonly itemDomains: readonly LapicCandidateDomain[]
  readonly compatibilityRules: readonly LapicCompatibilityRule[]
  readonly objective: LapicCanonicalObjective
  readonly constraints: readonly LapicCanonicalConstraint[]
  readonly topN: number
  readonly orderingPolicy: LapicOrderingPolicy
  readonly potentialConfiguration?: LapicPotentialConfiguration
  readonly auxiliaryOutputs?: readonly LapicAuxiliaryOutputDescriptor[]
  readonly adapterMetadata: LapicAdapterMetadata
  readonly provenance: LapicTeamProvenance
}

export interface LapicStateLayoutDescriptor {
  readonly layoutId: string
  readonly teamLayoutDigest: LapicDigest
  readonly slotIds: readonly LapicSlotId[]
  readonly frameAxisIdentity: LapicFrameAxisIdentity
  readonly dominanceProjectionIds: readonly string[]
  readonly stateOrderDigest?: LapicDigest
}

export interface LapicDominanceProjection {
  readonly projectionId: string
  readonly vectorDigest: LapicDigest
}

export interface LapicSirState {
  readonly stateId: LapicStateId
  readonly layout: LapicStateLayoutDescriptor
  readonly exactSignatureGroupKey: LapicExactSignatureGroupKey
  readonly compatibilitySignature: LapicCompatibilitySignature
  readonly dominanceProjection: LapicDominanceProjection
  readonly potentialOrderingDigest?: LapicDigest
  readonly potentialSummaryDigests?: readonly LapicDigest[]
  readonly provenance: LapicTeamProvenance
}

export interface LapicCanonicalProblemIdentity {
  readonly problemId: LapicProblemId
  readonly problemDigest: LapicProblemDigest
  readonly engineVersion: LapicEngineVersion
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
}

export interface LapicExactSignatureGroupKeyDerivationInput {
  readonly compatibilitySignature: LapicCompatibilitySignature
  readonly frameAxisIdentityDigest: LapicDigest
  readonly discreteTeamModeKey?: string
}
