/**
 * Sub-worker for parallel partition execution in Lapic multi-threading.
 *
 * Created by the orchestrator worker (LapicSolveWorker) when
 * workerCount > 1.  Each sub-worker:
 * 1. Receives evaluator data + canonical problem + MessagePort
 * 2. Rebuilds the GI stat evaluator via precompute()
 * 3. Sets up a bounded-exact worker entry handler for partition dispatch
 * 4. Signals readiness to the orchestrator
 *
 * After init, all communication flows through the MessagePort using
 * the existing dispatch-partition / partition-result protocol.
 *
 * MVP limitation: sub-workers do not compile FIR graphs or use LP
 * bounds.  Pruning within each partition relies on incumbent thresholds
 * only.  FIR bound integration is planned for Phase 2.
 */

import './subWorkerPolyfill'
import type { ArtifactBuildData } from '@genshin-optimizer/gi/solver'
import { precompute } from '@genshin-optimizer/gi/wr'
import type { ReadNode } from '@genshin-optimizer/gi/wr'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactCombinationEvaluation,
} from '@genshin-optimizer/lapic/runtime'

import type {
  LapicSubWorkerInitMsg,
  LapicSubWorkerOutMsg,
} from './subWorkerProtocol'

declare function postMessage(msg: LapicSubWorkerOutMsg): void

onmessage = async (e: MessageEvent<LapicSubWorkerInitMsg>) => {
  if (e.data.type !== 'sub-worker-init') return

  try {
    await initSubWorker(e.data, e.ports[0])
  } catch (err) {
    postMessage({
      type: 'sub-worker-error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

async function initSubWorker(
  msg: LapicSubWorkerInitMsg,
  port: MessagePort | undefined
): Promise<void> {
  if (!port) throw new Error('No MessagePort received in sub-worker init')

  const {
    optimizedNodes,
    base,
    artsBySlot,
    constraintMinimums,
    canonicalProblem,
  } = msg

  const {
    createBoundedExactWorkerEntryHandler,
    createLapicInMemorySessionController,
    lapicRuntimeProtocolVersion,
  } = await import('@genshin-optimizer/lapic/runtime')

  const { createLapicMemoryArtifactStore } = await import(
    '@genshin-optimizer/lapic/storage'
  )

  // 1. Rebuild evaluator from serialized data
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

  const evaluateCombination = buildEvaluator(
    compute,
    artifactById,
    constraintMinimums,
    slotCount
  )

  // 2. Create per-worker artifact store
  const artifactStore = createLapicMemoryArtifactStore()

  // 3. Set up bounded-exact worker entry handler
  let sequenceCounter = 0
  createBoundedExactWorkerEntryHandler({
    port,
    dispatchConfig: {
      problem: canonicalProblem,
      artifactStore,
      evaluateCombination,
    },
    createController(partitionIndex: number) {
      return createLapicInMemorySessionController({
        identity: {
          sessionId: `sub-worker:partition-${partitionIndex}`,
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

  // 4. Signal ready
  postMessage({ type: 'sub-worker-ready' })
}

/**
 * Build the evaluator closure that maps candidate combinations to scores.
 * Mirrors the evaluator in LapicSolveWorker.ts but without mutable
 * counters (each sub-worker is stateless from the orchestrator's
 * perspective).
 */
function buildEvaluator(
  compute: ReturnType<typeof precompute>,
  artifactById: Map<string, ArtifactBuildData>,
  constraintMinimums: readonly number[],
  slotCount: number
) {
  return (
    combination: LapicBoundedExactCandidateCombination
  ): LapicValidationResult<LapicBoundedExactCombinationEvaluation> => {
    const buffer: ArtifactBuildData[] = []
    for (const candidate of combination.candidates) {
      const art = artifactById.get(candidate.candidateId)
      if (!art) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'ARTIFACT_NOT_FOUND',
              message: `Artifact not found: ${candidate.candidateId}`,
              path: ['candidateId'],
            },
          ],
        }
      }
      buffer.push(art)
    }

    const result = compute(
      buffer as readonly {
        readonly values: Readonly<Record<string, number>>
      }[] & { length: typeof slotCount }
    )

    for (let c = 0; c < constraintMinimums.length; c++) {
      if (result[c] < constraintMinimums[c]) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'CONSTRAINT_VIOLATED',
              message: `Constraint ${c} violated: ${result[c]} < ${constraintMinimums[c]}`,
              path: ['constraint', String(c)],
            },
          ],
        }
      }
    }

    const objectiveValue = result[constraintMinimums.length]
    return {
      ok: true,
      value: {
        objectiveValue: String(objectiveValue),
        evidenceDigest: `gi-precompute:${objectiveValue}`,
      },
      diagnostics: [],
    }
  }
}
