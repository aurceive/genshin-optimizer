/**
 * GI expected-value potential rerank evaluator factory.
 *
 * Creates a `LapicPotentialRerankEvaluator` that re-evaluates each
 * top-N combination through the F-IR graph with expected substat
 * values after full artifact upgrade.
 */

import {
  evaluateLapicFirScalar,
  type LapicPotentialRerankEvaluator,
  type LapicPotentialRerankEvaluation,
  type LapicRerankCandidateEntry,
} from '@genshin-optimizer/lapic/core'
import { buildExpectedValueEnv } from './expected-env'
import type { GiLapicExpectedValueRerankConfig } from './types'

const DEFAULT_FORMAT = (value: number): string =>
  value.toFixed(6).padStart(25, '0')

/**
 * Create a potential rerank evaluator using expected-value strategy.
 *
 * For each top-N entry, the evaluator:
 * 1. Builds an expected F-IR environment (current values + expected deltas)
 * 2. Evaluates the F-IR graph at that point → expected objective value
 * 3. Returns the expected value as a potential ordering key
 *
 * Cost: O(topN × |F-IR graph|) — one scalar evaluation per entry.
 */
export function createGiExpectedValueRerankEvaluator(
  config: GiLapicExpectedValueRerankConfig
): LapicPotentialRerankEvaluator {
  const {
    firGraph,
    artifactIndex,
    extractVariables,
    globalConstants,
    substatRollTiers,
  } = config
  const format = config.formatOrderingKey ?? DEFAULT_FORMAT

  return (
    entry: LapicRerankCandidateEntry
  ): LapicPotentialRerankEvaluation | undefined => {
    const env = buildExpectedValueEnv(
      entry.candidates,
      artifactIndex,
      extractVariables,
      substatRollTiers,
      globalConstants
    )

    const result = evaluateLapicFirScalar(firGraph, env)
    const expectedValue = result.rootValue

    if (!Number.isFinite(expectedValue)) return undefined

    return {
      potentialOrderingKey: [format(expectedValue)],
      potentialEvidenceDigest: `gi-expected-value:${expectedValue}`,
    }
  }
}
