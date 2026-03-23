import type { MainStatKey } from '@genshin-optimizer/gi/consts'
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
  LapicCandidateDescriptor,
  LapicCandidateDomain,
  LapicCanonicalProblem,
  LapicDigest,
  LapicEngineVersion,
  LapicFirGraph,
  LapicPotentialParticipationMode,
  LapicPotentialSolveMode,
  LapicProblemDigest,
  LapicProblemId,
  LapicProblemNormalizationInput,
  LapicUpgradeFrontierDescriptor,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactCombinationEvaluation,
  LapicBoundedExactEvaluationComparator,
  LapicBoundedExactUpperBoundEvaluator,
  LapicInMemorySessionController,
  LapicSolveCompletionResult,
} from '@genshin-optimizer/lapic/runtime'
import type { LapicArtifactStore } from '@genshin-optimizer/lapic/storage'
import type { GiLapicCandidateVariableExtractor } from './bound-maps'

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

/**
 * Full source snapshot package envelope for governed GI exports.
 * Extends the descriptor with packaging policy metadata per
 * source-snapshot-packaging.md §3.
 */
export interface GiLapicSourceSnapshotPackage {
  readonly packageKind: 'source-snapshot-package-v1'
  readonly packageVersion: string
  readonly adapterKind: 'gi'
  readonly adapterVersion: GiLapicAdapterSchemaVersion
  readonly sourceSnapshotDescriptor: GiLapicSourceSnapshotDescriptor
  readonly sourceSnapshotDigestSet: readonly LapicDigest[]
  readonly manifestDigest: LapicDigest
  readonly payloadEntries: readonly GiLapicSnapshotPayloadEntry[]
  readonly reconstructionHints: readonly string[]
  readonly packagingPolicyId: string
}

export interface GiLapicSnapshotPayloadEntry {
  readonly entryId: string
  readonly entryClass:
    | 'inventorySnapshot'
    | 'entityStateSnapshot'
    | 'formulaDataSnapshot'
    | 'statTableSnapshot'
    | 'auxiliaryAdapterMetadata'
  readonly contentDigest: LapicDigest
  readonly description?: string
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
  readonly supportedFormulaCompilationModes: readonly string[]
  readonly supportedCandidateDomainClasses: readonly string[]
  readonly supportedLegacyCompatibilityPaths: readonly string[]
  readonly explicitlyUnsupportedSemantics: readonly string[]
}

export interface GiLapicCanonicalExport {
  readonly adapterKind: 'gi'
  readonly problem: LapicCanonicalProblem
  readonly canonicalProblemDigest: LapicProblemDigest
  readonly adapterVersion: GiLapicAdapterSchemaVersion
  readonly sourceSnapshotDigest: LapicDigest
  readonly sourceSnapshotDigestSet: readonly LapicDigest[]
  readonly formulaCompilationMode: string
  readonly featureSchemaVersion: GiLapicAdapterSchemaVersion
  readonly filterTransformationLog: readonly string[]
  readonly unsupportedFeatureList: readonly string[]
  readonly replayReconstructionHints: readonly string[]
  readonly supportedGraphOutputModes: readonly string[]
  readonly potentialSolveMode?: LapicPotentialSolveMode
  readonly potentialParticipationMode?: LapicPotentialParticipationMode
  readonly upgradeFrontierDescriptorSet?: readonly LapicUpgradeFrontierDescriptor[]
  readonly potentialSummarySchemaVersion?: GiLapicAdapterSchemaVersion
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

export type GiLapicBoundedCurrentOnlyCombinationEvaluator = (
  combination: LapicBoundedExactCandidateCombination,
  canonicalExport: GiLapicCanonicalExport
) => LapicValidationResult<LapicBoundedExactCombinationEvaluation>

export type GiLapicBoundedCurrentOnlyFeasibilityEvaluator = (
  combination: LapicBoundedExactCandidateCombination,
  canonicalExport: GiLapicCanonicalExport
) => boolean | LapicValidationResult<boolean>

export interface GiLapicBoundedCurrentOnlySolveOptions {
  readonly request: GiLapicAdapterRequest
  readonly canonicalIdentity: GiLapicCanonicalIdentity
  readonly controller: LapicInMemorySessionController
  readonly artifactStore: LapicArtifactStore
  readonly evaluateCombination: GiLapicBoundedCurrentOnlyCombinationEvaluator
  readonly compareEvaluations?: LapicBoundedExactEvaluationComparator
  readonly isCombinationFeasible?: GiLapicBoundedCurrentOnlyFeasibilityEvaluator
  readonly maxCombinationCount?: number
  readonly computeUpperBound?: LapicBoundedExactUpperBoundEvaluator
  /**
   * Optional extractor that maps each candidate to its F-IR variable values.
   * When provided and `computeUpperBound` is absent, the adapter automatically
   * creates a built-in FIR-bound provider using the compiled F-IR graph.
   */
  readonly candidateVariableExtractor?: GiLapicCandidateVariableExtractor
}

export interface GiLapicBoundedCurrentOnlySolveResult {
  readonly canonicalExport: GiLapicCanonicalExport
  readonly completion: LapicSolveCompletionResult
  /** Compiled F-IR graph (present when optimization target compiles successfully). */
  readonly firGraph?: LapicFirGraph
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

const giSupportedPotentialSolveModes = [
  'current-only',
] as const satisfies readonly LapicPotentialSolveMode[]
const giSupportedGraphOutputKinds = ['gi-plot-base'] as const
const giSupportedFormulaCompilationModes = ['gi-legacy-compatibility'] as const
const giSupportedCandidateDomainClasses = ['artifact-inventory'] as const
const giSupportedLegacyCompatibilityPaths = ['waverider-opt-node'] as const
const giExplicitlyUnsupportedSemantics = [
  'gi-canonical-pando-export',
  'gi-upgrade-frontier-export',
  'gi-potential-aware-ranking',
  'gi-tc-subproblem-export',
] as const

export const giLapicAdapterCapabilities: GiLapicAdapterCapabilities = {
  adapterKind: 'gi',
  supportedPotentialSolveModes: giSupportedPotentialSolveModes,
  supportedGraphOutputKinds: giSupportedGraphOutputKinds,
  supportedFormulaCompilationModes: giSupportedFormulaCompilationModes,
  supportedCandidateDomainClasses: giSupportedCandidateDomainClasses,
  supportedLegacyCompatibilityPaths: giSupportedLegacyCompatibilityPaths,
  explicitlyUnsupportedSemantics: giExplicitlyUnsupportedSemantics,
}

export type GiLapicArtifact = ICachedArtifact
export type GiLapicCounterFacts = readonly LapicAggregateCountFact[]
export type GiLapicCandidate = LapicCandidateDescriptor
export type GiLapicCandidateSet = readonly LapicCandidateDomain[]
export type GiLapicMetadata = LapicAdapterMetadata
