import {
  createLapicFailureResult,
  createLapicSuccessResult,
  validateLapicCanonicalProblem,
  validateLapicProblemNormalizationInput,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicDiagnostic,
  LapicPotentialSolveMode,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import { giLapicAdapterCapabilities } from './types'
import type {
  GiLapicAdapterCapabilities,
  GiLapicAdapterContext,
  GiLapicAdapterRequest,
  GiLapicCanonicalExport,
  GiLapicCanonicalIdentity,
  GiLapicInventorySnapshot,
  GiLapicOptimizationRequest,
  GiLapicSourceSnapshotDescriptor,
} from './types'

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
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

function hasAnyArtifacts(artifacts: readonly unknown[]): boolean {
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

export function giAdapterFailure(
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

export function validateGiLapicSourceSnapshotDescriptor(
  sourceSnapshots: GiLapicSourceSnapshotDescriptor
): LapicValidationResult<GiLapicSourceSnapshotDescriptor> {
  if (!isRecord(sourceSnapshots))
    return giAdapterFailure('GI source snapshot descriptor must be a record.', [
      'sourceSnapshots',
    ])

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
    return giAdapterFailure('GI inventory snapshot must be a record.', [
      'inventorySnapshot',
    ])

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
    return giAdapterFailure('GI optimization request must be a record.', [
      'optimizationRequest',
    ])

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
    return giAdapterFailure('GI adapter context must be a record.', [
      'giContext',
    ])

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
    return giAdapterFailure('GI adapter capabilities must be a record.', [
      'capabilities',
    ])

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
    return giAdapterFailure('GI canonical identity must be a record.', [
      'canonicalIdentity',
    ])

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

export function isGiLapicPotentialSolveModeSupported(
  solveMode: LapicPotentialSolveMode
): boolean {
  return giLapicAdapterCapabilities.supportedPotentialSolveModes.includes(
    solveMode
  )
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
      { adapterKind: request.normalizationInput.adapterMetadata.adapterKind }
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

    if (
      request.giContext.optimizationRequest.topN !==
      request.normalizationInput.topN
    )
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

  const requestedPotentialSolveModes =
    request.requestedPotentialSolveModes ??
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

export function validateGiLapicAdapterRequest(
  request: GiLapicAdapterRequest
): LapicValidationResult<GiLapicAdapterRequest> {
  if (!isRecord(request))
    return giAdapterFailure('GI adapter request must be a record.', ['request'])

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
    return giAdapterFailure('GI canonical export must be a record.', [
      'canonicalExport',
    ])

  const problemValidation = validateLapicCanonicalProblem(
    canonicalExport.problem
  )
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
