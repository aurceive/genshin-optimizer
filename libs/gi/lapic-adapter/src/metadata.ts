import type { LapicAdapterMetadata, LapicDigest } from '@genshin-optimizer/lapic/core'
import type { GiLapicMigrationState } from './governance'
import type { GiLapicAdapterCapabilities, GiLapicAdapterRequest, GiLapicSourceSnapshotDescriptor } from './types'
import { giLapicAdapterCapabilities, giLapicAdapterSchemaVersion } from './types'

/** Current production migration state for the GI adapter. */
export const GI_LAPIC_CURRENT_MIGRATION_STATE: GiLapicMigrationState = 'legacyValidated'

export function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
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
    declaredUnsupportedFeatures: createGiDeclaredUnsupportedFeatures(request),
    metadata: {
      ...request.normalizationInput.adapterMetadata.metadata,
      formulaCompilationMode:
        giLapicAdapterCapabilities.supportedFormulaCompilationModes[0],
      featureSchemaVersion: giLapicAdapterSchemaVersion,
      migrationState: GI_LAPIC_CURRENT_MIGRATION_STATE,
      supportedGraphOutputKinds:
        giLapicAdapterCapabilities.supportedGraphOutputKinds.join(','),
      supportedCandidateDomainClasses:
        giLapicAdapterCapabilities.supportedCandidateDomainClasses.join(','),
      legacyCompatibilityPath:
        giLapicAdapterCapabilities.supportedLegacyCompatibilityPaths[0],
      replayReconstructionHints: createGiReplayReconstructionHints(request).join(','),
      filterTransformationLog: createGiFilterTransformationLog(request).join(','),
    },
  }
}
