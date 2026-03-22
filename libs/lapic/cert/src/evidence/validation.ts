import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicHighsDangerZoneAssessment,
  LapicHighsDangerZoneTriggerReason,
  LapicHighsDangerZoneVerificationAction,
  LapicHighsDiagnostics,
  LapicHighsEvidenceV1,
  LapicHighsReplayEligibility,
} from './types'

const VALID_TRIGGER_REASONS: readonly LapicHighsDangerZoneTriggerReason[] = [
  'objectiveNearThreshold',
  'poorConditioning',
  'highResidual',
  'unstableBasis',
  'providerWarning',
  'missingCriticalDiagnostic',
]

const VALID_VERIFICATION_ACTIONS: readonly LapicHighsDangerZoneVerificationAction[] =
  [
    'none',
    'repeatWithConservativeNumericMode',
    'exactReplay',
    'rejectProviderDecision',
  ]

const VALID_REPLAY_ELIGIBILITY: readonly LapicHighsReplayEligibility[] = [
  'providerReplayEligible',
  'exactReplayRequired',
  'diagnosticOnly',
]

function fail(message: string): LapicValidationResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'SchemaViolation', message }],
  }
}

function succeed<T>(value: T): LapicValidationResult<T> {
  return { ok: true, value, diagnostics: [] }
}

export function validateHighsDiagnostics(
  d: LapicHighsDiagnostics
): LapicValidationResult<LapicHighsDiagnostics> {
  if (typeof d.maxPrimalResidual !== 'number')
    return fail('diagnostics.maxPrimalResidual must be a number')
  if (typeof d.maxDualResidual !== 'number')
    return fail('diagnostics.maxDualResidual must be a number')
  if (typeof d.maxConstraintViolation !== 'number')
    return fail('diagnostics.maxConstraintViolation must be a number')
  if (typeof d.maxBoundViolation !== 'number')
    return fail('diagnostics.maxBoundViolation must be a number')
  if (typeof d.terminationReason !== 'string')
    return fail('diagnostics.terminationReason must be a string')
  if (typeof d.numericallyQuestionable !== 'boolean')
    return fail('diagnostics.numericallyQuestionable must be a boolean')
  if (!Array.isArray(d.solverWarningFlags))
    return fail('diagnostics.solverWarningFlags must be an array')
  if (
    typeof d.presolveReductionCounts !== 'object' ||
    d.presolveReductionCounts === null
  )
    return fail('diagnostics.presolveReductionCounts must be an object')
  return succeed(d)
}

export function validateHighsDangerZoneAssessment(
  dz: LapicHighsDangerZoneAssessment
): LapicValidationResult<LapicHighsDangerZoneAssessment> {
  if (typeof dz.thresholdDigest !== 'string')
    return fail('dangerZoneAssessment.thresholdDigest must be a string')
  if (
    dz.comparisonDirection !== 'strictly-less' &&
    dz.comparisonDirection !== 'strictly-greater' &&
    dz.comparisonDirection !== 'equal'
  )
    return fail(
      `dangerZoneAssessment.comparisonDirection must be 'strictly-less', 'strictly-greater', or 'equal'`
    )
  if (typeof dz.distanceToThresholdEncodingKind !== 'string')
    return fail(
      'dangerZoneAssessment.distanceToThresholdEncodingKind must be a string'
    )
  if (typeof dz.distanceToThresholdPayload !== 'string')
    return fail(
      'dangerZoneAssessment.distanceToThresholdPayload must be a string'
    )
  if (typeof dz.dangerZoneTriggered !== 'boolean')
    return fail('dangerZoneAssessment.dangerZoneTriggered must be a boolean')
  if (!Array.isArray(dz.triggerReasons))
    return fail('dangerZoneAssessment.triggerReasons must be an array')
  for (const reason of dz.triggerReasons) {
    if (!VALID_TRIGGER_REASONS.includes(reason))
      return fail(
        `Invalid danger-zone trigger reason '${reason}'. Expected one of: ${VALID_TRIGGER_REASONS.join(', ')}`
      )
  }
  if (!VALID_VERIFICATION_ACTIONS.includes(dz.verificationAction))
    return fail(
      `Invalid verification action '${dz.verificationAction}'. Expected one of: ${VALID_VERIFICATION_ACTIONS.join(', ')}`
    )
  // 'none' is only valid when danger zone is not triggered
  if (!dz.dangerZoneTriggered && dz.verificationAction !== 'none')
    return fail(
      'When dangerZoneTriggered is false, verificationAction must be "none"'
    )
  if (dz.dangerZoneTriggered && dz.verificationAction === 'none')
    return fail(
      'When dangerZoneTriggered is true, verificationAction must not be "none"'
    )
  if (dz.dangerZoneTriggered && dz.triggerReasons.length === 0)
    return fail(
      'When dangerZoneTriggered is true, at least one trigger reason is required'
    )
  return succeed(dz)
}

export function validateHighsEvidenceV1(
  evidence: LapicHighsEvidenceV1
): LapicValidationResult<LapicHighsEvidenceV1> {
  // Schema identity
  if (evidence.schemaKind !== 'HighsEvidenceV1')
    return fail(`schemaKind must be 'HighsEvidenceV1'`)
  if (typeof evidence.schemaVersion !== 'string')
    return fail('schemaVersion must be a string')

  // Provider identity
  if (evidence.providerFamily !== 'highs')
    return fail(`providerFamily must be 'highs'`)
  if (evidence.providerProfileId !== 'lapic-highs-deterministic-v1')
    return fail(`providerProfileId must be 'lapic-highs-deterministic-v1'`)
  if (typeof evidence.providerVersion !== 'string')
    return fail('providerVersion must be a string')
  if (typeof evidence.buildFingerprint !== 'string')
    return fail('buildFingerprint must be a string')
  if (typeof evidence.platformFingerprint !== 'string')
    return fail('platformFingerprint must be a string')

  // Model identification
  if (typeof evidence.linearModelDigest !== 'string')
    return fail('linearModelDigest must be a string')
  if (typeof evidence.relaxationDigest !== 'string')
    return fail('relaxationDigest must be a string')
  if (typeof evidence.solveInvocationId !== 'string')
    return fail('solveInvocationId must be a string')

  // Solve outcome
  if (
    evidence.objectiveSense !== 'minimize' &&
    evidence.objectiveSense !== 'maximize'
  )
    return fail(`objectiveSense must be 'minimize' or 'maximize'`)
  const validOutcomes = ['solved', 'infeasible', 'unbounded', 'interrupted']
  if (!validOutcomes.includes(evidence.solveOutcome))
    return fail(`solveOutcome must be one of: ${validOutcomes.join(', ')}`)
  if (typeof evidence.primalStatus !== 'string')
    return fail('primalStatus must be a string')
  if (typeof evidence.dualStatus !== 'string')
    return fail('dualStatus must be a string')

  // Objective value
  if (typeof evidence.objectiveValueEncodingKind !== 'string')
    return fail('objectiveValueEncodingKind must be a string')
  if (typeof evidence.objectiveValuePayload !== 'string')
    return fail('objectiveValuePayload must be a string')

  // Bound direction
  if (
    evidence.boundDirection !== 'lower' &&
    evidence.boundDirection !== 'upper'
  )
    return fail(`boundDirection must be 'lower' or 'upper'`)

  // Solver metrics
  if (
    typeof evidence.iterationCount !== 'number' ||
    evidence.iterationCount < 0
  )
    return fail('iterationCount must be a non-negative number')
  if (typeof evidence.presolveApplied !== 'boolean')
    return fail('presolveApplied must be a boolean')
  if (typeof evidence.scalingApplied !== 'boolean')
    return fail('scalingApplied must be a boolean')
  if (
    evidence.basisAvailability !== 'available' &&
    evidence.basisAvailability !== 'unavailable'
  )
    return fail(`basisAvailability must be 'available' or 'unavailable'`)

  // Diagnostics
  const diagResult = validateHighsDiagnostics(evidence.diagnostics)
  if (!diagResult.ok) return diagResult as LapicValidationResult<never>

  // Danger-zone
  const dzResult = validateHighsDangerZoneAssessment(
    evidence.dangerZoneAssessment
  )
  if (!dzResult.ok) return dzResult as LapicValidationResult<never>

  // Replay eligibility
  if (!VALID_REPLAY_ELIGIBILITY.includes(evidence.replayEligibility))
    return fail(
      `replayEligibility must be one of: ${VALID_REPLAY_ELIGIBILITY.join(', ')}`
    )

  // Consistency: danger-zone triggered → exactReplayRequired or diagnosticOnly
  if (
    evidence.dangerZoneAssessment.dangerZoneTriggered &&
    evidence.replayEligibility === 'providerReplayEligible'
  )
    return fail(
      'When danger zone is triggered, replayEligibility must not be "providerReplayEligible"'
    )

  // Config record
  if (typeof evidence.configRecordDigest !== 'string')
    return fail('configRecordDigest must be a string')

  return succeed(evidence)
}
