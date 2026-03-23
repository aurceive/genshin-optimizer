import type {
  LapicAdapterMetadata,
  LapicDigest,
} from '@genshin-optimizer/lapic/core'
import type { ZzzLapicMigrationState } from './governance'
import type {
  ZzzLapicAdapterCapabilities,
  ZzzLapicAdapterRequest,
  ZzzLapicSourceSnapshotDescriptor,
} from './types'
import {
  zzzLapicAdapterCapabilities,
  zzzLapicAdapterSchemaVersion,
} from './types'

/** Current production migration state for the ZZZ adapter. */
export const ZZZ_LAPIC_CURRENT_MIGRATION_STATE: ZzzLapicMigrationState =
  'legacyValidated'

export function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

export function getZzzLapicAdapterCapabilities(): ZzzLapicAdapterCapabilities {
  return zzzLapicAdapterCapabilities
}

export function createZzzLapicSourceSnapshotDigests(
  sourceSnapshots: ZzzLapicSourceSnapshotDescriptor
): readonly LapicDigest[] {
  return [
    sourceSnapshots.discSnapshotDigest,
    sourceSnapshots.characterSnapshotDigest,
    sourceSnapshots.wengineSnapshotDigest,
    sourceSnapshots.formulaSnapshotDigest,
    ...(sourceSnapshots.optConfigSnapshotDigest
      ? [sourceSnapshots.optConfigSnapshotDigest]
      : []),
  ]
}

export function createZzzLapicAdapterMetadata(
  request: ZzzLapicAdapterRequest
): LapicAdapterMetadata {
  const declaredUnsupportedFeatures = uniqueStrings([
    ...request.normalizationInput.adapterMetadata.declaredUnsupportedFeatures,
    ...zzzLapicAdapterCapabilities.explicitlyUnsupportedSemantics,
  ])

  return {
    ...request.normalizationInput.adapterMetadata,
    adapterKind: request.normalizationInput.adapterMetadata.adapterKind,
    supportedPotentialSolveModes:
      zzzLapicAdapterCapabilities.supportedPotentialSolveModes,
    declaredUnsupportedFeatures,
    metadata: {
      ...request.normalizationInput.adapterMetadata.metadata,
      formulaCompilationMode:
        zzzLapicAdapterCapabilities.supportedFormulaCompilationModes[0],
      featureSchemaVersion: zzzLapicAdapterSchemaVersion,
      migrationState: ZZZ_LAPIC_CURRENT_MIGRATION_STATE,
      supportedCandidateDomainClasses:
        zzzLapicAdapterCapabilities.supportedCandidateDomainClasses.join(','),
    },
  }
}
