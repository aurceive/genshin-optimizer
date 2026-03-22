import type { LapicPriorityDescriptor, LapicWorkUnitEnvelope } from '../types'
import { createLapicPriorityQueue } from './queue'

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
  p: LapicPriorityDescriptor
): LapicWorkUnitEnvelope {
  return {
    workUnitId: id,
    kind: 'JoinFrontierBlocks',
    determinismClass: 'pure-deterministic',
    priority: p,
    retryPolicy: { maxAttempts: 1, replaySafe: true },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LapicPriorityQueue', () => {
  it('dequeues highest priority first (higher upperBound)', () => {
    const q = createLapicPriorityQueue()
    q.enqueue({
      workUnit: workUnit('low', priority('100')),
      enqueuedAtSequence: 1,
    })
    q.enqueue({
      workUnit: workUnit('high', priority('900')),
      enqueuedAtSequence: 2,
    })
    q.enqueue({
      workUnit: workUnit('mid', priority('500')),
      enqueuedAtSequence: 3,
    })

    expect(q.dequeue()!.workUnit.workUnitId).toBe('high')
    expect(q.dequeue()!.workUnit.workUnitId).toBe('mid')
    expect(q.dequeue()!.workUnit.workUnitId).toBe('low')
  })

  it('breaks ties by enqueue sequence (FIFO)', () => {
    const q = createLapicPriorityQueue()
    const p = priority('500')
    q.enqueue({ workUnit: workUnit('first', p), enqueuedAtSequence: 1 })
    q.enqueue({ workUnit: workUnit('second', p), enqueuedAtSequence: 2 })
    q.enqueue({ workUnit: workUnit('third', p), enqueuedAtSequence: 3 })

    expect(q.dequeue()!.workUnit.workUnitId).toBe('first')
    expect(q.dequeue()!.workUnit.workUnitId).toBe('second')
    expect(q.dequeue()!.workUnit.workUnitId).toBe('third')
  })

  it('returns undefined when empty', () => {
    const q = createLapicPriorityQueue()
    expect(q.dequeue()).toBeUndefined()
    expect(q.peek()).toBeUndefined()
  })

  it('peek does not remove the item', () => {
    const q = createLapicPriorityQueue()
    q.enqueue({
      workUnit: workUnit('a', priority('999')),
      enqueuedAtSequence: 1,
    })
    expect(q.peek()!.workUnit.workUnitId).toBe('a')
    expect(q.size).toBe(1)
    expect(q.dequeue()!.workUnit.workUnitId).toBe('a')
    expect(q.size).toBe(0)
  })

  it('remove extracts a specific item', () => {
    const q = createLapicPriorityQueue()
    q.enqueue({
      workUnit: workUnit('a', priority('900')),
      enqueuedAtSequence: 1,
    })
    q.enqueue({
      workUnit: workUnit('b', priority('800')),
      enqueuedAtSequence: 2,
    })
    q.enqueue({
      workUnit: workUnit('c', priority('700')),
      enqueuedAtSequence: 3,
    })

    const removed = q.remove('b')
    expect(removed!.workUnit.workUnitId).toBe('b')
    expect(q.size).toBe(2)
    expect(q.dequeue()!.workUnit.workUnitId).toBe('a')
    expect(q.dequeue()!.workUnit.workUnitId).toBe('c')
  })

  it('remove returns undefined for non-existent item', () => {
    const q = createLapicPriorityQueue()
    expect(q.remove('nonexistent')).toBeUndefined()
  })

  it('isEmpty reflects queue state', () => {
    const q = createLapicPriorityQueue()
    expect(q.isEmpty()).toBe(true)
    q.enqueue({ workUnit: workUnit('a', priority('1')), enqueuedAtSequence: 1 })
    expect(q.isEmpty()).toBe(false)
    q.dequeue()
    expect(q.isEmpty()).toBe(true)
  })

  it('toSortedArray returns items in priority order', () => {
    const q = createLapicPriorityQueue()
    q.enqueue({
      workUnit: workUnit('c', priority('100')),
      enqueuedAtSequence: 3,
    })
    q.enqueue({
      workUnit: workUnit('a', priority('900')),
      enqueuedAtSequence: 1,
    })
    q.enqueue({
      workUnit: workUnit('b', priority('500')),
      enqueuedAtSequence: 2,
    })

    const sorted = q.toSortedArray()
    expect(sorted.map((e) => e.workUnit.workUnitId)).toEqual(['a', 'b', 'c'])
    // Queue is not modified
    expect(q.size).toBe(3)
  })

  it('handles secondary sort by uncertaintyGapDigest', () => {
    const q = createLapicPriorityQueue()
    q.enqueue({
      workUnit: workUnit('low-gap', priority('500', '100')),
      enqueuedAtSequence: 1,
    })
    q.enqueue({
      workUnit: workUnit('high-gap', priority('500', '900')),
      enqueuedAtSequence: 2,
    })

    // Higher gap = higher priority
    expect(q.dequeue()!.workUnit.workUnitId).toBe('high-gap')
    expect(q.dequeue()!.workUnit.workUnitId).toBe('low-gap')
  })

  it('handles tertiary sort by residualCostDigest (ascending)', () => {
    const q = createLapicPriorityQueue()
    q.enqueue({
      workUnit: workUnit('high-cost', priority('500', '500', '900')),
      enqueuedAtSequence: 1,
    })
    q.enqueue({
      workUnit: workUnit('low-cost', priority('500', '500', '100')),
      enqueuedAtSequence: 2,
    })

    // Lower cost = higher priority
    expect(q.dequeue()!.workUnit.workUnitId).toBe('low-cost')
    expect(q.dequeue()!.workUnit.workUnitId).toBe('high-cost')
  })

  it('handles many items correctly', () => {
    const q = createLapicPriorityQueue()
    const count = 100
    for (let i = 0; i < count; i++) {
      const p = priority(String(i).padStart(4, '0'))
      q.enqueue({ workUnit: workUnit(`w-${i}`, p), enqueuedAtSequence: i })
    }

    expect(q.size).toBe(count)

    // Should dequeue in descending order of upperBound
    let prev = '9999'
    for (let i = 0; i < count; i++) {
      const entry = q.dequeue()!
      expect(entry.workUnit.priority.upperBoundOrderingDigest <= prev).toBe(
        true
      )
      prev = entry.workUnit.priority.upperBoundOrderingDigest
    }
    expect(q.isEmpty()).toBe(true)
  })
})
