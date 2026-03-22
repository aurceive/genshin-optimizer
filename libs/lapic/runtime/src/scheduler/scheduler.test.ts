import type { LapicPriorityDescriptor, LapicWorkUnitEnvelope } from '../types'
import { createLapicWorkScheduler } from './scheduler'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function priority(
  upperBound: string,
  gap = '0',
  cost = '0',
  tieBreak = '0'
): LapicPriorityDescriptor {
  return {
    upperBoundOrderingDigest: upperBound,
    uncertaintyGapDigest: gap,
    residualCostDigest: cost,
    deterministicTieBreakDigest: tieBreak,
    costModelVersion: 'v1',
  }
}

function workUnit(
  id: string,
  p: LapicPriorityDescriptor,
  maxAttempts = 1,
  replaySafe = true
): LapicWorkUnitEnvelope {
  return {
    workUnitId: id,
    kind: 'JoinFrontierBlocks',
    determinismClass: 'pure-deterministic',
    priority: p,
    retryPolicy: { maxAttempts, replaySafe },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LapicWorkScheduler', () => {
  describe('enqueue / dequeue lifecycle', () => {
    it('enqueues and dequeues in priority order', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('low', priority('100')))
      scheduler.enqueue(workUnit('high', priority('900')))
      scheduler.enqueue(workUnit('mid', priority('500')))

      expect(scheduler.queueDepth).toBe(3)

      const first = scheduler.dequeue()!
      expect(first.workUnit.workUnitId).toBe('high')
      expect(first.status).toBe('dispatched')
      expect(scheduler.inFlightCount).toBe(1)
      expect(scheduler.queueDepth).toBe(2)
    })

    it('returns undefined when queue is empty', () => {
      const scheduler = createLapicWorkScheduler()
      expect(scheduler.dequeue()).toBeUndefined()
    })
  })

  describe('complete', () => {
    it('marks dispatched item as completed', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('500')))
      scheduler.dequeue()

      const completed = scheduler.complete('a')
      expect(completed.status).toBe('completed')
      expect(completed.completedAtSequence).toBeDefined()
      expect(scheduler.inFlightCount).toBe(0)
    })

    it('throws when completing non-dispatched item', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('500')))
      expect(() => scheduler.complete('a')).toThrow('not in dispatched status')
    })
  })

  describe('fail with retry', () => {
    it('re-enqueues on first failure when retries available', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('500'), 3, true))
      scheduler.dequeue()

      const result = scheduler.fail('a')
      expect(result.status).toBe('queued')
      expect(scheduler.queueDepth).toBe(1)
      expect(scheduler.inFlightCount).toBe(0)
    })

    it('marks as permanently failed after max retries', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('500'), 2, true))

      // Attempt 1
      scheduler.dequeue()
      scheduler.fail('a') // re-enqueued (attempt 1 < maxAttempts 2)

      // Attempt 2
      scheduler.dequeue()
      const result = scheduler.fail('a') // exhausted
      expect(result.status).toBe('failed')
      expect(scheduler.queueDepth).toBe(0)
    })

    it('does not retry when replaySafe is false', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('500'), 5, false))
      scheduler.dequeue()

      const result = scheduler.fail('a')
      expect(result.status).toBe('failed')
    })

    it('throws when failing non-dispatched item', () => {
      const scheduler = createLapicWorkScheduler()
      expect(() => scheduler.fail('nonexistent')).toThrow(
        'not in dispatched status'
      )
    })
  })

  describe('cancel', () => {
    it('cancels a queued item', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('500')))

      const result = scheduler.cancel('a')
      expect(result!.status).toBe('cancelled')
      expect(scheduler.queueDepth).toBe(0)
    })

    it('cancels a dispatched item', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('500')))
      scheduler.dequeue()

      const result = scheduler.cancel('a')
      expect(result!.status).toBe('cancelled')
      expect(scheduler.inFlightCount).toBe(0)
    })

    it('returns undefined for non-existent item', () => {
      const scheduler = createLapicWorkScheduler()
      expect(scheduler.cancel('nonexistent')).toBeUndefined()
    })

    it('returns undefined for already completed item', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('500')))
      scheduler.dequeue()
      scheduler.complete('a')

      expect(scheduler.cancel('a')).toBeUndefined()
    })
  })

  describe('reprioritize', () => {
    it('changes priority of a queued item', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('100')))
      scheduler.enqueue(workUnit('b', priority('500')))

      // Promote 'a' above 'b'
      const result = scheduler.reprioritize('a', priority('900'))
      expect(result).toBe(true)

      const first = scheduler.dequeue()!
      expect(first.workUnit.workUnitId).toBe('a')
      expect(first.workUnit.priority.upperBoundOrderingDigest).toBe('900')
    })

    it('returns false for dispatched item', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('500')))
      scheduler.dequeue()

      expect(scheduler.reprioritize('a', priority('900'))).toBe(false)
    })

    it('returns false for non-existent item', () => {
      const scheduler = createLapicWorkScheduler()
      expect(scheduler.reprioritize('nonexistent', priority('900'))).toBe(false)
    })
  })

  describe('getItem', () => {
    it('returns item by ID', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('500')))

      const item = scheduler.getItem('a')
      expect(item).toBeDefined()
      expect(item!.workUnit.workUnitId).toBe('a')
    })

    it('returns undefined for non-existent item', () => {
      const scheduler = createLapicWorkScheduler()
      expect(scheduler.getItem('nonexistent')).toBeUndefined()
    })
  })

  describe('statistics', () => {
    it('tracks all counters correctly', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('900')))
      scheduler.enqueue(workUnit('b', priority('800')))
      scheduler.enqueue(workUnit('c', priority('700')))

      scheduler.dequeue() // a → dispatched
      scheduler.dequeue() // b → dispatched
      scheduler.complete('a')
      scheduler.cancel('c')

      const stats = scheduler.getStatistics()
      expect(stats.totalEnqueued).toBe(3)
      expect(stats.totalDispatched).toBe(2)
      expect(stats.totalCompleted).toBe(1)
      expect(stats.totalCancelled).toBe(1)
      expect(stats.currentQueueDepth).toBe(0)
      expect(stats.currentInFlight).toBe(1) // 'b' still in flight
    })
  })

  describe('events', () => {
    it('records all lifecycle events in order', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('500')))
      scheduler.dequeue()
      scheduler.complete('a')

      const events = scheduler.getEvents()
      expect(events).toHaveLength(3)
      expect(events[0]!.kind).toBe('enqueued')
      expect(events[1]!.kind).toBe('dispatched')
      expect(events[2]!.kind).toBe('completed')

      // Sequences are monotonically increasing
      for (let i = 1; i < events.length; i++) {
        expect(events[i]!.sequence).toBeGreaterThan(events[i - 1]!.sequence)
      }
    })
  })

  describe('getItemsByStatus', () => {
    it('filters items by status', () => {
      const scheduler = createLapicWorkScheduler()
      scheduler.enqueue(workUnit('a', priority('900')))
      scheduler.enqueue(workUnit('b', priority('800')))
      scheduler.enqueue(workUnit('c', priority('700')))
      scheduler.dequeue() // a → dispatched
      scheduler.complete('a')

      expect(scheduler.getItemsByStatus('queued')).toHaveLength(2)
      expect(scheduler.getItemsByStatus('dispatched')).toHaveLength(0)
      expect(scheduler.getItemsByStatus('completed')).toHaveLength(1)
    })
  })

  describe('determinism invariant', () => {
    it('produces same dequeue order regardless of insertion order', () => {
      const items = [
        workUnit('w1', priority('300')),
        workUnit('w2', priority('700')),
        workUnit('w3', priority('500')),
        workUnit('w4', priority('100')),
        workUnit('w5', priority('900')),
      ]

      // Forward order
      const scheduler1 = createLapicWorkScheduler()
      for (const item of items) scheduler1.enqueue(item)

      // Reverse order
      const scheduler2 = createLapicWorkScheduler()
      for (const item of [...items].reverse()) scheduler2.enqueue(item)

      // Random order
      const scheduler3 = createLapicWorkScheduler()
      const shuffled = [items[3]!, items[0]!, items[4]!, items[1]!, items[2]!]
      for (const item of shuffled) scheduler3.enqueue(item)

      // All three should dequeue in the same priority order
      const order1: string[] = []
      const order2: string[] = []
      const order3: string[] = []

      for (let i = 0; i < items.length; i++) {
        order1.push(scheduler1.dequeue()!.workUnit.workUnitId)
        order2.push(scheduler2.dequeue()!.workUnit.workUnitId)
        order3.push(scheduler3.dequeue()!.workUnit.workUnitId)
      }

      expect(order1).toEqual(order2)
      expect(order1).toEqual(order3)
      // Verify it's priority-descending: w5(900), w2(700), w3(500), w1(300), w4(100)
      expect(order1).toEqual(['w5', 'w2', 'w3', 'w1', 'w4'])
    })
  })
})
