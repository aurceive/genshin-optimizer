/**
 * Web Worker for the lapic optimization engine.
 *
 * The GI optimization tab runs the full lapic orchestration inside this
 * Worker rather than on the main thread.  The `useLapicSolve` hook in
 * `lapic-ui` provides a convenient React wrapper around the same
 * orchestration API, but it executes on the calling thread — which
 * blocks rendering for production-scale search spaces (>10^8 candidates).
 *
 * This Worker isolates the computation so the UI stays responsive:
 * 1. Reconstructs the GI stat evaluator via `precompute()`
 * 2. Builds a proper normalization input for GI artifact optimization
 * 3. Runs `createGiLapicSolveOrchestration()` with coordinated solve
 *    (domain partitioning, B&B pruning, incumbent sharing)
 * 4. Forwards progress events and top-N results to the main thread
 *
 * Communication follows the typed bridge protocol in `lapicBridge.ts`.
 */

import type { ArtifactBuildData } from '@genshin-optimizer/gi/solver'
import {
  createGiLapicOrchestrationConfigFromUi,
  createGiLapicSolveOrchestration,
} from '@genshin-optimizer/gi/lapic-adapter'
import type {
  GiLapicSolveOrchestration,
  GiLapicCanonicalExport,
  GiLapicCandidateVariableExtractor,
  GiLapicDispatcherBoundContext,
} from '@genshin-optimizer/gi/lapic-adapter'
import type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactCombinationEvaluation,
  LapicProgressEvent,
  LapicSolveCheckpointState,
} from '@genshin-optimizer/lapic/runtime'
import type {
  LapicProblemNormalizationInput,
  LapicValidationResult,
  LapicLpProvider,
} from '@genshin-optimizer/lapic/core'
import { precompute } from '@genshin-optimizer/gi/wr'
import type { OptNode, ReadNode } from '@genshin-optimizer/gi/wr'
import type {
  LapicWorkerInMsg,
  LapicWorkerOutMsg,
  LapicWorkerInitMsg,
  LapicSolveEvidence,
} from './lapicBridge'
import { buildPartitionEvaluator } from './buildPartitionEvaluator'

declare function postMessage(msg: LapicWorkerOutMsg): void

// ---------------------------------------------------------------------------
// GI artifact slot normalization
// ---------------------------------------------------------------------------

const GI_ARTIFACT_SLOTS = [
  'flower',
  'plume',
  'sands',
  'goblet',
  'circlet',
] as const

/**
 * Build a `LapicProblemNormalizationInput` for single-character
 * artifact optimization with 5 artifact slots.
 *
 * The `itemDomains` field is intentionally empty because the
 * canonical export builder overrides it with domains derived
 * from the GI adapter context (filtered artifacts by slot).
 */
function createGiArtifactNormalizationInput(
  topN: number
): LapicProblemNormalizationInput {
  return {
    teamLayout: {
      teamKind: 'gi-single',
      slotCount: 5,
      slotIds: [...GI_ARTIFACT_SLOTS],
      slotRoleTaxonomy: ['artifact'],
      slotRequirements: Object.fromEntries(
        GI_ARTIFACT_SLOTS.map((s) => [s, 'required' as const])
      ) as Record<string, 'required'>,
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: GI_ARTIFACT_SLOTS.map((slotId) => ({
      slotId,
      slotRole: `artifact-${slotId}`,
      participationMode: 'optimizedBuild' as const,
      occupantDomainId: `gi:${slotId}`,
      equipmentOwnershipModel: 'hard-reserved-inventory' as const,
      contributesToObjective: true,
      contributesToConstraints: true,
      mayRemainEmpty: false,
    })),
    sharedTeamContext: {
      adapterSemanticMode: 'gi-legacy-compatibility',
      aggregateFacts: {},
      metadata: {},
    },
    itemDomains: [],
    compatibilityRules: [],
    objective: {
      objectiveId: 'gi-optimization-target',
      objectiveKind: 'single-slot',
      expressionDigest: 'gi-precompute-target',
      targetSlotIds: [...GI_ARTIFACT_SLOTS],
      frameIds: [],
    },
    constraints: [],
    topN,
    orderingPolicy: {
      tieBreakDimensions: ['value'],
      canonicalCandidateOrdering: ['value'],
    },
    adapterMetadata: {
      adapterKind: 'gi-wr',
      adapterVersion: '0.1.0-draft',
      sourceSnapshotDigests: [],
      declaredUnsupportedFeatures: [],
      metadata: {},
    },
    provenance: {
      teamLayoutDigest: 'gi-single-character',
      sharedTeamContextDigest: 'gi-default',
      crossSlotRuleDescriptorVersion: '0.1.0-draft',
      compatibilitySignatureSchemaVersion: '0.1.0-draft',
      slotProvenance: [],
    },
  }
}

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

let orchestration: GiLapicSolveOrchestration | null = null

// Resume synchronization: when the Worker is paused, a 'resume' message
// resolves this promise to unblock the solve cycle.
let resolveResumeWait: ((action: 'resume' | 'cancel') => void) | null = null

onmessage = (e: MessageEvent<LapicWorkerInMsg>) => {
  const msg = e.data

  if (msg.type === 'cancel') {
    // If paused and waiting for resume, unblock the wait so the
    // solve cycle can exit cleanly.
    resolveResumeWait?.('cancel')
    resolveResumeWait = null
    orchestration?.handle.requestCancel().catch(() => {})
    return
  }

  if (msg.type === 'pause') {
    orchestration?.handle.requestPause().catch(() => {})
    return
  }

  if (msg.type === 'resume') {
    resolveResumeWait?.('resume')
    resolveResumeWait = null
    return
  }

  if (msg.type === 'init') {
    // Capture ports from transferables (one per secondary worker)
    const secondaryPorts = [...e.ports]
    // Cancel any in-flight orchestration before starting a new one
    const prev = orchestration
    orchestration = null
    const start = async () => {
      if (prev) await prev.handle.requestCancel().catch(() => {})
      return runSolve(msg, undefined, undefined, secondaryPorts)
    }
    start().catch((err) => {
      postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    })
  }
}

async function runSolve(
  msg: LapicWorkerInitMsg,
  resumeCheckpoint?: LapicSolveCheckpointState,
  priorCounters?: { evaluated: number; failed: number; total: number },
  secondaryPorts?: MessagePort[]
): Promise<void> {
  const {
    optimizedNodes,
    base,
    artsBySlot,
    constraintMinimums,
    artifacts,
    optimizationTarget,
    constraints,
    optConfig,
    topN,
    workerCount,
    problemId,
  } = msg

  // 1. Build evaluator from precompute()
  const slotCount = artsBySlot.length
  const compute = precompute(
    optimizedNodes as OptNode[],
    base,
    (f: ReadNode<number>) => f.path[1],
    slotCount
  )

  // Build lookup: candidateId → ArtifactBuildData
  const artifactById = new Map<string, ArtifactBuildData>()
  for (const slotArts of artsBySlot) {
    for (const art of slotArts) {
      if (art.id) artifactById.set(art.id, art)
    }
  }

  // Build stateless evaluator for local in-process partition dispatcher
  // (used when primary participates in compute alongside secondaries)
  const localEvaluator = buildPartitionEvaluator(
    compute,
    artifactById,
    constraintMinimums,
    slotCount
  )

  // Build candidate variable extractor for B&B pruning.
  // Maps each artifact's stat values to F-IR variable IDs ('dyn:{statKey}')
  // so the interval-arithmetic bound provider can compute admissible upper bounds.
  const candidateVariableExtractor: GiLapicCandidateVariableExtractor = (
    candidateId: string
  ) => {
    const art = artifactById.get(candidateId)
    if (!art) return new Map()
    const variables = new Map<string, number>()
    for (const [statKey, value] of Object.entries(art.values)) {
      variables.set(`dyn:${statKey}`, value)
    }
    return variables
  }

  // 2. Create the lapic evaluator (maps candidate combinations → scores)
  // When resuming from a checkpoint, carry forward the counters accumulated
  // before the pause so that progress and final result messages report
  // cumulative values across the full solve lifecycle.
  const counterBase = priorCounters ?? { evaluated: 0, failed: 0, total: 0 }
  let failedCount = counterBase.failed
  let evaluatedCount = counterBase.evaluated
  let totalCombinations = counterBase.total

  const evaluateCombination = (
    combination: LapicBoundedExactCandidateCombination,
    _canonicalExport: GiLapicCanonicalExport
  ): LapicValidationResult<LapicBoundedExactCombinationEvaluation> => {
    const buffer: ArtifactBuildData[] = []
    for (const candidate of combination.candidates) {
      const art = artifactById.get(candidate.candidateId)
      if (!art) {
        failedCount++
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

    // Check constraints (first N entries in result)
    for (let c = 0; c < constraintMinimums.length; c++) {
      if (result[c] < constraintMinimums[c]) {
        failedCount++
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

    // Objective value is at index constraintMinimums.length
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

  // 3. Build orchestration config via the adapter's config factory
  const normalizationInput = createGiArtifactNormalizationInput(topN)

  // Build global constants from base stats for FIR interval evaluation.
  // precompute() computes total = base[key] + sum(artifact[key]) per variable,
  // but the candidate variable extractor only provides per-artifact values.
  // Without these base values, FIR upper bounds underestimate by ~4.5x.
  const globalConstants = new Map<string, number>()
  for (const [key, value] of Object.entries(base)) {
    if (value !== 0) globalConstants.set(`dyn:${key}`, value)
  }

  const config = createGiLapicOrchestrationConfigFromUi({
    problemId,
    artifacts,
    optimizationTarget: optimizationTarget as OptNode,
    constraints: constraints.map((c) => ({
      value: c.value as OptNode,
      min: c.minimum,
    })),
    optConfig,
    normalizationInput,
    evaluateCombination,
    candidateVariableExtractor,
    globalConstants,
    topN,
  })

  // 4. Init HiGHS LP provider (graceful fallback to FIR-only bounds)
  let lpProvider: LapicLpProvider | undefined
  try {
    const { createLapicHighsProvider } = await import(
      '@genshin-optimizer/lapic/runtime'
    )
    lpProvider = await createLapicHighsProvider()
  } catch (e) {
    console.warn('[lapic] HiGHS WASM init failed, using FIR bounds only', e)
  }

  // 5. Create orchestration (UI solves skip intermediate certificates)
  orchestration = createGiLapicSolveOrchestration({
    ...config,
    workerCount,
    skipIntermediateCertificates: true,
    ...(lpProvider !== undefined ? { lpProvider } : {}),
    ...(resumeCheckpoint !== undefined
      ? { resumeCheckpointState: resumeCheckpoint }
      : {}),
    ...(secondaryPorts && secondaryPorts.length > 0
      ? {
          dispatcherFactory: async (canonicalProblem, boundContext) => {
            const {
              createMessagePortPartitionDispatcher,
              createInProcessPartitionDispatcher,
            } = await import('@genshin-optimizer/lapic/runtime')
            const { createLapicMemoryArtifactStore } = await import(
              '@genshin-optimizer/lapic/storage'
            )

            // Phase 2: send canonical problem to each secondary worker.
            // Only lightweight serializable fields are sent — NOT the
            // full domainVariableMaps (would cause OOM via N copies of
            // ~10MB nested Maps through structured clone).
            const remoteDispatchers = await Promise.all(
              secondaryPorts.map(async (port) => {
                port.postMessage({
                  kind: 'init-problem',
                  canonicalProblem,
                })
                await waitForReady(port)
                return createMessagePortPartitionDispatcher({ port })
              })
            )

            // Local in-process dispatcher for primary's own compute.
            // Reuses the orchestrator's full-precision bound provider
            // (zero-copy: same thread, closure reference only).
            // cooperativeYield allows port messages from remote workers
            // to be processed between top-level domain iterations.
            const localStore = createLapicMemoryArtifactStore()
            const localDispatcher = createInProcessPartitionDispatcher({
              problem: canonicalProblem,
              artifactStore: localStore,
              evaluateCombination: localEvaluator,
              cooperativeYield: true,
              ...(boundContext?.computeUpperBound !== undefined
                ? { computeUpperBound: boundContext.computeUpperBound }
                : {}),
              ...(boundContext?.firGraph !== undefined
                ? { firGraph: boundContext.firGraph }
                : {}),
              ...(boundContext?.dangerZoneConfig !== undefined
                ? { dangerZoneConfig: boundContext.dangerZoneConfig }
                : {}),
            })

            // Hybrid round-robin across all dispatchers
            const all = [...remoteDispatchers, localDispatcher]
            let next = 0
            return {
              dispatch: (req) => all[next++ % all.length].dispatch(req),
              shutdown: () =>
                Promise.all(all.map((d) => d.shutdown())).then(() => {}),
            }
          },
        }
      : {}),
    ...(workerCount > 1
      ? {
          onPartitionComplete: (index: number, total: number) => {
            postMessage({ type: 'partition-complete', index, total })
          },
        }
      : {}),
  })

  // 6. Subscribe to progress — forward canonical LapicProgressEvent objects
  let lastProgressEvent: LapicProgressEvent | undefined
  let lastProgressPostTime = 0
  const PROGRESS_THROTTLE_MS = 200

  orchestration.handle.subscribeProgress((event) => {
    if (event.phase === 'join') {
      evaluatedCount =
        counterBase.evaluated + event.completedUnits - (event.skippedUnits ?? 0)
      if (event.totalUnits !== undefined) {
        totalCombinations = Math.max(totalCombinations, event.totalUnits)
      }
    }
    lastProgressEvent = event
    const now = performance.now()
    if (now - lastProgressPostTime >= PROGRESS_THROTTLE_MS) {
      lastProgressPostTime = now
      postMessage({ type: 'progress', event })
    }
  })

  // UI solves do not subscribe to diagnostics (D-007). The runtime's
  // diagnostic broadcast is a no-op with zero listeners. Solve failures
  // surface through outcome.state and outcome.error.

  // 7. Start the solve
  const outcome = await orchestration.start()

  // 8. Handle outcome
  // Flush final progress unconditionally (throttle may have suppressed it)
  if (lastProgressEvent) {
    postMessage({ type: 'progress', event: lastProgressEvent })
  }

  // 8a. Paused — extract partial results, wait for resume or cancel
  if (
    outcome.state === 'paused' &&
    outcome.solveOutcome &&
    'paused' in outcome.solveOutcome &&
    outcome.solveOutcome.paused
  ) {
    const checkpoint = outcome.solveOutcome.checkpointState
    const partialBuilds = checkpoint.trackerSnapshot.entries.map((entry) => ({
      value: Number.parseFloat(entry.evaluation.objectiveValue),
      artifactIds: [...entry.candidateIds],
    }))

    postMessage({
      type: 'paused',
      partialBuilds,
      tested: evaluatedCount,
      total: totalCombinations,
    })

    // Block until 'resume' or 'cancel' message arrives
    const action = await new Promise<'resume' | 'cancel'>((resolve) => {
      resolveResumeWait = resolve
    })
    resolveResumeWait = null

    // If cancelled while paused, exit without resuming
    if (action === 'cancel') return

    // Resume: create a new orchestration from the checkpoint
    orchestration = null
    return runSolve(
      msg,
      checkpoint,
      {
        evaluated: evaluatedCount,
        failed: failedCount,
        total: totalCombinations,
      },
      secondaryPorts
    )
  }

  // 8b. Failed
  if (outcome.state === 'failed') {
    postMessage({
      type: 'error',
      message: outcome.error?.message ?? 'Lapic solve failed',
    })
    return
  }

  // 8c. Completed (or cancelled — no result posted)
  let builds: { value: number; artifactIds: string[] }[] = []
  let evidence: LapicSolveEvidence | undefined
  if (outcome.state === 'completed' && outcome.solveOutcome) {
    const solveResult = outcome.solveOutcome
    if ('topNCandidates' in solveResult && solveResult.topNCandidates) {
      builds = solveResult.topNCandidates.map((entry) => ({
        value: Number.parseFloat(entry.evaluation.objectiveValue),
        artifactIds: entry.candidates.map((c) => c.candidateId),
      }))
    }

    // Extract optimality evidence from the completion result
    if ('finalOptimality' in solveResult && solveResult.finalOptimality) {
      const fo = solveResult.finalOptimality
      const finalCert =
        'emittedCertificates' in solveResult
          ? solveResult.emittedCertificates.find(
              (c) => c.certKind === 'FinalOptimalityCert'
            )
          : undefined
      evidence = {
        optimalityGap: fo.decisionMetadata?.thresholdDigest ? '0' : 'unknown',
        dangerZoneDetected: fo.decisionMetadata?.dangerZoneDetected ?? false,
        exactReplayRequired: fo.decisionMetadata?.exactReplayRequired ?? false,
        ...(finalCert !== undefined
          ? {
              certificateId: finalCert.certId,
              certificateValidationStatus: finalCert.validationStatus,
              certificateJson: JSON.stringify(finalCert, null, 2),
            }
          : {}),
      }
    }
  }

  postMessage({
    type: 'result',
    builds,
    tested: evaluatedCount,
    failed: failedCount,
    total: totalCombinations,
    ...(evidence !== undefined ? { evidence } : {}),
  })
}

// ---------------------------------------------------------------------------
// Port handshake: wait for secondary worker to signal readiness
// ---------------------------------------------------------------------------

const SECONDARY_INIT_TIMEOUT_MS = 30_000

function waitForReady(port: MessagePort): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Secondary worker init timeout')),
      SECONDARY_INIT_TIMEOUT_MS
    )
    function handler(event: MessageEvent) {
      if (event.data?.kind === 'ready') {
        clearTimeout(timeout)
        port.removeEventListener('message', handler)
        resolve()
      }
    }
    port.addEventListener('message', handler)
    if (typeof port.start === 'function') port.start()
  })
}
