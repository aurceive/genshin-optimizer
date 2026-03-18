import type {
  LapicCanonicalProblem,
  LapicDigest,
  LapicPotentialSolveMode,
  LapicProblemNormalizationInput,
} from '@genshin-optimizer/lapic/core'

export const zzzLapicAdapterPackageName = 'zzz-lapic-adapter'
export const zzzLapicAdapterSchemaVersion = '0.1.0-draft'

export type ZzzLapicAdapterSchemaVersion = typeof zzzLapicAdapterSchemaVersion

export interface ZzzLapicAdapterRequest {
  readonly adapterKind: 'zzz'
  readonly normalizationInput: LapicProblemNormalizationInput
  readonly requestedPotentialSolveModes?: readonly LapicPotentialSolveMode[]
}

export interface ZzzLapicAdapterCapabilities {
  readonly adapterKind: 'zzz'
  readonly supportedPotentialSolveModes: readonly LapicPotentialSolveMode[]
  readonly supportedGraphOutputKinds: readonly string[]
}

export interface ZzzLapicCanonicalExport {
  readonly adapterKind: 'zzz'
  readonly problem: LapicCanonicalProblem
  readonly sourceSnapshotDigest: LapicDigest
}

export interface ZzzLapicAdapterSkeletonMarker {
  readonly packageName: typeof zzzLapicAdapterPackageName
  readonly schemaVersion: ZzzLapicAdapterSchemaVersion
}

export const zzzLapicAdapterSkeleton: ZzzLapicAdapterSkeletonMarker = {
  packageName: zzzLapicAdapterPackageName,
  schemaVersion: zzzLapicAdapterSchemaVersion,
}