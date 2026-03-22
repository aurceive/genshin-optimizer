// ---------------------------------------------------------------------------
// Work scheduler facade
// ---------------------------------------------------------------------------

export type {
  LapicScheduledWorkItem,
  LapicScheduledWorkStatus,
  LapicSchedulerEvent,
  LapicSchedulerEventKind,
  LapicSchedulerStatistics,
} from './types'

export { comparePriorityDescriptors } from './types'

export type {
  LapicPriorityQueue,
  LapicPriorityQueueEntry,
} from './queue'

export { createLapicPriorityQueue } from './queue'

export type { LapicWorkScheduler } from './scheduler'
export { createLapicWorkScheduler } from './scheduler'
