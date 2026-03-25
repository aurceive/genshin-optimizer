import type {
  LapicCandidateDescriptor,
  LapicFirVariableId,
  LapicInterval,
} from '@genshin-optimizer/lapic/core'
import {
  lapicInterval,
  lapicIntervalAdd,
  lapicIntervalPoint,
} from '@genshin-optimizer/lapic/core'
import type { LapicFirDomainVariableMap } from './types'

/**
 * Pre-computed envelope intervals for each domain's variables.
 * The envelope for a variable is the [min, max] across all candidates
 * in the domain. This is computed once per provider and reused for
 * every bound evaluation.
 */
export type LapicFirDomainEnvelopes = ReadonlyMap<
  string,
  ReadonlyMap<LapicFirVariableId, LapicInterval>
>

/**
 * Pre-compute the per-domain variable envelopes.
 * For each domain, finds [min, max] of each variable across all candidates.
 *
 * Candidates that don't contribute a particular variable are treated as
 * contributing 0 for that variable. Without this zero-floor, the envelope's
 * lower bound is artificially inflated, causing the interval-arithmetic
 * bound evaluator to produce upper bounds that are too tight — which makes
 * B&B pruning over-aggressive and can cause the solver to miss the true
 * optimum.
 */
export function precomputeDomainEnvelopes(
  domainVariableMaps: readonly LapicFirDomainVariableMap[]
): LapicFirDomainEnvelopes {
  const result = new Map<
    string,
    ReadonlyMap<LapicFirVariableId, LapicInterval>
  >()

  for (const dvm of domainVariableMaps) {
    // Pass 1: collect all variable IDs across all candidates in this domain
    const allVarIds = new Set<LapicFirVariableId>()
    for (const [, candidateVars] of dvm.candidateVariables) {
      for (const [varId] of candidateVars) {
        allVarIds.add(varId)
      }
    }

    // Pass 2: compute envelopes, treating missing variables as 0
    const envelopes = new Map<LapicFirVariableId, LapicInterval>()
    for (const varId of allVarIds) {
      let lo = Infinity
      let hi = -Infinity
      for (const [, candidateVars] of dvm.candidateVariables) {
        const value = candidateVars.get(varId) ?? 0
        if (value < lo) lo = value
        if (value > hi) hi = value
      }
      envelopes.set(varId, lapicInterval(lo, hi))
    }

    result.set(dvm.domainId, envelopes)
  }

  return result
}

/**
 * Create an interval environment for F-IR evaluation from a partial
 * candidate assignment.
 *
 * - Assigned candidates → point intervals from their variable values
 * - Unassigned domains  → envelope intervals across all candidates
 * - Global constants    → point intervals
 *
 * Returns `undefined` if the environment cannot be constructed
 * (e.g., an assigned candidate's domain is missing from the maps).
 */
export function createLapicFirPartialIntervalEnv(
  assignedCandidates: readonly LapicCandidateDescriptor[],
  domainVariableMaps: readonly LapicFirDomainVariableMap[],
  domainEnvelopes: LapicFirDomainEnvelopes,
  globalConstants?: ReadonlyMap<LapicFirVariableId, number>
): Map<LapicFirVariableId, LapicInterval> {
  const env = new Map<LapicFirVariableId, LapicInterval>()
  const domainMapById = new Map(domainVariableMaps.map((d) => [d.domainId, d]))
  fillLapicFirPartialIntervalEnv(
    env,
    assignedCandidates,
    domainVariableMaps,
    domainMapById,
    domainEnvelopes,
    globalConstants
  )
  return env
}

/**
 * Fill an existing interval environment for F-IR evaluation.
 * Clears the map and fills it in-place — avoids per-call Map allocation
 * in hot paths (B&B bound evaluation).
 *
 * The F-IR graph has a single `read('dyn:atk_')` node per variable,
 * representing the aggregate value across all artifact slots.
 * `precompute()` sums per-slot contributions into this aggregate.
 * Therefore the interval environment must contain the SUM of all
 * per-domain contributions:
 *
 *   env[varId] = Σ_d contribution_d(varId)
 *
 * where each domain contributes either a point interval (assigned
 * candidate) or an envelope interval (unassigned domain).
 *
 * Using SET (overwrite) instead of ADD here produces inadmissible
 * bounds — the upper bound can fall below the true optimum, causing
 * the B&B solver to prune branches containing the optimal solution.
 */
export function fillLapicFirPartialIntervalEnv(
  env: Map<LapicFirVariableId, LapicInterval>,
  assignedCandidates: readonly LapicCandidateDescriptor[],
  domainVariableMaps: readonly LapicFirDomainVariableMap[],
  domainMapById: ReadonlyMap<string, LapicFirDomainVariableMap>,
  domainEnvelopes: LapicFirDomainEnvelopes,
  globalConstants?: ReadonlyMap<LapicFirVariableId, number>
): void {
  env.clear()

  // 1. Global constants as point intervals (base stats, folded constants)
  if (globalConstants) {
    for (const [varId, value] of globalConstants) {
      env.set(varId, lapicIntervalPoint(value))
    }
  }

  // 2. Build assigned-domain lookup
  const assignedMap = new Map<string, LapicCandidateDescriptor>()
  for (const candidate of assignedCandidates) {
    assignedMap.set(candidate.domainId, candidate)
  }

  // 3. Sum contributions from ALL domains via interval addition.
  //    Assigned → point interval from the chosen candidate's variables.
  //    Unassigned → envelope interval (min/max across all candidates).
  //    Variables the assigned candidate does not carry contribute 0
  //    implicitly (interval addition identity) and need not be added.
  for (const dvm of domainVariableMaps) {
    const assigned = assignedMap.get(dvm.domainId)

    if (assigned) {
      const vars = dvm.candidateVariables.get(assigned.candidateId)
      if (!vars) continue
      for (const [varId, value] of vars) {
        const prev = env.get(varId)
        env.set(
          varId,
          prev
            ? lapicIntervalAdd(prev, lapicIntervalPoint(value))
            : lapicIntervalPoint(value)
        )
      }
    } else {
      const envelopes = domainEnvelopes.get(dvm.domainId)
      if (!envelopes) continue
      for (const [varId, iv] of envelopes) {
        const prev = env.get(varId)
        env.set(varId, prev ? lapicIntervalAdd(prev, iv) : iv)
      }
    }
  }
}
