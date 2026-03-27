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
  defaultLapicDangerZoneConfig,
  executeLapicBoundedExactSolve,
  executeCoordinatedBoundedExactSolve,
} from '@genshin-optimizer/lapic/runtime'
import type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactSolveOutcome,
  LapicDangerZoneConfig,
  LapicInMemorySessionController,
  LapicPartitionDispatcher,
  LapicSolveCheckpointState,
  LapicSolveOrchestration,
} from '@genshin-optimizer/lapic/runtime'
import type {
  LapicCanonicalProblem,
  LapicLpProvider,
} from '@genshin-optimizer/lapic/core'
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
  /**
   * Numeric danger-zone protection for bound-based pruning.
   * When supplied, the executor declines a prune if the bound is
   * suspiciously close to the threshold (within the safe margin),
   * avoiding silent false-negative pruning due to floating-point error.
   */
  readonly dangerZoneConfig?: LapicDangerZoneConfig
  readonly candidateVariableExtractor?: GiLapicBoundedCurrentOnlySolveOptions['candidateVariableExtractor']
  readonly potentialRerankEvaluator?: GiLapicBoundedCurrentOnlySolveOptions['potentialRerankEvaluator']
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
  /**
   * Checkpoint state from a previously paused solve.
   * When present, the single-threaded executor resumes from
   * the saved cursor position instead of starting fresh.
   * Coordinated (multi-partition) solve does not support resume;
   * if this is set, the solve is forced to single-threaded mode.
   */
  readonly resumeCheckpointState?: LapicSolveCheckpointState
  /**
   * Optional factory for creating a partition dispatcher from sub-workers.
   *
   * Called with the canonical problem after it's built inside the solve
   * function.  When provided and workerCount > 1, partitions are dispatched
   * to real Web Worker threads instead of running in-process.
   *
   * The returned dispatcher is shut down automatically by the coordinated
   * solve's finally block.
   */
  readonly dispatcherFactory?: (
    canonicalProblem: LapicCanonicalProblem
  ) => Promise<LapicPartitionDispatcher>
  /**
   * Callback invoked after each partition completes in coordinated solve.
   * Useful for UX feedback like "Partition 2/4 complete".
   */
  readonly onPartitionComplete?: (
    partitionIndex: number,
    totalPartitions: number
  ) => void
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

      // 4b. Auto-wire danger zone protection when pruning is active
      const dangerZoneConfig =
        config.dangerZoneConfig ??
        (computeUpperBound !== undefined
          ? defaultLapicDangerZoneConfig
          : undefined)

      // 5. Execute solve — coordinated or single-threaded
      //    Resume forces single-threaded (coordinated solve lacks resume support)
      const effectiveWorkerCount = config.resumeCheckpointState
        ? 1
        : (config.workerCount ?? 1)
      if (effectiveWorkerCount > 1) {
        const wrappedEvaluateCombination = (
          combination: LapicBoundedExactCandidateCombination
        ) => config.evaluateCombination(combination, canonicalExport.value)
        const wrappedFeasibility = config.isCombinationFeasible
          ? (combination: LapicBoundedExactCandidateCombination) =>
              config.isCombinationFeasible!(combination, canonicalExport.value)
          : undefined

        // Create real dispatcher if factory provided (enables true parallelism)
        const dispatcher = config.dispatcherFactory
          ? await config.dispatcherFactory(canonicalExport.value.problem)
          : undefined

        return executeCoordinatedBoundedExactSolve({
          problem: canonicalExport.value.problem,
          controller,
          artifactStore,
          workerCount: effectiveWorkerCount,
          ...(firGraph !== undefined ? { firGraph } : {}),
          evaluateCombination: wrappedEvaluateCombination,
          ...(config.compareEvaluations !== undefined
            ? { compareEvaluations: config.compareEvaluations }
            : {}),
          ...(wrappedFeasibility !== undefined
            ? { isCombinationFeasible: wrappedFeasibility }
            : {}),
          ...(config.maxCombinationCount !== undefined
            ? { maxCombinationCount: config.maxCombinationCount }
            : {}),
          ...(computeUpperBound !== undefined ? { computeUpperBound } : {}),
          ...(dangerZoneConfig !== undefined ? { dangerZoneConfig } : {}),
          ...(config.skipIntermediateCertificates !== undefined
            ? {
                skipIntermediateCertificates:
                  config.skipIntermediateCertificates,
              }
            : {}),
          ...(dispatcher !== undefined ? { dispatcher } : {}),
          ...(config.onPartitionComplete !== undefined
            ? { onPartitionComplete: config.onPartitionComplete }
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
        ...(dangerZoneConfig !== undefined ? { dangerZoneConfig } : {}),
        ...(config.skipIntermediateCertificates !== undefined
          ? {
              skipIntermediateCertificates: config.skipIntermediateCertificates,
            }
          : {}),
        ...(config.resumeCheckpointState !== undefined
          ? { resumeCheckpointState: config.resumeCheckpointState }
          : {}),
        ...(config.potentialRerankEvaluator !== undefined
          ? { potentialRerankEvaluator: config.potentialRerankEvaluator }
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
