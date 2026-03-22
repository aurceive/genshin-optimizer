/**
 * GI adapter orchestrator bridge.
 *
 * Wraps the GI bounded-current-only solve through the lapic
 * solve orchestrator, providing a stable `LapicPublicSolveHandle`
 * for app integration.
 *
 * This is the Phase 7 entry point: apps call
 * `createGiLapicSolveOrchestration()` to get an orchestration
 * with handle subscriptions, then call `.start()` to begin.
 */

import {
  executeLapicBoundedExactSolve,
  createSolveOrchestration,
} from '@genshin-optimizer/lapic/runtime'
import type {
  LapicSolveOrchestration,
  LapicBoundedExactSolveOutcome,
  LapicInMemorySessionController,
} from '@genshin-optimizer/lapic/runtime'
import type { LapicArtifactStore } from '@genshin-optimizer/lapic/storage'
import {
  createLapicArtifactWriteRequest,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import { createGiLapicBuiltinBoundProvider } from './builtin-bound-provider'
import { buildGiLapicCanonicalExportFromRequest } from './canonical'
import { compileGiOptNodeToFir } from './compilation'
import type {
  GiLapicBoundedCurrentOnlySolveOptions,
  GiLapicCanonicalExport,
  GiLapicCanonicalIdentity,
} from './types'

// ---------------------------------------------------------------------------
// Orchestrator bridge config
// ---------------------------------------------------------------------------

/**
 * Configuration for creating a GI solve orchestration.
 *
 * Same inputs as `GiLapicBoundedCurrentOnlySolveOptions` but
 * without `controller` — the orchestrator creates and owns it.
 */
export interface GiLapicSolveOrchestrationConfig {
  readonly request: GiLapicBoundedCurrentOnlySolveOptions['request']
  readonly canonicalIdentity: GiLapicCanonicalIdentity
  readonly artifactStore: LapicArtifactStore
  readonly evaluateCombination: GiLapicBoundedCurrentOnlySolveOptions['evaluateCombination']
  readonly compareEvaluations?: GiLapicBoundedCurrentOnlySolveOptions['compareEvaluations']
  readonly isCombinationFeasible?: GiLapicBoundedCurrentOnlySolveOptions['isCombinationFeasible']
  readonly maxCombinationCount?: number
  readonly computeUpperBound?: GiLapicBoundedCurrentOnlySolveOptions['computeUpperBound']
  readonly candidateVariableExtractor?: GiLapicBoundedCurrentOnlySolveOptions['candidateVariableExtractor']
  /** Optional explicit session ID. */
  readonly sessionId?: string
}

/**
 * Extended orchestration with GI-specific metadata.
 */
export interface GiLapicSolveOrchestration extends LapicSolveOrchestration {
  /**
   * The canonical export is available after `.start()` resolves
   * (or after the solve function has built it). Returns undefined
   * if the orchestration hasn't started or canonical export failed.
   */
  readonly canonicalExport?: GiLapicCanonicalExport
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a GI solve orchestration.
 *
 * This is the recommended entry point for Phase 7 app integration.
 * The orchestrator creates the session controller and wires the
 * GI-specific solve pipeline as the `solveFn`.
 *
 * Usage:
 * ```ts
 * const orch = createGiLapicSolveOrchestration({
 *   request,
 *   canonicalIdentity,
 *   artifactStore,
 *   evaluateCombination,
 * })
 *
 * orch.handle.subscribeProgress(e => updateUI(e))
 * const outcome = await orch.start()
 * ```
 */
export function createGiLapicSolveOrchestration(
  config: GiLapicSolveOrchestrationConfig
): GiLapicSolveOrchestration {
  let resolvedCanonicalExport: GiLapicCanonicalExport | undefined

  const base = createSolveOrchestration({
    problemDigest: config.canonicalIdentity.problemDigest,
    engineVersion: config.canonicalIdentity.engineVersion,
    arithmeticPolicyId: config.canonicalIdentity.arithmeticPolicyId,
    artifactStore: config.artifactStore,
    sessionId: config.sessionId,
    solveFn: async (
      controller: LapicInMemorySessionController,
      artifactStore: LapicArtifactStore
    ): Promise<LapicBoundedExactSolveOutcome> => {
      // 1. Build canonical export from request
      const canonicalExport = buildGiLapicCanonicalExportFromRequest({
        request: config.request,
        canonicalIdentity: config.canonicalIdentity,
      })

      if (!canonicalExport.ok) {
        return controller
          .fail(
            'schemaCompatibilityFailure',
            canonicalExport.diagnostics[0]?.message ??
              'Failed to build GI canonical export.',
            canonicalExport.diagnostics
          )
          .catch(() => {
            throw new Error(
              canonicalExport.diagnostics[0]?.message ??
                'Failed to build GI canonical export.'
            )
          })
      }

      resolvedCanonicalExport = canonicalExport.value

      // 2. Persist canonical problem artifact
      await persistCanonicalProblemArtifact(
        canonicalExport.value,
        artifactStore,
        controller
      )

      // 3. Compile F-IR for static analysis (best-effort)
      const optimizationTarget =
        config.request.giContext?.optimizationRequest.optimizationTarget
      const firCompilation = optimizationTarget
        ? compileGiOptNodeToFir(optimizationTarget)
        : undefined
      const firGraph = firCompilation?.ok
        ? firCompilation.result.graph
        : undefined

      // 4. Auto-wire FIR-bound provider
      const computeUpperBound =
        config.computeUpperBound ??
        (firGraph && config.candidateVariableExtractor
          ? createGiLapicBuiltinBoundProvider({
              firGraph,
              canonicalExport: canonicalExport.value,
              extractVariables: config.candidateVariableExtractor,
            })
          : undefined)

      // 5. Execute solve
      return executeLapicBoundedExactSolve({
        problem: canonicalExport.value.problem,
        controller,
        artifactStore,
        firGraph,
        evaluateCombination(combination) {
          return config.evaluateCombination(
            combination,
            canonicalExport.value
          )
        },
        compareEvaluations: config.compareEvaluations,
        isCombinationFeasible: config.isCombinationFeasible
          ? (combination) =>
              config.isCombinationFeasible!(
                combination,
                canonicalExport.value
              )
          : undefined,
        maxCombinationCount: config.maxCombinationCount,
        computeUpperBound,
      })
    },
  })

  return {
    get handle() {
      return base.handle
    },
    get controller() {
      return base.controller
    },
    get state() {
      return base.state
    },
    get sessionId() {
      return base.sessionId
    },
    start() {
      return base.start()
    },
    get canonicalExport() {
      return resolvedCanonicalExport
    },
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function persistCanonicalProblemArtifact(
  canonicalExport: GiLapicCanonicalExport,
  artifactStore: LapicArtifactStore,
  controller: LapicInMemorySessionController
) {
  const serializedPayload = JSON.stringify(canonicalExport.problem)
  const commit = await artifactStore.write(
    createLapicArtifactWriteRequest(
      createLapicStorageEnvelope({
        artifactKind: 'canonical-problem',
        schemaVersion: '0.1.0-draft',
        payloadEncoding: 'json',
        payloadLength: serializedPayload.length,
        contentHash: canonicalExport.canonicalProblemDigest,
        checksum: {
          algorithm: 'sha256',
          checksum: canonicalExport.canonicalProblemDigest,
        },
        compressionCodec: 'none',
        creationEngineVersion: canonicalExport.problem.engineVersion,
        arithmeticPolicyId: canonicalExport.problem.arithmeticPolicyId,
        dependencyDigestSet: canonicalExport.sourceSnapshotDigestSet,
      }),
      canonicalExport.canonicalProblemDigest
    )
  )

  controller.publishArtifact(commit.artifactRef)
}
