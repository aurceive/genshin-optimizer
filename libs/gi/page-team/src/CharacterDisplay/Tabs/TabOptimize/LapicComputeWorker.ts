/**
 * Secondary compute worker for parallel partition execution.
 *
 * Spawned by the main thread (not by another worker).  Each compute
 * worker handles two initialization phases:
 *
 * Phase 1 (main thread → worker via postMessage):
 *   Receives evaluator data (optimizedNodes, base, artsBySlot,
 *   constraintMinimums) and a MessagePort as transferable.
 *   Rebuilds the GI stat evaluator via precompute() — runs in
 *   parallel with the primary worker's precompute.
 *
 * Phase 2 (primary worker → this worker via MessagePort):
 *   Receives the canonical problem (built by the primary after
 *   normalization).  Sets up a bounded-exact worker entry handler
 *   and signals readiness to the primary via the port.
 *
 * After init, all communication flows through the MessagePort using
 * the existing dispatch-partition / partition-result protocol from
 * message-port.ts.
 *
 * Supports re-initialization (resume after pause): when the primary
 * sends a new init-problem via the port, the previous entry handler
 * is disposed and a fresh one is created.
 */

import type { ArtifactBuildData } from '@genshin-optimizer/gi/solver'
import { precompute } from '@genshin-optimizer/gi/wr'
import type { ReadNode } from '@genshin-optimizer/gi/wr'
import type { LapicComputeWorkerInitMsg } from './computeWorkerProtocol'
import { buildPartitionEvaluator } from './buildPartitionEvaluator'

onmessage = async (e: MessageEvent<LapicComputeWorkerInitMsg>) => {
  if (e.data.type !== 'compute-init') return

  try {
    await initComputeWorker(e.data, e.ports[0])
  } catch (err) {
    // Fatal — the primary will timeout waiting for the ready ack
    // and report the failure to the main thread.
    console.error('[lapic compute-worker] init failed:', err)
  }
}

async function initComputeWorker(
  msg: LapicComputeWorkerInitMsg,
  port: MessagePort | undefined
): Promise<void> {
  if (!port) throw new Error('No MessagePort received in compute worker')

  const { optimizedNodes, base, artsBySlot, constraintMinimums } = msg

  // Phase 1: precompute evaluator (runs in parallel with primary)
  const slotCount = artsBySlot.length
  const compute = precompute(
    optimizedNodes,
    base,
    (f: ReadNode<number>) => f.path[1],
    slotCount
  )

  const artifactById = new Map<string, ArtifactBuildData>()
  for (const slotArts of artsBySlot) {
    for (const art of slotArts) {
      if (art.id) artifactById.set(art.id, art)
    }
  }

  const evaluateCombination = buildPartitionEvaluator(
    compute,
    artifactById,
    constraintMinimums,
    slotCount
  )

  // Lazy-load runtime modules once (reused across resume cycles)
  const {
    createBoundedExactWorkerEntryHandler,
    createLapicInMemorySessionController,
    lapicRuntimeProtocolVersion,
  } = await import('@genshin-optimizer/lapic/runtime')

  const { createLapicMemoryArtifactStore } = await import(
    '@genshin-optimizer/lapic/storage'
  )

  // Phase 2: listen for canonical problem from primary via port.
  // Supports re-initialization on resume — each init-problem disposes
  // the previous entry handler and creates a fresh one.
  //
  // Note: secondary workers do NOT receive domainVariableMaps (sending
  // them caused OOM via N × ~10 MB structured clone duplication).
  // B&B pruning on remote workers requires a lighter data path — see
  // backlog item "envelope-only remote bounds".
  let currentDispose: (() => void) | null = null

  port.addEventListener('message', (event: MessageEvent) => {
    if (event.data?.kind !== 'init-problem') return

    // Dispose previous entry handler (resume case)
    if (currentDispose) {
      currentDispose()
      currentDispose = null
    }

    const canonicalProblem = event.data.canonicalProblem

    const artifactStore = createLapicMemoryArtifactStore()
    let sequenceCounter = 0

    currentDispose = createBoundedExactWorkerEntryHandler({
      port,
      dispatchConfig: {
        problem: canonicalProblem,
        artifactStore,
        evaluateCombination,
      },
      createController(partitionIndex: number) {
        return createLapicInMemorySessionController({
          identity: {
            sessionId: `compute-worker:partition-${partitionIndex}`,
            problemDigest: canonicalProblem.problemDigest,
            engineVersion: canonicalProblem.engineVersion,
            arithmeticPolicyId: canonicalProblem.arithmeticPolicyId,
            runtimeProtocolVersion: lapicRuntimeProtocolVersion,
            createdAtLogicalTimestamp: String(Date.now() + ++sequenceCounter),
          },
          artifactStore,
        })
      },
      deserializeJoinPlan: JSON.parse,
    })

    // Signal ready to primary
    port.postMessage({ kind: 'ready' })
  })
  if (typeof port.start === 'function') port.start()
}
