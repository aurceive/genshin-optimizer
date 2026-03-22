import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicDiagnostic, LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicBoundPrunePayload,
  LapicBranchReachabilityPayload,
  LapicDominancePayload,
  LapicFinalOptimalityPayload,
  LapicInfeasibilityPayload,
  LapicPotentialDecisionBasis,
} from '../types'

export function validateLapicPotentialDecisionBasis(
  decisionBasis: LapicPotentialDecisionBasis
): LapicValidationResult<LapicPotentialDecisionBasis> {
  const diagnostics: LapicDiagnostic[] = []

  if (!decisionBasis.solveMode)
    diagnostics.push(
      createLapicDiagnostic('error', 'SchemaViolation', 'solveMode must not be empty.', ['solveMode'])
    )

  if (!decisionBasis.participationMode)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'participationMode must not be empty.',
        ['participationMode']
      )
    )

  if (
    (decisionBasis.envelopeDigest && !decisionBasis.envelopeKind) ||
    (!decisionBasis.envelopeDigest && decisionBasis.envelopeKind)
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'envelopeDigest and envelopeKind must either both be present or both be omitted.',
        ['envelopeDigest']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(decisionBasis)
}

export function validateLapicBranchReachabilityPayload(
  payload: LapicBranchReachabilityPayload
): LapicValidationResult<LapicBranchReachabilityPayload> {
  const diagnostics: LapicDiagnostic[] = []

  if (!payload.branchPredicateDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'branchPredicateDigest must not be empty.',
        ['branchPredicateDigest']
      )
    )

  if (!payload.validityRegionId)
    diagnostics.push(
      createLapicDiagnostic('error', 'SchemaViolation', 'validityRegionId must not be empty.', ['validityRegionId'])
    )

  if (!payload.exactBoundsDigest && !payload.contradictionWitnessDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'BranchReachability payload requires exactBoundsDigest or contradictionWitnessDigest.',
        ['contradictionWitnessDigest']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(payload)
}

export function validateLapicInfeasibilityPayload(
  payload: LapicInfeasibilityPayload
): LapicValidationResult<LapicInfeasibilityPayload> {
  const diagnostics: LapicDiagnostic[] = []

  if (!payload.witnessDigest)
    diagnostics.push(
      createLapicDiagnostic('error', 'SchemaViolation', 'witnessDigest must not be empty.', ['witnessDigest'])
    )

  if (!payload.replayPathRequirement)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'replayPathRequirement must not be empty.',
        ['replayPathRequirement']
      )
    )

  if (!payload.affectedStateIds?.length && !payload.affectedBlockIds?.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'Infeasibility payload must name affectedStateIds or affectedBlockIds.',
        ['affectedStateIds']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(payload)
}

export function validateLapicBoundPrunePayload(
  payload: LapicBoundPrunePayload
): LapicValidationResult<LapicBoundPrunePayload> {
  const diagnostics: LapicDiagnostic[] = []

  if (!payload.thresholdDigest)
    diagnostics.push(
      createLapicDiagnostic('error', 'SchemaViolation', 'thresholdDigest must not be empty.', ['thresholdDigest'])
    )

  if (!payload.boundValue)
    diagnostics.push(
      createLapicDiagnostic('error', 'SchemaViolation', 'boundValue must not be empty.', ['boundValue'])
    )

  if (!payload.validityRegionId)
    diagnostics.push(
      createLapicDiagnostic('error', 'SchemaViolation', 'validityRegionId must not be empty.', ['validityRegionId'])
    )

  if (!payload.numericDiagnosticsDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'numericDiagnosticsDigest must not be empty.',
        ['numericDiagnosticsDigest']
      )
    )

  if (
    payload.potentialDecisionBasis &&
    !validateLapicPotentialDecisionBasis(payload.potentialDecisionBasis).ok
  )
    diagnostics.push(
      ...validateLapicPotentialDecisionBasis(payload.potentialDecisionBasis).diagnostics
    )

  if (payload.dangerZoneRecord.triggered && !payload.dangerZoneRecord.explanation)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'dangerZoneRecord.explanation must be provided when triggered is true.',
        ['dangerZoneRecord', 'explanation']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(payload)
}

export function validateLapicDominancePayload(
  payload: LapicDominancePayload
): LapicValidationResult<LapicDominancePayload> {
  const diagnostics: LapicDiagnostic[] = []

  ;[
    ['dominatingStateId', payload.dominatingStateId],
    ['dominatedStateId', payload.dominatedStateId],
    ['comparisonDigest', payload.comparisonDigest],
    ['exactSignatureGroupKeyDigest', payload.exactSignatureGroupKeyDigest],
    ['compatibilityInclusionDigest', payload.compatibilityInclusionDigest],
    ['monotoneProjectionDigest', payload.monotoneProjectionDigest],
    ['upperBoundProfileDigest', payload.upperBoundProfileDigest],
    ['strengthComparisonDigest', payload.strengthComparisonDigest],
  ].forEach(([fieldName, value]) => {
    if (!value)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          `${fieldName} must not be empty.`,
          [fieldName]
        )
      )
  })

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(payload)
}

export function validateLapicFinalOptimalityPayload(
  payload: LapicFinalOptimalityPayload
): LapicValidationResult<LapicFinalOptimalityPayload> {
  const diagnostics: LapicDiagnostic[] = []

  ;[
    ['winningStateId', payload.winningStateId],
    ['optimalityGap', payload.optimalityGap],
    ['finalThresholdDigest', payload.finalThresholdDigest],
    ['finalIncumbentSetDigest', payload.finalIncumbentSetDigest],
    ['queueExhaustionSummaryDigest', payload.queueExhaustionSummaryDigest],
    ['thresholdPruneSummaryDigest', payload.thresholdPruneSummaryDigest],
    ['escalatedReplaySummaryDigest', payload.escalatedReplaySummaryDigest],
    ['stableOrderCompletenessDigest', payload.stableOrderCompletenessDigest],
  ].forEach(([fieldName, value]) => {
    if (!value)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          `${fieldName} must not be empty.`,
          [fieldName]
        )
      )
  })

  if (payload.potentialDecisionBasis && !payload.rankingParticipationMode)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'rankingParticipationMode must be present when potentialDecisionBasis is present.',
        ['rankingParticipationMode']
      )
    )

  if (
    payload.potentialDecisionBasis &&
    payload.rankingParticipationMode &&
    payload.potentialDecisionBasis.participationMode !== payload.rankingParticipationMode
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'rankingParticipationMode must match potentialDecisionBasis.participationMode.',
        ['rankingParticipationMode']
      )
    )

  if (
    payload.potentialDecisionBasis &&
    !validateLapicPotentialDecisionBasis(payload.potentialDecisionBasis).ok
  )
    diagnostics.push(
      ...validateLapicPotentialDecisionBasis(payload.potentialDecisionBasis).diagnostics
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(payload)
}
