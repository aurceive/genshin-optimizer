/**
 * Runtime Join Executor (§5.3–5.4)
 *
 * Orchestrates the multi-slot join phase: enumerates cross-slot combinations,
 * applies legality filtering via {@link checkJoinLegality}, evaluates a
 * team-level objective, and produces a ranked top-N result set.
 *
 * The executor is designed to be called *after* per-slot frontier building
 * has produced a join plan.  It bridges the per-slot solve results into
 * full team compositions.
 */

import type {
  LapicCandidateDescriptor,
  LapicCompatibilitySignature,
} from '@genshin-optimizer/lapic/core'
import {
  type LapicTeamResultEntry,
  sortTeamResults,
} from '@genshin-optimizer/lapic/core'
import {
  checkJoinLegality,
  mergeCompatibilitySignatures,
} from './join-legality'
import type {
  LapicFrontierJoinPlan,
  LapicFrontierJoinPlanRow,
} from './join-plan'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Evaluator that computes a team-level objective value for a complete
 * combination of candidates (one per slot).
 */
export type LapicTeamObjectiveEvaluator = (
  candidates: readonly LapicCandidateDescriptor[]
) => LapicTeamCombinationEvaluation | undefined

/** Result of evaluating a single team combination. */
export interface LapicTeamCombinationEvaluation {
  readonly objectiveValue: number
  readonly secondaryObjectiveValues?: readonly number[]
}

/** A single team result from the join executor. */
export interface LapicJoinResult extends LapicTeamResultEntry {
  readonly candidates: readonly LapicCandidateDescriptor[]
}

/** Configuration for the join executor. */
export interface LapicJoinExecutorOptions {
  /** The join plan produced by `createFrontierJoinPlan`. */
  readonly joinPlan: LapicFrontierJoinPlan
  /** Team-level objective evaluator. */
  readonly evaluateTeam: LapicTeamObjectiveEvaluator
  /** How many top results to keep. */
  readonly topN: number
  /**
   * Compatibility signature extractor for a single candidate row.
   * Needed for cross-slot legality checks.  If not provided, legality
   * filtering is skipped (all combinations treated as legal).
   */
  readonly getCompatibilitySignature?: (
    row: LapicFrontierJoinPlanRow
  ) => LapicCompatibilitySignature
  /** Optional progress callback. Called after each complete combination. */
  readonly onProgress?: (stats: LapicJoinExecutorStats) => void
}

/** Statistics reported during join execution. */
export interface LapicJoinExecutorStats {
  readonly totalCombinationsExplored: number
  readonly legalCombinations: number
  readonly illegalCombinations: number
  readonly evaluationFailures: number
}

/** Final result from the join executor. */
export interface LapicJoinExecutorResult {
  readonly results: readonly LapicJoinResult[]
  readonly stats: LapicJoinExecutorStats
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Execute the multi-slot join phase.
 *
 * Enumerates cross-slot combinations from the join plan, applies legality
 * filtering, evaluates the team objective, and returns the top-N results
 * in descending quality order.
 */
export function executeJoinPhase(
  options: LapicJoinExecutorOptions
): LapicJoinExecutorResult {
  const {
    joinPlan,
    evaluateTeam,
    topN,
    getCompatibilitySignature,
    onProgress,
  } = options

  const entries = joinPlan.entries
  const slotCount = entries.length

  if (slotCount === 0) {
    return {
      results: [],
      stats: {
        totalCombinationsExplored: 0,
        legalCombinations: 0,
        illegalCombinations: 0,
        evaluationFailures: 0,
      },
    }
  }

  const stats = {
    totalCombinationsExplored: 0,
    legalCombinations: 0,
    illegalCombinations: 0,
    evaluationFailures: 0,
  }

  // Collect results, then sort and trim at the end
  const collectedResults: LapicJoinResult[] = []

  // Recursive enumeration with early legality pruning
  function visit(
    depth: number,
    partialRows: LapicFrontierJoinPlanRow[],
    partialSignature: LapicCompatibilitySignature | undefined
  ): void {
    if (depth === slotCount) {
      stats.totalCombinationsExplored++

      const candidates = partialRows.map((r) => r.candidate)
      const slotIds = entries.map((e) => e.slotId)

      const evaluation = evaluateTeam(candidates)
      if (!evaluation) {
        stats.evaluationFailures++
        return
      }

      stats.legalCombinations++

      collectedResults.push({
        objectiveValue: evaluation.objectiveValue,
        ...(evaluation.secondaryObjectiveValues !== undefined
          ? { secondaryObjectiveValues: evaluation.secondaryObjectiveValues }
          : {}),
        slotCandidateIds: candidates.map((c) => c.candidateId),
        slotIds,
        candidates,
      })

      if (onProgress) {
        onProgress({ ...stats })
      }
      return
    }

    const entry = entries[depth]

    for (const row of entry.rows) {
      // Legality check at intermediate depth
      if (getCompatibilitySignature && depth > 0) {
        const rowSig = getCompatibilitySignature(row)

        if (partialSignature) {
          const legality = checkJoinLegality(partialSignature, rowSig)
          if (!legality.legal) {
            stats.illegalCombinations++
            stats.totalCombinationsExplored++
            continue
          }
        }
      }

      // Compute merged signature for deeper recursion
      let nextSignature: LapicCompatibilitySignature | undefined
      if (getCompatibilitySignature) {
        const rowSig = getCompatibilitySignature(row)
        nextSignature = partialSignature
          ? mergeCompatibilitySignatures(partialSignature, rowSig)
          : rowSig
      }

      partialRows.push(row)
      visit(depth + 1, partialRows, nextSignature)
      partialRows.pop()
    }
  }

  visit(0, [], undefined)

  // Sort and trim to top-N
  const sorted = sortTeamResults(collectedResults)
  const trimmed = sorted.slice(0, topN)

  return {
    results: trimmed,
    stats: {
      ...stats,
    },
  }
}
