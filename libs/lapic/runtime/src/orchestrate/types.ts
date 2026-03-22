/**
 * Configuration and result types for the lapic solve orchestrator.
 *
 * The orchestrator is the top-level factory that apps use to start
 * a solve session. It creates a session controller, wires up the
 * solver pipeline, and returns a public solve handle for progress
 * monitoring, pause/resume, checkpoint, and completion.
 */

import type {
  LapicArithmeticPolicyId,
  LapicEngineVersion,
  LapicProblemDigest,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicArtifactStore,
  LapicClosureImportDescriptor,
} from '@genshin-optimizer/lapic/storage'
import type { LapicBoundedExactSolveOutcome } from '../solve/types'
import type {
  LapicInMemorySessionController,
  LapicPublicSolveHandle,
} from '../types'

// ---------------------------------------------------------------------------
// Orchestration config
// ---------------------------------------------------------------------------

/**
 * The solve function that the orchestrator invokes after creating
 * the session controller. The adapter or caller provides this; the
 * orchestrator handles lifecycle around it.
 *
 * The function receives the wired controller and artifact store
 * and must return the solve outcome (completion or pause).
 *
 * This inversion-of-control pattern lets the orchestrator own
 * session identity and lifecycle while the adapter owns solver
 * wiring (evaluators, bounds, transport).
 */
export type LapicOrchestrationSolveFunction = (
  controller: LapicInMemorySessionController,
  artifactStore: LapicArtifactStore
) => Promise<LapicBoundedExactSolveOutcome>

/**
 * Configuration for creating a solve orchestration.
 */
export interface LapicSolveOrchestrationConfig {
  /** Digest of the canonical problem being solved. */
  readonly problemDigest: LapicProblemDigest
  /** Engine version for session identity. */
  readonly engineVersion: LapicEngineVersion
  /** Arithmetic policy for session identity. */
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
  /** Storage backend for artifacts and checkpoints. */
  readonly artifactStore: LapicArtifactStore
  /**
   * The solve function to invoke. The orchestrator creates the
   * controller and passes it here; the adapter is responsible
   * for wiring evaluators, bounds, and transport within.
   */
  readonly solveFn: LapicOrchestrationSolveFunction
  /**
   * Optional checkpoint import descriptor for resuming a
   * previously checkpointed solve session.
   */
  readonly checkpointImport?: LapicClosureImportDescriptor
  /**
   * Optional explicit session ID. If not provided, a
   * monotonic ID is generated automatically.
   */
  readonly sessionId?: string
}

// ---------------------------------------------------------------------------
// Orchestration result
// ---------------------------------------------------------------------------

/**
 * State of the orchestrated solve lifecycle.
 *
 * - `created`: session created, not yet started
 * - `running`: solve in progress
 * - `completed`: solve finished successfully
 * - `paused`: solve paused at a safe point
 * - `failed`: solve failed with an error
 * - `cancelled`: solve was cancelled by the caller
 */
export type LapicOrchestrationState =
  | 'created'
  | 'running'
  | 'completed'
  | 'paused'
  | 'failed'
  | 'cancelled'

/**
 * A solve orchestration — the top-level object apps interact with.
 *
 * Provides a `LapicPublicSolveHandle` for event subscriptions and
 * lifecycle control, plus orchestration-level methods for starting
 * and inspecting the solve.
 */
export interface LapicSolveOrchestration {
  /**
   * The public solve handle. Available immediately (before `.start()`),
   * so consumers can subscribe to progress and diagnostics before
   * the solve begins producing events.
   */
  readonly handle: LapicPublicSolveHandle

  /**
   * The internal session controller. Exposed for advanced use
   * (e.g., adapter-level certificate emission). Apps should prefer
   * the `handle` interface.
   */
  readonly controller: LapicInMemorySessionController

  /** Current orchestration lifecycle state. */
  readonly state: LapicOrchestrationState

  /** Session ID for this orchestration. */
  readonly sessionId: string

  /**
   * Start the solve asynchronously.
   *
   * The solve runs on a microtask, so `.handle` event subscriptions
   * established before calling `.start()` will receive all events.
   *
   * Calling `.start()` more than once throws.
   *
   * @returns A promise that resolves when the solve finishes
   *          (completed, paused, or failed). For fire-and-forget,
   *          ignore the return value and use `handle.awaitCompletion()`.
   */
  start(): Promise<LapicOrchestrationOutcome>
}

/**
 * Outcome of a completed orchestration.
 */
export interface LapicOrchestrationOutcome {
  readonly state: LapicOrchestrationState
  /** Present when state is 'completed' or 'paused'. */
  readonly solveOutcome?: LapicBoundedExactSolveOutcome
  /** Present when state is 'failed'. */
  readonly error?: Error
}
