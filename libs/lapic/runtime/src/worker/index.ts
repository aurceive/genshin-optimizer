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
  LapicCoordinatedSolveConfig,
  LapicCoordinatedSolveResult,
} from './coordinator'

export {
  mergeWorkerResults,
  createInProcessPartitionExecutor,
  executeCoordinatedSolve,
  createInProcessCoordinatedSolve,
} from './coordinator'
