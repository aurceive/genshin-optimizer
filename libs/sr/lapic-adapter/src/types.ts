import type {
  LapicAdapterMetadata,
  LapicDigest,
  LapicPotentialSolveMode,
  LapicProblemNormalizationInput,
} from '@genshin-optimizer/lapic/core'

export const srLapicAdapterPackageName = 'sr-lapic-adapter'
export const srLapicAdapterSchemaVersion = '0.1.0-draft'

export type SrLapicAdapterSchemaVersion = typeof srLapicAdapterSchemaVersion

export interface SrLapicSourceSnapshotDescriptor {
  readonly relicSnapshotDigest: LapicDigest
  readonly characterSnapshotDigest: LapicDigest
  readonly lightConeSnapshotDigest: LapicDigest
  readonly formulaSnapshotDigest: LapicDigest
  readonly optConfigSnapshotDigest?: LapicDigest
}

export interface SrLapicAdapterRequest {
  readonly adapterKind: 'sr'
  readonly normalizationInput: LapicProblemNormalizationInput
  readonly requestedPotentialSolveModes?: readonly LapicPotentialSolveMode[]
}

export interface SrLapicAdapterCapabilities {
  readonly adapterKind: 'sr'
  readonly supportedPotentialSolveModes: readonly LapicPotentialSolveMode[]
  readonly supportedFormulaCompilationModes: readonly string[]
  readonly supportedCandidateDomainClasses: readonly string[]
  readonly explicitlyUnsupportedSemantics: readonly string[]
}

export interface SrLapicAdapterSkeletonMarker {
  readonly packageName: typeof srLapicAdapterPackageName
  readonly schemaVersion: SrLapicAdapterSchemaVersion
}

export const srLapicAdapterSkeleton: SrLapicAdapterSkeletonMarker = {
  packageName: srLapicAdapterPackageName,
  schemaVersion: srLapicAdapterSchemaVersion,
}

const srSupportedPotentialSolveModes = [
  'current-only',
] as const satisfies readonly LapicPotentialSolveMode[]
const srSupportedFormulaCompilationModes = ['pando-detach'] as const
const srSupportedCandidateDomainClasses = [
  'relic-main',
  'relic-sub',
  'light-cone',
] as const
const srExplicitlyUnsupportedSemantics = [
  'multi-path-sub-stat-optimization',
  'conditional-passive-enumeration',
  'dynamic-team-rotation-modeling',
  'cross-frame-conditional-propagation',
] as const

export const srLapicAdapterCapabilities: SrLapicAdapterCapabilities = {
  adapterKind: 'sr',
  supportedPotentialSolveModes: srSupportedPotentialSolveModes,
  supportedFormulaCompilationModes: srSupportedFormulaCompilationModes,
  supportedCandidateDomainClasses: srSupportedCandidateDomainClasses,
  explicitlyUnsupportedSemantics: srExplicitlyUnsupportedSemantics,
}

export type SrLapicMetadata = LapicAdapterMetadata
