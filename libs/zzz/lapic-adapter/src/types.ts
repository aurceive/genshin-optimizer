import type {
  LapicAdapterMetadata,
  LapicDigest,
  LapicPotentialSolveMode,
  LapicProblemNormalizationInput,
} from '@genshin-optimizer/lapic/core'

export const zzzLapicAdapterPackageName = 'zzz-lapic-adapter'
export const zzzLapicAdapterSchemaVersion = '0.1.0-draft'

export type ZzzLapicAdapterSchemaVersion = typeof zzzLapicAdapterSchemaVersion

export interface ZzzLapicSourceSnapshotDescriptor {
  readonly discSnapshotDigest: LapicDigest
  readonly characterSnapshotDigest: LapicDigest
  readonly wengineSnapshotDigest: LapicDigest
  readonly formulaSnapshotDigest: LapicDigest
  readonly optConfigSnapshotDigest?: LapicDigest
}

export interface ZzzLapicAdapterRequest {
  readonly adapterKind: 'zzz'
  readonly normalizationInput: LapicProblemNormalizationInput
  readonly requestedPotentialSolveModes?: readonly LapicPotentialSolveMode[]
}

export interface ZzzLapicAdapterCapabilities {
  readonly adapterKind: 'zzz'
  readonly supportedPotentialSolveModes: readonly LapicPotentialSolveMode[]
  readonly supportedFormulaCompilationModes: readonly string[]
  readonly supportedCandidateDomainClasses: readonly string[]
  readonly explicitlyUnsupportedSemantics: readonly string[]
}

export interface ZzzLapicAdapterSkeletonMarker {
  readonly packageName: typeof zzzLapicAdapterPackageName
  readonly schemaVersion: ZzzLapicAdapterSchemaVersion
}

export const zzzLapicAdapterSkeleton: ZzzLapicAdapterSkeletonMarker = {
  packageName: zzzLapicAdapterPackageName,
  schemaVersion: zzzLapicAdapterSchemaVersion,
}

const zzzSupportedPotentialSolveModes = [
  'current-only',
] as const satisfies readonly LapicPotentialSolveMode[]
const zzzSupportedFormulaCompilationModes = ['pando-detach'] as const
const zzzSupportedCandidateDomainClasses = [
  'disc-main',
  'disc-sub',
  'wengine',
] as const
const zzzExplicitlyUnsupportedSemantics = [
  'multi-path-sub-stat-optimization',
  'conditional-passive-enumeration',
  'dynamic-team-rotation-modeling',
  'cross-frame-conditional-propagation',
  'decimal-precision-above-base-times-upgrades',
] as const

export const zzzLapicAdapterCapabilities: ZzzLapicAdapterCapabilities = {
  adapterKind: 'zzz',
  supportedPotentialSolveModes: zzzSupportedPotentialSolveModes,
  supportedFormulaCompilationModes: zzzSupportedFormulaCompilationModes,
  supportedCandidateDomainClasses: zzzSupportedCandidateDomainClasses,
  explicitlyUnsupportedSemantics: zzzExplicitlyUnsupportedSemantics,
}

export type ZzzLapicMetadata = LapicAdapterMetadata
