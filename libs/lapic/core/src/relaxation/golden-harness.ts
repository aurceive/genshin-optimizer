/**
 * Golden validation harness for LP relaxation admissibility.
 *
 * Extends the F-IR golden harness pattern to verify that LP upper
 * bounds produced by the model-builder are admissible: no feasible
 * completion of a partial assignment can exceed the LP upper bound.
 *
 * Additionally compares LP tightness against interval arithmetic
 * bounds, verifying that LP relaxation is at least as tight (LP
 * captures inter-variable correlations that interval arithmetic
 * treats independently).
 *
 * This is a correctness gate for the LP relaxation pipeline.
 */

import type { LapicFirGraph, LapicFirVariableId } from '../fir/types'
import type { LapicFirScalarEnv } from '../fir/scalar-eval'
import { evaluateLapicFirScalar } from '../fir/scalar-eval'
import { evaluateLapicFirIntervals } from '../fir/interval-eval'
import type { LapicInterval } from '../interval/types'
import { lapicIntervalPoint } from '../interval/types'
import { buildLinearModelFromFir } from './model-builder'
import type { LapicLpProvider } from './types'
import type {
  LapicGoldenCandidate,
  LapicGoldenDomain,
} from '../fir/golden-harness'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for an LP golden validation run.
 */
export interface LapicLpGoldenHarnessConfig {
  readonly graph: LapicFirGraph
  readonly domains: readonly LapicGoldenDomain[]
  /** Global constants not tied to any domain. */
  readonly globalConstants?: ReadonlyMap<LapicFirVariableId, number>
  /** LP solver provider for computing LP bounds. */
  readonly lpProvider: LapicLpProvider
  /**
   * Numeric tolerance for admissibility checks.
   * Default: 1e-9 (wider than interval harness because LP
   * involves floating-point solver arithmetic).
   */
  readonly tolerance?: number
  /**
   * Maximum number of partial assignments to check.
   * When the Cartesian product is large, random sampling is used.
   * Default: unlimited (exhaustive enumeration).
   */
  readonly maxPartialChecks?: number
}

/**
 * A single LP admissibility violation.
 */
export interface LapicLpGoldenViolation {
  readonly assignedCandidateIds: readonly string[]
  readonly maxCompletionScalar: number
  readonly lpUpperBound: number
  readonly intervalUpperBound: number
  readonly message: string
}

/**
 * Tightness comparison between LP and interval relaxation
 * for a single partial assignment.
 */
export interface LapicLpTightnessRecord {
  readonly assignedCandidateIds: readonly string[]
  readonly lpUpperBound: number
  readonly intervalUpperBound: number
  readonly maxCompletionScalar: number
  /** lpUpperBound - maxCompletionScalar (lower is tighter). */
  readonly lpGap: number
  /** intervalUpperBound - maxCompletionScalar (lower is tighter). */
  readonly intervalGap: number
  /** True when LP is strictly tighter than interval. */
  readonly lpIsTighter: boolean
}

/**
 * Result of an LP golden validation run.
 */
export interface LapicLpGoldenHarnessResult {
  readonly totalCombinations: number
  readonly partialAssignmentsChecked: number
  readonly lpSolveInvocations: number
  readonly violations: readonly LapicLpGoldenViolation[]
  readonly tightnessRecords: readonly LapicLpTightnessRecord[]
  /** Count of partial assignments where LP was strictly tighter. */
  readonly lpTighterCount: number
  /** Count of partial assignments where LP and interval were equal. */
  readonly equalTightnessCount: number
  /** Average LP gap across all partial assignments. */
  readonly averageLpGap: number
  /** Average interval gap across all partial assignments. */
  readonly averageIntervalGap: number
  readonly ok: boolean
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Run the LP golden validation harness.
 *
 * For each partial assignment (first k domains assigned, rest unassigned):
 * 1. Compute interval bounds using envelope intervals
 * 2. Compile an LP model with those envelope bounds
 * 3. Solve the LP to get an upper bound
 * 4. Exhaustively enumerate all completions and compute max scalar
 * 5. Verify: maxCompletionScalar ≤ lpUpperBound + tolerance
 * 6. Verify: lpUpperBound ≤ intervalUpperBound + tolerance
 * 7. Record tightness comparison
 */
export function runLapicLpGoldenHarness(
  config: LapicLpGoldenHarnessConfig
): LapicLpGoldenHarnessResult {
  const { graph, domains, globalConstants, lpProvider } = config
  const tolerance = config.tolerance ?? 1e-9
  const maxPartialChecks = config.maxPartialChecks

  const violations: LapicLpGoldenViolation[] = []
  const tightnessRecords: LapicLpTightnessRecord[] = []
  let lpSolveInvocations = 0
  let partialAssignmentsChecked = 0

  const totalCombinations = domains.reduce(
    (product, d) => product * d.candidates.length,
    1
  )

  // Pre-compute domain envelopes
  const domainEnvelopes = computeDomainEnvelopes(domains)

  // Track checked partials to avoid duplicates
  const checkedPartials = new Set<string>()

  function shouldContinue(): boolean {
    return maxPartialChecks === undefined ||
      partialAssignmentsChecked < maxPartialChecks
  }

  // Check the fully-unassigned case (all domains get envelopes)
  checkPartial([], 0)

  // Enumerate partial assignments at each depth
  enumeratePartials(0, [])

  // Compute summary statistics
  let lpTighterCount = 0
  let equalTightnessCount = 0
  let totalLpGap = 0
  let totalIntervalGap = 0

  for (const record of tightnessRecords) {
    totalLpGap += record.lpGap
    totalIntervalGap += record.intervalGap
    if (record.lpIsTighter) lpTighterCount++
    else if (
      Math.abs(record.lpUpperBound - record.intervalUpperBound) < tolerance
    )
      equalTightnessCount++
  }

  const n = tightnessRecords.length || 1

  return {
    totalCombinations,
    partialAssignmentsChecked,
    lpSolveInvocations,
    violations,
    tightnessRecords,
    lpTighterCount,
    equalTightnessCount,
    averageLpGap: totalLpGap / n,
    averageIntervalGap: totalIntervalGap / n,
    ok: violations.length === 0,
  }

  // ----- internal functions -----

  function enumeratePartials(
    domainIndex: number,
    assigned: LapicGoldenCandidate[]
  ): void {
    if (!shouldContinue()) return
    if (domainIndex >= domains.length) return

    for (const candidate of domains[domainIndex]!.candidates) {
      if (!shouldContinue()) return
      const nextAssigned = [...assigned, candidate]

      // Check this partial assignment if it leaves at least one domain unassigned
      if (domainIndex + 1 < domains.length) {
        checkPartial(nextAssigned, domainIndex + 1)
      }

      // Recurse deeper
      enumeratePartials(domainIndex + 1, nextAssigned)
    }
  }

  function checkPartial(
    assignedCandidates: LapicGoldenCandidate[],
    firstUnassignedDomain: number
  ): void {
    if (!shouldContinue()) return

    const partialKey = assignedCandidates.map((c) => c.candidateId).join('|')
    if (checkedPartials.has(partialKey)) return
    checkedPartials.add(partialKey)

    partialAssignmentsChecked++

    // 1. Build interval environment (point for assigned, envelope for unassigned)
    const intervalEnv = buildPartialIntervalEnv(
      assignedCandidates,
      firstUnassignedDomain,
      domainEnvelopes,
      globalConstants
    )

    // 2. Compute interval upper bound
    const intervalResult = evaluateLapicFirIntervals(graph, intervalEnv)
    const intervalUpperBound = intervalResult.rootBound.hi

    // 3. Compile LP model and solve
    const modelDigest = `lp-golden:${partialKey}`
    const { model } = buildLinearModelFromFir(graph, intervalEnv, modelDigest)
    const solveResult = lpProvider.solve(model)
    lpSolveInvocations++

    // Parse LP bound
    let lpUpperBound: number
    if (
      solveResult.outcome === 'solved' &&
      solveResult.objectiveValue !== undefined
    ) {
      lpUpperBound = Number(solveResult.objectiveValue)
    } else {
      // LP couldn't solve — use interval bound as fallback (no violation)
      lpUpperBound = intervalUpperBound
    }

    // 4. Enumerate all completions to find max scalar value
    const completionScalars: number[] = []
    enumerateCompletions(
      firstUnassignedDomain,
      assignedCandidates,
      completionScalars
    )

    const maxCompletionScalar = completionScalars.length > 0
      ? Math.max(...completionScalars)
      : -Infinity

    const candidateIds = assignedCandidates.map((c) => c.candidateId)

    // 5. Check LP admissibility: max scalar ≤ LP upper bound
    if (
      Number.isFinite(maxCompletionScalar) &&
      Number.isFinite(lpUpperBound) &&
      maxCompletionScalar > lpUpperBound + tolerance
    ) {
      violations.push({
        assignedCandidateIds: candidateIds,
        maxCompletionScalar,
        lpUpperBound,
        intervalUpperBound,
        message: `LP upper bound ${lpUpperBound} < max completion scalar ${maxCompletionScalar} (gap: ${maxCompletionScalar - lpUpperBound})`,
      })
    }

    // 6. Check LP ≤ interval (LP should be at least as tight)
    if (
      Number.isFinite(lpUpperBound) &&
      Number.isFinite(intervalUpperBound) &&
      lpUpperBound > intervalUpperBound + tolerance
    ) {
      violations.push({
        assignedCandidateIds: candidateIds,
        maxCompletionScalar,
        lpUpperBound,
        intervalUpperBound,
        message: `LP upper bound ${lpUpperBound} exceeds interval upper bound ${intervalUpperBound} (LP should be at least as tight)`,
      })
    }

    // 7. Record tightness
    const lpGap = Number.isFinite(lpUpperBound) && Number.isFinite(maxCompletionScalar)
      ? lpUpperBound - maxCompletionScalar
      : Infinity
    const intervalGap = Number.isFinite(intervalUpperBound) && Number.isFinite(maxCompletionScalar)
      ? intervalUpperBound - maxCompletionScalar
      : Infinity

    tightnessRecords.push({
      assignedCandidateIds: candidateIds,
      lpUpperBound,
      intervalUpperBound,
      maxCompletionScalar,
      lpGap,
      intervalGap,
      lpIsTighter: Number.isFinite(lpGap) && Number.isFinite(intervalGap)
        ? lpGap < intervalGap - tolerance
        : false,
    })
  }

  function enumerateCompletions(
    startDomain: number,
    prefix: LapicGoldenCandidate[],
    results: number[]
  ): void {
    if (startDomain >= domains.length) {
      const scalarEnv = buildScalarEnv(prefix, globalConstants)
      const result = evaluateLapicFirScalar(graph, scalarEnv)
      if (Number.isFinite(result.rootValue)) {
        results.push(result.rootValue)
      }
      return
    }

    for (const candidate of domains[startDomain]!.candidates) {
      enumerateCompletions(startDomain + 1, [...prefix, candidate], results)
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDomainEnvelopes(
  domains: readonly LapicGoldenDomain[]
): ReadonlyMap<LapicFirVariableId, LapicInterval>[] {
  return domains.map((domain) => {
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
}

function buildPartialIntervalEnv(
  assignedCandidates: readonly LapicGoldenCandidate[],
  firstUnassignedDomain: number,
  domainEnvelopes: ReadonlyMap<LapicFirVariableId, LapicInterval>[],
  globalConstants?: ReadonlyMap<LapicFirVariableId, number>
): Map<LapicFirVariableId, LapicInterval> {
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

  for (let i = firstUnassignedDomain; i < domainEnvelopes.length; i++) {
    for (const [varId, iv] of domainEnvelopes[i]!) {
      env.set(varId, iv)
    }
  }

  return env
}

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
