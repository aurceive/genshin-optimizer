/**
 * localStorage-backed engine preference for use as the controlled
 * value source for `LapicEngineProvider`.
 *
 * Reads/writes `'gi-optimizer-engine'` in localStorage. Falls back
 * to `'legacy'` when localStorage is unavailable (e.g., private browsing).
 */

import { useCallback, useState } from 'react'
import type { LapicEngineKind } from './useLapicEnginePreference'

const STORAGE_KEY = 'gi-optimizer-engine'

function readStoredEngine(): LapicEngineKind {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'lapic' ? 'lapic' : 'legacy'
  } catch {
    return 'legacy'
  }
}

/**
 * Provides a `[engine, setEngine]` tuple backed by localStorage.
 *
 * ```tsx
 * const [engine, setEngine] = useLocalStorageEnginePreference()
 * return (
 *   <LapicEngineProvider engine={engine} onEngineChange={setEngine}>
 *     ...
 *   </LapicEngineProvider>
 * )
 * ```
 */
export function useLocalStorageEnginePreference(): [
  LapicEngineKind,
  (engine: LapicEngineKind) => void,
] {
  const [engine, setEngineState] = useState<LapicEngineKind>(readStoredEngine)

  const setEngine = useCallback((next: LapicEngineKind) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore localStorage errors (e.g. private browsing)
    }
    setEngineState(next)
  }, [])

  return [engine, setEngine]
}
