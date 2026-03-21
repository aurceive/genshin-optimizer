import {
  evaluateLapicFirIntervals,
  lapicIntervalIsEmpty,
} from '@genshin-optimizer/lapic/core'
import type { LapicBoundedExactUpperBoundEvaluator } from '../solve/types'
import { createLapicFirPartialIntervalEnv, precomputeDomainEnvelopes } from './env-factory'
import type { LapicFirBoundProviderConfig } from './types'

/**
 * Create an admissible upper-bound evaluator from an F-IR graph
 * and per-domain variable mappings.
 *
 * The returned callback:
 * 1. Builds an interval environment from the partial combination
 *    (point values for assigned candidates, envelopes for unassigned domains)
 * 2. Evaluates the F-IR graph with interval arithmetic
 * 3. Returns `rootBound.hi` as the admissible upper bound
 *
 * Returns `undefined` when the bound is empty or non-finite
 * (no useful pruning information).
 */
export function createLapicFirBoundProvider(
  config: LapicFirBoundProviderConfig
): LapicBoundedExactUpperBoundEvaluator {
  const { graph, domainVariableMaps, globalConstants } = config
  const format = config.formatUpperBound ?? String

  // Pre-compute domain envelopes once (domains are fixed during a solve)
  const domainEnvelopes = precomputeDomainEnvelopes(domainVariableMaps)

  return (partial) => {
    const env = createLapicFirPartialIntervalEnv(
      partial.assignedCandidates,
      domainVariableMaps,
      domainEnvelopes,
      globalConstants
    )

    const result = evaluateLapicFirIntervals(graph, env)

    if (lapicIntervalIsEmpty(result.rootBound)) return undefined
    if (!Number.isFinite(result.rootBound.hi)) return undefined

    return {
      upperBoundValue: format(result.rootBound.hi),
      evidenceDigest: `fir-interval-bound:${result.rootBound.lo}:${result.rootBound.hi}`,
    }
  }
}
