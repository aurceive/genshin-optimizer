export const lapicCorePackageName = 'lapic-core'
export const lapicCoreSchemaVersion = '0.1.0-draft'
export const lapicCompatibilitySignatureSchemaVersion = '0.1.0-draft'

export type LapicSchemaVersion = typeof lapicCoreSchemaVersion
export type LapicCompatibilitySignatureSchemaVersion =
  typeof lapicCompatibilitySignatureSchemaVersion
export type LapicDigest = string
export type LapicProblemId = string
export type LapicProblemDigest = string
export type LapicStateId = string
export type LapicRegionId = string
export type LapicBlockId = string
export type LapicRelaxId = string
export type LapicArithmeticPolicyId = string
export type LapicEngineVersion = string
export type LapicLogicalTimestamp = string
export type LapicContentHash = string
export type LapicCanonicalByteDigest = string
export type LapicSlotId = string
export type LapicFrameId = string
export type LapicCandidateId = string
export type LapicDomainId = string
export type LapicObjectiveId = string
export type LapicConstraintId = string
export type LapicActorId = string
export type LapicResourceId = string
export type LapicCapabilityId = string
export type LapicCounterId = string
export type LapicMetadataKey = string
export type LapicDigestSet = readonly LapicDigest[]
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

export type LapicDeterministicOrderingRelation = -1 | 0 | 1

export function createLapicDiagnostic(
  severity: LapicDiagnosticSeverity,
  code: LapicErrorCode | string,
  message: string,
  path?: readonly string[],
  details?: Readonly<Record<string, string | number | boolean | null>>
): LapicDiagnostic {
  return {
    severity,
    code,
    message,
    path,
    details,
  }
}

export function createLapicSuccessResult<T>(
  value: T,
  diagnostics: readonly LapicDiagnostic[] = []
): LapicSuccess<T> {
  return {
    ok: true,
    value,
    diagnostics,
  }
}

export function createLapicFailureResult(
  diagnostics: readonly LapicDiagnostic[]
): LapicFailure {
  return {
    ok: false,
    diagnostics,
  }
}

export function createLapicCanonicalProblem(
  normalizationInput: LapicProblemNormalizationInput,
  identity: LapicCanonicalProblemIdentity
): LapicCanonicalProblem {
  return {
    problemId: identity.problemId,
    problemDigest: identity.problemDigest,
    engineVersion: identity.engineVersion,
    arithmeticPolicyId: identity.arithmeticPolicyId,
    teamLayout: normalizationInput.teamLayout,
    slotDescriptors: normalizationInput.slotDescriptors,
    sharedTeamContext: normalizationInput.sharedTeamContext,
    frameAxis: normalizationInput.frameAxis ?? [],
    itemDomains: normalizationInput.itemDomains,
    compatibilityRules: normalizationInput.compatibilityRules,
    objective: normalizationInput.objective,
    constraints: normalizationInput.constraints,
    topN: normalizationInput.topN,
    orderingPolicy: normalizationInput.orderingPolicy,
    potentialConfiguration: normalizationInput.potentialConfiguration,
    auxiliaryOutputs: normalizationInput.auxiliaryOutputs ?? [],
    adapterMetadata: normalizationInput.adapterMetadata,
    provenance: normalizationInput.provenance,
  }
}

export function createLapicStateLayoutDescriptor(
  layout: LapicStateLayoutDescriptor
): LapicStateLayoutDescriptor {
  return layout
}

export function createLapicCompatibilitySignature(
  signature: Omit<LapicCompatibilitySignature, 'schemaVersion'> & {
    readonly schemaVersion?: LapicCompatibilitySignatureSchemaVersion
  }
): LapicCompatibilitySignature {
  return {
    schemaVersion:
      signature.schemaVersion ?? lapicCompatibilitySignatureSchemaVersion,
    occupiedSlotMask: signature.occupiedSlotMask,
    actorUniquenessClaims: signature.actorUniquenessClaims,
    exclusiveResourceClaims: signature.exclusiveResourceClaims,
    aggregateCounts: signature.aggregateCounts,
    remainingAggregateObligations: signature.remainingAggregateObligations,
    providedCapabilityFacts: signature.providedCapabilityFacts,
    remainingRequiredCapabilityFacts: signature.remainingRequiredCapabilityFacts,
    branchCompatibilityToggles: signature.branchCompatibilityToggles,
    frameAxisIdentity: signature.frameAxisIdentity,
    adapterSemanticMode: signature.adapterSemanticMode,
  }
}

export function createLapicExactSignatureGroupKey(
  key: LapicExactSignatureGroupKey
): LapicExactSignatureGroupKey {
  return key
}

function createLapicActorUniquenessClaimOrderingKey(
  claim: LapicActorUniquenessClaim
): string {
  return [claim.family, claim.actorId, claim.claimedBySlotId].join('|')
}

function createLapicResourceClaimOrderingKey(claim: LapicResourceClaim): string {
  return [
    claim.reservationClass,
    claim.resourceKind,
    claim.resourceId,
    claim.claimedBySlotId,
  ].join('|')
}

function compareLapicStringArrays(
  left: readonly string[],
  right: readonly string[]
): LapicDeterministicOrderingRelation {
  const sharedLength = Math.min(left.length, right.length)

  for (let index = 0; index < sharedLength; index += 1) {
    if (left[index]! < right[index]!) return -1
    if (left[index]! > right[index]!) return 1
  }

  if (left.length < right.length) return -1
  if (left.length > right.length) return 1

  return 0
}

export function createLapicExactSignatureGroupKeyFromCompatibilitySignature(
  derivationInput: LapicExactSignatureGroupKeyDerivationInput
): LapicValidationResult<LapicExactSignatureGroupKey> {
  const compatibilityValidation = validateLapicCompatibilitySignature(
    derivationInput.compatibilitySignature
  )
  if (!compatibilityValidation.ok) return compatibilityValidation

  if (!derivationInput.frameAxisIdentityDigest)
    return createLapicFailureResult([
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'frameAxisIdentityDigest must not be empty.',
        ['frameAxisIdentityDigest']
      ),
    ])

  const actorIds = derivationInput.compatibilitySignature.actorUniquenessClaims
    .map((claim) => claim.actorId)
    .sort()
  const exclusiveResourceKeys =
    derivationInput.compatibilitySignature.exclusiveResourceClaims
      .map(createLapicResourceClaimOrderingKey)
      .sort()

  return createLapicSuccessResult({
    occupiedSlotMask: derivationInput.compatibilitySignature.occupiedSlotMask,
    actorIds,
    exclusiveResourceKeys,
    frameAxisIdentityDigest: derivationInput.frameAxisIdentityDigest,
    adapterSemanticMode:
      derivationInput.compatibilitySignature.adapterSemanticMode,
    discreteTeamModeKey: derivationInput.discreteTeamModeKey,
  })
}

export function createLapicExactSignatureGroupOrderingKey(
  key: LapicExactSignatureGroupKey
): LapicValidationResult<readonly string[]> {
  const validation = validateLapicExactSignatureGroupKey(key)
  if (!validation.ok) return validation

  return createLapicSuccessResult([
    String(key.occupiedSlotMask),
    key.adapterSemanticMode,
    key.frameAxisIdentityDigest,
    key.discreteTeamModeKey ?? '',
    ...key.actorIds,
    ...key.exclusiveResourceKeys,
  ])
}

export function compareLapicExactSignatureGroupKeys(
  left: LapicExactSignatureGroupKey,
  right: LapicExactSignatureGroupKey
): LapicValidationResult<LapicDeterministicOrderingRelation> {
  const leftOrderingKey = createLapicExactSignatureGroupOrderingKey(left)
  if (!leftOrderingKey.ok) return leftOrderingKey

  const rightOrderingKey = createLapicExactSignatureGroupOrderingKey(right)
  if (!rightOrderingKey.ok) return rightOrderingKey

  return createLapicSuccessResult(
    compareLapicStringArrays(leftOrderingKey.value, rightOrderingKey.value)
  )
}

export function areLapicSirStatesExactComparable(
  left: LapicSirState,
  right: LapicSirState
): boolean {
  const leftComparisonKey = createLapicExactSignatureGroupOrderingKey(
    left.exactSignatureGroupKey
  )
  const rightComparisonKey = createLapicExactSignatureGroupOrderingKey(
    right.exactSignatureGroupKey
  )

  if (!leftComparisonKey.ok || !rightComparisonKey.ok) return false

  return (
    compareLapicStringArrays(
      leftComparisonKey.value,
      rightComparisonKey.value
    ) === 0
  )
}

export function createLapicSirStateIdentityOrderingKey(
  state: LapicSirState
): LapicValidationResult<readonly string[]> {
  const validation = validateLapicSirState(state)
  if (!validation.ok) return validation

  const exactSignatureOrderingKey = createLapicExactSignatureGroupOrderingKey(
    state.exactSignatureGroupKey
  )
  if (!exactSignatureOrderingKey.ok) return exactSignatureOrderingKey

  const actorUniquenessClaimKeys = state.compatibilitySignature.actorUniquenessClaims
    .map(createLapicActorUniquenessClaimOrderingKey)
    .sort()
  const branchToggleKeys = state.compatibilitySignature.branchCompatibilityToggles
    .map((toggle) => `${toggle.toggleId}|${toggle.enabled ? '1' : '0'}`)
    .sort()

  return createLapicSuccessResult([
    ...exactSignatureOrderingKey.value,
    state.dominanceProjection.projectionId,
    state.dominanceProjection.vectorDigest,
    state.potentialOrderingDigest ?? '',
    ...[...(state.potentialSummaryDigests ?? [])].sort(),
    ...actorUniquenessClaimKeys,
    ...branchToggleKeys,
    state.stateId,
  ])
}

export function compareLapicSirStateIdentity(
  left: LapicSirState,
  right: LapicSirState
): LapicValidationResult<LapicDeterministicOrderingRelation> {
  const leftValidation = validateLapicSirState(left)
  if (!leftValidation.ok) return leftValidation

  const rightValidation = validateLapicSirState(right)
  if (!rightValidation.ok) return rightValidation

  if (!areLapicSirStatesExactComparable(left, right))
    return createLapicFailureResult([
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'S-IR state identity comparison requires equal exact signature group keys.',
        ['exactSignatureGroupKey']
      ),
    ])

  const leftOrderingKey = createLapicSirStateIdentityOrderingKey(left)
  if (!leftOrderingKey.ok) return leftOrderingKey

  const rightOrderingKey = createLapicSirStateIdentityOrderingKey(right)
  if (!rightOrderingKey.ok) return rightOrderingKey

  return createLapicSuccessResult(
    compareLapicStringArrays(leftOrderingKey.value, rightOrderingKey.value)
  )
}

export function createLapicSirState(state: LapicSirState): LapicSirState {
  return state
}

function validateLapicFrameAxisIdentity(
  frameAxisIdentity: LapicFrameAxisIdentity,
  path: readonly string[]
): readonly LapicDiagnostic[] {
  const diagnostics: LapicDiagnostic[] = []

  if (frameAxisIdentity.axisKind === 'none' && frameAxisIdentity.frameIds.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'frameAxisIdentity.frameIds must be empty when axisKind is none.',
        [...path, 'frameIds'],
        { axisKind: frameAxisIdentity.axisKind }
      )
    )

  frameAxisIdentity.frameIds.forEach((frameId, index) => {
    if (!frameId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'frameAxisIdentity.frameIds must not contain empty values.',
          [...path, 'frameIds', String(index)]
        )
      )
  })

  return diagnostics
}

export function validateLapicStateLayoutDescriptor(
  layout: LapicStateLayoutDescriptor
): LapicValidationResult<LapicStateLayoutDescriptor> {
  const diagnostics: LapicDiagnostic[] = []

  if (!layout.layoutId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'layoutId must not be empty.',
        ['layout', 'layoutId']
      )
    )

  if (!layout.teamLayoutDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'teamLayoutDigest must not be empty.',
        ['layout', 'teamLayoutDigest']
      )
    )

  if (!layout.slotIds.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'slotIds must not be empty.',
        ['layout', 'slotIds']
      )
    )

  layout.slotIds.forEach((slotId, index) => {
    if (!slotId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'slotIds must not contain empty values.',
          ['layout', 'slotIds', String(index)]
        )
      )
  })

  diagnostics.push(
    ...validateLapicFrameAxisIdentity(layout.frameAxisIdentity, [
      'layout',
      'frameAxisIdentity',
    ])
  )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(layout)
}

export function validateLapicCompatibilitySignature(
  signature: LapicCompatibilitySignature
): LapicValidationResult<LapicCompatibilitySignature> {
  const diagnostics: LapicDiagnostic[] = []

  if (
    signature.schemaVersion !== lapicCompatibilitySignatureSchemaVersion
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'compatibility signature schemaVersion must match the core compatibility signature schema.',
        ['schemaVersion'],
        {
          schemaVersion: signature.schemaVersion,
          expectedSchemaVersion: lapicCompatibilitySignatureSchemaVersion,
        }
      )
    )

  if (!Number.isInteger(signature.occupiedSlotMask) || signature.occupiedSlotMask < 0)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'occupiedSlotMask must be a non-negative integer.',
        ['occupiedSlotMask'],
        { occupiedSlotMask: signature.occupiedSlotMask }
      )
    )

  if (!signature.adapterSemanticMode)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'adapterSemanticMode must not be empty.',
        ['adapterSemanticMode']
      )
    )

  diagnostics.push(
    ...validateLapicFrameAxisIdentity(signature.frameAxisIdentity, [
      'frameAxisIdentity',
    ])
  )

  signature.actorUniquenessClaims.forEach((claim, index) => {
    if (!claim.actorId || !claim.family || !claim.claimedBySlotId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'actor uniqueness claims must include actorId, family, and claimedBySlotId.',
          ['actorUniquenessClaims', String(index)]
        )
      )
  })

  signature.exclusiveResourceClaims.forEach((claim, index) => {
    if (!claim.resourceKind || !claim.resourceId || !claim.claimedBySlotId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'exclusive resource claims must include resourceKind, resourceId, and claimedBySlotId.',
          ['exclusiveResourceClaims', String(index)]
        )
      )
  })

  signature.aggregateCounts.forEach((count, index) => {
    if (!count.counterId || count.value < 0)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'aggregateCounts must include a counterId and a non-negative value.',
          ['aggregateCounts', String(index)],
          { counterId: count.counterId, value: count.value }
        )
      )
  })

  signature.remainingAggregateObligations.forEach((obligation, index) => {
    if (!obligation.counterId || obligation.minimumRequired < 0)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'remainingAggregateObligations must include a counterId and a non-negative minimumRequired.',
          ['remainingAggregateObligations', String(index)],
          {
            counterId: obligation.counterId,
            minimumRequired: obligation.minimumRequired,
          }
        )
      )
  })

  ;[
    ['providedCapabilityFacts', signature.providedCapabilityFacts],
    ['remainingRequiredCapabilityFacts', signature.remainingRequiredCapabilityFacts],
  ].forEach(([collectionName, facts]) => {
    facts.forEach((fact, index) => {
      if (!fact.capabilityId)
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'capability facts must include capabilityId.',
            [collectionName, String(index), 'capabilityId']
          )
        )

      if (
        fact.scope === 'specific-target-slot' &&
        !fact.targetSlotId
      )
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'specific-target-slot capability facts must declare targetSlotId.',
            [collectionName, String(index), 'targetSlotId'],
            { capabilityId: fact.capabilityId }
          )
        )
    })
  })

  signature.branchCompatibilityToggles.forEach((toggle, index) => {
    if (!toggle.toggleId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'branchCompatibilityToggles must include toggleId.',
          ['branchCompatibilityToggles', String(index), 'toggleId']
        )
      )
  })

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(signature)
}

export function validateLapicExactSignatureGroupKey(
  key: LapicExactSignatureGroupKey
): LapicValidationResult<LapicExactSignatureGroupKey> {
  const diagnostics: LapicDiagnostic[] = []

  if (!Number.isInteger(key.occupiedSlotMask) || key.occupiedSlotMask < 0)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'occupiedSlotMask must be a non-negative integer.',
        ['occupiedSlotMask'],
        { occupiedSlotMask: key.occupiedSlotMask }
      )
    )

  if (!key.frameAxisIdentityDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'frameAxisIdentityDigest must not be empty.',
        ['frameAxisIdentityDigest']
      )
    )

  if (!key.adapterSemanticMode)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'adapterSemanticMode must not be empty.',
        ['adapterSemanticMode']
      )
    )

  key.actorIds.forEach((actorId, index) => {
    if (!actorId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'actorIds must not contain empty values.',
          ['actorIds', String(index)]
        )
      )
  })

  key.exclusiveResourceKeys.forEach((resourceKey, index) => {
    if (!resourceKey)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'exclusiveResourceKeys must not contain empty values.',
          ['exclusiveResourceKeys', String(index)]
        )
      )
  })

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(key)
}

export function validateLapicSirState(
  state: LapicSirState
): LapicValidationResult<LapicSirState> {
  const layoutValidation = validateLapicStateLayoutDescriptor(state.layout)
  if (!layoutValidation.ok) return layoutValidation

  const keyValidation = validateLapicExactSignatureGroupKey(
    state.exactSignatureGroupKey
  )
  if (!keyValidation.ok) return keyValidation

  const compatibilityValidation = validateLapicCompatibilitySignature(
    state.compatibilitySignature
  )
  if (!compatibilityValidation.ok) return compatibilityValidation

  const diagnostics: LapicDiagnostic[] = []

  if (!state.stateId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'stateId must not be empty.',
        ['stateId']
      )
    )

  if (!state.dominanceProjection.projectionId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'dominanceProjection.projectionId must not be empty.',
        ['dominanceProjection', 'projectionId']
      )
    )

  if (!state.dominanceProjection.vectorDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'dominanceProjection.vectorDigest must not be empty.',
        ['dominanceProjection', 'vectorDigest']
      )
    )

  if (
    state.layout.frameAxisIdentity.axisKind !==
    state.compatibilitySignature.frameAxisIdentity.axisKind
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'state layout frame axis kind must match the compatibility signature frame axis kind.',
        ['compatibilitySignature', 'frameAxisIdentity', 'axisKind'],
        {
          layoutAxisKind: state.layout.frameAxisIdentity.axisKind,
          compatibilityAxisKind:
            state.compatibilitySignature.frameAxisIdentity.axisKind,
        }
      )
    )

  if (
    state.layout.frameAxisIdentity.frameIds.length !==
      state.compatibilitySignature.frameAxisIdentity.frameIds.length ||
    state.layout.frameAxisIdentity.frameIds.some(
      (frameId, index) =>
        frameId !== state.compatibilitySignature.frameAxisIdentity.frameIds[index]
    )
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'state layout frame axis identity must match the compatibility signature frame axis identity.',
        ['compatibilitySignature', 'frameAxisIdentity']
      )
    )

  if (
    state.exactSignatureGroupKey.occupiedSlotMask !==
    state.compatibilitySignature.occupiedSlotMask
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'exactSignatureGroupKey.occupiedSlotMask must match compatibilitySignature.occupiedSlotMask.',
        ['exactSignatureGroupKey', 'occupiedSlotMask'],
        {
          exactSignatureOccupiedSlotMask:
            state.exactSignatureGroupKey.occupiedSlotMask,
          compatibilityOccupiedSlotMask:
            state.compatibilitySignature.occupiedSlotMask,
        }
      )
    )

  if (
    state.exactSignatureGroupKey.adapterSemanticMode !==
    state.compatibilitySignature.adapterSemanticMode
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'exactSignatureGroupKey.adapterSemanticMode must match compatibilitySignature.adapterSemanticMode.',
        ['exactSignatureGroupKey', 'adapterSemanticMode'],
        {
          exactSignatureAdapterSemanticMode:
            state.exactSignatureGroupKey.adapterSemanticMode,
          compatibilityAdapterSemanticMode:
            state.compatibilitySignature.adapterSemanticMode,
        }
      )
    )

  if (
    state.provenance.compatibilitySignatureSchemaVersion !==
    state.compatibilitySignature.schemaVersion
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'provenance.compatibilitySignatureSchemaVersion must match compatibilitySignature.schemaVersion.',
        ['provenance', 'compatibilitySignatureSchemaVersion'],
        {
          provenanceSchemaVersion:
            state.provenance.compatibilitySignatureSchemaVersion,
          compatibilitySchemaVersion: state.compatibilitySignature.schemaVersion,
        }
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(state)
}

export function validateLapicProblemNormalizationInput(
  normalizationInput: LapicProblemNormalizationInput
): LapicValidationResult<LapicProblemNormalizationInput> {
  const diagnostics: LapicDiagnostic[] = []
  const slotIdSet = new Set(normalizationInput.teamLayout.slotIds)

  if (normalizationInput.teamLayout.slotCount !== normalizationInput.teamLayout.slotIds.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'teamLayout.slotCount must match the number of declared slotIds.',
        ['teamLayout', 'slotCount'],
        {
          slotCount: normalizationInput.teamLayout.slotCount,
          slotIdsLength: normalizationInput.teamLayout.slotIds.length,
        }
      )
    )

  if (normalizationInput.topN < 1)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'topN must be at least 1.',
        ['topN'],
        { topN: normalizationInput.topN }
      )
    )

  if (!normalizationInput.adapterMetadata.sourceSnapshotDigests.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'adapterMetadata.sourceSnapshotDigests must not be empty.',
        ['adapterMetadata', 'sourceSnapshotDigests']
      )
    )

  normalizationInput.slotDescriptors.forEach((slotDescriptor, index) => {
    if (!slotIdSet.has(slotDescriptor.slotId))
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'slotDescriptors must reference only slotIds declared in teamLayout.',
          ['slotDescriptors', String(index), 'slotId'],
          { slotId: slotDescriptor.slotId }
        )
      )
  })

  normalizationInput.objective.targetSlotIds.forEach((slotId, index) => {
    if (!slotIdSet.has(slotId))
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'objective.targetSlotIds must reference declared slotIds.',
          ['objective', 'targetSlotIds', String(index)],
          { slotId }
        )
      )
  })

  normalizationInput.itemDomains.forEach((domain, domainIndex) => {
    if (!slotIdSet.has(domain.slotId))
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'itemDomains must reference declared slotIds.',
          ['itemDomains', String(domainIndex), 'slotId'],
          { slotId: domain.slotId }
        )
      )

    domain.candidates.forEach((candidate, candidateIndex) => {
      if (candidate.slotId !== domain.slotId)
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'candidate slotId must match its parent domain slotId.',
            [
              'itemDomains',
              String(domainIndex),
              'candidates',
              String(candidateIndex),
              'slotId',
            ],
            {
              candidateSlotId: candidate.slotId,
              domainSlotId: domain.slotId,
            }
          )
        )

      if (candidate.domainId !== domain.domainId)
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'candidate domainId must match its parent domainId.',
            [
              'itemDomains',
              String(domainIndex),
              'candidates',
              String(candidateIndex),
              'domainId',
            ],
            {
              candidateDomainId: candidate.domainId,
              domainId: domain.domainId,
            }
          )
        )
    })
  })

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(normalizationInput)
}

export function validateLapicCanonicalProblem(
  problem: LapicCanonicalProblem
): LapicValidationResult<LapicCanonicalProblem> {
  const normalizationValidation = validateLapicProblemNormalizationInput({
    teamLayout: problem.teamLayout,
    slotDescriptors: problem.slotDescriptors,
    sharedTeamContext: problem.sharedTeamContext,
    frameAxis: problem.frameAxis,
    itemDomains: problem.itemDomains,
    compatibilityRules: problem.compatibilityRules,
    objective: problem.objective,
    constraints: problem.constraints,
    topN: problem.topN,
    orderingPolicy: problem.orderingPolicy,
    potentialConfiguration: problem.potentialConfiguration,
    auxiliaryOutputs: problem.auxiliaryOutputs,
    adapterMetadata: problem.adapterMetadata,
    provenance: problem.provenance,
  })

  if (!normalizationValidation.ok) return normalizationValidation

  const diagnostics: LapicDiagnostic[] = []

  if (!problem.problemId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'problemId must not be empty.',
        ['problemId']
      )
    )

  if (!problem.problemDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'problemDigest must not be empty.',
        ['problemDigest']
      )
    )

  if (!problem.engineVersion)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'engineVersion must not be empty.',
        ['engineVersion']
      )
    )

  if (!problem.arithmeticPolicyId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'arithmeticPolicyId must not be empty.',
        ['arithmeticPolicyId']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(problem)
}

export interface LapicCoreSkeletonMarker {
  readonly packageName: typeof lapicCorePackageName
  readonly schemaVersion: LapicSchemaVersion
}

export const lapicCoreSkeleton: LapicCoreSkeletonMarker = {
  packageName: lapicCorePackageName,
  schemaVersion: lapicCoreSchemaVersion,
}
