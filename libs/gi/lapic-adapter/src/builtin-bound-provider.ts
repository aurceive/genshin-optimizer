/**
 * Built-in bound provider for the GI adapter.
 *
 * Composes the F-IR compilation, domain variable mapping,
 * and admissible upper-bound providers into a single
 * ready-to-use factory.
 *
 * When only a FIR graph is available, produces interval-arithmetic
 * bounds.  When an LP provider is also supplied, composes a cascade
 * that tries intervals first and falls back to LP for tighter bounds.
 */

import type {
  LapicFirGraph,
  LapicLpProvider,
} from '@genshin-optimizer/lapic/core'
import {
  type LapicBoundedExactUpperBoundEvaluator,
  type LapicCascadeBoundEvaluator,
  createLapicFirBoundProvider,
  createLapicIntervalThenLpCascade,
  createLapicLpBoundProvider,
} from '@genshin-optimizer/lapic/runtime'
import type { GiLapicCandidateVariableExtractor } from './bound-maps'
import { buildGiLapicDomainVariableMaps } from './bound-maps'
import type { GiLapicCanonicalExport } from './types'

/**
 * Configuration for creating a GI adapter built-in bound provider.
 */
export interface GiLapicBuiltinBoundProviderConfig {
  /** The compiled F-IR graph for the optimization target. */
  readonly firGraph: LapicFirGraph
  /** The canonical export (provides item domains). */
  readonly canonicalExport: GiLapicCanonicalExport
  /** Extracts F-IR variable values from a candidate. */
  readonly extractVariables: GiLapicCandidateVariableExtractor
  /** Global constants not tied to any domain (e.g., base character stats). */
  readonly globalConstants?: ReadonlyMap<string, number>
  /** Converts a numeric upper bound to a string for ordering comparison. */
  readonly formatUpperBound?: (value: number) => string
  /**
   * Optional LP solver provider. When supplied, the returned evaluator
   * uses a cascade: interval-arithmetic bounds first, LP bounds as
   * fallback for tighter pruning.
   */
  readonly lpProvider?: LapicLpProvider
}

/**
 * Create a ready-to-use upper-bound evaluator from a GI adapter context.
 *
 * This composes:
 * 1. Domain variable map construction from canonical problem + extractor
 * 2. FIR interval-based bound provider from the runtime
 * 3. (Optional) LP-based bound provider cascaded behind intervals
 *
 * When `lpProvider` is supplied, the cascade tries interval bounds first
 * and falls back to LP for cases where intervals are too loose (D-002).
 *
 * Returns the evaluator callback, or `undefined` if the domain maps are empty.
 */
export function createGiLapicBuiltinBoundProvider(
  config: GiLapicBuiltinBoundProviderConfig
): LapicBoundedExactUpperBoundEvaluator | undefined {
  const domainVariableMaps = buildGiLapicDomainVariableMaps(
    config.canonicalExport.problem.itemDomains,
    config.extractVariables
  )

  if (domainVariableMaps.length === 0) return undefined

  const intervalProvider = createLapicFirBoundProvider({
    graph: config.firGraph,
    domainVariableMaps,
    ...(config.globalConstants !== undefined
      ? { globalConstants: config.globalConstants }
      : {}),
    ...(config.formatUpperBound !== undefined
      ? { formatUpperBound: config.formatUpperBound }
      : {}),
  })

  if (!config.lpProvider) return intervalProvider

  const lpBoundProvider = createLapicLpBoundProvider({
    graph: config.firGraph,
    domainVariableMaps,
    ...(config.globalConstants !== undefined
      ? { globalConstants: config.globalConstants }
      : {}),
    ...(config.formatUpperBound !== undefined
      ? { formatUpperBound: config.formatUpperBound }
      : {}),
    lpProvider: config.lpProvider,
  })

  // The evaluators have `problem: LapicCanonicalProblem` but the cascade
  // signature uses `problem: unknown` for generality.  The cast is safe
  // because the cascade is always invoked within a typed solve context.
  return createLapicIntervalThenLpCascade(
    intervalProvider as LapicCascadeBoundEvaluator,
    lpBoundProvider as LapicCascadeBoundEvaluator
  )
}
