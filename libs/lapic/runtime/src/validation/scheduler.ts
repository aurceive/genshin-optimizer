/**
 * Validation functions for the lapic work scheduler subsystem.
 *
 * Validates scheduler items, events, statistics, state transitions,
 * and partition plans to ensure protocol integrity.
 */

import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicScheduledWorkItem,
  LapicScheduledWorkStatus,
  LapicSchedulerEvent,
  LapicSchedulerEventKind,
  LapicSchedulerStatistics,
} from '../scheduler/types'
import type {
  LapicWorkerPartition,
  LapicWorkerPartitionPlan,
} from '../worker/partitioner'
import {
  createRuntimeFailure,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from './internal'
import { validateLapicWorkUnitEnvelope } from './worker'

// ---------------------------------------------------------------------------
// Allowed values
// ---------------------------------------------------------------------------

export const lapicScheduledWorkStatuses = [
  'queued',
  'dispatched',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly LapicScheduledWorkStatus[]

export const lapicSchedulerEventKinds = [
  'enqueued',
  'dispatched',
  'completed',
  'failed',
  'cancelled',
  'reprioritized',
] as const satisfies readonly LapicSchedulerEventKind[]

/**
 * Valid state transitions for scheduled work items.
 * Key = current status, Value = set of allowed next statuses.
 */
const validTransitions: Record<
  LapicScheduledWorkStatus,
  readonly LapicScheduledWorkStatus[]
> = {
  queued: ['dispatched', 'cancelled'],
  dispatched: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export function validateLapicScheduledWorkItem(
  item: LapicScheduledWorkItem
): LapicValidationResult<LapicScheduledWorkItem> {
  if (!isRecord(item))
    return createRuntimeFailure('Scheduled work item must be a record.', [
      'scheduledWorkItem',
    ])

  const envelopeValidation = validateLapicWorkUnitEnvelope(item.workUnit)
  if (!envelopeValidation.ok) return envelopeValidation

  if (
    !isNonEmptyString(item.status) ||
    !lapicScheduledWorkStatuses.includes(
      item.status as LapicScheduledWorkStatus
    )
  )
    return createRuntimeFailure(
      'Scheduled work status must be a supported value.',
      ['status']
    )

  if (
    !isNonNegativeInteger(item.enqueuedAtSequence) ||
    item.enqueuedAtSequence < 1
  )
    return createRuntimeFailure(
      'Enqueued sequence must be a positive integer.',
      ['enqueuedAtSequence']
    )

  if (
    item.status === 'dispatched' ||
    item.status === 'completed' ||
    item.status === 'failed'
  ) {
    if (
      item.dispatchedAtSequence === undefined ||
      !isNonNegativeInteger(item.dispatchedAtSequence) ||
      item.dispatchedAtSequence < 1
    )
      return createRuntimeFailure(
        'Dispatched sequence must be present and positive for dispatched/completed/failed items.',
        ['dispatchedAtSequence']
      )

    if (item.dispatchedAtSequence <= item.enqueuedAtSequence)
      return createRuntimeFailure(
        'Dispatched sequence must be greater than enqueued sequence.',
        ['dispatchedAtSequence']
      )
  }

  if (item.status === 'completed' || item.status === 'failed') {
    if (
      item.completedAtSequence === undefined ||
      !isNonNegativeInteger(item.completedAtSequence) ||
      item.completedAtSequence < 1
    )
      return createRuntimeFailure(
        'Completed sequence must be present and positive for completed/failed items.',
        ['completedAtSequence']
      )

    if (
      item.dispatchedAtSequence !== undefined &&
      item.completedAtSequence <= item.dispatchedAtSequence
    )
      return createRuntimeFailure(
        'Completed sequence must be greater than dispatched sequence.',
        ['completedAtSequence']
      )
  }

  return createLapicSuccessResult(item)
}

export function validateLapicSchedulerEvent(
  event: LapicSchedulerEvent
): LapicValidationResult<LapicSchedulerEvent> {
  if (!isRecord(event))
    return createRuntimeFailure('Scheduler event must be a record.', [
      'schedulerEvent',
    ])

  if (
    !isNonEmptyString(event.kind) ||
    !lapicSchedulerEventKinds.includes(event.kind as LapicSchedulerEventKind)
  )
    return createRuntimeFailure(
      'Scheduler event kind must be a supported value.',
      ['kind']
    )

  if (!isNonEmptyString(event.workUnitId))
    return createRuntimeFailure('Work unit id must be a non-empty string.', [
      'workUnitId',
    ])

  if (!isNonNegativeInteger(event.sequence) || event.sequence < 1)
    return createRuntimeFailure('Event sequence must be a positive integer.', [
      'sequence',
    ])

  return createLapicSuccessResult(event)
}

export function validateLapicSchedulerStatistics(
  stats: LapicSchedulerStatistics
): LapicValidationResult<LapicSchedulerStatistics> {
  if (!isRecord(stats))
    return createRuntimeFailure('Scheduler statistics must be a record.', [
      'schedulerStatistics',
    ])

  const fields: Array<[keyof LapicSchedulerStatistics, string]> = [
    ['totalEnqueued', 'Total enqueued'],
    ['totalDispatched', 'Total dispatched'],
    ['totalCompleted', 'Total completed'],
    ['totalFailed', 'Total failed'],
    ['totalCancelled', 'Total cancelled'],
    ['currentQueueDepth', 'Current queue depth'],
    ['currentInFlight', 'Current in-flight'],
  ]

  for (const [field, label] of fields) {
    if (!isNonNegativeInteger(stats[field]))
      return createRuntimeFailure(`${label} must be a non-negative integer.`, [
        field,
      ])
  }

  // Logical invariants
  if (stats.totalDispatched > stats.totalEnqueued)
    return createRuntimeFailure(
      'Total dispatched cannot exceed total enqueued.',
      ['totalDispatched']
    )

  if (
    stats.totalCompleted + stats.totalFailed + stats.totalCancelled >
    stats.totalEnqueued
  )
    return createRuntimeFailure(
      'Sum of terminal states cannot exceed total enqueued.',
      ['totalCompleted']
    )

  return createLapicSuccessResult(stats)
}

/**
 * Validate that a state transition is legal.
 */
export function validateLapicSchedulerStateTransition(
  from: LapicScheduledWorkStatus,
  to: LapicScheduledWorkStatus
): LapicValidationResult<{
  from: LapicScheduledWorkStatus
  to: LapicScheduledWorkStatus
}> {
  if (
    !lapicScheduledWorkStatuses.includes(from) ||
    !lapicScheduledWorkStatuses.includes(to)
  )
    return createRuntimeFailure(
      'State transition endpoints must be valid statuses.',
      ['stateTransition']
    )

  const allowed = validTransitions[from]
  if (!allowed.includes(to))
    return createRuntimeFailure(
      `Transition from '${from}' to '${to}' is not allowed. Valid: [${allowed.join(', ')}].`,
      ['stateTransition']
    )

  return createLapicSuccessResult({ from, to })
}

/**
 * Validate that a scheduler event sequence is monotonically increasing.
 */
export function validateLapicSchedulerEventSequence(
  events: readonly LapicSchedulerEvent[]
): LapicValidationResult<readonly LapicSchedulerEvent[]> {
  if (!Array.isArray(events))
    return createRuntimeFailure('Event sequence must be an array.', [
      'eventSequence',
    ])

  for (let i = 0; i < events.length; i++) {
    const eventValidation = validateLapicSchedulerEvent(events[i]!)
    if (!eventValidation.ok) return eventValidation

    if (i > 0 && events[i]!.sequence <= events[i - 1]!.sequence)
      return createRuntimeFailure(
        'Event sequences must be monotonically increasing.',
        ['eventSequence', String(i)]
      )
  }

  return createLapicSuccessResult(events)
}

/**
 * Validate a worker partition's structural integrity.
 */
export function validateLapicWorkerPartition(
  partition: LapicWorkerPartition
): LapicValidationResult<LapicWorkerPartition> {
  if (!isRecord(partition))
    return createRuntimeFailure('Worker partition must be a record.', [
      'workerPartition',
    ])

  if (!isNonNegativeInteger(partition.partitionIndex))
    return createRuntimeFailure(
      'Partition index must be a non-negative integer.',
      ['partitionIndex']
    )

  if (!isNonNegativeInteger(partition.startFlatIndex))
    return createRuntimeFailure(
      'Start flat index must be a non-negative integer.',
      ['startFlatIndex']
    )

  if (
    !isNonNegativeInteger(partition.endFlatIndex) ||
    partition.endFlatIndex <= partition.startFlatIndex
  )
    return createRuntimeFailure(
      'End flat index must be greater than start flat index.',
      ['endFlatIndex']
    )

  if (
    partition.combinationCount !==
    partition.endFlatIndex - partition.startFlatIndex
  )
    return createRuntimeFailure(
      'Combination count must equal endFlatIndex - startFlatIndex.',
      ['combinationCount']
    )

  return createLapicSuccessResult(partition)
}

/**
 * Validate a complete partition plan: no gaps, no overlaps, contiguous.
 */
export function validateLapicWorkerPartitionPlan(
  plan: LapicWorkerPartitionPlan
): LapicValidationResult<LapicWorkerPartitionPlan> {
  if (!isRecord(plan))
    return createRuntimeFailure('Worker partition plan must be a record.', [
      'workerPartitionPlan',
    ])

  if (!isNonNegativeInteger(plan.workerCount))
    return createRuntimeFailure(
      'Worker count must be a non-negative integer.',
      ['workerCount']
    )

  if (!isNonNegativeInteger(plan.totalCombinationCount))
    return createRuntimeFailure(
      'Total combination count must be a non-negative integer.',
      ['totalCombinationCount']
    )

  if (!Array.isArray(plan.partitions))
    return createRuntimeFailure('Partitions must be an array.', ['partitions'])

  if (plan.partitions.length !== plan.workerCount)
    return createRuntimeFailure('Partition count must equal worker count.', [
      'partitions',
    ])

  let expectedStart = 0
  let totalCovered = 0

  for (let i = 0; i < plan.partitions.length; i++) {
    const partition = plan.partitions[i]!
    const partitionValidation = validateLapicWorkerPartition(partition)
    if (!partitionValidation.ok) return partitionValidation

    if (partition.partitionIndex !== i)
      return createRuntimeFailure(
        'Partition indices must be sequential starting from 0.',
        ['partitions', String(i), 'partitionIndex']
      )

    if (partition.startFlatIndex !== expectedStart)
      return createRuntimeFailure(
        'Partitions must be contiguous with no gaps.',
        ['partitions', String(i), 'startFlatIndex']
      )

    expectedStart = partition.endFlatIndex
    totalCovered += partition.combinationCount
  }

  if (totalCovered !== plan.totalCombinationCount)
    return createRuntimeFailure(
      'Partition coverage must equal total combination count.',
      ['totalCombinationCount']
    )

  return createLapicSuccessResult(plan)
}
