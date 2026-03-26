/**
 * Types for GI-specific expected-value potential reranking.
 *
 * The expected-value strategy re-evaluates each top-N combination
 * through the same F-IR graph but with substat values replaced by
 * their expected values after full artifact upgrade.
 */

import type { ICachedArtifact } from '@genshin-optimizer/gi/db'
import type {
  LapicFirGraph,
  LapicFirVariableId,
} from '@genshin-optimizer/lapic/core'
import type { GiLapicCandidateVariableExtractor } from '../bound-maps'

/**
 * Substat roll tier data indexed by rarity and substat key.
 * Each entry is an array of possible per-roll values.
 * Typically sourced from `allStats.art.sub`.
 */
export type GiLapicSubstatRollTierData = {
  readonly [rarity: number]: {
    readonly [substatKey: string]: readonly number[]
  }
}

/**
 * Configuration for creating a GI expected-value rerank evaluator.
 */
export interface GiLapicExpectedValueRerankConfig {
  /** Compiled F-IR graph for the optimization target. */
  readonly firGraph: LapicFirGraph
  /** Lookup from candidateId (= artifact.id) to cached artifact data. */
  readonly artifactIndex: ReadonlyMap<string, ICachedArtifact>
  /** Extracts current F-IR variable values for a candidate. */
  readonly extractVariables: GiLapicCandidateVariableExtractor
  /** Non-candidate global constants (e.g., character base stats). */
  readonly globalConstants?: ReadonlyMap<LapicFirVariableId, number>
  /** Roll tier values per rarity/substat. Typically `allStats.art.sub`. */
  readonly substatRollTiers: GiLapicSubstatRollTierData
  /**
   * Format a numeric objective value as a lexicographic ordering key.
   * Must produce strings that sort correctly via `localeCompare` for
   * higher-is-better semantics.
   * Defaults to zero-padded fixed-point: `value.toFixed(6).padStart(25, '0')`.
   */
  readonly formatOrderingKey?: (value: number) => string
}
