import type {
  LapicDigest,
  LapicSchemaVersion,
} from '@genshin-optimizer/lapic/core'

/**
 * Deterministic configuration record for a HiGHS LP solve.
 * Profile ID: 'lapic-highs-deterministic-v1'
 */
export interface LapicHighsDeterministicConfigRecord {
  readonly providerFamily: 'highs'
  readonly providerProfileId: 'lapic-highs-deterministic-v1'
  readonly providerVersion: string
  readonly buildFingerprint: string
  readonly platformFingerprint: string
  readonly threadCount: 1
  readonly algorithmSelection: string
  readonly presolveMode: string
  readonly scalingMode: string
  readonly crossoverMode?: string
  readonly primalFeasibilityTolerance: number
  readonly dualFeasibilityTolerance: number
  readonly optimalityTolerance?: number
  readonly iterationLimit: number
  readonly timeLimitPolicy: string
  readonly randomSeedPolicy: 'deterministic'
  readonly parallelPolicy: 'disabled'
}

/**
 * Numeric diagnostics emitted by HiGHS after an LP solve.
 */
export interface LapicHighsDiagnostics {
  readonly maxPrimalResidual: number
  readonly maxDualResidual: number
  readonly maxConstraintViolation: number
  readonly maxBoundViolation: number
  readonly objectiveGapEstimate?: number
  readonly conditionEstimate?: number
  readonly presolveReductionCounts: Readonly<Record<string, number>>
  readonly solverWarningFlags: readonly string[]
  readonly terminationReason: string
  readonly numericallyQuestionable: boolean
}

/**
 * Reason for triggering danger-zone assessment.
 */
export type LapicHighsDangerZoneTriggerReason =
  | 'objectiveNearThreshold'
  | 'poorConditioning'
  | 'highResidual'
  | 'unstableBasis'
  | 'providerWarning'
  | 'missingCriticalDiagnostic'

/**
 * Verification action taken when danger zone is triggered.
 */
export type LapicHighsDangerZoneVerificationAction =
  | 'none'
  | 'repeatWithConservativeNumericMode'
  | 'exactReplay'
  | 'rejectProviderDecision'

/**
 * Danger-zone assessment — threshold-sensitive prune decisions
 * require explicit recording of how close the bound is to the threshold.
 */
export interface LapicHighsDangerZoneAssessment {
  readonly thresholdDigest: LapicDigest
  readonly comparisonDirection: 'strictly-less' | 'strictly-greater' | 'equal'
  readonly distanceToThresholdEncodingKind: string
  readonly distanceToThresholdPayload: string
  readonly dangerZoneTriggered: boolean
  readonly triggerReasons: readonly LapicHighsDangerZoneTriggerReason[]
  readonly verificationAction: LapicHighsDangerZoneVerificationAction
  readonly verificationOutcome?: string
  readonly verificationEvidenceDigest?: LapicDigest
}

/**
 * Replay eligibility classification for an LP evidence payload.
 */
export type LapicHighsReplayEligibility =
  | 'providerReplayEligible'
  | 'exactReplayRequired'
  | 'diagnosticOnly'

/**
 * HighsEvidenceV1 — the complete evidence payload emitted by every
 * correctness-critical LP solve using HiGHS.
 *
 * Frozen in: low-level/highs-evidence-and-deterministic-config.md
 */
export interface LapicHighsEvidenceV1 {
  // Schema metadata
  readonly schemaKind: 'HighsEvidenceV1'
  readonly schemaVersion: LapicSchemaVersion

  // Provider identification
  readonly providerFamily: 'highs'
  readonly providerProfileId: 'lapic-highs-deterministic-v1'
  readonly providerVersion: string
  readonly buildFingerprint: string
  readonly platformFingerprint: string

  // Model identification
  readonly linearModelDigest: LapicDigest
  readonly relaxationDigest: LapicDigest
  readonly solveInvocationId: string

  // Solve outcome
  readonly objectiveSense: 'minimize' | 'maximize'
  readonly solveOutcome: 'solved' | 'infeasible' | 'unbounded' | 'interrupted'
  readonly primalStatus: string
  readonly dualStatus: string

  // Objective value (exact-decimal encoding)
  readonly objectiveValueEncodingKind: string
  readonly objectiveValuePayload: string

  // Bound direction
  readonly boundDirection: 'lower' | 'upper'

  // Solver metrics
  readonly iterationCount: number
  readonly presolveApplied: boolean
  readonly scalingApplied: boolean
  readonly basisAvailability: 'available' | 'unavailable'

  // Solution digests
  readonly primalSolutionDigest?: LapicDigest
  readonly dualSolutionDigest?: LapicDigest
  readonly rowStatusDigest?: LapicDigest
  readonly colStatusDigest?: LapicDigest

  // Diagnostics
  readonly diagnostics: LapicHighsDiagnostics

  // Danger-zone assessment
  readonly dangerZoneAssessment: LapicHighsDangerZoneAssessment

  // Replay eligibility
  readonly replayEligibility: LapicHighsReplayEligibility

  // Configuration record hash
  readonly configRecordDigest: LapicDigest
}
