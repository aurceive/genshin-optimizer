import type {
  LapicAdapterMetadata,
  LapicDigest,
} from '@genshin-optimizer/lapic/core'
import type { SrLapicMigrationState } from './governance'
import type {
  SrLapicAdapterCapabilities,
  SrLapicAdapterRequest,
  SrLapicSourceSnapshotDescriptor,
} from './types'
import {
  srLapicAdapterCapabilities,
  srLapicAdapterSchemaVersion,
} from './types'

/** Current production migration state for the SR adapter. */
export const SR_LAPIC_CURRENT_MIGRATION_STATE: SrLapicMigrationState =
  'legacyValidated'

export function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

export function getSrLapicAdapterCapabilities(): SrLapicAdapterCapabilities {
  return srLapicAdapterCapabilities
}

export function createSrLapicSourceSnapshotDigests(
  sourceSnapshots: SrLapicSourceSnapshotDescriptor
): readonly LapicDigest[] {
  return [
    sourceSnapshots.relicSnapshotDigest,
    sourceSnapshots.characterSnapshotDigest,
    sourceSnapshots.lightConeSnapshotDigest,
    sourceSnapshots.formulaSnapshotDigest,
    ...(sourceSnapshots.optConfigSnapshotDigest
      ? [sourceSnapshots.optConfigSnapshotDigest]
      : []),
  ]
}

export function createSrLapicAdapterMetadata(
  request: SrLapicAdapterRequest
): LapicAdapterMetadata {
  const declaredUnsupportedFeatures = uniqueStrings([
    ...request.normalizationInput.adapterMetadata.declaredUnsupportedFeatures,
    ...srLapicAdapterCapabilities.explicitlyUnsupportedSemantics,
  ])

  return {
    ...request.normalizationInput.adapterMetadata,
    adapterKind: request.normalizationInput.adapterMetadata.adapterKind,
    supportedPotentialSolveModes:
      srLapicAdapterCapabilities.supportedPotentialSolveModes,
    declaredUnsupportedFeatures,
    metadata: {
      ...request.normalizationInput.adapterMetadata.metadata,
      formulaCompilationMode:
        srLapicAdapterCapabilities.supportedFormulaCompilationModes[0],
      featureSchemaVersion: srLapicAdapterSchemaVersion,
      migrationState: SR_LAPIC_CURRENT_MIGRATION_STATE,
      supportedCandidateDomainClasses:
        srLapicAdapterCapabilities.supportedCandidateDomainClasses.join(','),
    },
  }
}
