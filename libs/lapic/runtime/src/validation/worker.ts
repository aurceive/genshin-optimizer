import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicDeterminismClass,
  LapicExecutorCapabilityDescriptor,
  LapicPriorityDescriptor,
  LapicRetryPolicy,
  LapicWorkUnitEnvelope,
  LapicWorkUnitKind,
  LapicWorkerBackendKind,
  LapicWorkerProtocolMessageTag,
  LapicWorkerRequest,
  LapicWorkerResponse,
} from '../types'
import {
  createRuntimeFailure,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
  lapicDeterminismClasses,
  lapicWorkUnitKinds,
  lapicWorkerBackendKinds,
  lapicWorkerProtocolMessageTags,
  validateArtifactRefs,
} from './internal'

export function validateLapicPriorityDescriptor(
  descriptor: LapicPriorityDescriptor
): LapicValidationResult<LapicPriorityDescriptor> {
  if (!isRecord(descriptor))
    return createRuntimeFailure('Priority descriptor must be a record.', [
      'priorityDescriptor',
    ])

  if (
    !isNonEmptyString(descriptor.upperBoundOrderingDigest) ||
    !isNonEmptyString(descriptor.uncertaintyGapDigest) ||
    !isNonEmptyString(descriptor.residualCostDigest) ||
    !isNonEmptyString(descriptor.deterministicTieBreakDigest) ||
    !isNonEmptyString(descriptor.costModelVersion)
  )
    return createRuntimeFailure(
      'Priority descriptor fields must be non-empty strings.',
      ['priorityDescriptor']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicRetryPolicy(
  policy: LapicRetryPolicy
): LapicValidationResult<LapicRetryPolicy> {
  if (!isRecord(policy))
    return createRuntimeFailure('Retry policy must be a record.', [
      'retryPolicy',
    ])

  if (!isNonNegativeInteger(policy.maxAttempts))
    return createRuntimeFailure(
      'Max attempts must be a non-negative integer.',
      ['maxAttempts']
    )

  if (!isBoolean(policy.replaySafe))
    return createRuntimeFailure('Replay safe must be a boolean.', [
      'replaySafe',
    ])

  return createLapicSuccessResult(policy)
}

export function validateLapicWorkUnitEnvelope(
  envelope: LapicWorkUnitEnvelope
): LapicValidationResult<LapicWorkUnitEnvelope> {
  if (!isRecord(envelope))
    return createRuntimeFailure('Work unit envelope must be a record.', [
      'workUnitEnvelope',
    ])

  if (!isNonEmptyString(envelope.workUnitId))
    return createRuntimeFailure('Work unit id must be a non-empty string.', [
      'workUnitId',
    ])

  if (
    !isNonEmptyString(envelope.kind) ||
    !lapicWorkUnitKinds.includes(envelope.kind as LapicWorkUnitKind)
  )
    return createRuntimeFailure('Work unit kind must be supported.', ['kind'])

  if (
    !isNonEmptyString(envelope.determinismClass) ||
    !lapicDeterminismClasses.includes(
      envelope.determinismClass as LapicDeterminismClass
    )
  )
    return createRuntimeFailure('Determinism class must be supported.', [
      'determinismClass',
    ])

  const priorityValidation = validateLapicPriorityDescriptor(envelope.priority)
  if (!priorityValidation.ok) return priorityValidation

  const retryValidation = validateLapicRetryPolicy(envelope.retryPolicy)
  if (!retryValidation.ok) return retryValidation

  return createLapicSuccessResult(envelope)
}

export function validateLapicWorkerRequest(
  request: LapicWorkerRequest
): LapicValidationResult<LapicWorkerRequest> {
  if (!isRecord(request))
    return createRuntimeFailure('Worker request must be a record.', [
      'workerRequest',
    ])

  if (
    !isNonEmptyString(request.tag) ||
    !lapicWorkerProtocolMessageTags.includes(
      request.tag as LapicWorkerProtocolMessageTag
    )
  )
    return createRuntimeFailure('Worker request tag must be supported.', [
      'tag',
    ])

  if (!isNonEmptyString(request.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', [
      'sessionId',
    ])

  if (request.workUnit) {
    const workUnitValidation = validateLapicWorkUnitEnvelope(request.workUnit)
    if (!workUnitValidation.ok) return workUnitValidation
  }

  return createLapicSuccessResult(request)
}

export function validateLapicExecutorCapabilityDescriptor(
  descriptor: LapicExecutorCapabilityDescriptor
): LapicValidationResult<LapicExecutorCapabilityDescriptor> {
  if (!isRecord(descriptor))
    return createRuntimeFailure(
      'Executor capability descriptor must be a record.',
      ['executorCapabilityDescriptor']
    )

  if (
    !isNonEmptyString(descriptor.backendKind) ||
    !lapicWorkerBackendKinds.includes(
      descriptor.backendKind as LapicWorkerBackendKind
    )
  )
    return createRuntimeFailure('Backend kind must be supported.', [
      'backendKind',
    ])

  if (!isBoolean(descriptor.supportsPauseAtSafePoint))
    return createRuntimeFailure('supportsPauseAtSafePoint must be boolean.', [
      'supportsPauseAtSafePoint',
    ])

  if (!isBoolean(descriptor.supportsArtifactPublication))
    return createRuntimeFailure(
      'supportsArtifactPublication must be boolean.',
      ['supportsArtifactPublication']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicWorkerResponse(
  response: LapicWorkerResponse
): LapicValidationResult<LapicWorkerResponse> {
  if (!isRecord(response))
    return createRuntimeFailure('Worker response must be a record.', [
      'workerResponse',
    ])

  if (
    !isNonEmptyString(response.tag) ||
    !lapicWorkerProtocolMessageTags.includes(
      response.tag as LapicWorkerProtocolMessageTag
    )
  )
    return createRuntimeFailure('Worker response tag must be supported.', [
      'tag',
    ])

  if (!isNonEmptyString(response.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', [
      'sessionId',
    ])

  if (response.producedArtifacts)
    return validateArtifactRefs(response.producedArtifacts, [
      'producedArtifacts',
    ]).ok
      ? createLapicSuccessResult(response)
      : createRuntimeFailure('Produced artifacts must be valid and unique.', [
          'producedArtifacts',
        ])

  return createLapicSuccessResult(response)
}
