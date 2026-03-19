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
  LapicPotentialSolveMode,
  LapicProblemDigest,
  LapicProblemId,
  LapicProblemNormalizationInput,
  LapicValidationResult,
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
}

export interface GiLapicCanonicalExport {
  readonly adapterKind: 'gi'
  readonly problem: LapicCanonicalProblem
  readonly sourceSnapshotDigest: LapicDigest
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

export const giLapicAdapterCapabilities: GiLapicAdapterCapabilities = {
  adapterKind: 'gi',
  supportedPotentialSolveModes: giSupportedPotentialSolveModes,
  supportedGraphOutputKinds: [],
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
  }
}

export function createGiLapicAuxiliaryOutputs(
  request: GiLapicAdapterRequest
): readonly LapicAuxiliaryOutputDescriptor[] {
  const baseOutputs = request.normalizationInput.auxiliaryOutputs ?? []
  const plotBase = request.giContext?.optimizationRequest.plotBase

  if (!plotBase) return baseOutputs

  return [
    ...baseOutputs,
    {
      kind: 'gi-plot-base',
      payloadDigest: createGiOptNodeDigest(plotBase),
      participatesInOrdering: false,
    },
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
      sourceSnapshotDigest: input.sourceSnapshotDigest,
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
