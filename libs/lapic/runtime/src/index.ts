import type {
  LapicCertificate,
  LapicFinalOptimalitySummary,
} from '@genshin-optimizer/lapic/cert'
import type {
  LapicArithmeticPolicyId,
  LapicDiagnostic,
  LapicDigest,
  LapicEngineVersion,
  LapicLogicalTimestamp,
  LapicProblemDigest,
  LapicStateId,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicArtifactRef,
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

export interface LapicRuntimeSkeletonMarker {
  readonly packageName: typeof lapicRuntimePackageName
  readonly protocolVersion: LapicRuntimeProtocolVersion
}

export const lapicRuntimeSkeleton: LapicRuntimeSkeletonMarker = {
  packageName: lapicRuntimePackageName,
  protocolVersion: lapicRuntimeProtocolVersion,
}
