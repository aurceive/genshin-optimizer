import type { LapicCandidateDescriptor } from '@genshin-optimizer/lapic/core'
import type {
  LapicBoundedExactBestCandidate,
  LapicBoundedExactTopNTracker,
  LapicTopNInsertResult,
} from './combination'
import { createTopNTracker } from './combination'
import type { LapicTopNTrackerSnapshot } from './checkpoint-state'
import { createLapicTopNTrackerSnapshot } from './checkpoint-state'
import type { LapicBoundedExactSolveOptions } from './types'

/**
 * Extends the standard TopN tracker with checkpoint export/import.
 */
export interface LapicResumableTopNTracker extends LapicBoundedExactTopNTracker {
  /** Serialize current ranked entries into a checkpoint-safe snapshot. */
  snapshot(): LapicTopNTrackerSnapshot

  /**
   * Current worst (lowest-ranked) objective value in the tracker,
   * or `undefined` when the tracker is not yet full.
   * Useful for future threshold-driven pruning.
   */
  currentThreshold(): string | undefined
}

/**
 * Create a resumable TopN tracker that can be serialized/deserialized
 * across pause/resume boundaries.
 */
export function createResumableTopNTracker(
  topN: number,
  explicitComparator?: LapicBoundedExactSolveOptions['compareEvaluations']
): LapicResumableTopNTracker {
  const inner = createTopNTracker(topN, explicitComparator)

  return {
    insert(candidate: LapicBoundedExactBestCandidate): void {
      inner.insert(candidate)
    },
    insertWithEviction(candidate: LapicBoundedExactBestCandidate): LapicTopNInsertResult {
      return inner.insertWithEviction(candidate)
    },
    isEmpty(): boolean {
      return inner.isEmpty()
    },
    isFull(): boolean {
      return inner.isFull()
    },
    results(): readonly LapicBoundedExactBestCandidate[] {
      return inner.results()
    },
    snapshot(): LapicTopNTrackerSnapshot {
      const entries = inner.results()
      return createLapicTopNTrackerSnapshot(
        topN,
        entries.map((entry) => ({
          stateId: entry.stateId,
          candidateIds: entry.candidates.map((c) => c.candidateId),
          evaluation: entry.evaluation,
        }))
      )
    },
    currentThreshold(): string | undefined {
      const entries = inner.results()
      if (!inner.isFull() || entries.length === 0) return undefined
      return entries[entries.length - 1]!.evaluation.objectiveValue
    },
  }
}

/**
 * Restore a resumable TopN tracker from a checkpoint snapshot.
 * Requires the full candidate descriptors map so entries can be
 * reconstituted with full provenance.
 */
export function restoreResumableTopNTracker(
  snapshotData: LapicTopNTrackerSnapshot,
  candidateIndex: ReadonlyMap<string, LapicCandidateDescriptor>,
  explicitComparator?: LapicBoundedExactSolveOptions['compareEvaluations']
): LapicResumableTopNTracker {
  const tracker = createResumableTopNTracker(snapshotData.topN, explicitComparator)

  for (const entry of snapshotData.entries) {
    const candidates = entry.candidateIds.map((id) => {
      const descriptor = candidateIndex.get(id)
      if (!descriptor)
        throw new Error(
          `Checkpoint restore failed: candidate '${id}' not found in problem domains.`
        )
      return descriptor
    })

    tracker.insert({
      stateId: entry.stateId,
      candidates,
      evaluation: entry.evaluation,
    })
  }

  return tracker
}

/**
 * Build a lookup map from candidateId → LapicCandidateDescriptor
 * across all domains in the problem. Used for checkpoint restoration.
 */
export function buildCandidateIndex(
  domains: readonly { readonly candidates: readonly LapicCandidateDescriptor[] }[]
): Map<string, LapicCandidateDescriptor> {
  const index = new Map<string, LapicCandidateDescriptor>()
  for (const domain of domains) {
    for (const candidate of domain.candidates) {
      index.set(candidate.candidateId, candidate)
    }
  }
  return index
}
