import type {
  LapicCanonicalProblem,
  LapicDigest,
  LapicPotentialSolveMode,
  LapicProblemNormalizationInput,
} from '@genshin-optimizer/lapic/core'

export const srLapicAdapterPackageName = 'sr-lapic-adapter'
export const srLapicAdapterSchemaVersion = '0.1.0-draft'

export type SrLapicAdapterSchemaVersion = typeof srLapicAdapterSchemaVersion

export interface SrLapicAdapterRequest {
  readonly adapterKind: 'sr'
  readonly normalizationInput: LapicProblemNormalizationInput
  readonly requestedPotentialSolveModes?: readonly LapicPotentialSolveMode[]
}

export interface SrLapicAdapterCapabilities {
  readonly adapterKind: 'sr'
  readonly supportedPotentialSolveModes: readonly LapicPotentialSolveMode[]
  readonly supportedGraphOutputKinds: readonly string[]
}

export interface SrLapicCanonicalExport {
  readonly adapterKind: 'sr'
  readonly problem: LapicCanonicalProblem
  readonly sourceSnapshotDigest: LapicDigest
}

export interface SrLapicAdapterSkeletonMarker {
  readonly packageName: typeof srLapicAdapterPackageName
  readonly schemaVersion: SrLapicAdapterSchemaVersion
}

export const srLapicAdapterSkeleton: SrLapicAdapterSkeletonMarker = {
  packageName: srLapicAdapterPackageName,
  schemaVersion: srLapicAdapterSchemaVersion,
}
