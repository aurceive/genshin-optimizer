import type {
  LapicCertificate,
  LapicFinalOptimalitySummary,
} from '@genshin-optimizer/lapic/cert'
import type {
  LapicDiagnostic,
  LapicDigest,
  LapicStateId,
} from '@genshin-optimizer/lapic/core'
import { createLapicArtifactRef } from '@genshin-optimizer/lapic/storage'
import type {
  LapicArtifactRef,
  LapicClosureImportDescriptor,
} from '@genshin-optimizer/lapic/storage'
import { projectLapicSolveState } from '../session/internal'
import { lapicRuntimePackageName, lapicRuntimeProtocolVersion } from '../types'
import type {
  LapicActivePhase,
  LapicCancelRequestResult,
  LapicExecutorCapabilityDescriptor,
  LapicFailedSessionSummary,
  LapicFailureClass,
  LapicFailureRecord,
  LapicInternalSolveState,
  LapicObservationalCounterSummary,
  LapicPauseRequestResult,
  LapicPriorityDescriptor,
  LapicProgressEvent,
  LapicRecoveryEligibilityClassification,
  LapicRetryPolicy,
  LapicRuntimeSkeletonMarker,
  LapicSessionIdentity,
  LapicSessionSummary,
  LapicSolveCompletionResult,
  LapicSolveRequest,
  LapicSubscriptionToken,
  LapicTraceEvent,
  LapicWorkResultSummary,
  LapicWorkUnitEnvelope,
  LapicWorkerProtocolMessageTag,
  LapicWorkerRequest,
  LapicWorkerResponse,
} from '../types'

export function createLapicSessionIdentity(
  input: LapicSessionIdentity
): LapicSessionIdentity {
  return {
    sessionId: input.sessionId,
    problemDigest: input.problemDigest,
    engineVersion: input.engineVersion,
    arithmeticPolicyId: input.arithmeticPolicyId,
    runtimeProtocolVersion: input.runtimeProtocolVersion,
    createdAtLogicalTimestamp: input.createdAtLogicalTimestamp,
  }
}

export function createLapicSessionSummary(
  identity: LapicSessionIdentity,
  internalState: LapicInternalSolveState,
  activePhase?: LapicActivePhase
): LapicSessionSummary {
  return {
    identity: createLapicSessionIdentity(identity),
    solveState: projectLapicSolveState(internalState),
    internalState,
    ...(activePhase !== undefined ? { activePhase } : {}),
  }
}

export function createLapicSolveRequest(
  problemDigest: string,
  checkpointImport?: LapicClosureImportDescriptor
): LapicSolveRequest {
  return {
    problemDigest,
    ...(checkpointImport !== undefined ? { checkpointImport } : {}),
  }
}

export function createLapicSolveCompletionResult(
  summary: LapicSessionSummary,
  emittedCertificates: readonly LapicCertificate[],
  finalOptimality?: LapicFinalOptimalitySummary
): LapicSolveCompletionResult {
  return {
    summary,
    emittedCertificates: [...emittedCertificates],
    ...(finalOptimality !== undefined ? { finalOptimality } : {}),
  }
}

export function createLapicPauseRequestResult(
  accepted: boolean,
  targetCheckpointId?: string
): LapicPauseRequestResult {
  return {
    accepted,
    ...(targetCheckpointId !== undefined ? { targetCheckpointId } : {}),
  }
}

export function createLapicCancelRequestResult(
  accepted: boolean
): LapicCancelRequestResult {
  return { accepted }
}

export function createLapicProgressEvent(
  sessionId: string,
  phase: LapicActivePhase,
  completedUnits: number,
  totalUnits?: number
): LapicProgressEvent {
  return {
    sessionId,
    phase,
    completedUnits,
    ...(totalUnits !== undefined ? { totalUnits } : {}),
  }
}

export function createLapicTraceEvent(
  sessionId: string,
  tag: LapicTraceEvent['tag'],
  eventDigest: LapicDigest
): LapicTraceEvent {
  return {
    sessionId,
    tag,
    eventDigest,
  }
}

export function createLapicPriorityDescriptor(
  input: LapicPriorityDescriptor
): LapicPriorityDescriptor {
  return {
    upperBoundOrderingDigest: input.upperBoundOrderingDigest,
    uncertaintyGapDigest: input.uncertaintyGapDigest,
    residualCostDigest: input.residualCostDigest,
    deterministicTieBreakDigest: input.deterministicTieBreakDigest,
    costModelVersion: input.costModelVersion,
  }
}

export function createLapicRetryPolicy(
  maxAttempts: number,
  replaySafe: boolean
): LapicRetryPolicy {
  return {
    maxAttempts,
    replaySafe,
  }
}

export function createLapicWorkUnitEnvelope(
  input: LapicWorkUnitEnvelope
): LapicWorkUnitEnvelope {
  return {
    workUnitId: input.workUnitId,
    kind: input.kind,
    determinismClass: input.determinismClass,
    priority: createLapicPriorityDescriptor(input.priority),
    retryPolicy: createLapicRetryPolicy(
      input.retryPolicy.maxAttempts,
      input.retryPolicy.replaySafe
    ),
  }
}

export function createLapicWorkResultSummary(
  workUnitId: string,
  producedArtifacts: readonly LapicArtifactRef[],
  emittedStateIds: readonly LapicStateId[]
): LapicWorkResultSummary {
  return {
    workUnitId,
    producedArtifacts: producedArtifacts.map(createLapicArtifactRef),
    emittedStateIds: [...emittedStateIds],
  }
}

export function createLapicWorkerRequest(
  tag: LapicWorkerProtocolMessageTag,
  sessionId: string,
  workUnit?: LapicWorkUnitEnvelope
): LapicWorkerRequest {
  return {
    tag,
    sessionId,
    ...(workUnit !== undefined
      ? { workUnit: createLapicWorkUnitEnvelope(workUnit) }
      : {}),
  }
}

export function createLapicExecutorCapabilityDescriptor(
  input: LapicExecutorCapabilityDescriptor
): LapicExecutorCapabilityDescriptor {
  return {
    backendKind: input.backendKind,
    supportsPauseAtSafePoint: input.supportsPauseAtSafePoint,
    supportsArtifactPublication: input.supportsArtifactPublication,
  }
}

export function createLapicWorkerResponse(
  tag: LapicWorkerProtocolMessageTag,
  sessionId: string,
  producedArtifacts: readonly LapicArtifactRef[] = []
): LapicWorkerResponse {
  return {
    tag,
    sessionId,
    producedArtifacts: producedArtifacts.map(createLapicArtifactRef),
  }
}

export function createLapicFailureRecord(
  sessionId: string,
  failureClass: LapicFailureClass,
  message: string,
  diagnostics: readonly LapicDiagnostic[] = []
): LapicFailureRecord {
  return {
    sessionId,
    failureClass,
    message,
    diagnostics: [...diagnostics],
  }
}

export function createLapicFailedSessionSummary(
  summary: LapicSessionSummary,
  failure: LapicFailureRecord
): LapicFailedSessionSummary {
  return {
    summary,
    failure,
  }
}

export function createLapicRecoveryEligibilityClassification(
  eligible: boolean,
  reason: string
): LapicRecoveryEligibilityClassification {
  return {
    eligible,
    reason,
  }
}

export function createLapicSubscriptionToken(
  subscriptionId: string,
  unsubscribe: () => void
): LapicSubscriptionToken {
  return {
    subscriptionId,
    unsubscribe,
  }
}

export function createLapicObservationalCounterSummary(
  counterId: string,
  value: number
): LapicObservationalCounterSummary {
  return {
    counterId,
    value,
  }
}

export const lapicRuntimeSkeleton: LapicRuntimeSkeletonMarker = {
  packageName: lapicRuntimePackageName,
  protocolVersion: lapicRuntimeProtocolVersion,
}
