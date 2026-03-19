import { createLapicFailureResult, createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicCertificate,
  LapicFinalOptimalitySummary,
} from '@genshin-optimizer/lapic/cert'
import {
  createLapicDiagnostic,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicArithmeticPolicyId,
  LapicDiagnostic,
  LapicDigest,
  LapicEngineVersion,
  LapicLogicalTimestamp,
  LapicProblemDigest,
  LapicStateId,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import {
  createLapicCheckpointClosureInventory,
  createLapicCheckpointClosureVerificationResult,
  createLapicClosureExportDescriptor,
  createLapicClosureImportDescriptor,
  createLapicMemoryArtifactStore,
  createLapicArtifactRef,
  createLapicArtifactRefKey,
  verifyLapicCheckpointClosure,
} from '@genshin-optimizer/lapic/storage'
import type {
  LapicArtifactRef,
  LapicArtifactStore,
  LapicCheckpointClosureInventory,
  LapicCheckpointClosureVerificationResult,
  LapicClosureExportDescriptor,
  LapicClosureImportDescriptor,
} from '@genshin-optimizer/lapic/storage'

export const lapicRuntimePackageName = 'lapic-runtime'
export const lapicRuntimeProtocolVersion = '0.1.0-draft'

export type LapicRuntimeProtocolVersion = typeof lapicRuntimeProtocolVersion
export type LapicInternalSolveState =
  | 'created'
  | 'initializing'
  | 'frontier-building'
  | 'search-running'
  | 'pausing'
  | 'paused'
  | 'checkpointing'
  | 'resuming'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
  | 'failed'
export type LapicSolveState =
  | 'created'
  | 'active'
  | 'pausing'
  | 'paused'
  | 'checkpointing'
  | 'resuming'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
  | 'failed'
export type LapicActivePhase =
  | 'analyze'
  | 'frontier-build'
  | 'join'
  | 'resolve-residual'
  | 'validate-certificate'
  | 'persist'
export type LapicWorkUnitKind =
  | 'AnalyzeRegion'
  | 'BuildFrontierBlock'
  | 'CompactFrontierBlock'
  | 'JoinFrontierBlocks'
  | 'ResolveResidualExact'
  | 'ValidateCertificate'
  | 'PersistArtifact'
  | 'ReloadArtifact'
export type LapicDeterminismClass = 'pure-deterministic' | 'provider-verified'
export type LapicWorkerBackendKind = 'browser-worker' | 'node-worker' | 'in-process'
export type LapicWorkerProtocolMessageTag =
  | 'InitSession'
  | 'LoadArtifacts'
  | 'StartWork'
  | 'PauseAtSafePoint'
  | 'PublishArtifacts'
  | 'EmitCertificate'
  | 'ReportFailure'
  | 'AcknowledgeCheckpoint'
  | 'Shutdown'
export type LapicFailureClass =
  | 'protocolFailure'
  | 'storageIntegrityFailure'
  | 'arithmeticVerificationFailure'
  | 'providerFailure'
  | 'workerFailure'
  | 'schemaCompatibilityFailure'
  | 'checkpointClosureFailure'

export interface LapicSessionIdentity {
  readonly sessionId: string
  readonly problemDigest: LapicProblemDigest
  readonly engineVersion: LapicEngineVersion
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
  readonly runtimeProtocolVersion: LapicRuntimeProtocolVersion
  readonly createdAtLogicalTimestamp: LapicLogicalTimestamp
}

export interface LapicSessionSummary {
  readonly identity: LapicSessionIdentity
  readonly solveState: LapicSolveState
  readonly internalState?: LapicInternalSolveState
  readonly activePhase?: LapicActivePhase
}

export interface LapicSolveRequest {
  readonly problemDigest: LapicProblemDigest
  readonly checkpointImport?: LapicClosureImportDescriptor
}

export interface LapicSolveCompletionResult {
  readonly summary: LapicSessionSummary
  readonly finalOptimality?: LapicFinalOptimalitySummary
  readonly emittedCertificates: readonly LapicCertificate[]
}

export interface LapicPauseRequestResult {
  readonly accepted: boolean
  readonly targetCheckpointId?: string
}

export interface LapicCancelRequestResult {
  readonly accepted: boolean
}

export interface LapicSessionInspectionResult {
  readonly summary: LapicSessionSummary
  readonly openArtifacts: readonly LapicArtifactRef[]
}

export interface LapicProgressEvent {
  readonly sessionId: string
  readonly phase: LapicActivePhase
  readonly completedUnits: number
  readonly totalUnits?: number
}

export interface LapicTraceEvent {
  readonly sessionId: string
  readonly tag: LapicWorkerProtocolMessageTag | 'Progress'
  readonly eventDigest: LapicDigest
}

export interface LapicSubscriptionToken {
  readonly subscriptionId: string
  unsubscribe(): void
}

export interface LapicObservationalCounterSummary {
  readonly counterId: string
  readonly value: number
}

export interface LapicPublicSolveHandle {
  subscribeProgress(
    listener: (event: LapicProgressEvent) => void
  ): LapicSubscriptionToken
  subscribeDiagnostics(
    listener: (event: LapicTraceEvent | LapicFailureRecord) => void
  ): LapicSubscriptionToken
  requestPause(): Promise<LapicPauseRequestResult>
  requestCheckpoint(): Promise<LapicPauseToCheckpointTransitionSummary>
  requestCancel(): Promise<LapicCancelRequestResult>
  exportCheckpoint(): Promise<LapicCheckpointExportDescriptor>
  awaitCompletion(): Promise<LapicSolveCompletionResult>
  inspectSessionState(): Promise<LapicSessionInspectionResult>
}

export interface LapicPriorityDescriptor {
  readonly upperBoundOrderingDigest: LapicDigest
  readonly uncertaintyGapDigest: LapicDigest
  readonly residualCostDigest: LapicDigest
  readonly deterministicTieBreakDigest: LapicDigest
  readonly costModelVersion: string
}

export interface LapicRetryPolicy {
  readonly maxAttempts: number
  readonly replaySafe: boolean
}

export interface LapicWorkUnitEnvelope {
  readonly workUnitId: string
  readonly kind: LapicWorkUnitKind
  readonly determinismClass: LapicDeterminismClass
  readonly priority: LapicPriorityDescriptor
  readonly retryPolicy: LapicRetryPolicy
}

export interface LapicWorkResultSummary {
  readonly workUnitId: string
  readonly producedArtifacts: readonly LapicArtifactRef[]
  readonly emittedStateIds: readonly LapicStateId[]
}

export interface LapicWorkerRequest {
  readonly tag: LapicWorkerProtocolMessageTag
  readonly sessionId: string
  readonly workUnit?: LapicWorkUnitEnvelope
}

export interface LapicExecutorCapabilityDescriptor {
  readonly backendKind: LapicWorkerBackendKind
  readonly supportsPauseAtSafePoint: boolean
  readonly supportsArtifactPublication: boolean
}

export interface LapicWorkerResponse {
  readonly tag: LapicWorkerProtocolMessageTag
  readonly sessionId: string
  readonly producedArtifacts?: readonly LapicArtifactRef[]
}

export interface LapicCheckpointRequest {
  readonly sessionId: string
  readonly checkpointId: string
}

export interface LapicCheckpointExportDescriptor {
  readonly closure: LapicClosureExportDescriptor
  readonly inventory: LapicCheckpointClosureInventory
}

export interface LapicCheckpointImportDescriptor {
  readonly closure: LapicClosureImportDescriptor
}

export interface LapicCheckpointCompletionResult {
  readonly checkpointId: string
  readonly verification: LapicCheckpointClosureVerificationResult
}

export interface LapicPauseToCheckpointTransitionSummary {
  readonly sessionId: string
  readonly checkpoint: LapicCheckpointCompletionResult
}

export interface LapicFailureRecord {
  readonly sessionId: string
  readonly failureClass: LapicFailureClass
  readonly message: string
  readonly diagnostics: readonly LapicDiagnostic[]
}

export interface LapicFailedSessionSummary {
  readonly summary: LapicSessionSummary
  readonly failure: LapicFailureRecord
}

export interface LapicRecoveryEligibilityClassification {
  readonly eligible: boolean
  readonly reason: string
}

export interface LapicInMemorySessionControllerOptions {
  readonly identity: LapicSessionIdentity
  readonly solveRequest?: LapicSolveRequest
  readonly artifactStore?: LapicArtifactStore
  readonly initialArtifacts?: readonly LapicArtifactRef[]
  readonly initialCertificates?: readonly LapicCertificate[]
  readonly initialFinalOptimality?: LapicFinalOptimalitySummary
}

export interface LapicInMemorySessionController extends LapicPublicSolveHandle {
  activate(phase: LapicActivePhase): void
  publishProgress(event: Omit<LapicProgressEvent, 'sessionId'>): void
  publishTrace(tag: LapicTraceEvent['tag'], eventDigest?: LapicDigest): void
  publishArtifact(artifactRef: LapicArtifactRef): void
  emitCertificate(certificate: LapicCertificate): void
  reachPauseSafePoint(): void
  resume(phase?: LapicActivePhase): void
  complete(finalOptimality?: LapicFinalOptimalitySummary): Promise<LapicSolveCompletionResult>
  fail(
    failureClass: LapicFailureClass,
    message: string,
    diagnostics?: readonly LapicDiagnostic[]
  ): Promise<never>
  getLatestCheckpoint(): LapicPauseToCheckpointTransitionSummary | undefined
}

export interface LapicRuntimeSkeletonMarker {
  readonly packageName: typeof lapicRuntimePackageName
  readonly protocolVersion: LapicRuntimeProtocolVersion
}

const lapicInternalSolveStates = [
  'created',
  'initializing',
  'frontier-building',
  'search-running',
  'pausing',
  'paused',
  'checkpointing',
  'resuming',
  'finalizing',
  'completed',
  'cancelled',
  'failed',
] as const satisfies readonly LapicInternalSolveState[]

const lapicSolveStates = [
  'created',
  'active',
  'pausing',
  'paused',
  'checkpointing',
  'resuming',
  'finalizing',
  'completed',
  'cancelled',
  'failed',
] as const satisfies readonly LapicSolveState[]

const lapicActivePhases = [
  'analyze',
  'frontier-build',
  'join',
  'resolve-residual',
  'validate-certificate',
  'persist',
] as const satisfies readonly LapicActivePhase[]

const lapicWorkUnitKinds = [
  'AnalyzeRegion',
  'BuildFrontierBlock',
  'CompactFrontierBlock',
  'JoinFrontierBlocks',
  'ResolveResidualExact',
  'ValidateCertificate',
  'PersistArtifact',
  'ReloadArtifact',
] as const satisfies readonly LapicWorkUnitKind[]

const lapicDeterminismClasses = [
  'pure-deterministic',
  'provider-verified',
] as const satisfies readonly LapicDeterminismClass[]

const lapicWorkerBackendKinds = [
  'browser-worker',
  'node-worker',
  'in-process',
] as const satisfies readonly LapicWorkerBackendKind[]

const lapicWorkerProtocolMessageTags = [
  'InitSession',
  'LoadArtifacts',
  'StartWork',
  'PauseAtSafePoint',
  'PublishArtifacts',
  'EmitCertificate',
  'ReportFailure',
  'AcknowledgeCheckpoint',
  'Shutdown',
] as const satisfies readonly LapicWorkerProtocolMessageTag[]

const lapicFailureClasses = [
  'protocolFailure',
  'storageIntegrityFailure',
  'arithmeticVerificationFailure',
  'providerFailure',
  'workerFailure',
  'schemaCompatibilityFailure',
  'checkpointClosureFailure',
] as const satisfies readonly LapicFailureClass[]

const terminalSolveStates = new Set<LapicSolveState>([
  'completed',
  'cancelled',
  'failed',
])

const terminalInternalStates = new Set<LapicInternalSolveState>([
  'completed',
  'cancelled',
  'failed',
])

function isRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && value >= 0
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

function createRuntimeFailure<T>(
  message: string,
  path?: readonly string[],
  details?: Readonly<Record<string, string | number | boolean | null>>
): LapicValidationResult<T> {
  return createLapicFailureResult([
    createLapicDiagnostic('error', 'SchemaViolation', message, path, details),
  ])
}

function projectLapicSolveState(
  internalState: LapicInternalSolveState
): LapicSolveState {
  switch (internalState) {
    case 'created':
      return 'created'
    case 'initializing':
    case 'frontier-building':
    case 'search-running':
      return 'active'
    case 'pausing':
      return 'pausing'
    case 'paused':
      return 'paused'
    case 'checkpointing':
      return 'checkpointing'
    case 'resuming':
      return 'resuming'
    case 'finalizing':
      return 'finalizing'
    case 'completed':
      return 'completed'
    case 'cancelled':
      return 'cancelled'
    case 'failed':
      return 'failed'
  }
}

function createRuntimeEventDigest(
  sessionId: string,
  tag: LapicTraceEvent['tag'],
  ordinal: number
): LapicDigest {
  return `${sessionId}:${tag}:${ordinal}`
}

function createCheckpointId(sessionId: string, ordinal: number): string {
  return `${sessionId}:checkpoint:${ordinal}`
}

function validateArtifactRefs(
  artifactRefs: readonly LapicArtifactRef[],
  path: readonly string[]
): LapicValidationResult<readonly LapicArtifactRef[]> {
  if (!Array.isArray(artifactRefs))
    return createRuntimeFailure('Artifact refs must be an array.', path)

  const keys = artifactRefs.map(createLapicArtifactRefKey)
  if (!hasUniqueValues(keys))
    return createRuntimeFailure('Artifact refs must be unique.', path)

  if (
    artifactRefs.some(
      (artifactRef) =>
        !isNonEmptyString(artifactRef.artifactId) ||
        !isNonEmptyString(artifactRef.contentHash)
    )
  )
    return createRuntimeFailure(
      'Artifact refs must contain non-empty ids and content hashes.',
      path
    )

  return createLapicSuccessResult(artifactRefs)
}

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
    activePhase,
  }
}

export function createLapicSolveRequest(
  problemDigest: LapicProblemDigest,
  checkpointImport?: LapicClosureImportDescriptor
): LapicSolveRequest {
  return {
    problemDigest,
    checkpointImport,
  }
}

export function createLapicPauseRequestResult(
  accepted: boolean,
  targetCheckpointId?: string
): LapicPauseRequestResult {
  return {
    accepted,
    targetCheckpointId,
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
    totalUnits,
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
    workUnit,
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

export function createLapicCheckpointRequest(
  sessionId: string,
  checkpointId: string
): LapicCheckpointRequest {
  return {
    sessionId,
    checkpointId,
  }
}

export function createLapicCheckpointExportDescriptor(
  closure: LapicClosureExportDescriptor,
  inventory: LapicCheckpointClosureInventory
): LapicCheckpointExportDescriptor {
  return {
    closure,
    inventory,
  }
}

export function createLapicCheckpointImportDescriptor(
  closure: LapicClosureImportDescriptor
): LapicCheckpointImportDescriptor {
  return { closure }
}

export function createLapicCheckpointCompletionResult(
  checkpointId: string,
  verification: LapicCheckpointClosureVerificationResult
): LapicCheckpointCompletionResult {
  return {
    checkpointId,
    verification,
  }
}

export function createLapicPauseToCheckpointTransitionSummary(
  sessionId: string,
  checkpoint: LapicCheckpointCompletionResult
): LapicPauseToCheckpointTransitionSummary {
  return {
    sessionId,
    checkpoint,
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

  if (result.targetCheckpointId !== undefined && !isNonEmptyString(result.targetCheckpointId))
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
      !lapicWorkerProtocolMessageTags.includes(event.tag as LapicWorkerProtocolMessageTag))
  )
    return createRuntimeFailure('Trace tag must be supported.', ['tag'])

  if (!isNonEmptyString(event.eventDigest))
    return createRuntimeFailure('Event digest must be a non-empty string.', ['eventDigest'])

  return createLapicSuccessResult(event)
}

export function validateLapicPriorityDescriptor(
  descriptor: LapicPriorityDescriptor
): LapicValidationResult<LapicPriorityDescriptor> {
  if (!isRecord(descriptor))
    return createRuntimeFailure(
      'Priority descriptor must be a record.',
      ['priorityDescriptor']
    )

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
    return createRuntimeFailure('Retry policy must be a record.', ['retryPolicy'])

  if (!isNonNegativeInteger(policy.maxAttempts))
    return createRuntimeFailure(
      'Max attempts must be a non-negative integer.',
      ['maxAttempts']
    )

  if (!isBoolean(policy.replaySafe))
    return createRuntimeFailure('Replay safe must be a boolean.', ['replaySafe'])

  return createLapicSuccessResult(policy)
}

export function validateLapicWorkUnitEnvelope(
  envelope: LapicWorkUnitEnvelope
): LapicValidationResult<LapicWorkUnitEnvelope> {
  if (!isRecord(envelope))
    return createRuntimeFailure('Work unit envelope must be a record.', ['workUnitEnvelope'])

  if (!isNonEmptyString(envelope.workUnitId))
    return createRuntimeFailure('Work unit id must be a non-empty string.', ['workUnitId'])

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
    return createRuntimeFailure(
      'Determinism class must be supported.',
      ['determinismClass']
    )

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
    return createRuntimeFailure('Worker request must be a record.', ['workerRequest'])

  if (
    !isNonEmptyString(request.tag) ||
    !lapicWorkerProtocolMessageTags.includes(
      request.tag as LapicWorkerProtocolMessageTag
    )
  )
    return createRuntimeFailure('Worker request tag must be supported.', ['tag'])

  if (!isNonEmptyString(request.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', ['sessionId'])

  if (request.workUnit) return validateLapicWorkUnitEnvelope(request.workUnit)

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
    return createRuntimeFailure('Backend kind must be supported.', ['backendKind'])

  if (!isBoolean(descriptor.supportsPauseAtSafePoint))
    return createRuntimeFailure(
      'supportsPauseAtSafePoint must be boolean.',
      ['supportsPauseAtSafePoint']
    )

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
    return createRuntimeFailure('Worker response must be a record.', ['workerResponse'])

  if (
    !isNonEmptyString(response.tag) ||
    !lapicWorkerProtocolMessageTags.includes(
      response.tag as LapicWorkerProtocolMessageTag
    )
  )
    return createRuntimeFailure('Worker response tag must be supported.', ['tag'])

  if (!isNonEmptyString(response.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', ['sessionId'])

  if (response.producedArtifacts)
    return validateArtifactRefs(response.producedArtifacts, ['producedArtifacts']).ok
      ? createLapicSuccessResult(response)
      : createRuntimeFailure(
          'Produced artifacts must be valid and unique.',
          ['producedArtifacts']
        )

  return createLapicSuccessResult(response)
}

export function validateLapicCheckpointRequest(
  request: LapicCheckpointRequest
): LapicValidationResult<LapicCheckpointRequest> {
  if (!isRecord(request))
    return createRuntimeFailure(
      'Checkpoint request must be a record.',
      ['checkpointRequest']
    )

  if (!isNonEmptyString(request.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', ['sessionId'])

  if (!isNonEmptyString(request.checkpointId))
    return createRuntimeFailure(
      'Checkpoint id must be a non-empty string.',
      ['checkpointId']
    )

  return createLapicSuccessResult(request)
}

export function validateLapicCheckpointExportDescriptor(
  descriptor: LapicCheckpointExportDescriptor
): LapicValidationResult<LapicCheckpointExportDescriptor> {
  if (!isRecord(descriptor))
    return createRuntimeFailure(
      'Checkpoint export descriptor must be a record.',
      ['checkpointExportDescriptor']
    )

  if (!isNonEmptyString(descriptor.closure.checkpointId))
    return createRuntimeFailure(
      'Closure checkpoint id must be a non-empty string.',
      ['closure', 'checkpointId']
    )

  if (!isNonEmptyString(descriptor.closure.exportDigest))
    return createRuntimeFailure(
      'Closure export digest must be a non-empty string.',
      ['closure', 'exportDigest']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicCheckpointImportDescriptor(
  descriptor: LapicCheckpointImportDescriptor
): LapicValidationResult<LapicCheckpointImportDescriptor> {
  if (!isRecord(descriptor))
    return createRuntimeFailure(
      'Checkpoint import descriptor must be a record.',
      ['checkpointImportDescriptor']
    )

  if (!isNonEmptyString(descriptor.closure.checkpointId))
    return createRuntimeFailure(
      'Closure checkpoint id must be a non-empty string.',
      ['closure', 'checkpointId']
    )

  if (!isNonEmptyString(descriptor.closure.importDigest))
    return createRuntimeFailure(
      'Closure import digest must be a non-empty string.',
      ['closure', 'importDigest']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicCheckpointCompletionResult(
  result: LapicCheckpointCompletionResult
): LapicValidationResult<LapicCheckpointCompletionResult> {
  if (!isRecord(result))
    return createRuntimeFailure(
      'Checkpoint completion result must be a record.',
      ['checkpointCompletionResult']
    )

  if (!isNonEmptyString(result.checkpointId))
    return createRuntimeFailure(
      'Checkpoint id must be a non-empty string.',
      ['checkpointId']
    )

  if (!isBoolean(result.verification.resumable))
    return createRuntimeFailure(
      'Verification resumable must be boolean.',
      ['verification', 'resumable']
    )

  return createLapicSuccessResult(result)
}

export function validateLapicPauseToCheckpointTransitionSummary(
  summary: LapicPauseToCheckpointTransitionSummary
): LapicValidationResult<LapicPauseToCheckpointTransitionSummary> {
  if (!isRecord(summary))
    return createRuntimeFailure(
      'Pause-to-checkpoint summary must be a record.',
      ['pauseToCheckpointTransitionSummary']
    )

  if (!isNonEmptyString(summary.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', ['sessionId'])

  return validateLapicCheckpointCompletionResult(summary.checkpoint).ok
    ? createLapicSuccessResult(summary)
    : createRuntimeFailure('Checkpoint result must be valid.', ['checkpoint'])
}

export function validateLapicFailureRecord(
  failure: LapicFailureRecord
): LapicValidationResult<LapicFailureRecord> {
  if (!isRecord(failure))
    return createRuntimeFailure('Failure record must be a record.', ['failureRecord'])

  if (!isNonEmptyString(failure.sessionId))
    return createRuntimeFailure('Session id must be a non-empty string.', ['sessionId'])

  if (
    !isNonEmptyString(failure.failureClass) ||
    !lapicFailureClasses.includes(failure.failureClass as LapicFailureClass)
  )
    return createRuntimeFailure('Failure class must be supported.', ['failureClass'])

  if (!isNonEmptyString(failure.message))
    return createRuntimeFailure('Message must be a non-empty string.', ['message'])

  if (!Array.isArray(failure.diagnostics))
    return createRuntimeFailure('Diagnostics must be an array.', ['diagnostics'])

  return createLapicSuccessResult(failure)
}

export function validateLapicFailedSessionSummary(
  summary: LapicFailedSessionSummary
): LapicValidationResult<LapicFailedSessionSummary> {
  if (!isRecord(summary))
    return createRuntimeFailure(
      'Failed session summary must be a record.',
      ['failedSessionSummary']
    )

  const sessionValidation = validateLapicSessionSummary(summary.summary)
  if (!sessionValidation.ok) return sessionValidation

  return validateLapicFailureRecord(summary.failure).ok
    ? createLapicSuccessResult(summary)
    : createRuntimeFailure('Failure record must be valid.', ['failure'])
}

export function validateLapicRecoveryEligibilityClassification(
  classification: LapicRecoveryEligibilityClassification
): LapicValidationResult<LapicRecoveryEligibilityClassification> {
  if (!isRecord(classification))
    return createRuntimeFailure(
      'Recovery eligibility classification must be a record.',
      ['recoveryEligibilityClassification']
    )

  if (!isBoolean(classification.eligible))
    return createRuntimeFailure('Eligible must be boolean.', ['eligible'])

  if (!isNonEmptyString(classification.reason))
    return createRuntimeFailure('Reason must be a non-empty string.', ['reason'])

  return createLapicSuccessResult(classification)
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

  return createLapicSuccessResult(options)
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

export function createLapicInMemorySessionController(
  options: LapicInMemorySessionControllerOptions
): LapicInMemorySessionController {
  const optionsValidation = validateLapicInMemorySessionControllerOptions(options)
  if (!optionsValidation.ok)
    throw new Error(
      optionsValidation.diagnostics[0]?.message ??
        'Invalid in-memory session controller options.'
    )

  if (
    options.solveRequest &&
    options.solveRequest.problemDigest !== options.identity.problemDigest
  )
    throw new Error('Solve request problem digest must match session identity.')

  const artifactStore = options.artifactStore ?? createLapicMemoryArtifactStore()
  const progressListeners = new Map<string, (event: LapicProgressEvent) => void>()
  const diagnosticListeners = new Map<
    string,
    (event: LapicTraceEvent | LapicFailureRecord) => void
  >()

  const openArtifacts = new Map<string, LapicArtifactRef>()
  options.initialArtifacts?.forEach((artifactRef) => {
    openArtifacts.set(createLapicArtifactRefKey(artifactRef), createLapicArtifactRef(artifactRef))
  })

  const emittedCertificates: LapicCertificate[] = [...(options.initialCertificates ?? [])]
  let latestCheckpoint: LapicPauseToCheckpointTransitionSummary | undefined
  let finalOptimality = options.initialFinalOptimality
  let activePhase: LapicActivePhase | undefined
  let internalState: LapicInternalSolveState = 'created'
  let failure: LapicFailureRecord | undefined
  let completionSettled = false
  let subscriptionOrdinal = 0
  let eventOrdinal = 0
  let checkpointOrdinal = 0

  let resolveCompletion!: (result: LapicSolveCompletionResult) => void
  let rejectCompletion!: (reason: unknown) => void
  const completionPromise = new Promise<LapicSolveCompletionResult>((resolve, reject) => {
    resolveCompletion = resolve
    rejectCompletion = reject
  })

  const ensureNonTerminal = (action: string) => {
    if (terminalInternalStates.has(internalState))
      throw new Error(`Cannot ${action} after session reached terminal state ${internalState}.`)
  }

  const currentSummary = (): LapicSessionSummary =>
    createLapicSessionSummary(options.identity, internalState, activePhase)

  const emitTrace = (tag: LapicTraceEvent['tag'], digest?: LapicDigest) => {
    const traceEvent = createLapicTraceEvent(
      options.identity.sessionId,
      tag,
      digest ?? createRuntimeEventDigest(options.identity.sessionId, tag, eventOrdinal++)
    )
    diagnosticListeners.forEach((listener) => listener(traceEvent))
  }

  const settleCompletion = (result: LapicSolveCompletionResult) => {
    if (completionSettled) return
    completionSettled = true
    resolveCompletion(result)
  }

  const rejectFailedCompletion = (failedSummary: LapicFailedSessionSummary) => {
    if (completionSettled) return
    completionSettled = true
    rejectCompletion(failedSummary)
  }

  const createToken = <T>(listeners: Map<string, T>, listener: T): LapicSubscriptionToken => {
    const subscriptionId = `${options.identity.sessionId}:subscription:${subscriptionOrdinal++}`
    listeners.set(subscriptionId, listener)
    return createLapicSubscriptionToken(subscriptionId, () => {
      listeners.delete(subscriptionId)
    })
  }

  const checkpointArtifacts = (): readonly LapicArtifactRef[] => [
    ...openArtifacts.values(),
  ].map(createLapicArtifactRef)

  const moveToState = (
    nextState: LapicInternalSolveState,
    phase?: LapicActivePhase
  ) => {
    internalState = nextState
    activePhase = phase
  }

  return {
    subscribeProgress(listener) {
      return createToken(progressListeners, listener)
    },
    subscribeDiagnostics(listener) {
      return createToken(diagnosticListeners, listener)
    },
    activate(phase) {
      ensureNonTerminal('activate session')
      moveToState(
        phase === 'frontier-build' ? 'frontier-building' : 'search-running',
        phase
      )
      emitTrace('StartWork')
    },
    publishProgress(event) {
      ensureNonTerminal('publish progress')
      const progressEvent = createLapicProgressEvent(
        options.identity.sessionId,
        event.phase,
        event.completedUnits,
        event.totalUnits
      )
      const validation = validateLapicProgressEvent(progressEvent)
      if (!validation.ok)
        throw new Error(validation.diagnostics[0]?.message ?? 'Invalid progress event.')

      activePhase = progressEvent.phase
      if (internalState === 'created' || internalState === 'initializing')
        internalState = progressEvent.phase === 'frontier-build'
          ? 'frontier-building'
          : 'search-running'

      progressListeners.forEach((listener) => listener(progressEvent))
      emitTrace('Progress')
    },
    publishTrace(tag, eventDigest) {
      ensureNonTerminal('publish trace')
      emitTrace(tag, eventDigest)
    },
    publishArtifact(artifactRef) {
      ensureNonTerminal('publish artifact')
      openArtifacts.set(
        createLapicArtifactRefKey(artifactRef),
        createLapicArtifactRef(artifactRef)
      )
      emitTrace('PublishArtifacts')
    },
    emitCertificate(certificate) {
      ensureNonTerminal('emit certificate')
      emittedCertificates.push(certificate)
      emitTrace('EmitCertificate')
    },
    async requestPause() {
      if (terminalInternalStates.has(internalState))
        return createLapicPauseRequestResult(false)

      checkpointOrdinal += 1
      const targetCheckpointId = createCheckpointId(
        options.identity.sessionId,
        checkpointOrdinal
      )
      moveToState('pausing', activePhase)
      return createLapicPauseRequestResult(true, targetCheckpointId)
    },
    reachPauseSafePoint() {
      if (internalState !== 'pausing')
        throw new Error('Pause safe point can only be reached from the pausing state.')

      moveToState('paused', activePhase)
      emitTrace('PauseAtSafePoint')
    },
    resume(phase = activePhase ?? 'analyze') {
      ensureNonTerminal('resume session')
      if (internalState !== 'paused' && internalState !== 'checkpointing')
        throw new Error('Resume is only allowed from paused or checkpointing states.')

      moveToState('resuming', phase)
      emitTrace('LoadArtifacts')
      moveToState(phase === 'frontier-build' ? 'frontier-building' : 'search-running', phase)
    },
    async requestCheckpoint() {
      ensureNonTerminal('request checkpoint')
      if (internalState === 'created') moveToState('initializing', activePhase)
      if (internalState === 'pausing') this.reachPauseSafePoint()
      if (internalState !== 'paused') {
        const pauseRequest = await this.requestPause()
        if (!pauseRequest.accepted || !pauseRequest.targetCheckpointId)
          throw new Error('Checkpoint request was not accepted.')
        this.reachPauseSafePoint()
      }

      moveToState('checkpointing', activePhase)
      const checkpointId = createCheckpointId(
        options.identity.sessionId,
        checkpointOrdinal
      )
      const verification = await verifyLapicCheckpointClosure(artifactStore, {
        checkpointId,
        artifactRefs: checkpointArtifacts(),
      })
      const completion = createLapicCheckpointCompletionResult(checkpointId, verification)
      latestCheckpoint = createLapicPauseToCheckpointTransitionSummary(
        options.identity.sessionId,
        completion
      )
      moveToState('paused', activePhase)
      emitTrace('AcknowledgeCheckpoint')
      return latestCheckpoint
    },
    async exportCheckpoint() {
      ensureNonTerminal('export checkpoint')
      const checkpointSummary = latestCheckpoint ?? (await this.requestCheckpoint())
      const inventory =
        checkpointSummary.checkpoint.verification.diagnostics.length === 0
          ? createLapicCheckpointClosureInventory(
              checkpointSummary.checkpoint.checkpointId,
              checkpointArtifacts(),
              []
            )
          : createLapicCheckpointClosureInventory(
              checkpointSummary.checkpoint.checkpointId,
              checkpointArtifacts(),
              checkpointArtifacts().filter((artifactRef) =>
                checkpointSummary.checkpoint.verification.diagnostics.includes(
                  `Missing artifact: ${artifactRef.artifactId}`
                )
              )
            )

      return createLapicCheckpointExportDescriptor(
        createLapicClosureExportDescriptor(
          checkpointSummary.checkpoint.checkpointId,
          `${checkpointSummary.checkpoint.checkpointId}:export`
        ),
        inventory
      )
    },
    async requestCancel() {
      if (terminalInternalStates.has(internalState))
        return createLapicCancelRequestResult(false)

      moveToState('cancelled')
      settleCompletion({
        summary: currentSummary(),
        finalOptimality,
        emittedCertificates: [...emittedCertificates],
      })
      emitTrace('Shutdown')
      return createLapicCancelRequestResult(true)
    },
    async awaitCompletion() {
      return completionPromise
    },
    async inspectSessionState() {
      return {
        summary: currentSummary(),
        openArtifacts: checkpointArtifacts(),
      }
    },
    async complete(nextFinalOptimality) {
      ensureNonTerminal('complete session')
      moveToState('finalizing', activePhase)
      finalOptimality = nextFinalOptimality ?? finalOptimality
      moveToState('completed', activePhase)
      const result = {
        summary: currentSummary(),
        finalOptimality,
        emittedCertificates: [...emittedCertificates],
      }
      settleCompletion(result)
      emitTrace('Shutdown')
      return result
    },
    async fail(failureClass, message, diagnostics = []) {
      ensureNonTerminal('fail session')
      failure = createLapicFailureRecord(
        options.identity.sessionId,
        failureClass,
        message,
        diagnostics
      )
      moveToState('failed', activePhase)
      diagnosticListeners.forEach((listener) => listener(failure))
      emitTrace('ReportFailure')
      rejectFailedCompletion(
        createLapicFailedSessionSummary(currentSummary(), failure)
      )
      throw createLapicFailedSessionSummary(currentSummary(), failure)
    },
    getLatestCheckpoint() {
      return latestCheckpoint
    },
  }
}

export function createLapicRuntimeRecoveryEligibility(
  failedSummary: LapicFailedSessionSummary
): LapicRecoveryEligibilityClassification {
  switch (failedSummary.failure.failureClass) {
    case 'workerFailure':
    case 'providerFailure':
      return createLapicRecoveryEligibilityClassification(
        true,
        'Session may be retried from the last checkpoint once executor health is restored.'
      )
    case 'checkpointClosureFailure':
    case 'storageIntegrityFailure':
      return createLapicRecoveryEligibilityClassification(
        false,
        'Session cannot be recovered until persistence integrity issues are repaired.'
      )
    default:
      return createLapicRecoveryEligibilityClassification(
        false,
        'Failure class is not automatically eligible for recovery.'
      )
  }
}

export const lapicRuntimeSkeleton: LapicRuntimeSkeletonMarker = {
  packageName: lapicRuntimePackageName,
  protocolVersion: lapicRuntimeProtocolVersion,
}

export {
  createLapicArtifactRef,
  createLapicCheckpointClosureInventory,
  createLapicCheckpointClosureVerificationResult,
  createLapicClosureExportDescriptor,
  createLapicClosureImportDescriptor,
}
