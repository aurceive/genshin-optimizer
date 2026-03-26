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
  createSolveOrchestration,
  executeLapicBoundedExactSolve,
  executeCoordinatedBoundedExactSolve,
} from '@genshin-optimizer/lapic/runtime'
import type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactSolveOutcome,
  LapicInMemorySessionController,
  LapicSolveOrchestration,
} from '@genshin-optimizer/lapic/runtime'
import type { LapicLpProvider } from '@genshin-optimizer/lapic/core'
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
  /**
   * Global constants for the FIR interval environment.
   * These are additive base values (e.g., from `arts.base` after
   * `pruneAll` + `reaffine`) that `precompute()` includes but
   * the per-candidate variable extractor does not.
   * Keys should match FIR variable IDs (`dyn:{statKey}`).
   */
  readonly globalConstants?: ReadonlyMap<string, number>
  /** Optional explicit session ID. */
  readonly sessionId?: string
  /**
   * Number of domain-level partitions for the coordinated solve.
   * When > 1, the solve splits the outermost domain and runs
   * each partition through the full bounded-exact executor
   * with branch-and-bound, certificates, and pruning.
   * Defaults to 1 (single-threaded executor).
   */
  readonly workerCount?: number
  /**
   * When true, intermediate certificates (BoundPruneCert, DominanceCert,
   * BranchReachabilityCert) are not emitted during the solve.
   * Use for UI-driven solves that only consume the top-N candidates.
   */
  readonly skipIntermediateCertificates?: boolean
  /**
   * Optional LP solver provider (e.g. HiGHS WASM).
   * When supplied, the auto-wired bound provider composes a cascade:
   * interval-arithmetic first, LP bounds as fallback for tighter pruning.
   */
  readonly lpProvider?: LapicLpProvider
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
    ...(config.sessionId !== undefined ? { sessionId: config.sessionId } : {}),
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

      // Diagnostic: report FIR compilation failure so B&B absence is traceable
      if (firCompilation && !firCompilation.ok) {
        const errMsgs = firCompilation.errors
          .map((e) => `${e.operation}: ${e.message}`)
          .join('; ')
        console.warn(
          `[lapic] FIR compilation failed — B&B pruning disabled. Errors: ${errMsgs}`
        )
      }

      // 4. Auto-wire bound provider (interval-only or interval+LP cascade)
      const computeUpperBound =
        config.computeUpperBound ??
        (firGraph && config.candidateVariableExtractor
          ? createGiLapicBuiltinBoundProvider({
              firGraph,
              canonicalExport: canonicalExport.value,
              extractVariables: config.candidateVariableExtractor,
              ...(config.globalConstants !== undefined
                ? { globalConstants: config.globalConstants }
                : {}),
              ...(config.lpProvider !== undefined
                ? { lpProvider: config.lpProvider }
                : {}),
            })
          : undefined)

      // 5. Execute solve — coordinated or single-threaded
      const effectiveWorkerCount = config.workerCount ?? 1
      if (effectiveWorkerCount > 1) {
        return executeCoordinatedBoundedExactSolve({
          problem: canonicalExport.value.problem,
          controller,
          artifactStore,
          workerCount: effectiveWorkerCount,
          ...(firGraph !== undefined ? { firGraph } : {}),
          evaluateCombination(combination) {
            return config.evaluateCombination(
              combination,
              canonicalExport.value
            )
          },
          ...(config.compareEvaluations !== undefined
            ? { compareEvaluations: config.compareEvaluations }
            : {}),
          ...(config.isCombinationFeasible !== undefined
            ? {
                isCombinationFeasible: (
                  combination: LapicBoundedExactCandidateCombination
                ) =>
                  config.isCombinationFeasible!(
                    combination,
                    canonicalExport.value
                  ),
              }
            : {}),
          ...(config.maxCombinationCount !== undefined
            ? { maxCombinationCount: config.maxCombinationCount }
            : {}),
          ...(computeUpperBound !== undefined ? { computeUpperBound } : {}),
          ...(config.skipIntermediateCertificates !== undefined
            ? {
                skipIntermediateCertificates:
                  config.skipIntermediateCertificates,
              }
            : {}),
        })
      }

      return executeLapicBoundedExactSolve({
        problem: canonicalExport.value.problem,
        controller,
        artifactStore,
        ...(firGraph !== undefined ? { firGraph } : {}),
        evaluateCombination(combination) {
          return config.evaluateCombination(combination, canonicalExport.value)
        },
        ...(config.compareEvaluations !== undefined
          ? { compareEvaluations: config.compareEvaluations }
          : {}),
        ...(config.isCombinationFeasible !== undefined
          ? {
              isCombinationFeasible: (
                combination: LapicBoundedExactCandidateCombination
              ) =>
                config.isCombinationFeasible!(
                  combination,
                  canonicalExport.value
                ),
            }
          : {}),
        ...(config.maxCombinationCount !== undefined
          ? { maxCombinationCount: config.maxCombinationCount }
          : {}),
        ...(computeUpperBound !== undefined ? { computeUpperBound } : {}),
        ...(config.skipIntermediateCertificates !== undefined
          ? {
              skipIntermediateCertificates: config.skipIntermediateCertificates,
            }
          : {}),
      })
    },
  })

  const result: LapicSolveOrchestration = {
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
  }

  Object.defineProperty(result, 'canonicalExport', {
    get() {
      return resolvedCanonicalExport
    },
    enumerable: true,
    configurable: true,
  })

  return result as GiLapicSolveOrchestration
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
