/**
 * GI TC (Theorycrafting) Subproblem — Type Definitions
 *
 * Per adapters-gi-sr-zzz.md §8.8 and adapters-gi-sr-zzz-api.md §9.3,
 * TC optimization is a separate adapter sub-family with its own
 * request/export types. TC optimizes roll distributions, not inventory
 * combinations, so the candidate domain model is fundamentally different.
 *
 * Status: structural scaffold only — TC solve pipeline is not yet
 * implemented. All types are defined for architecture compliance and
 * to prevent accidental leakage into the artifact optimization path.
 */

import type {
  LapicArithmeticPolicyId,
  LapicDigest,
  LapicEngineVersion,
  LapicProblemDigest,
  LapicProblemId,
  LapicProblemNormalizationInput,
} from '@genshin-optimizer/lapic/core'

// ---------------------------------------------------------------------------
// TC adapter identity
// ---------------------------------------------------------------------------

export const giLapicTcAdapterKind = 'gi-tc' as const
export const giLapicTcAdapterSchemaVersion = '0.1.0-draft' as const

export type GiLapicTcAdapterKind = typeof giLapicTcAdapterKind
export type GiLapicTcAdapterSchemaVersion = typeof giLapicTcAdapterSchemaVersion

// ---------------------------------------------------------------------------
// TC candidate domain: roll distributions
// ---------------------------------------------------------------------------

/**
 * Materializability constraint classifying whether a TC candidate
 * configuration is achievable under current game rules.
 */
export type GiLapicTcMaterializability =
  | 'fully-achievable'
  | 'partially-achievable'
  | 'theoretical-only'

/**
 * A single roll-distribution candidate in the TC optimization space.
 * Unlike artifact candidates, TC candidates represent hypothetical
 * stat configurations from substat roll distributions.
 */
export interface GiLapicTcCandidate {
  readonly candidateId: string
  readonly distributionId: string
  readonly slotKey: string
  readonly mainStatKey: string
  readonly substatDistribution: ReadonlyMap<string, number>
  readonly materializability: GiLapicTcMaterializability
  readonly rollCount: number
}

/**
 * A TC candidate domain groups all achievable roll-distribution states
 * for a single artifact slot.
 */
export interface GiLapicTcCandidateDomain {
  readonly domainId: string
  readonly slotId: string
  readonly candidates: readonly GiLapicTcCandidate[]
}

// ---------------------------------------------------------------------------
// TC request contract
// ---------------------------------------------------------------------------

/**
 * TC-specific optimization request. This is the TC counterpart of
 * GiLapicOptimizationRequest — it does NOT reference artifact inventory.
 */
export interface GiLapicTcOptimizationRequest {
  readonly targetFormula: string
  readonly slotConstraints: ReadonlyMap<string, GiLapicTcSlotConstraint>
  readonly rollBudget: number
  readonly materializabilityFilter: GiLapicTcMaterializability
  readonly topN: number
}

export interface GiLapicTcSlotConstraint {
  readonly mainStatKey: string
  readonly setKey?: string
  readonly minRolls?: number
  readonly maxRolls?: number
}

/**
 * TC adapter request wrapper. The `adapterKind` field is `'gi-tc'`,
 * explicitly distinguishing it from the `'gi'` artifact path.
 */
export interface GiLapicTcAdapterRequest {
  readonly adapterKind: GiLapicTcAdapterKind
  readonly normalizationInput: LapicProblemNormalizationInput
  readonly tcRequest: GiLapicTcOptimizationRequest
}

// ---------------------------------------------------------------------------
// TC canonical export
// ---------------------------------------------------------------------------

/**
 * TC-specific canonical export. Structurally parallel to
 * GiLapicCanonicalExport but carrying TC-specific metadata.
 */
export interface GiLapicTcCanonicalExport {
  readonly adapterKind: GiLapicTcAdapterKind
  readonly canonicalProblemDigest: LapicProblemDigest
  readonly problemId: LapicProblemId
  readonly engineVersion: LapicEngineVersion
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
  readonly adapterVersion: GiLapicTcAdapterSchemaVersion
  readonly sourceSnapshotDigestSet: readonly LapicDigest[]
  readonly rollDistributionDomains: readonly GiLapicTcCandidateDomain[]
  readonly materializabilityMode: GiLapicTcMaterializability
  readonly unsupportedFeatureList: readonly string[]
}

// ---------------------------------------------------------------------------
// TC capabilities
// ---------------------------------------------------------------------------

export interface GiLapicTcAdapterCapabilities {
  readonly adapterKind: GiLapicTcAdapterKind
  readonly supportedMaterializabilityModes: readonly GiLapicTcMaterializability[]
  readonly explicitlyUnsupportedSemantics: readonly string[]
}

export const giLapicTcAdapterCapabilities: GiLapicTcAdapterCapabilities = {
  adapterKind: giLapicTcAdapterKind,
  supportedMaterializabilityModes: ['fully-achievable'],
  explicitlyUnsupportedSemantics: [
    'gi-tc-partial-roll-budget',
    'gi-tc-multi-character-distribution',
    'gi-tc-cross-slot-correlation',
  ],
}
