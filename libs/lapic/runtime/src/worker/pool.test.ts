import {
  type LapicWorkerHandle,
  createCallbackWorkerHandle,
  createPoolTransport,
} from './pool'
import type {
  LapicWorkerDispatchMessage,
  LapicWorkerResultMessage,
} from './transport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createSimpleResultForPartition(
  message: LapicWorkerDispatchMessage,
  workerId: string
): LapicWorkerResultMessage {
  const count = message.endFlatIndex - message.startFlatIndex
  return {
    tag: 'WorkComplete',
    sessionId: message.sessionId,
    partitionIndex: message.partitionIndex,
    topCandidates: [
      {
        stateId: `state-${workerId}-${message.partitionIndex}`,
        candidates: [],
        evaluation: {
          objectiveValue: String(count),
          evidenceDigest: `digest-${message.partitionIndex}`,
        },
      },
    ],
    evaluatedCount: count,
    visitedCount: count,
  }
}

function createSimpleHandle(workerId: string): LapicWorkerHandle {
  return createCallbackWorkerHandle(workerId, (message) =>
    createSimpleResultForPartition(message, workerId)
  )
}

/**
 * Create a handle that tracks invocations for assertion.
 */
function createTrackingHandle(workerId: string) {
  const dispatches: LapicWorkerDispatchMessage[] = []
  let terminateCalled = false

  const handle = createCallbackWorkerHandle(workerId, (message) => {
    dispatches.push(message)
    return createSimpleResultForPartition(message, workerId)
  })

  return {
    handle: {
      ...handle,
      async terminate() {
        terminateCalled = true
      },
    } as LapicWorkerHandle,
    dispatches,
    get terminateCalled() {
      return terminateCalled
    },
  }
}

function createDispatchMessage(
  partitionIndex: number,
  start = 0,
  end = 10
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

describe('pool transport', () => {
  describe('creation', () => {
    it('creates a pool transport with the given handles', () => {
      const transport = createPoolTransport({
        handles: [createSimpleHandle('w0'), createSimpleHandle('w1')],
        backendKind: 'in-process',
      })

      expect(transport.poolSize).toBe(2)
      expect(transport.backendKind).toBe('in-process')
    })

    it('throws when created with zero handles', () => {
      expect(() =>
        createPoolTransport({ handles: [], backendKind: 'in-process' })
      ).toThrow('at least one worker handle')
    })
  })

  describe('dispatch routing', () => {
    it('dispatches to a single worker', async () => {
      const tracked = createTrackingHandle('w0')
      const transport = createPoolTransport({
        handles: [tracked.handle],
        backendKind: 'in-process',
      })

      const result = await transport.dispatch(createDispatchMessage(0))

      expect(result.tag).toBe('WorkComplete')
      expect(result.partitionIndex).toBe(0)
      expect(tracked.dispatches).toHaveLength(1)
    })

    it('dispatches sequentially to a single worker', async () => {
      const tracked = createTrackingHandle('w0')
      const transport = createPoolTransport({
        handles: [tracked.handle],
        backendKind: 'in-process',
      })

      await transport.dispatch(createDispatchMessage(0))
      await transport.dispatch(createDispatchMessage(1))
      await transport.dispatch(createDispatchMessage(2))

      expect(tracked.dispatches).toHaveLength(3)
      expect(tracked.dispatches.map((d) => d.partitionIndex)).toEqual([0, 1, 2])
    })

    it('routes concurrent dispatches across multiple workers', async () => {
      const resolvers: Array<() => void> = []
      const workerDispatches: Map<string, number[]> = new Map()

      function createDelayedHandle(id: string): LapicWorkerHandle {
        workerDispatches.set(id, [])
        return {
          workerId: id,
          dispatch: (msg) =>
            new Promise<LapicWorkerResultMessage>((resolve) => {
              workerDispatches.get(id)!.push(msg.partitionIndex)
              resolvers.push(() =>
                resolve(createSimpleResultForPartition(msg, id))
              )
            }),
          requestPause: async () => undefined,
          terminate: async () => {},
        }
      }

      const transport = createPoolTransport({
        handles: [createDelayedHandle('w0'), createDelayedHandle('w1')],
        backendKind: 'in-process',
      })

      // Dispatch two partitions concurrently
      const p0 = transport.dispatch(createDispatchMessage(0))
      const p1 = transport.dispatch(createDispatchMessage(1))

      // Both workers should have received dispatches
      await new Promise((r) => setTimeout(r, 10))
      expect(workerDispatches.get('w0')!.length).toBe(1)
      expect(workerDispatches.get('w1')!.length).toBe(1)

      // Resolve all
      for (const resolve of resolvers) resolve()

      const [r0, r1] = await Promise.all([p0, p1])

      expect(r0.partitionIndex).toBe(0)
      expect(r1.partitionIndex).toBe(1)
    })

    it('queues dispatches when all workers are busy', async () => {
      const resolveFns: Array<() => void> = []
      const dispatched: number[] = []

      const slowHandle: LapicWorkerHandle = {
        workerId: 'slow',
        dispatch: (msg) =>
          new Promise<LapicWorkerResultMessage>((resolve) => {
            dispatched.push(msg.partitionIndex)
            resolveFns.push(() =>
              resolve(createSimpleResultForPartition(msg, 'slow'))
            )
          }),
        requestPause: async () => undefined,
        terminate: async () => {},
      }

      const transport = createPoolTransport({
        handles: [slowHandle],
        backendKind: 'in-process',
      })

      // First dispatch occupies the only worker
      const p0 = transport.dispatch(createDispatchMessage(0))

      // Wait for first dispatch to be picked up
      await new Promise((r) => setTimeout(r, 10))
      expect(dispatched).toEqual([0])

      // Second dispatch should queue (pool has only 1 worker, it's busy)
      const p1 = transport.dispatch(createDispatchMessage(1))

      // Give microtask a chance — second should NOT be dispatched yet
      await new Promise((r) => setTimeout(r, 10))
      expect(dispatched).toEqual([0])

      // Release first worker
      resolveFns[0]!()
      await p0

      // Now second should be dispatched
      await new Promise((r) => setTimeout(r, 10))
      expect(dispatched).toEqual([0, 1])

      // Release second
      resolveFns[1]!()
      await p1
    })
  })

  describe('shutdown', () => {
    it('terminates all workers on shutdown', async () => {
      const t0 = createTrackingHandle('w0')
      const t1 = createTrackingHandle('w1')
      const transport = createPoolTransport({
        handles: [t0.handle, t1.handle],
        backendKind: 'in-process',
      })

      await transport.shutdown()

      expect(t0.terminateCalled).toBe(true)
      expect(t1.terminateCalled).toBe(true)
    })

    it('rejects dispatch after shutdown', async () => {
      const transport = createPoolTransport({
        handles: [createSimpleHandle('w0')],
        backendKind: 'in-process',
      })

      await transport.shutdown()

      await expect(
        transport.dispatch(createDispatchMessage(0))
      ).rejects.toThrow('shut down')
    })
  })

  describe('pause', () => {
    it('returns empty array when no workers are busy', async () => {
      const transport = createPoolTransport({
        handles: [createSimpleHandle('w0')],
        backendKind: 'in-process',
      })

      const acks = await transport.requestPauseAll('session')
      expect(acks).toEqual([])
    })

    it('sends pause to busy workers and collects acknowledgments', async () => {
      let resolveDispatch: (() => void) | undefined
      const pauseRequests: string[] = []

      const handle: LapicWorkerHandle = {
        workerId: 'pauseable',
        dispatch: (msg) =>
          new Promise<LapicWorkerResultMessage>((resolve) => {
            resolveDispatch = () =>
              resolve(createSimpleResultForPartition(msg, 'pauseable'))
          }),
        requestPause: async (sessionId) => {
          pauseRequests.push(sessionId)
          return {
            tag: 'AckPaused' as const,
            sessionId,
            partitionIndex: 0,
            lastProcessedFlatIndex: 5,
            topCandidates: [],
            evaluatedCount: 5,
            visitedCount: 5,
          }
        },
        terminate: async () => {},
      }

      const transport = createPoolTransport({
        handles: [handle],
        backendKind: 'in-process',
      })

      // Start a dispatch (worker becomes busy)
      const dispatchPromise = transport.dispatch(createDispatchMessage(0))

      await new Promise((r) => setTimeout(r, 10))

      // Request pause while worker is busy
      const acks = await transport.requestPauseAll('test-session')

      expect(pauseRequests).toEqual(['test-session'])
      expect(acks).toHaveLength(1)
      expect(acks[0]!.tag).toBe('AckPaused')

      // Clean up: resolve the dispatch
      resolveDispatch!()
      await dispatchPromise
    })
  })

  describe('determinism', () => {
    it('produces identical results regardless of pool size', async () => {
      // Create a deterministic evaluator that produces results
      // based on partition range
      function createDeterministicHandle(id: string): LapicWorkerHandle {
        return createCallbackWorkerHandle(id, (msg) => ({
          tag: 'WorkComplete',
          sessionId: msg.sessionId,
          partitionIndex: msg.partitionIndex,
          topCandidates: [
            {
              stateId: `state-${msg.startFlatIndex}-${msg.endFlatIndex}`,
              candidates: [],
              evaluation: {
                objectiveValue: String(msg.endFlatIndex - msg.startFlatIndex),
                evidenceDigest: `digest-${msg.partitionIndex}`,
              },
            },
          ],
          evaluatedCount: msg.endFlatIndex - msg.startFlatIndex,
          visitedCount: msg.endFlatIndex - msg.startFlatIndex,
        }))
      }

      // Dispatch 4 partitions through pools of different sizes
      const messages = [
        createDispatchMessage(0, 0, 10),
        createDispatchMessage(1, 10, 20),
        createDispatchMessage(2, 20, 30),
        createDispatchMessage(3, 30, 40),
      ]

      const allResults: LapicWorkerResultMessage[][] = []

      for (const poolSize of [1, 2, 3, 4]) {
        const handles = Array.from({ length: poolSize }, (_, i) =>
          createDeterministicHandle(`w${i}`)
        )
        const transport = createPoolTransport({
          handles,
          backendKind: 'in-process',
        })

        const results: LapicWorkerResultMessage[] = []
        for (const msg of messages) {
          results.push(await transport.dispatch(msg))
        }

        allResults.push(results)
        await transport.shutdown()
      }

      // All pool sizes should produce the same results
      // (same stateIds, same evaluations, same counts)
      const baseline = allResults[0]!
      for (let i = 1; i < allResults.length; i++) {
        const current = allResults[i]!
        expect(current.length).toBe(baseline.length)
        for (let j = 0; j < baseline.length; j++) {
          expect(current[j]!.topCandidates[0]!.stateId).toBe(
            baseline[j]!.topCandidates[0]!.stateId
          )
          expect(current[j]!.evaluatedCount).toBe(baseline[j]!.evaluatedCount)
        }
      }
    })
  })
})

describe('callback worker handle', () => {
  it('dispatches and returns result from callback', async () => {
    const handle = createCallbackWorkerHandle('test', (msg) => ({
      tag: 'WorkComplete',
      sessionId: msg.sessionId,
      partitionIndex: msg.partitionIndex,
      topCandidates: [],
      evaluatedCount: 0,
      visitedCount: 0,
    }))

    const result = await handle.dispatch(createDispatchMessage(0))
    expect(result.tag).toBe('WorkComplete')
  })

  it('requestPause returns undefined (synchronous worker)', async () => {
    const handle = createCallbackWorkerHandle('test', () => ({
      tag: 'WorkComplete',
      sessionId: 's',
      partitionIndex: 0,
      topCandidates: [],
      evaluatedCount: 0,
      visitedCount: 0,
    }))

    const ack = await handle.requestPause('session')
    expect(ack).toBeUndefined()
  })

  it('terminate is a no-op', async () => {
    const handle = createCallbackWorkerHandle('test', () => ({
      tag: 'WorkComplete',
      sessionId: 's',
      partitionIndex: 0,
      topCandidates: [],
      evaluatedCount: 0,
      visitedCount: 0,
    }))

    await expect(handle.terminate()).resolves.toBeUndefined()
  })
})
