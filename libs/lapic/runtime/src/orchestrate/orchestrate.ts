/**
 * Solve orchestrator — the top-level factory for lapic solve sessions.
 *
 * Creates a fully-wired session with identity, controller, and storage,
 * then starts the solve via an adapter-provided function.
 *
 * Apps call `createSolveOrchestration(config)` to get a handle, subscribe
 * to events, then call `.start()` to begin the solve.
 */

import { createLapicInMemorySessionController } from '../session/controller'
import { lapicRuntimeProtocolVersion } from '../types'
import type { LapicSessionIdentity } from '../types'
import type {
  LapicOrchestrationOutcome,
  LapicOrchestrationState,
  LapicSolveOrchestration,
  LapicSolveOrchestrationConfig,
} from './types'

// ---------------------------------------------------------------------------
// Session identity generator
// ---------------------------------------------------------------------------

let sessionSequence = 0

/**
 * Create a session identity from orchestration config.
 * Generates a unique session ID if not explicitly provided.
 */
export function createSessionIdentity(
  config: LapicSolveOrchestrationConfig
): LapicSessionIdentity {
  const sessionId =
    config.sessionId ?? `lapic-session-${Date.now()}-${++sessionSequence}`

  return {
    sessionId,
    problemDigest: config.problemDigest,
    engineVersion: config.engineVersion,
    arithmeticPolicyId: config.arithmeticPolicyId,
    runtimeProtocolVersion: lapicRuntimeProtocolVersion,
    createdAtLogicalTimestamp: String(Date.now()),
  }
}

// ---------------------------------------------------------------------------
// Orchestrator factory
// ---------------------------------------------------------------------------

/**
 * Create a solve orchestration.
 *
 * The returned `LapicSolveOrchestration` contains:
 * - `.handle` — a `LapicPublicSolveHandle` for subscriptions
 * - `.controller` — the internal controller for advanced use
 * - `.start()` — kicks off the solve asynchronously
 *
 * Typical usage:
 * ```ts
 * const orch = createSolveOrchestration({
 *   problemDigest: digest,
 *   engineVersion: '0.1.0-draft',
 *   arithmeticPolicyId: 'ieee754-double',
 *   artifactStore: store,
 *   solveFn: async (controller, store) => {
 *     return executeLapicBoundedExactSolve({ ... })
 *   },
 * })
 *
 * orch.handle.subscribeProgress(e => console.log(e))
 * const outcome = await orch.start()
 * ```
 */
export function createSolveOrchestration(
  config: LapicSolveOrchestrationConfig
): LapicSolveOrchestration {
  const identity = createSessionIdentity(config)

  const controller = createLapicInMemorySessionController({
    identity,
    solveRequest: {
      problemDigest: config.problemDigest,
      ...(config.checkpointImport !== undefined
        ? { checkpointImport: config.checkpointImport }
        : {}),
    },
    artifactStore: config.artifactStore,
  })

  // The orchestrator manages failures via start() return value,
  // so suppress unhandled rejections from the controller's
  // internal completion promise.
  controller.awaitCompletion().catch(() => {})

  let currentState: LapicOrchestrationState = 'created'
  let started = false

  const orchestration: LapicSolveOrchestration = {
    get handle() {
      return controller
    },
    get controller() {
      return controller
    },
    get state() {
      return currentState
    },
    get sessionId() {
      return identity.sessionId
    },

    async start(): Promise<LapicOrchestrationOutcome> {
      if (started) {
        throw new Error(
          'Solve orchestration has already been started. ' +
            'Create a new orchestration for a new solve.'
        )
      }
      started = true
      currentState = 'running'

      try {
        const outcome = await config.solveFn(controller, config.artifactStore)

        if ('paused' in outcome && outcome.paused) {
          currentState = 'paused'
          return { state: 'paused', solveOutcome: outcome }
        }

        currentState = 'completed'
        return { state: 'completed', solveOutcome: outcome }
      } catch (error: unknown) {
        const errorObj =
          error instanceof Error ? error : new Error(String(error))

        // If the controller is already in a terminal state
        // (e.g., solveFn called controller.fail()), don't
        // try to transition again.
        currentState = 'failed'
        return { state: 'failed', error: errorObj }
      }
    },
  }

  return orchestration
}

/**
 * Reset the internal session sequence counter.
 * Only used in tests to ensure deterministic session IDs.
 */
export function resetSessionSequenceForTesting(): void {
  sessionSequence = 0
}
