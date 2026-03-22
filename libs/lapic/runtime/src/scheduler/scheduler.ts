/**
 * Work scheduler for the lapic runtime.
 *
 * Manages the lifecycle of work units from enqueue through dispatch
 * to completion or failure. Provides deterministic priority ordering
 * and in-flight tracking for the multi-worker coordinator.
 *
 * The scheduler is environment-agnostic — it does not know about
 * workers or transports. It only manages the queue and status
 * transitions. The coordinator calls `dequeue()` to get work
 * and `complete()`/`fail()` to report results.
 */

import type { LapicPriorityDescriptor, LapicWorkUnitEnvelope } from '../types'
import { type LapicPriorityQueue, createLapicPriorityQueue } from './queue'
import type {
  LapicScheduledWorkItem,
  LapicScheduledWorkStatus,
  LapicSchedulerEvent,
  LapicSchedulerStatistics,
} from './types'

// ---------------------------------------------------------------------------
// Scheduler interface
// ---------------------------------------------------------------------------

export interface LapicWorkScheduler {
  /**
   * Add a work unit to the scheduler's queue.
   * Returns the scheduled item with status 'queued'.
   */
  enqueue(workUnit: LapicWorkUnitEnvelope): LapicScheduledWorkItem

  /**
   * Dequeue the highest-priority work unit and mark it 'dispatched'.
   * Returns `undefined` if no queued work is available.
   */
  dequeue(): LapicScheduledWorkItem | undefined

  /**
   * Mark a dispatched work unit as completed.
   * Throws if the work unit is not in 'dispatched' status.
   */
  complete(workUnitId: string): LapicScheduledWorkItem

  /**
   * Mark a dispatched work unit as failed.
   * If the work unit's retry policy allows retries and the attempt
   * count hasn't been exhausted, the unit is re-enqueued.
   */
  fail(workUnitId: string): LapicScheduledWorkItem

  /**
   * Cancel a queued or dispatched work unit.
   * Returns the cancelled item, or `undefined` if not found.
   */
  cancel(workUnitId: string): LapicScheduledWorkItem | undefined

  /**
   * Update the priority of a queued work unit.
   * Has no effect on dispatched or completed units.
   */
  reprioritize(
    workUnitId: string,
    newPriority: LapicPriorityDescriptor
  ): boolean

  /**
   * Look up a work unit by ID.
   */
  getItem(workUnitId: string): LapicScheduledWorkItem | undefined

  /**
   * Current scheduler statistics.
   */
  getStatistics(): LapicSchedulerStatistics

  /**
   * All events emitted since scheduler creation (for diagnostics).
   */
  getEvents(): readonly LapicSchedulerEvent[]

  /**
   * All items in the given status.
   */
  getItemsByStatus(
    status: LapicScheduledWorkStatus
  ): readonly LapicScheduledWorkItem[]

  /**
   * Number of items currently queued (not dispatched).
   */
  readonly queueDepth: number

  /**
   * Number of items currently dispatched (in-flight).
   */
  readonly inFlightCount: number
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createLapicWorkScheduler(): LapicWorkScheduler {
  const queue: LapicPriorityQueue = createLapicPriorityQueue()
  const items = new Map<string, LapicScheduledWorkItem>()
  const inFlight = new Map<string, LapicScheduledWorkItem>()
  const attemptCounts = new Map<string, number>()
  const events: LapicSchedulerEvent[] = []
  let sequenceCounter = 0

  let totalEnqueued = 0
  let totalDispatched = 0
  let totalCompleted = 0
  let totalFailed = 0
  let totalCancelled = 0

  function nextSequence(): number {
    return ++sequenceCounter
  }

  function emitEvent(
    kind: LapicSchedulerEvent['kind'],
    workUnitId: string,
    workUnitKind: LapicWorkUnitEnvelope['kind']
  ): void {
    events.push({ kind, workUnitId, workUnitKind, sequence: nextSequence() })
  }

  return {
    enqueue(workUnit: LapicWorkUnitEnvelope): LapicScheduledWorkItem {
      const seq = nextSequence()
      const item: LapicScheduledWorkItem = {
        workUnit,
        status: 'queued',
        enqueuedAtSequence: seq,
      }
      items.set(workUnit.workUnitId, item)
      queue.enqueue({ workUnit, enqueuedAtSequence: seq })
      totalEnqueued++
      emitEvent('enqueued', workUnit.workUnitId, workUnit.kind)
      return item
    },

    dequeue(): LapicScheduledWorkItem | undefined {
      const entry = queue.dequeue()
      if (!entry) return undefined

      const seq = nextSequence()
      const item: LapicScheduledWorkItem = {
        workUnit: entry.workUnit,
        status: 'dispatched',
        enqueuedAtSequence: entry.enqueuedAtSequence,
        dispatchedAtSequence: seq,
      }
      items.set(entry.workUnit.workUnitId, item)
      inFlight.set(entry.workUnit.workUnitId, item)
      totalDispatched++
      emitEvent('dispatched', entry.workUnit.workUnitId, entry.workUnit.kind)
      return item
    },

    complete(workUnitId: string): LapicScheduledWorkItem {
      const current = inFlight.get(workUnitId)
      if (!current)
        throw new Error(
          `Cannot complete work unit '${workUnitId}': not in dispatched status.`
        )

      const seq = nextSequence()
      const item: LapicScheduledWorkItem = {
        workUnit: current.workUnit,
        status: 'completed',
        enqueuedAtSequence: current.enqueuedAtSequence,
        ...(current.dispatchedAtSequence !== undefined
          ? { dispatchedAtSequence: current.dispatchedAtSequence }
          : {}),
        completedAtSequence: seq,
      }
      items.set(workUnitId, item)
      inFlight.delete(workUnitId)
      totalCompleted++
      emitEvent('completed', workUnitId, current.workUnit.kind)
      return item
    },

    fail(workUnitId: string): LapicScheduledWorkItem {
      const current = inFlight.get(workUnitId)
      if (!current)
        throw new Error(
          `Cannot fail work unit '${workUnitId}': not in dispatched status.`
        )

      inFlight.delete(workUnitId)
      const attempts = (attemptCounts.get(workUnitId) ?? 0) + 1
      attemptCounts.set(workUnitId, attempts)

      // Check retry policy
      if (
        current.workUnit.retryPolicy.replaySafe &&
        attempts < current.workUnit.retryPolicy.maxAttempts
      ) {
        // Re-enqueue with same priority
        const seq = nextSequence()
        const item: LapicScheduledWorkItem = {
          workUnit: current.workUnit,
          status: 'queued',
          enqueuedAtSequence: seq,
        }
        items.set(workUnitId, item)
        queue.enqueue({ workUnit: current.workUnit, enqueuedAtSequence: seq })
        emitEvent('enqueued', workUnitId, current.workUnit.kind)
        return item
      }

      // Exhausted retries — mark as permanently failed
      const seq = nextSequence()
      const item: LapicScheduledWorkItem = {
        workUnit: current.workUnit,
        status: 'failed',
        enqueuedAtSequence: current.enqueuedAtSequence,
        ...(current.dispatchedAtSequence !== undefined
          ? { dispatchedAtSequence: current.dispatchedAtSequence }
          : {}),
        completedAtSequence: seq,
      }
      items.set(workUnitId, item)
      totalFailed++
      emitEvent('failed', workUnitId, current.workUnit.kind)
      return item
    },

    cancel(workUnitId: string): LapicScheduledWorkItem | undefined {
      const current = items.get(workUnitId)
      if (!current) return undefined
      if (
        current.status === 'completed' ||
        current.status === 'failed' ||
        current.status === 'cancelled'
      )
        return undefined

      // Remove from queue or in-flight
      if (current.status === 'queued') {
        queue.remove(workUnitId)
      } else if (current.status === 'dispatched') {
        inFlight.delete(workUnitId)
      }

      const seq = nextSequence()
      const item: LapicScheduledWorkItem = {
        workUnit: current.workUnit,
        status: 'cancelled',
        enqueuedAtSequence: current.enqueuedAtSequence,
        ...(current.dispatchedAtSequence !== undefined
          ? { dispatchedAtSequence: current.dispatchedAtSequence }
          : {}),
        completedAtSequence: seq,
      }
      items.set(workUnitId, item)
      totalCancelled++
      emitEvent('cancelled', workUnitId, current.workUnit.kind)
      return item
    },

    reprioritize(
      workUnitId: string,
      newPriority: LapicPriorityDescriptor
    ): boolean {
      const current = items.get(workUnitId)
      if (!current || current.status !== 'queued') return false

      const removed = queue.remove(workUnitId)
      if (!removed) return false

      const updatedWorkUnit: LapicWorkUnitEnvelope = {
        ...current.workUnit,
        priority: newPriority,
      }
      const seq = nextSequence()
      const item: LapicScheduledWorkItem = {
        workUnit: updatedWorkUnit,
        status: 'queued',
        enqueuedAtSequence: seq,
      }
      items.set(workUnitId, item)
      queue.enqueue({ workUnit: updatedWorkUnit, enqueuedAtSequence: seq })
      emitEvent('reprioritized', workUnitId, updatedWorkUnit.kind)
      return true
    },

    getItem(workUnitId: string): LapicScheduledWorkItem | undefined {
      return items.get(workUnitId)
    },

    getStatistics(): LapicSchedulerStatistics {
      return {
        totalEnqueued,
        totalDispatched,
        totalCompleted,
        totalFailed,
        totalCancelled,
        currentQueueDepth: queue.size,
        currentInFlight: inFlight.size,
      }
    },

    getEvents(): readonly LapicSchedulerEvent[] {
      return events
    },

    getItemsByStatus(
      status: LapicScheduledWorkStatus
    ): readonly LapicScheduledWorkItem[] {
      const result: LapicScheduledWorkItem[] = []
      for (const item of items.values()) {
        if (item.status === status) result.push(item)
      }
      return result
    },

    get queueDepth(): number {
      return queue.size
    },

    get inFlightCount(): number {
      return inFlight.size
    },
  }
}
