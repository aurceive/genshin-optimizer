import {
  createLapicFirCachedIntervalEvaluator,
  lapicIntervalIsEmpty,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicFirVariableId,
  LapicInterval,
} from '@genshin-optimizer/lapic/core'
import type { LapicBoundedExactUpperBoundEvaluator } from '../solve/types'
import {
  fillLapicFirPartialIntervalEnv,
  precomputeDomainEnvelopes,
} from './env-factory'
import type { LapicFirBoundProviderConfig } from './types'

/**
 * Create an admissible upper-bound evaluator from an F-IR graph
 * and per-domain variable mappings.
 *
 * The returned callback:
 * 1. Fills an interval environment from the partial combination
 *    (point values for assigned candidates, envelopes for unassigned domains)
 * 2. Evaluates the F-IR graph with interval arithmetic
 * 3. Returns `rootBound.hi` as the admissible upper bound
 *
 * All internal state (topological order, bounds buffer, env Map,
 * domain lookup) is pre-allocated once and reused on every call.
 * This eliminates per-call allocations in the B&B hot loop.
 *
 * Returns `undefined` when the bound is empty or non-finite
 * (no useful pruning information).
 */
export function createLapicFirBoundProvider(
  config: LapicFirBoundProviderConfig
): LapicBoundedExactUpperBoundEvaluator {
  const { graph, domainVariableMaps, globalConstants } = config
  const format = config.formatUpperBound ?? String

  // Pre-compute once at creation — reused for every bound evaluation
  const domainEnvelopes = precomputeDomainEnvelopes(domainVariableMaps)
  const cachedEval = createLapicFirCachedIntervalEvaluator(graph)
  const domainMapById = new Map(domainVariableMaps.map((d) => [d.domainId, d]))
  const env = new Map<LapicFirVariableId, LapicInterval>()

  return (partial) => {
    // Fill env in-place (clear + refill, no new Map)
    fillLapicFirPartialIntervalEnv(
      env,
      partial.assignedCandidates,
      domainVariableMaps,
      domainMapById,
      domainEnvelopes,
      globalConstants
    )

    // Evaluate using cached evaluator (no DFS, no bounds Map allocation)
    const rootBound = cachedEval(env)

    if (lapicIntervalIsEmpty(rootBound)) return undefined
    if (!Number.isFinite(rootBound.hi)) return undefined

    return {
      upperBoundValue: format(rootBound.hi),
      evidenceDigest: `fir-interval-bound:${rootBound.lo}:${rootBound.hi}`,
    }
  }
}
