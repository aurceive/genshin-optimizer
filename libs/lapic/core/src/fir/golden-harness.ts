/**
 * Golden validation harness for F-IR bound admissibility.
 *
 * Exhaustively enumerates all candidate combinations, computes exact
 * scalar values, and verifies that every interval bound is admissible:
 * the scalar value must fall within [lo, hi] of the interval enclosure.
 *
 * This is the correctness kernel for the branch-and-bound pruning:
 * if bounds are not admissible, pruning may discard optimal solutions.
 */

import type { LapicInterval } from '../interval/types'
import { lapicIntervalPoint } from '../interval/types'
import type { LapicFirIntervalEnv } from './interval-eval'
import { evaluateLapicFirIntervals } from './interval-eval'
import type { LapicFirScalarEnv } from './scalar-eval'
import { evaluateLapicFirScalar } from './scalar-eval'
import type { LapicFirGraph, LapicFirVariableId } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single candidate's variable bindings within one domain.
 */
export interface LapicGoldenCandidate {
  readonly candidateId: string
  readonly variables: ReadonlyMap<LapicFirVariableId, number>
}

/**
 * A domain (slot) with its candidate list for golden enumeration.
 */
export interface LapicGoldenDomain {
  readonly domainId: string
  readonly candidates: readonly LapicGoldenCandidate[]
}

/**
 * Configuration for a golden validation run.
 */
export interface LapicGoldenHarnessConfig {
  readonly graph: LapicFirGraph
  readonly domains: readonly LapicGoldenDomain[]
  /** Global constants not tied to any domain. */
  readonly globalConstants?: ReadonlyMap<LapicFirVariableId, number>
  /**
   * Numeric tolerance for admissibility checks.
   * Default: 1e-12 (covers floating-point rounding).
   */
  readonly tolerance?: number
}

/**
 * A single violation found by the golden harness.
 */
export interface LapicGoldenViolation {
  readonly candidateIds: readonly string[]
  readonly scalarValue: number
  readonly intervalBound: LapicInterval
  readonly message: string
}

/**
 * Result of a golden validation run.
 */
export interface LapicGoldenHarnessResult {
  readonly totalCombinations: number
  readonly scalarEvaluations: number
  readonly intervalEvaluations: number
  readonly violations: readonly LapicGoldenViolation[]
  readonly maxScalarValue: number
  readonly minScalarValue: number
  readonly ok: boolean
}

// ---------------------------------------------------------------------------
// Harness implementation
// ---------------------------------------------------------------------------

/**
 * Run the golden validation harness.
 *
 * For each combination of candidates (one per domain):
 * 1. Compute the exact scalar value via `evaluateLapicFirScalar`
 * 2. Compute the interval bound via `evaluateLapicFirIntervals`
 *    using point intervals for all variables
 * 3. Verify `scalar ∈ [lo - tol, hi + tol]`
 *
 * Additionally, for each partial assignment (first k domains assigned,
 * rest given envelope intervals), verify that the scalar value of every
 * completion falls within the partial interval bound.
 */
export function runLapicGoldenHarness(
  config: LapicGoldenHarnessConfig
): LapicGoldenHarnessResult {
  const { graph, domains, globalConstants } = config
  const tolerance = config.tolerance ?? 1e-12

  const violations: LapicGoldenViolation[] = []
  let scalarEvaluations = 0
  let intervalEvaluations = 0
  let maxScalarValue = -Infinity
  let minScalarValue = Infinity

  // Pre-compute domain envelopes for partial-assignment checks
  const domainEnvelopes = domains.map((domain) => {
    const envMap = new Map<LapicFirVariableId, LapicInterval>()
    for (const candidate of domain.candidates) {
      for (const [varId, value] of candidate.variables) {
        const existing = envMap.get(varId)
        if (existing) {
          envMap.set(varId, {
            lo: Math.min(existing.lo, value),
            hi: Math.max(existing.hi, value),
          })
        } else {
          envMap.set(varId, lapicIntervalPoint(value))
        }
      }
    }
    return envMap
  })

  // Enumerate all combinations via recursive Cartesian product
  const totalCombinations = domains.reduce(
    (product, d) => product * d.candidates.length,
    1
  )

  function enumerate(
    domainIndex: number,
    chosenCandidates: LapicGoldenCandidate[]
  ): void {
    if (domainIndex >= domains.length) {
      // Full combination — scalar evaluation
      const scalarEnv = buildScalarEnv(chosenCandidates, globalConstants)
      const scalarResult = evaluateLapicFirScalar(graph, scalarEnv)
      scalarEvaluations++

      const sv = scalarResult.rootValue
      if (Number.isFinite(sv)) {
        maxScalarValue = Math.max(maxScalarValue, sv)
        minScalarValue = Math.min(minScalarValue, sv)
      }

      // Point-interval evaluation (should match scalar exactly)
      const pointEnv = buildPointIntervalEnv(chosenCandidates, globalConstants)
      const intervalResult = evaluateLapicFirIntervals(graph, pointEnv)
      intervalEvaluations++

      const ib = intervalResult.rootBound
      const candidateIds = chosenCandidates.map((c) => c.candidateId)

      if (
        Number.isFinite(sv) &&
        (sv < ib.lo - tolerance || sv > ib.hi + tolerance)
      ) {
        violations.push({
          candidateIds,
          scalarValue: sv,
          intervalBound: ib,
          message: `Scalar ${sv} outside point-interval [${ib.lo}, ${ib.hi}]`,
        })
      }

      return
    }

    // Also check partial-assignment admissibility at each depth
    if (domainIndex > 0) {
      checkPartialAdmissibility(
        domainIndex,
        chosenCandidates,
        domainEnvelopes,
        violations
      )
    }

    for (const candidate of domains[domainIndex]!.candidates) {
      enumerate(domainIndex + 1, [...chosenCandidates, candidate])
    }
  }

  // Track partial checks to avoid duplicates
  const checkedPartials = new Set<string>()

  function checkPartialAdmissibility(
    assignedCount: number,
    assignedCandidates: LapicGoldenCandidate[],
    envelopes: ReadonlyMap<LapicFirVariableId, LapicInterval>[],
    violations: LapicGoldenViolation[]
  ): void {
    const partialKey = assignedCandidates.map((c) => c.candidateId).join('|')
    if (checkedPartials.has(partialKey)) return
    checkedPartials.add(partialKey)

    // Build interval env: point for assigned, envelope for unassigned
    const env = new Map<LapicFirVariableId, LapicInterval>()

    if (globalConstants) {
      for (const [varId, value] of globalConstants) {
        env.set(varId, lapicIntervalPoint(value))
      }
    }

    for (const candidate of assignedCandidates) {
      for (const [varId, value] of candidate.variables) {
        env.set(varId, lapicIntervalPoint(value))
      }
    }

    for (let i = assignedCount; i < domains.length; i++) {
      const envelope = envelopes[i]!
      for (const [varId, iv] of envelope) {
        env.set(varId, iv)
      }
    }

    const intervalResult = evaluateLapicFirIntervals(graph, env)
    intervalEvaluations++

    // Now enumerate all completions and verify each scalar ≤ bound.hi
    const completionScalars: number[] = []
    enumerateCompletions(assignedCount, assignedCandidates, completionScalars)

    const candidateIds = assignedCandidates.map((c) => c.candidateId)
    const ib = intervalResult.rootBound

    for (const sv of completionScalars) {
      if (Number.isFinite(sv) && sv > ib.hi + tolerance) {
        violations.push({
          candidateIds,
          scalarValue: sv,
          intervalBound: ib,
          message: `Completion scalar ${sv} exceeds partial upper bound ${ib.hi} (assigned: [${candidateIds.join(', ')}])`,
        })
      }
      if (Number.isFinite(sv) && sv < ib.lo - tolerance) {
        violations.push({
          candidateIds,
          scalarValue: sv,
          intervalBound: ib,
          message: `Completion scalar ${sv} below partial lower bound ${ib.lo} (assigned: [${candidateIds.join(', ')}])`,
        })
      }
    }
  }

  function enumerateCompletions(
    startDomain: number,
    prefix: LapicGoldenCandidate[],
    results: number[]
  ): void {
    if (startDomain >= domains.length) {
      const scalarEnv = buildScalarEnv(prefix, globalConstants)
      const result = evaluateLapicFirScalar(graph, scalarEnv)
      results.push(result.rootValue)
      return
    }

    for (const candidate of domains[startDomain]!.candidates) {
      enumerateCompletions(startDomain + 1, [...prefix, candidate], results)
    }
  }

  enumerate(0, [])

  return {
    totalCombinations,
    scalarEvaluations,
    intervalEvaluations,
    violations,
    maxScalarValue,
    minScalarValue,
    ok: violations.length === 0,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildScalarEnv(
  candidates: readonly LapicGoldenCandidate[],
  globalConstants?: ReadonlyMap<LapicFirVariableId, number>
): LapicFirScalarEnv {
  const env = new Map<LapicFirVariableId, number>()
  if (globalConstants) {
    for (const [varId, value] of globalConstants) {
      env.set(varId, value)
    }
  }
  for (const candidate of candidates) {
    for (const [varId, value] of candidate.variables) {
      env.set(varId, value)
    }
  }
  return env
}

function buildPointIntervalEnv(
  candidates: readonly LapicGoldenCandidate[],
  globalConstants?: ReadonlyMap<LapicFirVariableId, number>
): LapicFirIntervalEnv {
  const env = new Map<LapicFirVariableId, LapicInterval>()
  if (globalConstants) {
    for (const [varId, value] of globalConstants) {
      env.set(varId, lapicIntervalPoint(value))
    }
  }
  for (const candidate of candidates) {
    for (const [varId, value] of candidate.variables) {
      env.set(varId, lapicIntervalPoint(value))
    }
  }
  return env
}
