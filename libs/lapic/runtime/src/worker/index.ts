// ---------------------------------------------------------------------------
// Multi-worker protocol facade
// ---------------------------------------------------------------------------

// --- Flat-index partitioner (used by validation/scheduler) ---

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

// --- Flat-index transport protocol (used by message-port, pool) ---

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

// --- Worker pool ---

export type {
  LapicWorkerHandle,
  LapicPoolWorkerState,
  LapicPoolTransportConfig,
} from './pool'

export {
  createPoolTransport,
  createCallbackWorkerHandle,
} from './pool'

// --- MessagePort-based worker handles ---

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

// --- Domain-level partitioner ---

export type { LapicDomainPartition } from './domain-partitioner'
export { createDomainPartitionedJoinPlans } from './domain-partitioner'

// --- Unified partition dispatch contract ---

export type {
  LapicPartitionDispatchRequest,
  LapicPartitionCompletedResponse,
  LapicPartitionPausedResponse,
  LapicPartitionDispatchResponse,
  LapicPartitionDispatcher,
  LapicPartitionDispatchConfig,
} from './partition-dispatch'
export { createInProcessPartitionDispatcher } from './partition-dispatch'

// --- Coordinated bounded-exact solve (coordinator + executor bridge) ---

export type { LapicCoordinatedBoundedExactSolveConfig } from './coordinated-solve'
export { executeCoordinatedBoundedExactSolve } from './coordinated-solve'
