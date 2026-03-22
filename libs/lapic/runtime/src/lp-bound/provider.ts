/**
 * LP-based admissible upper-bound provider for branch-and-bound pruning.
 *
 * Follows the same pattern as the F-IR interval provider in `fir-bound/`:
 * 1. Pre-compute domain envelopes once (domains are fixed per solve)
 * 2. For each partial assignment, build an interval environment
 * 3. Compile the F-IR graph into a LapicLinearModel using those bounds
 * 4. Solve the LP via the injected provider
 * 5. Return the upper bound from the LP solution
 *
 * The LP model produces tighter bounds than interval arithmetic
 * because it captures inter-variable correlations through constraints,
 * whereas interval evaluation treats each subexpression independently.
 */

import {
  type LapicLpProvider,
  type LapicLpSolveResult,
  buildLinearModelFromFir,
} from '@genshin-optimizer/lapic/core'
import {
  createLapicFirPartialIntervalEnv,
  precomputeDomainEnvelopes,
} from '../fir-bound/env-factory'
import type { LapicBoundedExactUpperBoundEvaluator } from '../solve/types'
import type { LapicLpBoundProviderConfig } from './types'

/**
 * Compute a stable digest for an LP bound evaluation.
 *
 * Combines the model digest with the solve evidence digest
 * so that certificates can trace the LP invocation.
 */
function makeLpBoundEvidenceDigest(
  modelDigest: string,
  solveResult: LapicLpSolveResult
): string {
  return `lp-bound:${modelDigest}:${solveResult.evidenceDigest}`
}

/**
 * Compute a model digest from a prefix and the assigned candidates.
 *
 * Uses a deterministic encoding of the partial assignment to
 * distinguish LP models compiled for different subproblems.
 */
function makeModelDigest(
  prefix: string,
  assignedCandidates: readonly { domainId: string; candidateId: string }[]
): string {
  const parts = assignedCandidates
    .map((c) => `${c.domainId}=${c.candidateId}`)
    .join(',')
  return `${prefix}:partial[${parts}]`
}

/**
 * Create an admissible upper-bound evaluator from an F-IR graph,
 * per-domain variable mappings, and an LP solver provider.
 *
 * The returned callback:
 * 1. Builds an interval environment from the partial combination
 *    (point values for assigned candidates, envelopes for unassigned domains)
 * 2. Compiles an LP model via {@link buildLinearModelFromFir}
 * 3. Solves the LP via the injected {@link LapicLpProvider}
 * 4. Returns `objectiveValue` as the admissible upper bound
 *
 * Returns `undefined` when:
 * - The LP outcome is not `'solved'`
 * - The objective value is not finite
 * - The result is flagged as `numericallyQuestionable`
 */
export function createLapicLpBoundProvider(
  config: LapicLpBoundProviderConfig
): LapicBoundedExactUpperBoundEvaluator {
  const { graph, domainVariableMaps, globalConstants, lpProvider } = config
  const format = config.formatUpperBound ?? String
  const digestPrefix = config.modelDigestPrefix ?? 'lp-bound'

  // Pre-compute domain envelopes once (domains are fixed during a solve)
  const domainEnvelopes = precomputeDomainEnvelopes(domainVariableMaps)

  return (partial) => {
    // 1. Build interval environment from partial assignment
    const intervalEnv = createLapicFirPartialIntervalEnv(
      partial.assignedCandidates,
      domainVariableMaps,
      domainEnvelopes,
      globalConstants
    )

    // 2. Compile F-IR → LinearModel with current variable bounds
    const modelDigest = makeModelDigest(
      digestPrefix,
      partial.assignedCandidates
    )
    const { model } = buildLinearModelFromFir(graph, intervalEnv, modelDigest)

    // 3. Solve LP
    const solveResult = lpProvider.solve(model)

    // 4. Interpret result
    if (solveResult.outcome !== 'solved') return undefined
    if (solveResult.numericallyQuestionable) return undefined
    if (solveResult.objectiveValue === undefined) return undefined

    const boundValue = Number(solveResult.objectiveValue)
    if (!Number.isFinite(boundValue)) return undefined

    return {
      upperBoundValue: format(boundValue),
      evidenceDigest: makeLpBoundEvidenceDigest(modelDigest, solveResult),
    }
  }
}

/**
 * Extract the LP provider from a bound provider config.
 * Useful for serializing evidence post-solve.
 */
export function getLpProviderFromConfig(
  config: LapicLpBoundProviderConfig
): LapicLpProvider {
  return config.lpProvider
}
