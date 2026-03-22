import {
  type LapicCandidateDescriptor,
  type LapicCanonicalProblem,
  type LapicDeterministicOrderingRelation,
  type LapicValidationResult,
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicBoundedExactCombinationEvaluation,
  LapicBoundedExactSolveOptions,
} from './types'

export interface LapicBoundedExactBestCandidate {
  readonly stateId: string
  readonly candidates: readonly LapicCandidateDescriptor[]
  readonly evaluation: LapicBoundedExactCombinationEvaluation
}

export interface LapicBoundedExactTopNTracker {
  insert(candidate: LapicBoundedExactBestCandidate): void
  insertWithEviction(candidate: LapicBoundedExactBestCandidate): LapicTopNInsertResult
  isEmpty(): boolean
  isFull(): boolean
  results(): readonly LapicBoundedExactBestCandidate[]
}

/** Result of an insert-with-eviction operation. */
export interface LapicTopNInsertResult {
  /** The candidate that was evicted, or `undefined` if no eviction occurred. */
  readonly evicted?: LapicBoundedExactBestCandidate
  /** Whether the inserted candidate itself was immediately evicted (ranked below top-N). */
  readonly insertedWasEvicted: boolean
}

export function createTopNTracker(
  topN: number,
  explicitComparator?: LapicBoundedExactSolveOptions['compareEvaluations']
): LapicBoundedExactTopNTracker {
  const entries: LapicBoundedExactBestCandidate[] = []

  function compare(
    left: LapicBoundedExactBestCandidate,
    right: LapicBoundedExactBestCandidate
  ): LapicDeterministicOrderingRelation {
    return compareEvaluations(
      left.evaluation,
      left.stateId,
      right.evaluation,
      right.stateId,
      explicitComparator
    )
  }

  return {
    insert(candidate: LapicBoundedExactBestCandidate): void {
      let insertionIndex = entries.length
      for (let i = 0; i < entries.length; i += 1) {
        if (compare(candidate, entries[i]!) > 0) {
          insertionIndex = i
          break
        }
      }
      entries.splice(insertionIndex, 0, candidate)
      if (entries.length > topN) entries.pop()
    },
    insertWithEviction(candidate: LapicBoundedExactBestCandidate): LapicTopNInsertResult {
      let insertionIndex = entries.length
      for (let i = 0; i < entries.length; i += 1) {
        if (compare(candidate, entries[i]!) > 0) {
          insertionIndex = i
          break
        }
      }
      entries.splice(insertionIndex, 0, candidate)
      if (entries.length > topN) {
        const evicted = entries.pop()!
        return {
          evicted,
          insertedWasEvicted: evicted === candidate,
        }
      }
      return { insertedWasEvicted: false }
    },
    isEmpty(): boolean {
      return entries.length === 0
    },
    isFull(): boolean {
      return entries.length >= topN
    },
    results(): readonly LapicBoundedExactBestCandidate[] {
      return entries
    },
  }
}

function compareStringArrays(
  left: readonly string[],
  right: readonly string[]
): LapicDeterministicOrderingRelation {
  const sharedLength = Math.min(left.length, right.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const comparison = left[index]!.localeCompare(right[index]!)
    if (comparison < 0) return -1
    if (comparison > 0) return 1
  }

  if (left.length < right.length) return -1
  if (left.length > right.length) return 1
  return 0
}

export function compareEvaluations(
  left: LapicBoundedExactCombinationEvaluation,
  leftStateId: string,
  right: LapicBoundedExactCombinationEvaluation,
  rightStateId: string,
  explicitComparator?: LapicBoundedExactSolveOptions['compareEvaluations']
): LapicDeterministicOrderingRelation {
  if (explicitComparator) return explicitComparator(left, right)

  const leftOrderingKey = [...(left.orderingKey ?? [left.objectiveValue]), leftStateId]
  const rightOrderingKey = [...(right.orderingKey ?? [right.objectiveValue]), rightStateId]
  return compareStringArrays(leftOrderingKey, rightOrderingKey)
}

export function hasExclusiveResourceConflict(
  candidates: readonly LapicCandidateDescriptor[]
): boolean {
  const seenClaims = new Set<string>()

  for (const candidate of candidates) {
    for (const claim of candidate.provenance.exclusiveResourceClaims) {
      const claimKey = [claim.resourceKind, claim.resourceId].join('|')
      if (seenClaims.has(claimKey)) return true
      seenClaims.add(claimKey)
    }
  }

  return false
}

export function normalizeFeasibilityResult(
  result: boolean | LapicValidationResult<boolean>
): LapicValidationResult<boolean> {
  if (typeof result === 'boolean') return createLapicSuccessResult(result)
  return result
}

export function createCombinationStateId(
  problem: LapicCanonicalProblem,
  candidates: readonly LapicCandidateDescriptor[]
): string {
  return `state:${problem.problemDigest}:${candidates
    .map((candidate) => `${candidate.slotId}:${candidate.candidateId}`)
    .join('|')}`
}

export function sortDomains(problem: LapicCanonicalProblem) {
  const slotOrder = new Map(
    problem.teamLayout.slotIds.map((slotId, index) => [slotId, index])
  )

  return [...problem.itemDomains].sort(
    (left, right) =>
      (slotOrder.get(left.slotId) ?? Number.MAX_SAFE_INTEGER) -
      (slotOrder.get(right.slotId) ?? Number.MAX_SAFE_INTEGER)
  )
}

export function validateSolveOptions(
  options: LapicBoundedExactSolveOptions,
  orderedCandidates: readonly (readonly LapicCandidateDescriptor[])[]
): LapicValidationResult<number> {
  if (options.problem.topN < 1)
    return failure(
      'The bounded in-process solve slice requires topN >= 1.',
      ['problem', 'topN']
    )

  if (
    options.problem.potentialConfiguration &&
    options.problem.potentialConfiguration.solveMode !== 'current-only'
  )
    return failure(
      'The bounded in-process solve slice currently supports only current-only potential mode.',
      ['problem', 'potentialConfiguration', 'solveMode']
    )

  if (!orderedCandidates.length)
    return failure(
      'The bounded in-process solve slice requires at least one candidate domain.',
      ['problem', 'itemDomains']
    )

  const emptyDomainIndex = orderedCandidates.findIndex((candidates) => !candidates.length)
  if (emptyDomainIndex >= 0)
    return failure(
      'The bounded in-process solve slice requires all participating domains to be non-empty.',
      ['problem', 'itemDomains', String(emptyDomainIndex), 'candidates']
    )

  const combinationCount = orderedCandidates.reduce(
    (product, candidates) => product * candidates.length,
    1
  )

  if (
    options.maxCombinationCount !== undefined &&
    combinationCount > options.maxCombinationCount
  )
    return failure(
      'The bounded in-process solve slice exceeded maxCombinationCount.',
      ['maxCombinationCount']
    )

  return createLapicSuccessResult(combinationCount)
}

function failure(message: string, path?: readonly string[]): LapicValidationResult<never> {
  return createLapicFailureResult([
    createLapicDiagnostic('error', 'SchemaViolation', message, path),
  ])
}
