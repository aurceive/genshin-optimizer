/**
 * Engine selection infrastructure for switching between legacy and lapic solvers.
 *
 * Provides React context for engine preference that the optimization UI reads
 * to determine which solver pipeline to use.
 *
 * The preference is a controlled value — the host page manages persistence
 * (e.g., in database settings or localStorage) and passes the current value
 * via `LapicEngineProvider`.
 */

import { type ReactNode, createContext, useContext, useMemo } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Which optimization engine to use.
 *
 * - `'legacy'` — the existing `GOSolver` pipeline.
 * - `'lapic'`  — the new lapic orchestrator pipeline.
 */
export type LapicEngineKind = 'legacy' | 'lapic'

/**
 * Context value exposed to consumers.
 */
export interface LapicEngineContextValue {
  /** Currently selected engine. */
  readonly engine: LapicEngineKind
  /** Toggle or set engine preference. */
  readonly setEngine: (engine: LapicEngineKind) => void
  /** Whether the lapic engine is available (feature gate). */
  readonly lapicAvailable: boolean
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DEFAULT_CONTEXT: LapicEngineContextValue = {
  engine: 'legacy',
  setEngine: () => {},
  lapicAvailable: false,
}

const LapicEngineContext =
  createContext<LapicEngineContextValue>(DEFAULT_CONTEXT)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface LapicEngineProviderProps {
  /** Current engine preference (controlled). */
  readonly engine: LapicEngineKind
  /** Callback when user changes engine selection. */
  readonly onEngineChange: (engine: LapicEngineKind) => void
  /** Whether the lapic engine is available in this environment. Defaults to `true`. */
  readonly lapicAvailable?: boolean
  readonly children: ReactNode
}

/**
 * Provides engine selection context to the component tree.
 *
 * ```tsx
 * <LapicEngineProvider engine={pref} onEngineChange={setPref}>
 *   <OptimizationPage />
 * </LapicEngineProvider>
 * ```
 */
export function LapicEngineProvider({
  engine,
  onEngineChange,
  lapicAvailable = true,
  children,
}: LapicEngineProviderProps) {
  const value = useMemo<LapicEngineContextValue>(
    () => ({
      engine,
      setEngine: onEngineChange,
      lapicAvailable,
    }),
    [engine, onEngineChange, lapicAvailable]
  )

  return (
    <LapicEngineContext.Provider value={value}>
      {children}
    </LapicEngineContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Read the current engine preference from context.
 *
 * Falls back to `{ engine: 'legacy', lapicAvailable: false }` when used
 * outside a `LapicEngineProvider`.
 */
export function useLapicEnginePreference(): LapicEngineContextValue {
  return useContext(LapicEngineContext)
}
