/**
 * Validation corpus types for golden enumeration testing (§5.2).
 *
 * A corpus fixture is a small, fully-enumerable optimization problem
 * with a known golden answer.  The corpus runner builds the F-IR graph,
 * runs both an exhaustive oracle and the bounded-exact solver, then
 * asserts that the solver's top-N matches the oracle's ground truth.
 */

import type { LapicFirNodeId } from '@genshin-optimizer/lapic/core'
import type { LapicFirGraphBuilder } from '@genshin-optimizer/lapic/core'

// ---------------------------------------------------------------------------
// Fixture data types
// ---------------------------------------------------------------------------

/**
 * Variable bindings for a single candidate within a corpus fixture.
 */
export interface LapicCorpusCandidateSpec {
  readonly candidateId: string
  readonly variables: Readonly<Record<string, number>>
}

/**
 * A domain (slot) within a corpus fixture.
 */
export interface LapicCorpusDomainSpec {
  readonly domainId: string
  readonly slotId: string
  readonly candidates: readonly LapicCorpusCandidateSpec[]
}

/**
 * Graph builder callback.  Receives a fresh `LapicFirGraphBuilder` and
 * must return the root node reference.  The runner calls `b.build(root)`
 * to produce the immutable graph.
 */
export type LapicCorpusGraphFactory = (
  b: LapicFirGraphBuilder
) => LapicFirNodeId

/**
 * A single corpus fixture — a small known-answer problem.
 *
 * The fixture is pure data plus a graph factory callback.
 * The runner uses this to drive both the golden oracle and the solver.
 */
export interface LapicCorpusFixture {
  /** Unique fixture identifier (e.g. `'additive-2slot-top1'`). */
  readonly fixtureId: string
  /** Human-readable description. */
  readonly description: string
  /** Builds the F-IR DAG for this fixture. */
  readonly buildGraph: LapicCorpusGraphFactory
  /** Optional global constants not tied to any domain. */
  readonly globalConstants?: Readonly<Record<string, number>>
  /** Domain specifications. */
  readonly domains: readonly LapicCorpusDomainSpec[]
  /** Number of top results to request. */
  readonly topN: number
  /**
   * Expected golden answer.
   *
   * `rankedCombinations[0]` is the best combination, etc.
   * Each entry is a sorted array of candidateIds forming the combination.
   * The numeric `bestObjectiveValue` is the exact scalar value of the
   * best combination as computed by the golden oracle.
   */
  readonly golden: LapicCorpusGoldenAnswer
}

/**
 * Golden answer for a corpus fixture.
 */
export interface LapicCorpusGoldenAnswer {
  /** Exact scalar value of the best combination. */
  readonly bestObjectiveValue: number
  /**
   * Top-N combinations in expected order (best first).
   * Each entry is a sorted array of candidateIds.
   */
  readonly rankedCombinations: readonly (readonly string[])[]
}

// ---------------------------------------------------------------------------
// Runner result types
// ---------------------------------------------------------------------------

/**
 * Result of running a single corpus fixture through the validation runner.
 */
export interface LapicCorpusRunResult {
  readonly fixtureId: string
  readonly passed: boolean
  readonly oracleMaxValue: number
  readonly solverTopValue: string
  readonly solverTopCandidateIds: readonly string[]
  readonly evaluationCount: number
  readonly totalCombinations: number
  readonly violations: readonly LapicCorpusViolation[]
}

/**
 * A single violation detected by the corpus runner.
 */
export interface LapicCorpusViolation {
  readonly kind:
    | 'objective-mismatch'
    | 'top-n-order-mismatch'
    | 'missing-combination'
    | 'oracle-failure'
    | 'solver-failure'
  readonly message: string
}
