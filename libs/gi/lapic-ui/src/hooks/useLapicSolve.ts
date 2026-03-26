/**
 * React hook for managing a lapic solve orchestration lifecycle.
 *
 * Wraps `createGiLapicSolveOrchestration()` with React state management:
 * - Tracks solve status (idle → running → completed/failed/paused/cancelled)
 * - Subscribes to progress events automatically
 * - Provides start/pause/cancel/reset controls
 * - Cleans up subscriptions on unmount
 *
 * **Threading note:** This hook runs the orchestration on the calling
 * thread (typically the browser main thread).  For small or test-sized
 * problems this is convenient, but for production UI solves over large
 * search spaces the computation will block React rendering.  The GI
 * optimization tab therefore uses a dedicated Web Worker
 * (`LapicSolveWorker.ts`) that instantiates the orchestration off-thread
 * and communicates via the bridge message protocol.
 *
 * Usage:
 * ```tsx
 * function SolvePanel({ config }: { config: GiLapicSolveOrchestrationConfig }) {
 *   const [state, controls] = useLapicSolve(config)
 *
 *   return (
 *     <div>
 *       <span>Status: {state.status}</span>
 *       {state.progress && <span>{state.progress.completedUnits} done</span>}
 *       <button onClick={controls.start} disabled={state.status !== 'idle'}>Start</button>
 *       <button onClick={controls.pause} disabled={state.status !== 'running'}>Pause</button>
 *       <button onClick={controls.cancel} disabled={state.status !== 'running'}>Cancel</button>
 *       <button onClick={controls.reset}>Reset</button>
 *     </div>
 *   )
 * }
 * ```
 */

import type {
  GiLapicSolveOrchestration,
  GiLapicSolveOrchestrationConfig,
} from '@genshin-optimizer/gi/lapic-adapter'
import { createGiLapicSolveOrchestration } from '@genshin-optimizer/gi/lapic-adapter'
import type {
  LapicFailureRecord,
  LapicOrchestrationOutcome,
  LapicProgressEvent,
  LapicSubscriptionToken,
  LapicTraceEvent,
} from '@genshin-optimizer/lapic/runtime'
import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

/**
 * Status of the solve lifecycle from the UI's perspective.
 */
export type LapicSolveStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'paused'
  | 'failed'
  | 'cancelled'

/**
 * Observable state of the current solve session.
 */
export interface LapicSolveState {
  /** Current lifecycle status. */
  readonly status: LapicSolveStatus
  /** Latest progress event (undefined before first event). */
  readonly progress: LapicProgressEvent | undefined
  /** Error if status is 'failed'. */
  readonly error: Error | undefined
  /** Outcome once solve reaches a terminal state. */
  readonly outcome: LapicOrchestrationOutcome | undefined
  /** Active session ID (undefined when idle). */
  readonly sessionId: string | undefined
  /** Accumulated diagnostic events. */
  readonly diagnostics: readonly (LapicTraceEvent | LapicFailureRecord)[]
}

/**
 * Controls for managing the solve lifecycle.
 */
export interface LapicSolveControls {
  /** Start the solve. No-op if already running. */
  start: () => void
  /** Request pause at the next safe point. */
  pause: () => void
  /** Request cancellation. */
  cancel: () => void
  /** Reset to idle state, discarding the current session. */
  reset: () => void
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: LapicSolveState = {
  status: 'idle',
  progress: undefined,
  error: undefined,
  outcome: undefined,
  sessionId: undefined,
  diagnostics: [],
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

/**
 * React hook for managing a lapic solve orchestration.
 *
 * @param config - Orchestration config, or `null` to defer creation.
 *   When config changes identity, the hook resets automatically.
 * @returns A tuple of `[state, controls]`.
 */
export function useLapicSolve(
  config: GiLapicSolveOrchestrationConfig | null
): [LapicSolveState, LapicSolveControls] {
  const [state, setState] = useState<LapicSolveState>(INITIAL_STATE)

  // Ref to the current orchestration (not in state to avoid re-render cycles)
  const orchestrationRef = useRef<GiLapicSolveOrchestration | null>(null)
  // Ref to subscription tokens for cleanup
  const subscriptionsRef = useRef<LapicSubscriptionToken[]>([])
  // Ref to track if the component is mounted
  const mountedRef = useRef(true)

  // Reset when config identity changes
  const configRef = useRef(config)
  if (config !== configRef.current) {
    configRef.current = config
    // Only reset if we're idle — if running, the user must explicitly reset
    if (state.status === 'idle') {
      orchestrationRef.current = null
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Unsubscribe all
      for (const token of subscriptionsRef.current) {
        token.unsubscribe()
      }
      subscriptionsRef.current = []
    }
  }, [])

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------

  const start = useCallback(() => {
    if (!config) return
    if (orchestrationRef.current) return // Already started

    const orch = createGiLapicSolveOrchestration(config)
    orchestrationRef.current = orch

    // Subscribe to progress events
    const progressToken = orch.handle.subscribeProgress((event) => {
      if (!mountedRef.current) return
      setState((prev) => ({ ...prev, progress: event }))
    })

    // Subscribe to diagnostics
    const diagToken = orch.handle.subscribeDiagnostics((event) => {
      if (!mountedRef.current) return
      setState((prev) => ({
        ...prev,
        diagnostics: [...prev.diagnostics, event],
      }))
    })

    subscriptionsRef.current = [progressToken, diagToken]

    // Update state to running
    setState((prev) => ({
      ...prev,
      status: 'running',
      sessionId: orch.sessionId,
      progress: undefined,
      error: undefined,
      outcome: undefined,
      diagnostics: [],
    }))

    // Start the solve (fire-and-forget, outcome handled via promise)
    orch.start().then(
      (outcome) => {
        if (!mountedRef.current) return
        setState((prev) => ({
          ...prev,
          status: outcome.state as LapicSolveStatus,
          outcome,
          error: outcome.error,
        }))
      },
      (err) => {
        if (!mountedRef.current) return
        setState((prev) => ({
          ...prev,
          status: 'failed',
          error: err instanceof Error ? err : new Error(String(err)),
        }))
      }
    )
  }, [config])

  const pause = useCallback(() => {
    const orch = orchestrationRef.current
    if (!orch || state.status !== 'running') return

    orch.handle.requestPause().catch(() => {
      // Pause request may fail if solve is already completing
    })
  }, [state.status])

  const cancel = useCallback(() => {
    const orch = orchestrationRef.current
    if (!orch || state.status !== 'running') return

    orch.handle.requestCancel().catch(() => {
      // Cancel request may fail if solve is already completing
    })
  }, [state.status])

  const reset = useCallback(() => {
    // Unsubscribe current
    for (const token of subscriptionsRef.current) {
      token.unsubscribe()
    }
    subscriptionsRef.current = []
    orchestrationRef.current = null
    setState(INITIAL_STATE)
  }, [])

  return [state, { start, pause, cancel, reset }]
}
