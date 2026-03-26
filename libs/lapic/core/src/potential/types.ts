/**
 * Potential-aware ranking types (§11 / potential-aware-optimization.md).
 *
 * These types define the callback surface for potential-aware reranking.
 * The actual potential summary computation is adapter-specific; lapic
 * core provides the reranking machinery that consumes it.
 */

import type {
  LapicDeterministicOrderingRelation,
  LapicDigest,
} from '../identity'
import type { LapicCandidateDescriptor } from '../types'

/**
 * A candidate entry eligible for potential-aware reranking.
 * Mirrors the solve tracker's best-candidate shape extended with
 * the current-value evaluation.
 */
export interface LapicRerankCandidateEntry {
  readonly stateId: string
  readonly candidates: readonly LapicCandidateDescriptor[]
  readonly evaluation: {
    readonly objectiveValue: string
    readonly evidenceDigest: LapicDigest
    readonly orderingKey?: readonly string[]
  }
}

/**
 * Result of evaluating a candidate's potential-adjusted ordering key.
 *
 * The `potentialOrderingKey` is a lexicographic string tuple that
 * replaces or extends the current-value ordering key during reranking.
 * Higher keys rank higher (same convention as current-value ordering).
 */
export interface LapicPotentialRerankEvaluation {
  readonly potentialOrderingKey: readonly string[]
  readonly potentialEvidenceDigest: LapicDigest
}

/**
 * Callback that computes a potential-adjusted ordering key for a
 * candidate combination.  Called once per top-N entry during the
 * post-solve reranking phase.
 *
 * The evaluator receives the full candidate set and current-value
 * evaluation.  It must return a deterministic ordering key that
 * incorporates potential information (e.g., upgrade path value).
 *
 * Returns `undefined` when no potential evaluation is available for
 * this candidate — the entry keeps its current-value ordering position.
 */
export type LapicPotentialRerankEvaluator = (
  entry: LapicRerankCandidateEntry
) => LapicPotentialRerankEvaluation | undefined

/**
 * A reranked top-N entry.  Carries both current-value and potential
 * ordering information.
 */
export interface LapicRerankedCandidateEntry extends LapicRerankCandidateEntry {
  readonly potentialOrderingKey?: readonly string[]
  readonly potentialEvidenceDigest?: LapicDigest
}

/**
 * Summary of a reranking operation.
 */
export interface LapicRerankSummary {
  readonly totalEntries: number
  readonly evaluatedEntries: number
  readonly reorderedCount: number
}

/**
 * Comparison function for reranked entries.
 * Compares by `potentialOrderingKey` when both are present,
 * falls back to current-value ordering.
 */
export type LapicRerankComparator = (
  left: LapicRerankedCandidateEntry,
  right: LapicRerankedCandidateEntry
) => LapicDeterministicOrderingRelation
