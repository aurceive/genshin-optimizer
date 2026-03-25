/**
 * Web Worker for the lapic optimization engine.
 *
 * Runs the full lapic orchestration pipeline off the main thread:
 * 1. Reconstructs the GI stat evaluator via `precompute()`
 * 2. Builds a proper normalization input for GI artifact optimization
 * 3. Runs `createGiLapicSolveOrchestration()` with coordinated solve
 *    (domain partitioning, B&B pruning, incumbent sharing)
 * 4. Forwards progress events and top-N results to the main thread
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
} from '@genshin-optimizer/gi/lapic-adapter'
import type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactCombinationEvaluation,
} from '@genshin-optimizer/lapic/runtime'
import type {
  LapicProblemNormalizationInput,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import { precompute } from '@genshin-optimizer/gi/wr'
import type { OptNode, ReadNode } from '@genshin-optimizer/gi/wr'
import type {
  LapicWorkerInMsg,
  LapicWorkerOutMsg,
  LapicWorkerInitMsg,
} from './lapicBridge'

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

onmessage = (e: MessageEvent<LapicWorkerInMsg>) => {
  const msg = e.data

  if (msg.type === 'cancel') {
    orchestration?.handle.requestCancel().catch(() => {})
    return
  }

  if (msg.type === 'init') {
    // Cancel any in-flight orchestration before starting a new one
    const prev = orchestration
    orchestration = null
    const start = async () => {
      if (prev) await prev.handle.requestCancel().catch(() => {})
      return runSolve(msg)
    }
    start().catch((err) => {
      postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    })
  }
}

async function runSolve(msg: LapicWorkerInitMsg): Promise<void> {
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
  let failedCount = 0

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

  // 4. Create orchestration
  orchestration = createGiLapicSolveOrchestration({
    ...config,
    workerCount,
  })

  // 5. Subscribe to progress (throttled to avoid flooding the main thread)
  let totalCombinations = 0
  let evaluatedCount = 0
  let skippedCount = 0
  let lastProgressPostTime = 0
  const PROGRESS_THROTTLE_MS = 500

  orchestration.handle.subscribeProgress((event) => {
    if (event.phase === 'join') {
      evaluatedCount = event.completedUnits - (event.skippedUnits ?? 0)
      skippedCount = event.skippedUnits ?? 0
      if (event.totalUnits !== undefined) {
        totalCombinations = event.totalUnits
      }
    }
    const now = performance.now()
    if (now - lastProgressPostTime >= PROGRESS_THROTTLE_MS) {
      lastProgressPostTime = now
      postMessage({
        type: 'progress',
        tested: evaluatedCount,
        failed: failedCount,
        skipped: skippedCount,
        total: totalCombinations,
      })
    }
  })

  // 5b. Subscribe to diagnostics and forward to main thread
  orchestration.handle.subscribeDiagnostics((event) => {
    if ('failureClass' in event) {
      // LapicFailureRecord
      const severity = event.diagnostics.some((d) => d.severity === 'error')
        ? 'error'
        : event.diagnostics.some((d) => d.severity === 'warning')
          ? 'warning'
          : 'info'
      postMessage({
        type: 'diagnostic',
        severity,
        code: event.failureClass,
        message: event.message,
      })
    } else {
      // LapicTraceEvent — only forward non-routine tags
      if (event.tag === 'ReportFailure') {
        postMessage({
          type: 'diagnostic',
          severity: 'warning',
          code: event.tag,
          message: `Trace: ${event.tag} [${event.eventDigest}]`,
        })
      }
    }
  })

  // 6. Start the solve
  const outcome = await orchestration.start()

  // 7. Map results to the expected format
  if (outcome.state === 'completed' && outcome.solveOutcome) {
    const solveResult = outcome.solveOutcome
    if ('topNCandidates' in solveResult && solveResult.topNCandidates) {
      const builds = solveResult.topNCandidates.map((entry) => ({
        value: parseFloat(entry.evaluation.objectiveValue),
        artifactIds: entry.candidates.map((c) => c.candidateId),
      }))

      postMessage({
        type: 'result',
        builds,
        tested: evaluatedCount,
        failed: failedCount,
        total: totalCombinations,
      })
      return
    }
  }

  if (outcome.state === 'failed') {
    postMessage({
      type: 'error',
      message: outcome.error?.message ?? 'Lapic solve failed',
    })
    return
  }

  // Cancelled, paused, or no results
  postMessage({
    type: 'result',
    builds: [],
    tested: evaluatedCount,
    failed: failedCount,
    total: totalCombinations,
  })
}
