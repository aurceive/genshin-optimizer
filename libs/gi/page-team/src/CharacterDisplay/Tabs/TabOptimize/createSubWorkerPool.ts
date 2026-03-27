/**
 * Factory for creating a pool of sub-workers for parallel partition
 * execution.
 *
 * Creates N Web Workers, each running LapicSubWorker.ts.  Each
 * sub-worker receives evaluator reconstruction data and a MessagePort
 * for the dispatch protocol.  Returns a unified LapicPartitionDispatcher
 * that distributes partitions across workers via round-robin.
 */

import type { ArtifactBuildData, DynStat } from '@genshin-optimizer/gi/solver'
import type { OptNode } from '@genshin-optimizer/gi/wr'
import type { LapicCanonicalProblem } from '@genshin-optimizer/lapic/core'
import type { LapicPartitionDispatcher } from '@genshin-optimizer/lapic/runtime'
import type {
  LapicSubWorkerInitMsg,
  LapicSubWorkerOutMsg,
} from './subWorkerProtocol'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SubWorkerPoolConfig {
  readonly workerCount: number
  readonly optimizedNodes: OptNode[]
  readonly base: DynStat
  readonly artsBySlot: ArtifactBuildData[][]
  readonly constraintMinimums: number[]
}

const SUB_WORKER_INIT_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a pool of sub-workers and return a unified partition dispatcher.
 *
 * Each sub-worker reconstructs its own evaluator from the provided init
 * data and listens for partition dispatch requests via MessagePort.
 * The returned dispatcher distributes partitions across workers using
 * round-robin assignment.
 *
 * The returned dispatcher's `shutdown()` terminates all sub-workers.
 *
 * @throws If any sub-worker fails to initialize within the timeout.
 */
export async function createSubWorkerPool(
  config: SubWorkerPoolConfig,
  canonicalProblem: LapicCanonicalProblem
): Promise<LapicPartitionDispatcher> {
  const { workerCount, optimizedNodes, base, artsBySlot, constraintMinimums } =
    config

  const { createMessagePortPartitionDispatcher } = await import(
    '@genshin-optimizer/lapic/runtime'
  )

  const workers: Worker[] = []
  const dispatchers: LapicPartitionDispatcher[] = []
  const readyPromises: Promise<void>[] = []

  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(new URL('./LapicSubWorker.ts', import.meta.url), {
      type: 'module',
    })
    workers.push(worker)

    const { port1, port2 } = new MessageChannel()
    dispatchers.push(createMessagePortPartitionDispatcher({ port: port1 }))

    readyPromises.push(
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Sub-worker ${i} init timeout`))
        }, SUB_WORKER_INIT_TIMEOUT_MS)

        worker.onmessage = (e: MessageEvent<LapicSubWorkerOutMsg>) => {
          clearTimeout(timeout)
          if (e.data.type === 'sub-worker-ready') {
            resolve()
          } else if (e.data.type === 'sub-worker-error') {
            reject(new Error(`Sub-worker ${i}: ${e.data.message}`))
          }
        }
        worker.onerror = (err) => {
          clearTimeout(timeout)
          reject(new Error(`Sub-worker ${i} load error: ${err.message}`))
        }
      })
    )

    const initMsg: LapicSubWorkerInitMsg = {
      type: 'sub-worker-init',
      optimizedNodes,
      base,
      artsBySlot,
      constraintMinimums,
      canonicalProblem,
    }
    worker.postMessage(initMsg, [port2])
  }

  try {
    await Promise.all(readyPromises)
  } catch (err) {
    for (const worker of workers) worker.terminate()
    throw err
  }

  // Pool dispatcher — round-robin across sub-workers
  let nextIdx = 0
  return {
    async dispatch(request) {
      const idx = nextIdx++ % dispatchers.length
      return dispatchers[idx].dispatch(request)
    },
    async shutdown() {
      await Promise.all(dispatchers.map((d) => d.shutdown()))
      for (const worker of workers) worker.terminate()
    },
  }
}
