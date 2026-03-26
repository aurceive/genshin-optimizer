/**
 * Expected-value F-IR environment builder.
 *
 * For each artifact in a combination, computes:
 *   E[substat_i] = current_i + remainingRolls × (1/numSubstats) × avgRollValue_i
 *
 * Then sums all candidate contributions + global constants into a single
 * F-IR scalar environment suitable for `evaluateLapicFirScalar()`.
 */

import type { ICachedArtifact } from '@genshin-optimizer/gi/db'
import { getRollsRemaining } from '@genshin-optimizer/gi/util'
import type {
  LapicCandidateDescriptor,
  LapicFirVariableId,
} from '@genshin-optimizer/lapic/core'
import type { GiLapicCandidateVariableExtractor } from '../bound-maps'
import type { GiLapicSubstatRollTierData } from './types'

/**
 * Build an expected-value F-IR scalar environment for a candidate combination.
 *
 * The environment is: globalConstants + Σ(currentVars_i + expectedDelta_i)
 * for each candidate artifact i in the combination.
 */
export function buildExpectedValueEnv(
  candidates: readonly LapicCandidateDescriptor[],
  artifactIndex: ReadonlyMap<string, ICachedArtifact>,
  extractVariables: GiLapicCandidateVariableExtractor,
  substatRollTiers: GiLapicSubstatRollTierData,
  globalConstants?: ReadonlyMap<LapicFirVariableId, number>
): Map<LapicFirVariableId, number> {
  const env = new Map<LapicFirVariableId, number>()

  if (globalConstants) {
    for (const [varId, value] of globalConstants) {
      env.set(varId, value)
    }
  }

  for (const candidate of candidates) {
    // Sum current F-IR variable values from the extractor
    const currentVars = extractVariables(
      candidate.candidateId,
      candidate.domainId
    )
    for (const [varId, value] of currentVars) {
      env.set(varId, (env.get(varId) ?? 0) + value)
    }

    // Add expected additional substat contributions from remaining upgrades
    const artifact = artifactIndex.get(candidate.candidateId)
    if (!artifact) continue

    const delta = computeExpectedSubstatDelta(artifact, substatRollTiers)
    for (const [varId, value] of delta) {
      env.set(varId, (env.get(varId) ?? 0) + value)
    }
  }

  return env
}

/**
 * Compute expected additional F-IR variable contributions from remaining
 * substat upgrade rolls on a single artifact.
 *
 * Formula per existing substat i:
 *   delta_i = remainingRolls × (1 / numSubstats) × mean(rollTiers_i)
 *
 * Fully-upgraded artifacts (remaining rolls = 0) return an empty map.
 */
export function computeExpectedSubstatDelta(
  artifact: ICachedArtifact,
  substatRollTiers: GiLapicSubstatRollTierData
): ReadonlyMap<LapicFirVariableId, number> {
  const result = new Map<LapicFirVariableId, number>()

  const remaining = getRollsRemaining(artifact.level, artifact.rarity)
  if (remaining <= 0) return result

  const activeSubstats = artifact.substats.filter((s) => s.key !== '')
  const numSubstats = activeSubstats.length
  if (numSubstats === 0) return result

  const rollShare = 1 / numSubstats

  for (const sub of activeSubstats) {
    const tiers = substatRollTiers[artifact.rarity]?.[sub.key]
    if (!tiers || tiers.length === 0) continue

    const avgRollValue = tiers.reduce((a, b) => a + b, 0) / tiers.length
    const expectedDelta = remaining * rollShare * avgRollValue

    result.set(`dyn:${sub.key}`, expectedDelta)
  }

  return result
}
