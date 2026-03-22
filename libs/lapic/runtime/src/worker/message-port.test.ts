import { MessageChannel } from 'worker_threads'
import type { LapicWorkerDispatchMessage, LapicInProcessWorkResult } from './transport'
import {
  createMessagePortWorkerHandle,
  createWorkerEntryHandler,
} from './message-port'
import type { LapicMessagePortLike } from './message-port'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a linked pair of handle + entry handler using MessageChannel.
 * The executor processes flat-index ranges and returns results.
 */
function createLinkedPair(
  workerId: string,
  executor: (start: number, end: number) => LapicInProcessWorkResult
) {
  const channel = new MessageChannel()
  const handle = createMessagePortWorkerHandle(
    workerId,
    channel.port1 as unknown as LapicMessagePortLike
  )
  const dispose = createWorkerEntryHandler({
    port: channel.port2 as unknown as LapicMessagePortLike,
    executor,
  })

  return { handle, dispose, port1: channel.port1, port2: channel.port2 }
}

function simpleExecutor(start: number, end: number): LapicInProcessWorkResult {
  return {
    topCandidates: [],
    evaluatedCount: end - start,
    visitedCount: end - start,
  }
}

function dispatchMessage(
  partitionIndex: number,
  start: number,
  end: number
): LapicWorkerDispatchMessage {
  return {
    tag: 'StartWork',
    sessionId: 'test-session',
    partitionIndex,
    startFlatIndex: start,
    endFlatIndex: end,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessagePort worker handle', () => {
  it('creates a handle with the correct workerId', () => {
    const { handle, dispose, port1, port2 } = createLinkedPair('w1', simpleExecutor)
    expect(handle.workerId).toBe('w1')
    dispose()
    port1.close()
    port2.close()
  })

  it('dispatches work and receives results', async () => {
    const { handle, dispose, port1, port2 } = createLinkedPair('w1', simpleExecutor)

    const result = await handle.dispatch(dispatchMessage(0, 0, 100))

    expect(result.tag).toBe('WorkComplete')
    expect(result.sessionId).toBe('test-session')
    expect(result.partitionIndex).toBe(0)
    expect(result.evaluatedCount).toBe(100)
    expect(result.visitedCount).toBe(100)
    expect(result.topCandidates).toHaveLength(0)

    dispose()
    port1.close()
    port2.close()
  })

  it('preserves partition index across dispatches', async () => {
    const { handle, dispose, port1, port2 } = createLinkedPair('w1', simpleExecutor)

    const r0 = await handle.dispatch(dispatchMessage(0, 0, 10))
    const r3 = await handle.dispatch(dispatchMessage(3, 30, 40))

    expect(r0.partitionIndex).toBe(0)
    expect(r3.partitionIndex).toBe(3)

    dispose()
    port1.close()
    port2.close()
  })

  it('supports concurrent dispatches', async () => {
    const { handle, dispose, port1, port2 } = createLinkedPair('w1', simpleExecutor)

    const results = await Promise.all([
      handle.dispatch(dispatchMessage(0, 0, 50)),
      handle.dispatch(dispatchMessage(1, 50, 100)),
      handle.dispatch(dispatchMessage(2, 100, 150)),
    ])

    expect(results).toHaveLength(3)
    expect(results[0]!.partitionIndex).toBe(0)
    expect(results[1]!.partitionIndex).toBe(1)
    expect(results[2]!.partitionIndex).toBe(2)
    expect(results[0]!.evaluatedCount).toBe(50)
    expect(results[1]!.evaluatedCount).toBe(50)
    expect(results[2]!.evaluatedCount).toBe(50)

    dispose()
    port1.close()
    port2.close()
  })

  it('executor receives correct flat-index ranges', async () => {
    const ranges: Array<[number, number]> = []
    const { handle, dispose, port1, port2 } = createLinkedPair('w1', (start, end) => {
      ranges.push([start, end])
      return simpleExecutor(start, end)
    })

    await handle.dispatch(dispatchMessage(0, 42, 99))

    expect(ranges).toEqual([[42, 99]])

    dispose()
    port1.close()
    port2.close()
  })

  it('forwards top candidates from executor', async () => {
    const { handle, dispose, port1, port2 } = createLinkedPair('w1', () => ({
      topCandidates: [
        {
          stateId: 'combo-1',
          candidates: [],
          evaluation: {
            objectiveValue: '100',
            evidenceDigest: 'ev-1',
            orderingKey: ['100'],
          },
        },
      ],
      evaluatedCount: 10,
      visitedCount: 15,
    }))

    const result = await handle.dispatch(dispatchMessage(0, 0, 15))

    expect(result.topCandidates).toHaveLength(1)
    expect(result.topCandidates[0]!.stateId).toBe('combo-1')
    expect(result.topCandidates[0]!.evaluation.objectiveValue).toBe('100')
    expect(result.evaluatedCount).toBe(10)
    expect(result.visitedCount).toBe(15)

    dispose()
    port1.close()
    port2.close()
  })

  it('requestPause returns undefined for sync executor', async () => {
    const { handle, dispose, port1, port2 } = createLinkedPair('w1', simpleExecutor)

    const ack = await handle.requestPause('test-session')
    expect(ack).toBeUndefined()

    dispose()
    port1.close()
    port2.close()
  })

  it('dispatch after terminate rejects', async () => {
    const { handle, dispose, port1, port2 } = createLinkedPair('w1', simpleExecutor)

    await handle.terminate()

    await expect(handle.dispatch(dispatchMessage(0, 0, 10))).rejects.toThrow(/terminated/)

    dispose()
    port1.close()
    port2.close()
  })

  it('requestPause after terminate returns undefined', async () => {
    const { handle, dispose, port1, port2 } = createLinkedPair('w1', simpleExecutor)

    await handle.terminate()

    const ack = await handle.requestPause('test-session')
    expect(ack).toBeUndefined()

    dispose()
    port1.close()
    port2.close()
  })

  it('double terminate is idempotent', async () => {
    const { handle, dispose, port1, port2 } = createLinkedPair('w1', simpleExecutor)

    await handle.terminate()
    await expect(handle.terminate()).resolves.toBeUndefined()

    dispose()
    port1.close()
    port2.close()
  })

  it('propagates executor errors as rejections', async () => {
    const { handle, dispose, port1, port2 } = createLinkedPair('w1', () => {
      throw new Error('Evaluation failed!')
    })

    await expect(handle.dispatch(dispatchMessage(0, 0, 10))).rejects.toThrow('Evaluation failed!')

    dispose()
    port1.close()
    port2.close()
  })

  it('works with multiple independent pairs', async () => {
    const pair1 = createLinkedPair('w1', (s, e) => ({
      topCandidates: [],
      evaluatedCount: (e - s) * 10,
      visitedCount: e - s,
    }))
    const pair2 = createLinkedPair('w2', (s, e) => ({
      topCandidates: [],
      evaluatedCount: (e - s) * 20,
      visitedCount: e - s,
    }))

    const [r1, r2] = await Promise.all([
      pair1.handle.dispatch(dispatchMessage(0, 0, 5)),
      pair2.handle.dispatch(dispatchMessage(1, 5, 10)),
    ])

    expect(r1.evaluatedCount).toBe(50) // 5 * 10
    expect(r2.evaluatedCount).toBe(100) // 5 * 20

    pair1.dispose()
    pair2.dispose()
    pair1.port1.close()
    pair1.port2.close()
    pair2.port1.close()
    pair2.port2.close()
  })

  it('integrates with pool transport', async () => {
    // Create two linked pairs and wire them into a pool
    const { createPoolTransport } = await import('./pool')

    const pair1 = createLinkedPair('w1', simpleExecutor)
    const pair2 = createLinkedPair('w2', simpleExecutor)

    const pool = createPoolTransport({
      handles: [pair1.handle, pair2.handle],
      backendKind: 'in-process',
    })

    const results = await Promise.all([
      pool.dispatch(dispatchMessage(0, 0, 50)),
      pool.dispatch(dispatchMessage(1, 50, 100)),
    ])

    expect(results).toHaveLength(2)
    expect(results[0]!.evaluatedCount).toBe(50)
    expect(results[1]!.evaluatedCount).toBe(50)

    await pool.shutdown()

    pair1.dispose()
    pair2.dispose()
    pair1.port1.close()
    pair1.port2.close()
    pair2.port1.close()
    pair2.port2.close()
  })

  it('terminate rejects all pending dispatches', async () => {
    // Use a slow executor that delays via setTimeout
    const channel = new MessageChannel()
    const handle = createMessagePortWorkerHandle(
      'w-slow',
      channel.port1 as unknown as LapicMessagePortLike
    )

    // Don't attach a handler — messages will never be processed
    // So dispatch will pend forever until terminate rejects it
    const dispatchPromise = handle.dispatch(dispatchMessage(0, 0, 10))

    await handle.terminate()

    await expect(dispatchPromise).rejects.toThrow(/terminated/)

    channel.port1.close()
    channel.port2.close()
  })
})
