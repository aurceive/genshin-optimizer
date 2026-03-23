// ---------------------------------------------------------------------------
// Multi-worker protocol facade
// ---------------------------------------------------------------------------

export type {
  LapicWorkerPartition,
  LapicWorkerPartitionPlan,
  LapicPartitionConfig,
} from './partitioner'

export {
  createWorkerPartitionPlan,
  validatePartitionPlanCoverage,
  decodeFlatIndex,
  encodeFlatIndex,
} from './partitioner'

export type {
  LapicWorkerDispatchMessage,
  LapicWorkerResultMessage,
  LapicWorkerResultEntry,
  LapicWorkerPauseMessage,
  LapicWorkerPauseAckMessage,
  LapicCoordinatorMessage,
  LapicWorkerMessage,
  LapicWorkerTransport,
  LapicInProcessWorkExecutor,
  LapicInProcessWorkResult,
} from './transport'

export { createInProcessTransport } from './transport'

export type {
  LapicWorkerHandle,
  LapicPoolWorkerState,
  LapicPoolTransportConfig,
} from './pool'

export {
  createPoolTransport,
  createCallbackWorkerHandle,
} from './pool'

export type {
  LapicMessagePortLike,
  LapicPortCoordinatorEnvelope,
  LapicPortWorkerEnvelope,
  LapicWorkerEntryConfig,
  LapicBoundedExactPortDispatchRequest,
  LapicBoundedExactPortCoordinatorEnvelope,
  LapicBoundedExactPortWorkerEnvelope,
  LapicBoundedExactWorkerEntryConfig,
  LapicMessagePortPartitionDispatcherConfig,
} from './message-port'

export {
  createMessagePortWorkerHandle,
  createWorkerEntryHandler,
  createBoundedExactWorkerEntryHandler,
  createMessagePortPartitionDispatcher,
} from './message-port'

export type {
  LapicCoordinatedSolveConfig,
  LapicCoordinatedSolveResult,
} from './coordinator'

export {
  mergeWorkerResults,
  mergeWorkerCertificates,
  createInProcessPartitionExecutor,
  executeCoordinatedSolve,
  createInProcessCoordinatedSolve,
} from './coordinator'

export type { LapicDomainPartition } from './domain-partitioner'
export { createDomainPartitionedJoinPlans } from './domain-partitioner'

export type {
  LapicPartitionDispatchRequest,
  LapicPartitionCompletedResponse,
  LapicPartitionPausedResponse,
  LapicPartitionDispatchResponse,
  LapicPartitionDispatcher,
  LapicPartitionDispatchConfig,
} from './partition-dispatch'
export { createInProcessPartitionDispatcher } from './partition-dispatch'

export type { LapicCoordinatedBoundedExactSolveConfig } from './coordinated-solve'
export { executeCoordinatedBoundedExactSolve } from './coordinated-solve'
