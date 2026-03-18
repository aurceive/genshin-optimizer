import type {
  LapicCanonicalProblem,
  LapicDigest,
  LapicPotentialSolveMode,
  LapicProblemNormalizationInput,
} from '@genshin-optimizer/lapic/core'

export const giLapicAdapterPackageName = 'gi-lapic-adapter'
export const giLapicAdapterSchemaVersion = '0.1.0-draft'

export type GiLapicAdapterSchemaVersion = typeof giLapicAdapterSchemaVersion

export interface GiLapicAdapterRequest {
  readonly adapterKind: 'gi'
  readonly normalizationInput: LapicProblemNormalizationInput
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

export interface GiLapicAdapterSkeletonMarker {
  readonly packageName: typeof giLapicAdapterPackageName
  readonly schemaVersion: GiLapicAdapterSchemaVersion
}

export const giLapicAdapterSkeleton: GiLapicAdapterSkeletonMarker = {
  packageName: giLapicAdapterPackageName,
  schemaVersion: giLapicAdapterSchemaVersion,
}
