/**
 * Helpers for constructing FIR-bound domain variable maps
 * from GI canonical problem domains.
 *
 * These maps are required by `createLapicFirBoundProvider` to
 * build interval environments for admissible upper-bound computation.
 */

import type {
  LapicCandidateDomain,
  LapicFirVariableId,
} from '@genshin-optimizer/lapic/core'
import type { LapicFirDomainVariableMap } from '@genshin-optimizer/lapic/runtime'

/**
 * Extracts numeric variable values from a candidate.
 *
 * The extractor is called once per candidate per domain and must
 * return a map of F-IR variable IDs to their numeric values.
 * Variable IDs should match the `variableMapping` produced by
 * `compileGiOptNodeToFir`.
 */
export type GiLapicCandidateVariableExtractor = (
  candidateId: string,
  domainId: string
) => ReadonlyMap<LapicFirVariableId, number>

/**
 * Build `LapicFirDomainVariableMap[]` from the canonical problem's
 * item domains using a caller-supplied variable extractor.
 *
 * The extractor maps each candidate to its F-IR variable values
 * (stat contributions). This decouples the bound-provider wiring
 * from the specific GI stat evaluation pipeline.
 */
export function buildGiLapicDomainVariableMaps(
  itemDomains: readonly LapicCandidateDomain[],
  extractVariables: GiLapicCandidateVariableExtractor
): LapicFirDomainVariableMap[] {
  return itemDomains.map((domain) => ({
    domainId: domain.domainId,
    candidateVariables: new Map(
      domain.candidates.map((candidate) => [
        candidate.candidateId,
        extractVariables(candidate.candidateId, domain.domainId),
      ])
    ),
  }))
}
