import type {
  LapicCandidateDescriptor,
  LapicFirVariableId,
  LapicInterval,
} from '@genshin-optimizer/lapic/core'
import { lapicInterval, lapicIntervalPoint } from '@genshin-optimizer/lapic/core'
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
 */
export function precomputeDomainEnvelopes(
  domainVariableMaps: readonly LapicFirDomainVariableMap[]
): LapicFirDomainEnvelopes {
  const result = new Map<string, ReadonlyMap<LapicFirVariableId, LapicInterval>>()

  for (const dvm of domainVariableMaps) {
    const envelopes = new Map<LapicFirVariableId, LapicInterval>()
    for (const [, candidateVars] of dvm.candidateVariables) {
      for (const [varId, value] of candidateVars) {
        const existing = envelopes.get(varId)
        if (existing) {
          envelopes.set(
            varId,
            lapicInterval(
              Math.min(existing.lo, value),
              Math.max(existing.hi, value)
            )
          )
        } else {
          envelopes.set(varId, lapicIntervalPoint(value))
        }
      }
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

  // 1. Global constants as point intervals
  if (globalConstants) {
    for (const [varId, value] of globalConstants) {
      env.set(varId, lapicIntervalPoint(value))
    }
  }

  // 2. Collect assigned domain IDs
  const assignedDomainIds = new Set<string>()
  const domainMapById = new Map(
    domainVariableMaps.map((d) => [d.domainId, d])
  )

  // 3. Assigned candidates → point intervals
  for (const candidate of assignedCandidates) {
    assignedDomainIds.add(candidate.domainId)
    const dvm = domainMapById.get(candidate.domainId)
    if (!dvm) continue
    const vars = dvm.candidateVariables.get(candidate.candidateId)
    if (!vars) continue
    for (const [varId, value] of vars) {
      env.set(varId, lapicIntervalPoint(value))
    }
  }

  // 4. Unassigned domains → envelope intervals
  for (const dvm of domainVariableMaps) {
    if (assignedDomainIds.has(dvm.domainId)) continue
    const envelopes = domainEnvelopes.get(dvm.domainId)
    if (!envelopes) continue
    for (const [varId, iv] of envelopes) {
      env.set(varId, iv)
    }
  }

  return env
}
