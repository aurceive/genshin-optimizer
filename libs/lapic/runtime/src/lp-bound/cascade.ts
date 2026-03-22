/**
 * Cascade bound provider that composes two bound evaluators.
 *
 * Typical use case: interval-based bounds (fast) as primary,
 * LP-based bounds (tighter but slower) as secondary.
 *
 * Two strategies are supported:
 * - `'fallback'`: Use primary; invoke secondary only when primary
 *   returns no useful bound.
 * - `'tightest'`: Always invoke both; return whichever bound is tighter.
 */

import type { LapicBoundedExactUpperBoundEvaluator } from '../solve/types'
import type {
  LapicCascadeBoundEvaluator,
  LapicCascadeBoundProviderConfig,
} from './types'

/**
 * Create a cascade bound evaluator that composes primary and
 * secondary evaluators according to the configured strategy.
 *
 * Returns `undefined` only when neither evaluator produces a bound.
 */
export function createLapicCascadeBoundProvider(
  config: LapicCascadeBoundProviderConfig
): LapicBoundedExactUpperBoundEvaluator {
  const { primary, secondary } = config
  const strategy = config.strategy ?? 'fallback'

  if (strategy === 'fallback') {
    return (partial) => {
      const primaryResult = primary(partial)
      if (primaryResult !== undefined) return primaryResult
      return secondary(partial)
    }
  }

  // strategy === 'tightest'
  return (partial) => {
    const primaryResult = primary(partial)
    const secondaryResult = secondary(partial)

    if (primaryResult === undefined) return secondaryResult
    if (secondaryResult === undefined) return primaryResult

    const pv = Number(primaryResult.upperBoundValue)
    const sv = Number(secondaryResult.upperBoundValue)

    // Return the tighter (smaller) upper bound
    if (Number.isFinite(pv) && Number.isFinite(sv)) {
      return sv < pv ? secondaryResult : primaryResult
    }
    // If one is non-finite, prefer the finite one
    if (Number.isFinite(sv)) return secondaryResult
    return primaryResult
  }
}

/**
 * Create a cascade that tries interval bounds first and falls
 * back to LP bounds when interval returns no useful bound.
 *
 * This is the recommended default cascade for production use.
 */
export function createLapicIntervalThenLpCascade(
  intervalProvider: LapicCascadeBoundEvaluator,
  lpProvider: LapicCascadeBoundEvaluator
): LapicBoundedExactUpperBoundEvaluator {
  return createLapicCascadeBoundProvider({
    primary: intervalProvider,
    secondary: lpProvider,
    strategy: 'fallback',
  })
}
