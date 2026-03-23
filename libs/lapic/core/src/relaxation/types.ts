import type {
  LapicArithmeticPolicyId,
  LapicDigest,
  LapicRegionId,
  LapicRelaxId,
} from '../identity'
import type { LapicSchemaVersion } from '../schema'

/**
 * Classification of admissible relaxation methods within the bound cascade.
 * Ordered by cost and expected tightness (cheapest first).
 */
export type LapicRelaxationKind =
  | 'IntervalRelax'
  | 'AffineRelax'
  | 'McCormickRelax'
  | 'PiecewiseLinearRelax'
  | 'LinearProgramRelax'

/**
 * Verification status of a relaxation artifact.
 */
export type LapicRelaxationVerificationStatus =
  | 'unverified'
  | 'admissibility-checked'
  | 'danger-zone-escalated'
  | 'rejected'

/**
 * Direction of the bound produced by a relaxation.
 */
export type LapicBoundDirection = 'lower' | 'upper'

/**
 * Variable basis declaration — every relaxation must declare its
 * basis explicitly to prevent hidden basis changes.
 */
export type LapicVariableBasisKind =
  | 'original-feature'
  | 'affine-reduced'
  | 'region-local-lifted'
  | 'join-level-aggregate'

export interface LapicVariableBasis {
  readonly basisKind: LapicVariableBasisKind
  readonly variableIds: readonly string[]
  readonly basisTransformDigest?: LapicDigest
}

/**
 * Validity domain — every R-IR artifact is valid only within its declared domain.
 * Reuse outside the domain is forbidden.
 */
export interface LapicRelaxationValidityDomain {
  readonly activePartitionDigest: LapicDigest
  readonly branchRegionPredicates: readonly LapicDigest[]
  readonly exactVariableBoundsDigest: LapicDigest
  readonly categoricalAssumptions: readonly string[]
  readonly compatibilityConstraintDigests: readonly LapicDigest[]
}

/**
 * A single linear constraint in an LP model:
 *   lo ≤ Σ(coefficients[i] * variables[i]) ≤ hi
 */
export interface LapicLinearConstraint {
  readonly constraintId: string
  readonly coefficients: readonly number[]
  readonly variableIndices: readonly number[]
  readonly lowerBound: number
  readonly upperBound: number
}

/**
 * Variable descriptor in an LP model.
 */
export interface LapicLinearVariable {
  readonly variableIndex: number
  readonly name: string
  readonly lowerBound: number
  readonly upperBound: number
}

/**
 * Objective function for an LP model:
 *   minimize/maximize  Σ(coefficients[i] * variables[i]) + offset
 */
export interface LapicLinearObjective {
  readonly sense: 'minimize' | 'maximize'
  readonly coefficients: readonly number[]
  readonly variableIndices: readonly number[]
  readonly offset: number
}

/**
 * Complete LP model ready for submission to an LP provider.
 */
export interface LapicLinearModel {
  readonly modelDigest: LapicDigest
  readonly variables: readonly LapicLinearVariable[]
  readonly constraints: readonly LapicLinearConstraint[]
  readonly objective: LapicLinearObjective
}

/**
 * Result status from an LP solve.
 */
export type LapicLpSolveOutcome =
  | 'solved'
  | 'infeasible'
  | 'unbounded'
  | 'interrupted'

/**
 * LP solve result returned by a provider.
 */
export interface LapicLpSolveResult {
  readonly outcome: LapicLpSolveOutcome
  readonly objectiveValue?: string
  readonly boundDirection: LapicBoundDirection
  readonly evidenceDigest: LapicDigest
  readonly iterationCount: number
  readonly numericallyQuestionable: boolean
}

/**
 * Configuration for an LP provider's deterministic mode.
 */
export interface LapicLpDeterministicMode {
  readonly profileId: string
  readonly configRecordDigest: LapicDigest
}

/**
 * LP provider contract — every LP solver binding must implement this interface.
 *
 * Required guarantees:
 * - Runs deterministically under configured mode
 * - Exposes evidence for replay or conservative validation
 * - Separates infeasible, unbounded, and solved outcomes
 * - Reports diagnostics for danger-zone policy
 *
 * Forbidden behavior:
 * - Hidden randomization
 * - Undisclosed presolve transformations
 * - Adaptive tolerances without metadata
 * - Nondeterministic tie-breaking
 */
export interface LapicLpProvider {
  readonly deterministicMode: LapicLpDeterministicMode
  solve(model: LapicLinearModel): LapicLpSolveResult
  serializeEvidence(result: LapicLpSolveResult): unknown
}

/**
 * Constraint system descriptor within an R-IR artifact.
 */
export interface LapicConstraintSystem {
  readonly constraintCount: number
  readonly constraintDigest: LapicDigest
}

/**
 * Objective system descriptor within an R-IR artifact.
 */
export interface LapicObjectiveSystem {
  readonly objectiveDigest: LapicDigest
  readonly sense: 'minimize' | 'maximize'
}

/**
 * R-IR artifact — canonical relaxation intermediate representation.
 * Every relaxation artifact conforms to this schema.
 */
export interface LapicRelaxationArtifact {
  readonly relaxId: LapicRelaxId
  readonly schemaVersion: LapicSchemaVersion
  readonly relaxationKind: LapicRelaxationKind
  readonly sourceNodeSetDigest: LapicDigest
  readonly targetRegionDescriptor: LapicRegionId
  readonly variableBasis: LapicVariableBasis
  readonly constraintSystem: LapicConstraintSystem
  readonly objectiveSystem: LapicObjectiveSystem
  readonly validityDomain: LapicRelaxationValidityDomain
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
  readonly verificationStatus: LapicRelaxationVerificationStatus
  readonly boundDirection: LapicBoundDirection
  readonly boundValue?: string
  readonly evidenceDigest?: LapicDigest
  readonly providerProfileId?: string
}
