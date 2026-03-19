import type {
  MainStatKey,
} from '@genshin-optimizer/gi/consts'
import type {
  ArtSetExclusion,
  ICachedArtifact,
  OptConfig,
} from '@genshin-optimizer/gi/db'
import type { OptNode } from '@genshin-optimizer/gi/wr'
import type {
  LapicAdapterMetadata,
  LapicAggregateCountFact,
  LapicArithmeticPolicyId,
  LapicAuxiliaryOutputDescriptor,
  LapicCandidateDescriptor,
  LapicCandidateDomain,
  LapicCanonicalProblem,
  LapicDiagnostic,
  LapicDigest,
  LapicEngineVersion,
  LapicGraphAuxiliaryOutputDescriptor,
  LapicPotentialSolveMode,
  LapicProblemDigest,
  LapicProblemId,
  LapicProblemNormalizationInput,
  LapicPotentialParticipationMode,
  LapicUpgradeFrontierDescriptor,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import {
  createLapicFailureResult,
  createLapicSuccessResult,
  validateLapicCanonicalProblem,
  validateLapicProblemNormalizationInput,
} from '@genshin-optimizer/lapic/core'

export const giLapicAdapterPackageName = 'gi-lapic-adapter'
export const giLapicAdapterSchemaVersion = '0.1.0-draft'

export type GiLapicAdapterSchemaVersion = typeof giLapicAdapterSchemaVersion

export interface GiLapicConstraintInput {
  readonly value: OptNode
  readonly min: number
}

export interface GiLapicMainStatKeySelection {
  readonly sands: readonly MainStatKey[]
  readonly goblet: readonly MainStatKey[]
  readonly circlet: readonly MainStatKey[]
}

export interface GiLapicSourceSnapshotDescriptor {
  readonly artifactSnapshotDigest: LapicDigest
  readonly characterSnapshotDigest: LapicDigest
  readonly weaponSnapshotDigest: LapicDigest
  readonly formulaSnapshotDigest: LapicDigest
  readonly optConfigSnapshotDigest?: LapicDigest
}

export interface GiLapicInventorySnapshot {
  readonly artifacts: readonly ICachedArtifact[]
  readonly excludedArtifactIds: readonly string[]
  readonly excludedLocations: readonly string[]
}

export interface GiLapicOptimizationRequest {
  readonly optimizationTarget: OptNode
  readonly constraints: readonly GiLapicConstraintInput[]
  readonly exclusion: ArtSetExclusion
  readonly topN: number
  readonly plotBase?: OptNode
  readonly statFilters: OptConfig['statFilters']
  readonly mainStatKeys: GiLapicMainStatKeySelection
  readonly allowPartial: boolean
  readonly useExcludedArts: boolean
  readonly useTeammateBuild: boolean
  readonly levelLow: number
  readonly levelHigh: number
  readonly upOptLevelLow: number
  readonly upOptLevelHigh: number
  readonly mainStatAssumptionLevel: number
}

export interface GiLapicAdapterContext {
  readonly sourceSnapshots: GiLapicSourceSnapshotDescriptor
  readonly inventorySnapshot: GiLapicInventorySnapshot
  readonly optConfig: OptConfig
  readonly optimizationRequest: GiLapicOptimizationRequest
}

export interface GiLapicAdapterRequest {
  readonly adapterKind: 'gi'
  readonly normalizationInput: LapicProblemNormalizationInput
  readonly giContext?: GiLapicAdapterContext
  readonly requestedPotentialSolveModes?: readonly LapicPotentialSolveMode[]
}

export interface GiLapicAdapterCapabilities {
  readonly adapterKind: 'gi'
  readonly supportedPotentialSolveModes: readonly LapicPotentialSolveMode[]
  readonly supportedGraphOutputKinds: readonly string[]
  readonly supportedFormulaCompilationModes: readonly string[]
  readonly supportedCandidateDomainClasses: readonly string[]
  readonly supportedLegacyCompatibilityPaths: readonly string[]
  readonly explicitlyUnsupportedSemantics: readonly string[]
}

export interface GiLapicCanonicalExport {
  readonly adapterKind: 'gi'
  readonly problem: LapicCanonicalProblem
  readonly canonicalProblemDigest: LapicProblemDigest
  readonly adapterVersion: GiLapicAdapterSchemaVersion
  readonly sourceSnapshotDigest: LapicDigest
  readonly sourceSnapshotDigestSet: readonly LapicDigest[]
  readonly formulaCompilationMode: string
  readonly featureSchemaVersion: GiLapicAdapterSchemaVersion
  readonly filterTransformationLog: readonly string[]
  readonly unsupportedFeatureList: readonly string[]
  readonly replayReconstructionHints: readonly string[]
  readonly supportedGraphOutputModes: readonly string[]
  readonly potentialSolveMode?: LapicPotentialSolveMode
  readonly potentialParticipationMode?: LapicPotentialParticipationMode
  readonly upgradeFrontierDescriptorSet?: readonly LapicUpgradeFrontierDescriptor[]
  readonly potentialSummarySchemaVersion?: GiLapicAdapterSchemaVersion
}

export interface GiLapicCanonicalExportInput {
  readonly problem: LapicCanonicalProblem
  readonly sourceSnapshotDigest: LapicDigest
}

export interface GiLapicCanonicalExportFromRequestInput {
  readonly request: GiLapicAdapterRequest
  readonly canonicalIdentity?: GiLapicCanonicalIdentity
  readonly sourceSnapshotDigest?: LapicDigest
}

export interface GiLapicCanonicalIdentity {
  readonly problemId: LapicProblemId
  readonly problemDigest: LapicProblemDigest
  readonly engineVersion: LapicEngineVersion
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
}

export interface GiLapicAdapterSkeletonMarker {
  readonly packageName: typeof giLapicAdapterPackageName
  readonly schemaVersion: GiLapicAdapterSchemaVersion
}

export const giLapicAdapterSkeleton: GiLapicAdapterSkeletonMarker = {
  packageName: giLapicAdapterPackageName,
  schemaVersion: giLapicAdapterSchemaVersion,
}

const giSupportedPotentialSolveModes = ['current-only'] as const satisfies readonly LapicPotentialSolveMode[]
const giSupportedGraphOutputKinds = ['gi-plot-base'] as const
const giSupportedFormulaCompilationModes = ['gi-legacy-compatibility'] as const
const giSupportedCandidateDomainClasses = ['artifact-inventory'] as const
const giSupportedLegacyCompatibilityPaths = ['waverider-opt-node'] as const
const giExplicitlyUnsupportedSemantics = [
  'gi-canonical-pando-export',
  'gi-upgrade-frontier-export',
  'gi-potential-aware-ranking',
  'gi-tc-subproblem-export',
] as const

export const giLapicAdapterCapabilities: GiLapicAdapterCapabilities = {
  adapterKind: 'gi',
  supportedPotentialSolveModes: giSupportedPotentialSolveModes,
  supportedGraphOutputKinds: giSupportedGraphOutputKinds,
  supportedFormulaCompilationModes: giSupportedFormulaCompilationModes,
  supportedCandidateDomainClasses: giSupportedCandidateDomainClasses,
  supportedLegacyCompatibilityPaths: giSupportedLegacyCompatibilityPaths,
  explicitlyUnsupportedSemantics: giExplicitlyUnsupportedSemantics,
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function isRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && value > 0
}

function createGiFilterTransformationLog(
  request: GiLapicAdapterRequest
): readonly string[] {
  if (!request.giContext) return ['normalization-input-pass-through']

  const transformations = ['inventory-to-candidate-domain']
  const optimizationRequest = request.giContext.optimizationRequest

  if (!optimizationRequest.useExcludedArts)
    transformations.push('excluded-artifacts-pruned')
  if (!optimizationRequest.useTeammateBuild)
    transformations.push('excluded-locations-pruned')
  if (optimizationRequest.plotBase)
    transformations.push('plot-base-exported-as-auxiliary-output')

  return transformations
}

function createGiReplayReconstructionHints(
  request: GiLapicAdapterRequest
): readonly string[] {
  const hints = [
    'reconstruct-from-gi-source-snapshots',
    'replay-uses-legacy-waverider-compatibility-path',
  ]

  if (request.giContext)
    hints.push('replay-requires-artifact-character-weapon-formula-snapshots')

  return hints
}

function createGiDeclaredUnsupportedFeatures(
  request: GiLapicAdapterRequest
): readonly string[] {
  const declaredUnsupportedFeatures = [
    ...request.normalizationInput.adapterMetadata.declaredUnsupportedFeatures,
    ...giLapicAdapterCapabilities.explicitlyUnsupportedSemantics,
  ]

  if (
    request.normalizationInput.potentialConfiguration &&
    request.normalizationInput.potentialConfiguration.solveMode !== 'current-only'
  )
    declaredUnsupportedFeatures.push(
      `requested-potential-solve-mode:${request.normalizationInput.potentialConfiguration.solveMode}`
    )

  return uniqueStrings(declaredUnsupportedFeatures)
}

function createGiOptNodeDigest(node: OptNode): LapicDigest {
  const operands = 'operands' in node ? node.operands : []
  const operandDigest = operands
    .map((operand) => createGiOptNodeDigest(operand as OptNode))
    .join(',')

  if ('operation' in node)
    return `gi-opt-node:${node.operation}:${operands.length}:${operandDigest}`

  return `gi-opt-node:unknown:${operands.length}:${operandDigest}`
}

function createGiArtifactFeatureDigest(artifact: ICachedArtifact): LapicDigest {
  return [
    artifact.id,
    artifact.slotKey,
    artifact.setKey,
    artifact.mainStatKey,
    String(artifact.level),
    String(artifact.rarity),
  ].join('|')
}

function createGiArtifactCategoricalSignatureDigest(
  artifact: ICachedArtifact
): LapicDigest {
  return [artifact.slotKey, artifact.setKey, artifact.mainStatKey].join('|')
}

function createGiArtifactCounterFacts(
  artifact: ICachedArtifact
): readonly LapicAggregateCountFact[] {
  return [
    {
      counterId: `gi:artifact-level:${artifact.slotKey}`,
      value: artifact.level,
    },
    {
      counterId: `gi:artifact-rarity:${artifact.slotKey}`,
      value: artifact.rarity,
    },
  ]
}

function shouldIncludeGiArtifact(
  artifact: ICachedArtifact,
  context: GiLapicAdapterContext
): boolean {
  if (
    !context.optimizationRequest.useExcludedArts &&
    context.inventorySnapshot.excludedArtifactIds.includes(artifact.id)
  )
    return false

  if (
    !context.optimizationRequest.useTeammateBuild &&
    artifact.location &&
    context.inventorySnapshot.excludedLocations.includes(artifact.location)
  )
    return false

  return true
}

function hasAnyArtifacts(artifacts: readonly ICachedArtifact[]): boolean {
  return artifacts.length > 0
}

function hasRequiredSnapshotDigests(
  sourceSnapshots: GiLapicSourceSnapshotDescriptor
): boolean {
  return Boolean(
    sourceSnapshots.artifactSnapshotDigest &&
      sourceSnapshots.characterSnapshotDigest &&
      sourceSnapshots.weaponSnapshotDigest &&
      sourceSnapshots.formulaSnapshotDigest
  )
}

function giAdapterFailure(
  message: string,
  path?: readonly string[],
  details?: Readonly<Record<string, string | number | boolean | null>>
): LapicValidationResult<never> {
  const diagnostic: LapicDiagnostic = {
    severity: 'error',
    code: 'NormalizationFailure',
    message,
    path,
    details,
  }

  return {
    ok: false,
    diagnostics: [diagnostic],
  }
}

export function getGiLapicAdapterCapabilities(): GiLapicAdapterCapabilities {
  return giLapicAdapterCapabilities
}

export function createGiLapicCanonicalIdentity(
  input: GiLapicCanonicalIdentity
): GiLapicCanonicalIdentity {
  return {
    problemId: input.problemId,
    problemDigest: input.problemDigest,
    engineVersion: input.engineVersion,
    arithmeticPolicyId: input.arithmeticPolicyId,
  }
}

export function createGiLapicAdapterRequest(
  input: GiLapicAdapterRequest
): GiLapicAdapterRequest {
  return {
    adapterKind: input.adapterKind,
    normalizationInput: input.normalizationInput,
    giContext: input.giContext,
    requestedPotentialSolveModes: input.requestedPotentialSolveModes
      ? [...input.requestedPotentialSolveModes]
      : undefined,
  }
}

export function createGiLapicSourceSnapshotDigests(
  sourceSnapshots: GiLapicSourceSnapshotDescriptor
): readonly LapicDigest[] {
  return [
    sourceSnapshots.artifactSnapshotDigest,
    sourceSnapshots.characterSnapshotDigest,
    sourceSnapshots.weaponSnapshotDigest,
    sourceSnapshots.formulaSnapshotDigest,
    ...(sourceSnapshots.optConfigSnapshotDigest
      ? [sourceSnapshots.optConfigSnapshotDigest]
      : []),
  ]
}

export function validateGiLapicSourceSnapshotDescriptor(
  sourceSnapshots: GiLapicSourceSnapshotDescriptor
): LapicValidationResult<GiLapicSourceSnapshotDescriptor> {
  if (!isRecord(sourceSnapshots))
    return giAdapterFailure(
      'GI source snapshot descriptor must be a record.',
      ['sourceSnapshots']
    )

  if (
    !isNonEmptyString(sourceSnapshots.artifactSnapshotDigest) ||
    !isNonEmptyString(sourceSnapshots.characterSnapshotDigest) ||
    !isNonEmptyString(sourceSnapshots.weaponSnapshotDigest) ||
    !isNonEmptyString(sourceSnapshots.formulaSnapshotDigest)
  )
    return giAdapterFailure(
      'GI source snapshot descriptor requires non-empty artifact, character, weapon, and formula digests.',
      ['sourceSnapshots']
    )

  if (
    sourceSnapshots.optConfigSnapshotDigest !== undefined &&
    !isNonEmptyString(sourceSnapshots.optConfigSnapshotDigest)
  )
    return giAdapterFailure(
      'GI optConfig snapshot digest must be a non-empty string when present.',
      ['sourceSnapshots', 'optConfigSnapshotDigest']
    )

  return createLapicSuccessResult(sourceSnapshots)
}

export function validateGiLapicInventorySnapshot(
  inventorySnapshot: GiLapicInventorySnapshot
): LapicValidationResult<GiLapicInventorySnapshot> {
  if (!isRecord(inventorySnapshot))
    return giAdapterFailure(
      'GI inventory snapshot must be a record.',
      ['inventorySnapshot']
    )

  if (!Array.isArray(inventorySnapshot.artifacts))
    return giAdapterFailure(
      'GI inventory snapshot artifacts must be an array.',
      ['inventorySnapshot', 'artifacts']
    )

  if (
    !Array.isArray(inventorySnapshot.excludedArtifactIds) ||
    !inventorySnapshot.excludedArtifactIds.every(isNonEmptyString)
  )
    return giAdapterFailure(
      'Excluded artifact ids must contain non-empty strings.',
      ['inventorySnapshot', 'excludedArtifactIds']
    )

  if (
    !Array.isArray(inventorySnapshot.excludedLocations) ||
    !inventorySnapshot.excludedLocations.every(isNonEmptyString)
  )
    return giAdapterFailure(
      'Excluded locations must contain non-empty strings.',
      ['inventorySnapshot', 'excludedLocations']
    )

  return createLapicSuccessResult(inventorySnapshot)
}

export function validateGiLapicOptimizationRequest(
  optimizationRequest: GiLapicOptimizationRequest
): LapicValidationResult<GiLapicOptimizationRequest> {
  if (!isRecord(optimizationRequest))
    return giAdapterFailure(
      'GI optimization request must be a record.',
      ['optimizationRequest']
    )

  if (!isPositiveInteger(optimizationRequest.topN))
    return giAdapterFailure(
      'GI optimization request topN must be a positive integer.',
      ['optimizationRequest', 'topN']
    )

  if (
    optimizationRequest.levelLow > optimizationRequest.levelHigh ||
    optimizationRequest.upOptLevelLow > optimizationRequest.upOptLevelHigh
  )
    return giAdapterFailure(
      'GI optimization request level ranges must be ordered low <= high.',
      ['optimizationRequest']
    )

  if (
    !isBoolean(optimizationRequest.allowPartial) ||
    !isBoolean(optimizationRequest.useExcludedArts) ||
    !isBoolean(optimizationRequest.useTeammateBuild)
  )
    return giAdapterFailure(
      'GI optimization request boolean flags must be boolean values.',
      ['optimizationRequest']
    )

  return createLapicSuccessResult(optimizationRequest)
}

export function validateGiLapicAdapterContext(
  context: GiLapicAdapterContext
): LapicValidationResult<GiLapicAdapterContext> {
  if (!isRecord(context))
    return giAdapterFailure(
      'GI adapter context must be a record.',
      ['giContext']
    )

  const sourceSnapshotValidation = validateGiLapicSourceSnapshotDescriptor(
    context.sourceSnapshots
  )
  if (!sourceSnapshotValidation.ok) return sourceSnapshotValidation

  const inventoryValidation = validateGiLapicInventorySnapshot(
    context.inventorySnapshot
  )
  if (!inventoryValidation.ok) return inventoryValidation

  const optimizationValidation = validateGiLapicOptimizationRequest(
    context.optimizationRequest
  )
  if (!optimizationValidation.ok) return optimizationValidation

  return createLapicSuccessResult(context)
}

export function validateGiLapicAdapterCapabilities(
  capabilities: GiLapicAdapterCapabilities
): LapicValidationResult<GiLapicAdapterCapabilities> {
  if (!isRecord(capabilities))
    return giAdapterFailure(
      'GI adapter capabilities must be a record.',
      ['capabilities']
    )

  if (capabilities.adapterKind !== 'gi')
    return giAdapterFailure(
      'GI adapter capabilities adapterKind must be `gi`.',
      ['capabilities', 'adapterKind']
    )

  if (
    !Array.isArray(capabilities.supportedPotentialSolveModes) ||
    !Array.isArray(capabilities.supportedGraphOutputKinds) ||
    !Array.isArray(capabilities.supportedFormulaCompilationModes) ||
    !Array.isArray(capabilities.supportedCandidateDomainClasses) ||
    !Array.isArray(capabilities.supportedLegacyCompatibilityPaths) ||
    !Array.isArray(capabilities.explicitlyUnsupportedSemantics)
  )
    return giAdapterFailure(
      'GI adapter capabilities lists must all be arrays.',
      ['capabilities']
    )

  return createLapicSuccessResult(capabilities)
}

export function validateGiLapicCanonicalIdentity(
  canonicalIdentity: GiLapicCanonicalIdentity
): LapicValidationResult<GiLapicCanonicalIdentity> {
  if (!isRecord(canonicalIdentity))
    return giAdapterFailure(
      'GI canonical identity must be a record.',
      ['canonicalIdentity']
    )

  if (
    !isNonEmptyString(canonicalIdentity.problemId) ||
    !isNonEmptyString(canonicalIdentity.problemDigest) ||
    !isNonEmptyString(canonicalIdentity.engineVersion) ||
    !isNonEmptyString(canonicalIdentity.arithmeticPolicyId)
  )
    return giAdapterFailure(
      'GI canonical identity fields must be non-empty strings.',
      ['canonicalIdentity']
    )

  return createLapicSuccessResult(canonicalIdentity)
}

export function validateGiLapicAdapterRequest(
  request: GiLapicAdapterRequest
): LapicValidationResult<GiLapicAdapterRequest> {
  if (!isRecord(request))
    return giAdapterFailure(
      'GI adapter request must be a record.',
      ['request']
    )

  const normalizationValidation = validateLapicProblemNormalizationInput(
    request.normalizationInput
  )
  if (!normalizationValidation.ok)
    return createLapicFailureResult(normalizationValidation.diagnostics)

  if (request.giContext) {
    const contextValidation = validateGiLapicAdapterContext(request.giContext)
    if (!contextValidation.ok) return contextValidation
  }

  return normalizeGiLapicAdapterRequest(request)
}

export function validateGiLapicCanonicalExport(
  canonicalExport: GiLapicCanonicalExport
): LapicValidationResult<GiLapicCanonicalExport> {
  if (!isRecord(canonicalExport))
    return giAdapterFailure(
      'GI canonical export must be a record.',
      ['canonicalExport']
    )

  const problemValidation = validateLapicCanonicalProblem(canonicalExport.problem)
  if (!problemValidation.ok)
    return createLapicFailureResult(problemValidation.diagnostics)

  if (
    canonicalExport.adapterKind !== 'gi' ||
    !isNonEmptyString(canonicalExport.canonicalProblemDigest) ||
    !isNonEmptyString(canonicalExport.sourceSnapshotDigest) ||
    !isNonEmptyString(canonicalExport.formulaCompilationMode) ||
    !isNonEmptyString(canonicalExport.featureSchemaVersion)
  )
    return giAdapterFailure(
      'GI canonical export requires valid adapter kind, digest, and metadata fields.',
      ['canonicalExport']
    )

  if (
    !Array.isArray(canonicalExport.sourceSnapshotDigestSet) ||
    !canonicalExport.sourceSnapshotDigestSet.every(isNonEmptyString) ||
    !Array.isArray(canonicalExport.filterTransformationLog) ||
    !canonicalExport.filterTransformationLog.every(isNonEmptyString) ||
    !Array.isArray(canonicalExport.unsupportedFeatureList) ||
    !canonicalExport.unsupportedFeatureList.every(isNonEmptyString) ||
    !Array.isArray(canonicalExport.replayReconstructionHints) ||
    !canonicalExport.replayReconstructionHints.every(isNonEmptyString) ||
    !Array.isArray(canonicalExport.supportedGraphOutputModes) ||
    !canonicalExport.supportedGraphOutputModes.every(isNonEmptyString)
  )
    return giAdapterFailure(
      'GI canonical export list fields must contain non-empty strings.',
      ['canonicalExport']
    )

  return createLapicSuccessResult(canonicalExport)
}

export function createGiLapicAdapterMetadata(
  request: GiLapicAdapterRequest
): LapicAdapterMetadata {
  const sourceSnapshotDigests = request.giContext
    ? createGiLapicSourceSnapshotDigests(request.giContext.sourceSnapshots)
    : request.normalizationInput.adapterMetadata.sourceSnapshotDigests

  return {
    ...request.normalizationInput.adapterMetadata,
    adapterKind: request.normalizationInput.adapterMetadata.adapterKind,
    sourceSnapshotDigests,
    supportedPotentialSolveModes:
      giLapicAdapterCapabilities.supportedPotentialSolveModes,
    declaredUnsupportedFeatures: createGiDeclaredUnsupportedFeatures(request),
    metadata: {
      ...request.normalizationInput.adapterMetadata.metadata,
      formulaCompilationMode: giLapicAdapterCapabilities.supportedFormulaCompilationModes[0],
      featureSchemaVersion: giLapicAdapterSchemaVersion,
      migrationState: 'legacyValidated',
      supportedGraphOutputKinds:
        giLapicAdapterCapabilities.supportedGraphOutputKinds.join(','),
      supportedCandidateDomainClasses:
        giLapicAdapterCapabilities.supportedCandidateDomainClasses.join(','),
      legacyCompatibilityPath:
        giLapicAdapterCapabilities.supportedLegacyCompatibilityPaths[0],
      replayReconstructionHints: createGiReplayReconstructionHints(request).join(
        ','
      ),
      filterTransformationLog: createGiFilterTransformationLog(request).join(','),
    },
  }
}

export function createGiLapicAuxiliaryOutputs(
  request: GiLapicAdapterRequest
): readonly LapicAuxiliaryOutputDescriptor[] {
  const baseOutputs = request.normalizationInput.auxiliaryOutputs ?? []
  const plotBase = request.giContext?.optimizationRequest.plotBase

  if (!plotBase) return baseOutputs

  const plotOutput: LapicGraphAuxiliaryOutputDescriptor = {
    kind: 'gi-plot-base',
    payloadDigest: createGiOptNodeDigest(plotBase),
    participatesInOrdering: false,
    xAxisKind: 'gi-plot-x',
    yAxisKind: 'gi-plot-y',
    graphExactness: 'exact',
  }

  return [
    ...baseOutputs,
    plotOutput,
  ]
}

export function createGiLapicCandidateDescriptor(
  artifact: ICachedArtifact
): LapicCandidateDescriptor {
  return {
    candidateId: artifact.id,
    sourceRecordDigest: artifact.id,
    domainId: `gi:${artifact.slotKey}`,
    slotId: artifact.slotKey,
    additiveFeatureDigest: createGiArtifactFeatureDigest(artifact),
    discreteCounters: createGiArtifactCounterFacts(artifact),
    categoricalSignatureDigest: createGiArtifactCategoricalSignatureDigest(
      artifact
    ),
    provenance: {
      slotId: artifact.slotKey,
      sourceEntityId: artifact.location || 'inventory',
      sourceRecordDigests: [artifact.id],
      exclusiveResourceClaims: [],
      concreteInventoryBacked: true,
      featureExtractionDigest: createGiArtifactFeatureDigest(artifact),
    },
  }
}

export function createGiLapicCandidateDomains(
  context: GiLapicAdapterContext
): readonly LapicCandidateDomain[] {
  const domainMap = new Map<string, LapicCandidateDescriptor[]>()

  context.inventorySnapshot.artifacts
    .filter((artifact) => shouldIncludeGiArtifact(artifact, context))
    .forEach((artifact) => {
      const domainId = `gi:${artifact.slotKey}`
      const candidates = domainMap.get(domainId) ?? []
      candidates.push(createGiLapicCandidateDescriptor(artifact))
      domainMap.set(domainId, candidates)
    })

  return Array.from(domainMap.entries()).map(([domainId, candidates]) => ({
    domainId,
    slotId: domainId.replace('gi:', ''),
    candidates,
  }))
}

export function isGiLapicPotentialSolveModeSupported(
  solveMode: LapicPotentialSolveMode
): boolean {
  return giLapicAdapterCapabilities.supportedPotentialSolveModes.includes(solveMode)
}

export function normalizeGiLapicAdapterRequest(
  request: GiLapicAdapterRequest
): LapicValidationResult<GiLapicAdapterRequest> {
  if (request.adapterKind !== 'gi')
    return giAdapterFailure('GI lapic adapter received a non-GI request.', [
      'adapterKind',
    ])

  if (!request.normalizationInput.adapterMetadata.adapterKind.startsWith('gi'))
    return giAdapterFailure(
      'GI lapic adapter requires GI-scoped adapter metadata.',
      ['normalizationInput', 'adapterMetadata', 'adapterKind'],
      {
        adapterKind: request.normalizationInput.adapterMetadata.adapterKind,
      }
    )

  if (request.giContext) {
    if (!hasRequiredSnapshotDigests(request.giContext.sourceSnapshots))
      return giAdapterFailure(
        'GI lapic adapter requires explicit source snapshot digests for artifacts, character, weapon, and formula state.',
        ['giContext', 'sourceSnapshots']
      )

    if (!hasAnyArtifacts(request.giContext.inventorySnapshot.artifacts))
      return giAdapterFailure(
        'GI lapic adapter inventory snapshot must contain at least one artifact candidate.',
        ['giContext', 'inventorySnapshot', 'artifacts']
      )

    if (request.giContext.optimizationRequest.topN < 1)
      return giAdapterFailure(
        'GI lapic adapter requires topN to be at least 1.',
        ['giContext', 'optimizationRequest', 'topN'],
        { topN: request.giContext.optimizationRequest.topN }
      )

    if (request.giContext.optimizationRequest.topN !== request.normalizationInput.topN)
      return giAdapterFailure(
        'GI lapic adapter requires normalizationInput.topN to match giContext.optimizationRequest.topN.',
        ['normalizationInput', 'topN'],
        {
          normalizationTopN: request.normalizationInput.topN,
          requestTopN: request.giContext.optimizationRequest.topN,
        }
      )

    if (
      request.giContext.optimizationRequest.levelLow >
      request.giContext.optimizationRequest.levelHigh
    )
      return giAdapterFailure(
        'GI lapic adapter requires levelLow <= levelHigh.',
        ['giContext', 'optimizationRequest'],
        {
          levelLow: request.giContext.optimizationRequest.levelLow,
          levelHigh: request.giContext.optimizationRequest.levelHigh,
        }
      )

    if (
      request.giContext.optimizationRequest.upOptLevelLow >
      request.giContext.optimizationRequest.upOptLevelHigh
    )
      return giAdapterFailure(
        'GI lapic adapter requires upOptLevelLow <= upOptLevelHigh.',
        ['giContext', 'optimizationRequest'],
        {
          upOptLevelLow: request.giContext.optimizationRequest.upOptLevelLow,
          upOptLevelHigh: request.giContext.optimizationRequest.upOptLevelHigh,
        }
      )
  }

  const requestedPotentialSolveModes = request.requestedPotentialSolveModes ??
    (request.normalizationInput.potentialConfiguration
      ? [request.normalizationInput.potentialConfiguration.solveMode]
      : [])

  const unsupportedPotentialSolveMode = requestedPotentialSolveModes.find(
    (solveMode) => !isGiLapicPotentialSolveModeSupported(solveMode)
  )

  if (unsupportedPotentialSolveMode)
    return giAdapterFailure(
      'GI lapic adapter does not yet support the requested potential-aware solve mode.',
      ['requestedPotentialSolveModes'],
      { unsupportedPotentialSolveMode }
    )

  return {
    ok: true,
    value: request,
    diagnostics: [],
  }
}

export function createGiLapicProblemNormalizationInput(
  request: GiLapicAdapterRequest
): LapicValidationResult<LapicProblemNormalizationInput> {
  const normalizedRequest = normalizeGiLapicAdapterRequest(request)
  if (!normalizedRequest.ok) return normalizedRequest

  if (!normalizedRequest.value.giContext)
    return {
      ok: true,
      value: normalizedRequest.value.normalizationInput,
      diagnostics: normalizedRequest.diagnostics,
    }

  const itemDomains = createGiLapicCandidateDomains(normalizedRequest.value.giContext)

  return {
    ok: true,
    value: {
      ...normalizedRequest.value.normalizationInput,
      itemDomains,
      auxiliaryOutputs: createGiLapicAuxiliaryOutputs(normalizedRequest.value),
      adapterMetadata: createGiLapicAdapterMetadata(normalizedRequest.value),
    },
    diagnostics: normalizedRequest.diagnostics,
  }
}

export function buildGiLapicCanonicalExport(
  input: GiLapicCanonicalExportInput
): LapicValidationResult<GiLapicCanonicalExport> {
  if (!input.sourceSnapshotDigest)
    return giAdapterFailure(
      'GI lapic canonical export requires an explicit source snapshot digest.',
      ['sourceSnapshotDigest']
    )

  if (!input.problem.adapterMetadata.adapterKind.startsWith('gi'))
    return giAdapterFailure(
      'GI lapic canonical export requires a GI-scoped canonical problem.',
      ['problem', 'adapterMetadata', 'adapterKind'],
      { adapterKind: input.problem.adapterMetadata.adapterKind }
    )

  return {
    ok: true,
    value: {
      adapterKind: 'gi',
      problem: input.problem,
      canonicalProblemDigest: input.problem.problemDigest,
      adapterVersion: giLapicAdapterSchemaVersion,
      sourceSnapshotDigest: input.sourceSnapshotDigest,
      sourceSnapshotDigestSet: input.problem.adapterMetadata.sourceSnapshotDigests,
      formulaCompilationMode:
        input.problem.adapterMetadata.metadata.formulaCompilationMode ??
        giLapicAdapterCapabilities.supportedFormulaCompilationModes[0],
      featureSchemaVersion: giLapicAdapterSchemaVersion,
      filterTransformationLog: uniqueStrings(
        (
          input.problem.adapterMetadata.metadata.filterTransformationLog ?? ''
        )
          .split(',')
          .filter(Boolean)
      ),
      unsupportedFeatureList: uniqueStrings(
        input.problem.adapterMetadata.declaredUnsupportedFeatures
      ),
      replayReconstructionHints: uniqueStrings(
        (
          input.problem.adapterMetadata.metadata.replayReconstructionHints ?? ''
        )
          .split(',')
          .filter(Boolean)
      ),
      supportedGraphOutputModes:
        giLapicAdapterCapabilities.supportedGraphOutputKinds,
      potentialSolveMode: input.problem.potentialConfiguration?.solveMode,
      potentialParticipationMode:
        input.problem.potentialConfiguration?.participationMode,
      upgradeFrontierDescriptorSet:
        input.problem.potentialConfiguration?.upgradeFrontiers,
      potentialSummarySchemaVersion: input.problem.potentialConfiguration
        ? giLapicAdapterSchemaVersion
        : undefined,
    },
    diagnostics: [],
  }
}

export function createGiLapicCanonicalProblem(
  normalizationInput: LapicProblemNormalizationInput,
  canonicalIdentity: GiLapicCanonicalIdentity
): LapicCanonicalProblem {
  return {
    problemId: canonicalIdentity.problemId,
    problemDigest: canonicalIdentity.problemDigest,
    engineVersion: canonicalIdentity.engineVersion,
    arithmeticPolicyId: canonicalIdentity.arithmeticPolicyId,
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

export function buildGiLapicCanonicalExportFromRequest(
  input: GiLapicCanonicalExportFromRequestInput
): LapicValidationResult<GiLapicCanonicalExport> {
  const normalizedInput = createGiLapicProblemNormalizationInput(input.request)
  if (!normalizedInput.ok) return normalizedInput

  const sourceSnapshotDigest =
    input.sourceSnapshotDigest ??
    input.request.giContext?.sourceSnapshots.artifactSnapshotDigest

  if (!sourceSnapshotDigest)
    return giAdapterFailure(
      'GI lapic canonical export from request requires an explicit source snapshot digest or GI source snapshot context.',
      ['sourceSnapshotDigest']
    )

  if (!input.canonicalIdentity)
    return giAdapterFailure(
      'GI lapic canonical export from request requires explicit canonical identity fields for problem assembly.',
      ['canonicalIdentity']
    )

  return buildGiLapicCanonicalExport({
    problem: createGiLapicCanonicalProblem(
      normalizedInput.value,
      input.canonicalIdentity
    ),
    sourceSnapshotDigest,
  })
}
