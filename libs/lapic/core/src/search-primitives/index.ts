import type {
  LapicArithmeticPolicyId,
  LapicBlockId,
  LapicCandidateId,
  LapicDigest,
  LapicDomainId,
  LapicProblemDigest,
  LapicRegionId,
  LapicSlotId,
  LapicStateId,
} from '../identity'

/**
 * Identifies a partition of the search space for parallel or phased exploration.
 */
export interface LapicPartitionDescriptor {
  readonly partitionId: string
  readonly problemDigest: LapicProblemDigest
  readonly domainIds: readonly LapicDomainId[]
  readonly slotIds: readonly LapicSlotId[]
  readonly partitionKind: LapicPartitionKind
  readonly estimatedCandidateCount?: number
}

export type LapicPartitionKind =
  | 'per-slot'
  | 'per-domain'
  | 'cross-slot-join'
  | 'residual-exact'

/**
 * Ordering key for frontier nodes in the search queue.
 * Defined in terms of persisted ordering-key material.
 */
export interface LapicFrontierOrderingKey {
  readonly upperBoundDigest: LapicDigest
  readonly upperBoundValue: string
  readonly uncertaintyGapDigest: LapicDigest
  readonly deterministicTieBreakDigest: LapicDigest
  readonly partitionId: string
  readonly blockId: LapicBlockId
  readonly stateId?: LapicStateId
}

/**
 * Snapshot of threshold state for top-N bound-prune decisions.
 * Every threshold-sensitive certificate must reference a threshold snapshot.
 */
export interface LapicThresholdSnapshot {
  readonly incumbentSetDigest: LapicDigest
  readonly nthIncumbentValue: string
  readonly tieBreakFrontierDigest?: LapicDigest
  readonly solveStep: number
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
}

/**
 * Request to expand a partial state in the frontier into child states.
 */
export interface LapicStateExpansionRequest {
  readonly stateId: LapicStateId
  readonly regionId: LapicRegionId
  readonly partitionId: string
  readonly targetDomainId: LapicDomainId
  readonly candidateIds?: readonly LapicCandidateId[]
}

/**
 * Response from a state expansion step.
 */
export interface LapicStateExpansionResponse {
  readonly parentStateId: LapicStateId
  readonly childStateIds: readonly LapicStateId[]
  readonly prunedCount: number
  readonly dominatedCount: number
  readonly certificateDigests: readonly LapicDigest[]
}

/**
 * Non-provider-specific bound result for a region or state.
 */
export interface LapicAdmissibleBoundResult {
  readonly upperBound: string
  readonly lowerBound?: string
  readonly boundKind: LapicBoundKind
  readonly isExact: boolean
  readonly relaxId?: string
  readonly evidenceDigest?: LapicDigest
  readonly numericDangerZone: boolean
}

export type LapicBoundKind =
  | 'interval'
  | 'affine'
  | 'mccormick'
  | 'piecewise-linear'
  | 'lp'
  | 'exact-symbolic'
