import { validateLapicCertificate } from '@genshin-optimizer/lapic/cert'
import {
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import {
  type LapicActivePhase,
  type LapicCancelRequestResult,
  type LapicInMemorySessionControllerOptions,
  type LapicInternalSolveState,
  type LapicObservationalCounterSummary,
  type LapicPauseRequestResult,
  type LapicProgressEvent,
  type LapicSessionIdentity,
  type LapicSessionInspectionResult,
  type LapicSessionSummary,
  type LapicSolveCompletionResult,
  type LapicSolveRequest,
  type LapicSolveState,
  type LapicSubscriptionToken,
  type LapicTraceEvent,
  lapicRuntimeProtocolVersion,
} from '../types'
import {
  createRuntimeFailure,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
  lapicActivePhases,
  lapicInternalSolveStates,
  lapicSolveStates,
  lapicWorkerProtocolMessageTags,
  validateArtifactRefs,
} from './internal'

export function validateLapicSessionIdentity(
  identity: LapicSessionIdentity
): LapicValidationResult<LapicSessionIdentity> {
  if (!isRecord(identity))
    return createRuntimeFailure('Session identity must be a record.', ['sessionIdentity'])

  if (!isNonEmptyString(identity.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', ['sessionId'])

  if (!isNonEmptyString(identity.problemDigest))
    return createRuntimeFailure(
      'Problem digest must be a non-empty string.',
      ['problemDigest']
    )

  if (!isNonEmptyString(identity.engineVersion))
    return createRuntimeFailure(
      'Engine version must be a non-empty string.',
      ['engineVersion']
    )

  if (!isNonEmptyString(identity.arithmeticPolicyId))
    return createRuntimeFailure(
      'Arithmetic policy id must be a non-empty string.',
      ['arithmeticPolicyId']
    )

  if (identity.runtimeProtocolVersion !== lapicRuntimeProtocolVersion)
    return createRuntimeFailure(
      'Runtime protocol version must match the package protocol version.',
      ['runtimeProtocolVersion']
    )

  if (!isNonEmptyString(identity.createdAtLogicalTimestamp))
    return createRuntimeFailure(
      'Created timestamp must be a non-empty string.',
      ['createdAtLogicalTimestamp']
    )

  return createLapicSuccessResult(identity)
}

export function validateLapicSessionSummary(
  summary: LapicSessionSummary
): LapicValidationResult<LapicSessionSummary> {
  if (!isRecord(summary))
    return createRuntimeFailure('Session summary must be a record.', ['sessionSummary'])

  const identityValidation = validateLapicSessionIdentity(summary.identity)
  if (!identityValidation.ok) return identityValidation

  if (
    !isNonEmptyString(summary.solveState) ||
    !lapicSolveStates.includes(summary.solveState as LapicSolveState)
  )
    return createRuntimeFailure('Solve state must be supported.', ['solveState'])

  if (
    summary.internalState !== undefined &&
    (!isNonEmptyString(summary.internalState) ||
      !lapicInternalSolveStates.includes(
        summary.internalState as LapicInternalSolveState
      ))
  )
    return createRuntimeFailure(
      'Internal state must be supported when present.',
      ['internalState']
    )

  if (
    summary.activePhase !== undefined &&
    (!isNonEmptyString(summary.activePhase) ||
      !lapicActivePhases.includes(summary.activePhase as LapicActivePhase))
  )
    return createRuntimeFailure(
      'Active phase must be supported when present.',
      ['activePhase']
    )

  return createLapicSuccessResult(summary)
}

export function validateLapicSolveRequest(
  request: LapicSolveRequest
): LapicValidationResult<LapicSolveRequest> {
  if (!isRecord(request))
    return createRuntimeFailure('Solve request must be a record.', ['solveRequest'])

  if (!isNonEmptyString(request.problemDigest))
    return createRuntimeFailure(
      'Problem digest must be a non-empty string.',
      ['problemDigest']
    )

  return createLapicSuccessResult(request)
}

export function validateLapicSolveCompletionResult(
  result: LapicSolveCompletionResult
): LapicValidationResult<LapicSolveCompletionResult> {
  if (!isRecord(result))
    return createRuntimeFailure(
      'Solve completion result must be a record.',
      ['solveCompletionResult']
    )

  const summaryValidation = validateLapicSessionSummary(result.summary)
  if (!summaryValidation.ok) return summaryValidation

  if (!Array.isArray(result.emittedCertificates))
    return createRuntimeFailure(
      'Emitted certificates must be an array.',
      ['emittedCertificates']
    )

  return createLapicSuccessResult(result)
}

export function validateLapicPauseRequestResult(
  result: LapicPauseRequestResult
): LapicValidationResult<LapicPauseRequestResult> {
  if (!isRecord(result))
    return createRuntimeFailure(
      'Pause request result must be a record.',
      ['pauseRequestResult']
    )

  if (!isBoolean(result.accepted))
    return createRuntimeFailure('Accepted must be boolean.', ['accepted'])

  if (
    result.targetCheckpointId !== undefined &&
    !isNonEmptyString(result.targetCheckpointId)
  )
    return createRuntimeFailure(
      'Target checkpoint id must be a non-empty string when present.',
      ['targetCheckpointId']
    )

  return createLapicSuccessResult(result)
}

export function validateLapicCancelRequestResult(
  result: LapicCancelRequestResult
): LapicValidationResult<LapicCancelRequestResult> {
  if (!isRecord(result))
    return createRuntimeFailure(
      'Cancel request result must be a record.',
      ['cancelRequestResult']
    )

  if (!isBoolean(result.accepted))
    return createRuntimeFailure('Accepted must be boolean.', ['accepted'])

  return createLapicSuccessResult(result)
}

export function validateLapicSessionInspectionResult(
  result: LapicSessionInspectionResult
): LapicValidationResult<LapicSessionInspectionResult> {
  if (!isRecord(result))
    return createRuntimeFailure(
      'Session inspection result must be a record.',
      ['sessionInspectionResult']
    )

  const summaryValidation = validateLapicSessionSummary(result.summary)
  if (!summaryValidation.ok) return summaryValidation

  return validateArtifactRefs(result.openArtifacts, ['openArtifacts']).ok
    ? createLapicSuccessResult(result)
    : createRuntimeFailure('Open artifacts must be valid and unique.', ['openArtifacts'])
}

export function validateLapicProgressEvent(
  event: LapicProgressEvent
): LapicValidationResult<LapicProgressEvent> {
  if (!isRecord(event))
    return createRuntimeFailure('Progress event must be a record.', ['progressEvent'])

  if (!isNonEmptyString(event.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', ['sessionId'])

  if (
    !isNonEmptyString(event.phase) ||
    !lapicActivePhases.includes(event.phase as LapicActivePhase)
  )
    return createRuntimeFailure('Phase must be supported.', ['phase'])

  if (!isNonNegativeInteger(event.completedUnits))
    return createRuntimeFailure(
      'Completed units must be a non-negative integer.',
      ['completedUnits']
    )

  if (
    event.totalUnits !== undefined &&
    (!isNonNegativeInteger(event.totalUnits) || event.totalUnits < event.completedUnits)
  )
    return createRuntimeFailure(
      'Total units must be a non-negative integer >= completed units.',
      ['totalUnits']
    )

  return createLapicSuccessResult(event)
}

export function validateLapicTraceEvent(
  event: LapicTraceEvent
): LapicValidationResult<LapicTraceEvent> {
  if (!isRecord(event))
    return createRuntimeFailure('Trace event must be a record.', ['traceEvent'])

  if (!isNonEmptyString(event.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', ['sessionId'])

  if (
    event.tag !== 'Progress' &&
    (!isNonEmptyString(event.tag) ||
      !lapicWorkerProtocolMessageTags.includes(event.tag))
  )
    return createRuntimeFailure('Trace tag must be supported.', ['tag'])

  if (!isNonEmptyString(event.eventDigest))
    return createRuntimeFailure('Event digest must be a non-empty string.', ['eventDigest'])

  return createLapicSuccessResult(event)
}

export function validateLapicSubscriptionToken(
  token: LapicSubscriptionToken
): LapicValidationResult<LapicSubscriptionToken> {
  if (!isRecord(token))
    return createRuntimeFailure(
      'Subscription token must be a record.',
      ['subscriptionToken']
    )

  if (!isNonEmptyString(token.subscriptionId))
    return createRuntimeFailure(
      'Subscription id must be a non-empty string.',
      ['subscriptionId']
    )

  if (typeof token.unsubscribe !== 'function')
    return createRuntimeFailure(
      'unsubscribe must be a function.',
      ['unsubscribe']
    )

  return createLapicSuccessResult(token)
}

export function validateLapicObservationalCounterSummary(
  summary: LapicObservationalCounterSummary
): LapicValidationResult<LapicObservationalCounterSummary> {
  if (!isRecord(summary))
    return createRuntimeFailure(
      'Observational counter summary must be a record.',
      ['observationalCounterSummary']
    )

  if (!isNonEmptyString(summary.counterId))
    return createRuntimeFailure(
      'Counter id must be a non-empty string.',
      ['counterId']
    )

  if (typeof summary.value !== 'number' || Number.isNaN(summary.value))
    return createRuntimeFailure(
      'Counter value must be a finite number.',
      ['value']
    )

  return createLapicSuccessResult(summary)
}

export function validateLapicInMemorySessionControllerOptions(
  options: LapicInMemorySessionControllerOptions
): LapicValidationResult<LapicInMemorySessionControllerOptions> {
  if (!isRecord(options))
    return createRuntimeFailure(
      'In-memory session controller options must be a record.',
      ['inMemorySessionControllerOptions']
    )

  const identityValidation = validateLapicSessionIdentity(options.identity)
  if (!identityValidation.ok) return identityValidation

  if (options.solveRequest) {
    const solveRequestValidation = validateLapicSolveRequest(options.solveRequest)
    if (!solveRequestValidation.ok) return solveRequestValidation
  }

  if (options.initialArtifacts && !Array.isArray(options.initialArtifacts))
    return createRuntimeFailure(
      'Initial artifacts must be an array when present.',
      ['initialArtifacts']
    )

  if (options.initialCertificates && !Array.isArray(options.initialCertificates))
    return createRuntimeFailure(
      'Initial certificates must be an array when present.',
      ['initialCertificates']
    )

  if (options.initialCertificates)
    for (const [index, certificate] of options.initialCertificates.entries()) {
      const certificateValidation = validateLapicCertificate(certificate)
      if (!certificateValidation.ok)
        return createLapicFailureResult(
          certificateValidation.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            path: ['initialCertificates', String(index), ...(diagnostic.path ?? [])],
          }))
        )
    }

  return createLapicSuccessResult(options)
}
