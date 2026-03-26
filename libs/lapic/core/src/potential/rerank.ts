/**
 * Post-solve potential-aware reranking (§4.3: potential-aware-rerank).
 *
 * Primary solve is driven by current-value ranking.  After solving,
 * the top-N entries are reranked using a potential summary evaluator.
 *
 * The reranking is deterministic: entries with equal potential ordering
 * keys preserve their current-value relative order.
 */

import type { LapicDeterministicOrderingRelation } from '../identity'
import type {
  LapicPotentialRerankEvaluator,
  LapicRerankCandidateEntry,
  LapicRerankSummary,
  LapicRerankedCandidateEntry,
} from './types'

/**
 * Reranks the top-N entries using a potential evaluator.
 *
 * Entries that the evaluator cannot assess (`undefined`) keep their
 * current-value position relative to each other and are sorted after
 * all evaluated entries.
 *
 * @returns The reranked entries (best-first) and a summary.
 */
export function rerankByPotential(
  entries: readonly LapicRerankCandidateEntry[],
  evaluator: LapicPotentialRerankEvaluator
): {
  reranked: readonly LapicRerankedCandidateEntry[]
  summary: LapicRerankSummary
} {
  const evaluated: LapicRerankedCandidateEntry[] = entries.map((entry) => {
    const result = evaluator(entry)
    if (result) {
      return {
        ...entry,
        potentialOrderingKey: result.potentialOrderingKey,
        potentialEvidenceDigest: result.potentialEvidenceDigest,
      }
    }
    return entry
  })

  const evaluatedCount = evaluated.filter(
    (e) => e.potentialOrderingKey !== undefined
  ).length

  // Stable sort: entries with potential keys sort by potential key,
  // entries without keep their relative current-value order.
  const indexed = evaluated.map((entry, index) => ({ entry, index }))
  indexed.sort((a, b) => {
    const cmp = compareRerankedEntries(a.entry, b.entry)
    if (cmp !== 0) return -cmp // descending: higher key = better
    return a.index - b.index // stable: original order
  })

  const reranked = indexed.map((item) => item.entry)

  // Count how many positions changed
  let reorderedCount = 0
  for (let i = 0; i < reranked.length; i++) {
    if (reranked[i] !== evaluated[i]) reorderedCount++
  }

  return {
    reranked,
    summary: {
      totalEntries: entries.length,
      evaluatedEntries: evaluatedCount,
      reorderedCount,
    },
  }
}

/**
 * Compare two reranked entries by potential ordering key.
 * Falls back to current-value ordering key when potential is absent.
 */
function compareRerankedEntries(
  left: LapicRerankedCandidateEntry,
  right: LapicRerankedCandidateEntry
): LapicDeterministicOrderingRelation {
  const leftKey = left.potentialOrderingKey ??
    left.evaluation.orderingKey ?? [left.evaluation.objectiveValue]
  const rightKey = right.potentialOrderingKey ??
    right.evaluation.orderingKey ?? [right.evaluation.objectiveValue]

  return compareStringArrays(leftKey, rightKey)
}

function compareStringArrays(
  left: readonly string[],
  right: readonly string[]
): LapicDeterministicOrderingRelation {
  const sharedLength = Math.min(left.length, right.length)
  for (let i = 0; i < sharedLength; i++) {
    const cmp = left[i]!.localeCompare(right[i]!)
    if (cmp < 0) return -1
    if (cmp > 0) return 1
  }
  if (left.length < right.length) return -1
  if (left.length > right.length) return 1
  return 0
}
