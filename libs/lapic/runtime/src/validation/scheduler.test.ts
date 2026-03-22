import { createLapicWorkScheduler } from '../scheduler/scheduler'
import type {
  LapicScheduledWorkItem,
  LapicSchedulerEvent,
  LapicSchedulerStatistics,
} from '../scheduler/types'
import type { LapicFrontierJoinPlan } from '../solve/join-plan'
import type { LapicPriorityDescriptor, LapicWorkUnitEnvelope } from '../types'
import { createWorkerPartitionPlan } from '../worker/partitioner'
import {
  validateLapicScheduledWorkItem,
  validateLapicSchedulerEvent,
  validateLapicSchedulerEventSequence,
  validateLapicSchedulerStateTransition,
  validateLapicSchedulerStatistics,
  validateLapicWorkerPartition,
  validateLapicWorkerPartitionPlan,
} from './scheduler'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function priority(upperBound = '500'): LapicPriorityDescriptor {
  return {
    upperBoundOrderingDigest: upperBound,
    uncertaintyGapDigest: '0',
    residualCostDigest: '0',
    deterministicTieBreakDigest: '0',
    costModelVersion: 'v1',
  }
}

function workUnit(
  id: string,
  p?: LapicPriorityDescriptor
): LapicWorkUnitEnvelope {
  return {
    workUnitId: id,
    kind: 'JoinFrontierBlocks',
    determinismClass: 'pure-deterministic',
    priority: p ?? priority(),
    retryPolicy: { maxAttempts: 1, replaySafe: true },
  }
}

function makeJoinPlan(rowCounts: number[]): LapicFrontierJoinPlan {
  const entries = rowCounts.map((count, i) => ({
    slotId: `slot-${i}`,
    blockIds: [`block-${i}`],
    groupDigests: [`digest-${i}`],
    rows: Array.from({ length: count }, (_, j) => ({
      row: {
        stateId: `s-${i}-${j}`,
        slotId: `slot-${i}`,
        candidateId: `c-${i}-${j}`,
        rowDigest: `r-${i}-${j}`,
        occupiedSlotMask: 1 << i,
        scoreContribution: `${j}`,
        additiveFeatureDigest: `f-${i}-${j}`,
        categoricalSignatureDigest: `cat-${i}-${j}`,
      },
      candidate: {
        candidateId: `c-${i}-${j}`,
        sourceRecordDigest: `src-${i}-${j}`,
        domainId: `domain-${i}`,
        slotId: `slot-${i}`,
        additiveFeatureDigest: `f-${i}-${j}`,
        discreteCounters: [],
        categoricalSignatureDigest: `cat-${i}-${j}`,
        provenance: {
          slotId: `slot-${i}`,
          sourceEntityId: 'test',
          sourceRecordDigests: [`src-${i}-${j}`],
          exclusiveResourceClaims: [],
          concreteInventoryBacked: true,
          featureExtractionDigest: `f-${i}-${j}`,
        },
      },
    })),
  }))
  return {
    entries,
    totalCombinationCount: rowCounts.reduce((p, c) => p * c, 1),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateLapicScheduledWorkItem', () => {
  it('accepts a valid queued item', () => {
    const item: LapicScheduledWorkItem = {
      workUnit: workUnit('w1'),
      status: 'queued',
      enqueuedAtSequence: 1,
    }
    expect(validateLapicScheduledWorkItem(item).ok).toBe(true)
  })

  it('accepts a valid dispatched item', () => {
    const item: LapicScheduledWorkItem = {
      workUnit: workUnit('w1'),
      status: 'dispatched',
      enqueuedAtSequence: 1,
      dispatchedAtSequence: 2,
    }
    expect(validateLapicScheduledWorkItem(item).ok).toBe(true)
  })

  it('accepts a valid completed item', () => {
    const item: LapicScheduledWorkItem = {
      workUnit: workUnit('w1'),
      status: 'completed',
      enqueuedAtSequence: 1,
      dispatchedAtSequence: 2,
      completedAtSequence: 3,
    }
    expect(validateLapicScheduledWorkItem(item).ok).toBe(true)
  })

  it('rejects dispatched item without dispatchedAtSequence', () => {
    const item: LapicScheduledWorkItem = {
      workUnit: workUnit('w1'),
      status: 'dispatched',
      enqueuedAtSequence: 1,
    }
    expect(validateLapicScheduledWorkItem(item).ok).toBe(false)
  })

  it('rejects completed item without completedAtSequence', () => {
    const item: LapicScheduledWorkItem = {
      workUnit: workUnit('w1'),
      status: 'completed',
      enqueuedAtSequence: 1,
      dispatchedAtSequence: 2,
    }
    expect(validateLapicScheduledWorkItem(item).ok).toBe(false)
  })

  it('rejects when dispatchedAtSequence <= enqueuedAtSequence', () => {
    const item: LapicScheduledWorkItem = {
      workUnit: workUnit('w1'),
      status: 'dispatched',
      enqueuedAtSequence: 5,
      dispatchedAtSequence: 3,
    }
    expect(validateLapicScheduledWorkItem(item).ok).toBe(false)
  })

  it('rejects invalid status', () => {
    const item = {
      workUnit: workUnit('w1'),
      status: 'invalid-status',
      enqueuedAtSequence: 1,
    }
    expect(validateLapicScheduledWorkItem(item as any).ok).toBe(false)
  })

  it('rejects non-record input', () => {
    expect(validateLapicScheduledWorkItem(null as any).ok).toBe(false)
  })
})

describe('validateLapicSchedulerEvent', () => {
  it('accepts a valid event', () => {
    const event: LapicSchedulerEvent = {
      kind: 'enqueued',
      workUnitId: 'w1',
      workUnitKind: 'JoinFrontierBlocks',
      sequence: 1,
    }
    expect(validateLapicSchedulerEvent(event).ok).toBe(true)
  })

  it('rejects invalid kind', () => {
    const event = {
      kind: 'bogus',
      workUnitId: 'w1',
      workUnitKind: 'JoinFrontierBlocks',
      sequence: 1,
    }
    expect(validateLapicSchedulerEvent(event as any).ok).toBe(false)
  })

  it('rejects zero sequence', () => {
    const event: LapicSchedulerEvent = {
      kind: 'enqueued',
      workUnitId: 'w1',
      workUnitKind: 'JoinFrontierBlocks',
      sequence: 0,
    }
    expect(validateLapicSchedulerEvent(event).ok).toBe(false)
  })

  it('rejects empty workUnitId', () => {
    const event: LapicSchedulerEvent = {
      kind: 'enqueued',
      workUnitId: '',
      workUnitKind: 'JoinFrontierBlocks',
      sequence: 1,
    }
    expect(validateLapicSchedulerEvent(event).ok).toBe(false)
  })
})

describe('validateLapicSchedulerStatistics', () => {
  it('accepts valid statistics', () => {
    const stats: LapicSchedulerStatistics = {
      totalEnqueued: 10,
      totalDispatched: 8,
      totalCompleted: 5,
      totalFailed: 1,
      totalCancelled: 2,
      currentQueueDepth: 2,
      currentInFlight: 2,
    }
    expect(validateLapicSchedulerStatistics(stats).ok).toBe(true)
  })

  it('rejects when dispatched > enqueued', () => {
    const stats: LapicSchedulerStatistics = {
      totalEnqueued: 5,
      totalDispatched: 10,
      totalCompleted: 3,
      totalFailed: 0,
      totalCancelled: 0,
      currentQueueDepth: 0,
      currentInFlight: 2,
    }
    expect(validateLapicSchedulerStatistics(stats).ok).toBe(false)
  })

  it('rejects when terminal sum > enqueued', () => {
    const stats: LapicSchedulerStatistics = {
      totalEnqueued: 5,
      totalDispatched: 5,
      totalCompleted: 3,
      totalFailed: 2,
      totalCancelled: 2,
      currentQueueDepth: 0,
      currentInFlight: 0,
    }
    expect(validateLapicSchedulerStatistics(stats).ok).toBe(false)
  })

  it('rejects negative values', () => {
    const stats: LapicSchedulerStatistics = {
      totalEnqueued: -1,
      totalDispatched: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalCancelled: 0,
      currentQueueDepth: 0,
      currentInFlight: 0,
    }
    expect(validateLapicSchedulerStatistics(stats).ok).toBe(false)
  })
})

describe('validateLapicSchedulerStateTransition', () => {
  it('accepts queued → dispatched', () => {
    expect(
      validateLapicSchedulerStateTransition('queued', 'dispatched').ok
    ).toBe(true)
  })

  it('accepts queued → cancelled', () => {
    expect(
      validateLapicSchedulerStateTransition('queued', 'cancelled').ok
    ).toBe(true)
  })

  it('accepts dispatched → completed', () => {
    expect(
      validateLapicSchedulerStateTransition('dispatched', 'completed').ok
    ).toBe(true)
  })

  it('accepts dispatched → failed', () => {
    expect(
      validateLapicSchedulerStateTransition('dispatched', 'failed').ok
    ).toBe(true)
  })

  it('accepts dispatched → cancelled', () => {
    expect(
      validateLapicSchedulerStateTransition('dispatched', 'cancelled').ok
    ).toBe(true)
  })

  it('rejects queued → completed (must dispatch first)', () => {
    expect(
      validateLapicSchedulerStateTransition('queued', 'completed').ok
    ).toBe(false)
  })

  it('rejects completed → dispatched (terminal state)', () => {
    expect(
      validateLapicSchedulerStateTransition('completed', 'dispatched').ok
    ).toBe(false)
  })

  it('rejects failed → queued (terminal state)', () => {
    expect(validateLapicSchedulerStateTransition('failed', 'queued').ok).toBe(
      false
    )
  })
})

describe('validateLapicSchedulerEventSequence', () => {
  it('accepts monotonically increasing sequence', () => {
    const events: LapicSchedulerEvent[] = [
      {
        kind: 'enqueued',
        workUnitId: 'w1',
        workUnitKind: 'JoinFrontierBlocks',
        sequence: 1,
      },
      {
        kind: 'dispatched',
        workUnitId: 'w1',
        workUnitKind: 'JoinFrontierBlocks',
        sequence: 2,
      },
      {
        kind: 'completed',
        workUnitId: 'w1',
        workUnitKind: 'JoinFrontierBlocks',
        sequence: 3,
      },
    ]
    expect(validateLapicSchedulerEventSequence(events).ok).toBe(true)
  })

  it('rejects non-monotonic sequence', () => {
    const events: LapicSchedulerEvent[] = [
      {
        kind: 'enqueued',
        workUnitId: 'w1',
        workUnitKind: 'JoinFrontierBlocks',
        sequence: 1,
      },
      {
        kind: 'dispatched',
        workUnitId: 'w1',
        workUnitKind: 'JoinFrontierBlocks',
        sequence: 3,
      },
      {
        kind: 'completed',
        workUnitId: 'w1',
        workUnitKind: 'JoinFrontierBlocks',
        sequence: 2,
      },
    ]
    expect(validateLapicSchedulerEventSequence(events).ok).toBe(false)
  })

  it('accepts empty sequence', () => {
    expect(validateLapicSchedulerEventSequence([]).ok).toBe(true)
  })
})

describe('validateLapicSchedulerEventSequence integration with real scheduler', () => {
  it('validates event sequence from a real scheduler lifecycle', () => {
    const scheduler = createLapicWorkScheduler()
    scheduler.enqueue(workUnit('w1', priority('900')))
    scheduler.enqueue(workUnit('w2', priority('800')))
    scheduler.dequeue()
    scheduler.complete('w1')
    scheduler.dequeue()
    scheduler.cancel('w2')

    const events = scheduler.getEvents()
    expect(validateLapicSchedulerEventSequence(events).ok).toBe(true)

    // Validate each individual event
    for (const event of events) {
      expect(validateLapicSchedulerEvent(event).ok).toBe(true)
    }
  })

  it('validates statistics from a real scheduler', () => {
    const scheduler = createLapicWorkScheduler()
    scheduler.enqueue(workUnit('w1', priority('900')))
    scheduler.enqueue(workUnit('w2', priority('800')))
    scheduler.dequeue()
    scheduler.complete('w1')

    const stats = scheduler.getStatistics()
    expect(validateLapicSchedulerStatistics(stats).ok).toBe(true)
  })
})

describe('validateLapicWorkerPartition', () => {
  it('accepts a valid partition', () => {
    expect(
      validateLapicWorkerPartition({
        partitionIndex: 0,
        startFlatIndex: 0,
        endFlatIndex: 10,
        combinationCount: 10,
      }).ok
    ).toBe(true)
  })

  it('rejects when combinationCount mismatches range', () => {
    expect(
      validateLapicWorkerPartition({
        partitionIndex: 0,
        startFlatIndex: 0,
        endFlatIndex: 10,
        combinationCount: 5,
      }).ok
    ).toBe(false)
  })

  it('rejects when endFlatIndex <= startFlatIndex', () => {
    expect(
      validateLapicWorkerPartition({
        partitionIndex: 0,
        startFlatIndex: 10,
        endFlatIndex: 5,
        combinationCount: -5,
      }).ok
    ).toBe(false)
  })
})

describe('validateLapicWorkerPartitionPlan', () => {
  it('validates a plan produced by createWorkerPartitionPlan', () => {
    const plan = createWorkerPartitionPlan(makeJoinPlan([3, 4]), {
      workerCount: 3,
    })
    expect(validateLapicWorkerPartitionPlan(plan).ok).toBe(true)
  })

  it('validates a single-worker plan', () => {
    const plan = createWorkerPartitionPlan(makeJoinPlan([5, 2]), {
      workerCount: 1,
    })
    expect(validateLapicWorkerPartitionPlan(plan).ok).toBe(true)
  })

  it('rejects a plan with gaps', () => {
    const plan = {
      workerCount: 2,
      totalCombinationCount: 10,
      partitions: [
        {
          partitionIndex: 0,
          startFlatIndex: 0,
          endFlatIndex: 4,
          combinationCount: 4,
        },
        {
          partitionIndex: 1,
          startFlatIndex: 6,
          endFlatIndex: 10,
          combinationCount: 4,
        },
      ],
    }
    expect(validateLapicWorkerPartitionPlan(plan).ok).toBe(false)
  })

  it('rejects when partition count != worker count', () => {
    const plan = {
      workerCount: 3,
      totalCombinationCount: 10,
      partitions: [
        {
          partitionIndex: 0,
          startFlatIndex: 0,
          endFlatIndex: 10,
          combinationCount: 10,
        },
      ],
    }
    expect(validateLapicWorkerPartitionPlan(plan).ok).toBe(false)
  })

  it('validates empty plan', () => {
    const plan = createWorkerPartitionPlan(
      { entries: [], totalCombinationCount: 0 },
      { workerCount: 4 }
    )
    expect(validateLapicWorkerPartitionPlan(plan).ok).toBe(true)
  })
})
