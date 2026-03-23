/**
 * Team-Level Tie-Break & Ordering (§7.3)
 *
 * Provides deterministic ordering for team-level optimization results.
 * When two team compositions have the same objective value, a canonical
 * tie-break key is used to produce a stable, reproducible ordering.
 *
 * Tie-break dimensions (in order):
 * 1. Objective value tuple (primary sort, descending)
 * 2. Per-slot candidate IDs in canonical slot order
 * 3. Team composition ID (slot-mask + actor identities)
 */

import type { LapicSlotId } from '../identity'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single team result entry for comparison. */
export interface LapicTeamResultEntry {
  /** Primary objective value (higher is better). */
  readonly objectiveValue: number
  /**
   * Secondary objective values for lexicographic comparison
   * (higher is better at each position).
   */
  readonly secondaryObjectiveValues?: readonly number[]
  /** Candidate IDs per slot, in canonical slot order. */
  readonly slotCandidateIds: readonly string[]
  /** Canonical slot IDs for this team composition. */
  readonly slotIds: readonly LapicSlotId[]
}

// ---------------------------------------------------------------------------
// Tie-Break Key
// ---------------------------------------------------------------------------

/**
 * Produce a deterministic tie-break key string for a team result.
 *
 * The key encodes per-slot candidate IDs in canonical order so that
 * two identical team compositions always produce the same key regardless
 * of evaluation path or enumeration order.
 */
export function createTeamTieBreakKey(entry: LapicTeamResultEntry): string {
  const parts: string[] = []

  for (let i = 0; i < entry.slotIds.length; i++) {
    const slotId = entry.slotIds[i]
    const candidateId = entry.slotCandidateIds[i] ?? ''
    parts.push(`${slotId}=${candidateId}`)
  }

  return parts.join('|')
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * Compare two team results for ordering.
 *
 * Returns:
 * - negative if `a` should rank higher (better) than `b`
 * - positive if `b` should rank higher than `a`
 * - 0 if they are identical
 *
 * Comparison order:
 * 1. Primary objective value (descending — higher is better)
 * 2. Secondary objective values in lexicographic order (descending)
 * 3. Tie-break key (ascending — deterministic canonical order)
 */
export function compareTeamResults(
  a: LapicTeamResultEntry,
  b: LapicTeamResultEntry
): number {
  // 1. Primary objective (descending)
  if (a.objectiveValue !== b.objectiveValue) {
    return b.objectiveValue - a.objectiveValue
  }

  // 2. Secondary objectives (descending, lexicographic)
  const secondaryA = a.secondaryObjectiveValues ?? []
  const secondaryB = b.secondaryObjectiveValues ?? []
  const maxSecondary = Math.max(secondaryA.length, secondaryB.length)

  for (let i = 0; i < maxSecondary; i++) {
    const valA = secondaryA[i] ?? 0
    const valB = secondaryB[i] ?? 0
    if (valA !== valB) {
      return valB - valA
    }
  }

  // 3. Tie-break key (ascending — canonical deterministic)
  const keyA = createTeamTieBreakKey(a)
  const keyB = createTeamTieBreakKey(b)

  if (keyA < keyB) return -1
  if (keyA > keyB) return 1

  return 0
}

/**
 * Sort an array of team results in descending quality order.
 * Uses `compareTeamResults` for full deterministic ordering.
 */
export function sortTeamResults<T extends LapicTeamResultEntry>(
  results: readonly T[]
): T[] {
  return [...results].sort(compareTeamResults)
}
