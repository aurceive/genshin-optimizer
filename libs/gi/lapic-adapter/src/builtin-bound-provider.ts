/**
 * Built-in FIR-bound provider for the GI adapter.
 *
 * Composes the F-IR compilation, domain variable mapping,
 * and interval-based upper-bound provider into a single
 * ready-to-use factory. When the GI adapter has a compiled
 * F-IR graph and knows how to extract per-candidate variable
 * values, this factory produces an admissible upper-bound
 * evaluator that the executor uses for branch-and-bound pruning.
 */

import type { LapicFirGraph } from '@genshin-optimizer/lapic/core'
import {
  type LapicBoundedExactUpperBoundEvaluator,
  createLapicFirBoundProvider,
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
}

/**
 * Create a ready-to-use upper-bound evaluator from a GI adapter context.
 *
 * This composes:
 * 1. Domain variable map construction from canonical problem + extractor
 * 2. FIR interval-based bound provider from the runtime
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

  return createLapicFirBoundProvider({
    graph: config.firGraph,
    domainVariableMaps,
    ...(config.globalConstants !== undefined
      ? { globalConstants: config.globalConstants }
      : {}),
    ...(config.formatUpperBound !== undefined
      ? { formatUpperBound: config.formatUpperBound }
      : {}),
  })
}
