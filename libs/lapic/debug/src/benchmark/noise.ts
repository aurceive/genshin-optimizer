/**
 * Browser Noise Mitigation Policy
 *
 * Per benchmark-governance-and-browser-noise.md, browser benchmarks
 * require explicit noise handling, environment classification, and
 * statistical publication rules. This module implements the noise
 * margin calculation, environment classification, and gating rules.
 */

// ---------------------------------------------------------------------------
// Environment classification
// ---------------------------------------------------------------------------

/**
 * Environment class determines eligibility for regression gating.
 * Only controlled/CI environments are eligible.
 */
export type LapicBenchmarkEnvironmentClass =
  | 'browserControlledLab'
  | 'browserCI'
  | 'browserUncontrolledLocal'
  | 'nodeControlledLab'
  | 'nodeCI'

/** Returns true if the environment class is eligible for gating. */
export function isGatingEligible(
  envClass: LapicBenchmarkEnvironmentClass
): boolean {
  return envClass !== 'browserUncontrolledLocal'
}

// ---------------------------------------------------------------------------
// Environment descriptor
// ---------------------------------------------------------------------------

/** Required metadata for every benchmark execution environment. */
export interface LapicBenchmarkEnvironmentDescriptor {
  readonly environmentClass: LapicBenchmarkEnvironmentClass
  readonly runtimeEngine: string
  readonly runtimeVersion: string
  readonly workerCount: number
  readonly storageBackend: string
  readonly repetitionCount: number
  readonly warmupRepetitions: number
  readonly tabVisibility?: 'visible' | 'hidden' | 'unknown'
  readonly powerMode?: 'ac' | 'battery' | 'unknown'
  readonly thermalSignal?: 'nominal' | 'throttled' | 'unknown'
  readonly cacheState?: 'cold' | 'warm' | 'unknown'
}

// ---------------------------------------------------------------------------
// Statistical publication
// ---------------------------------------------------------------------------

/**
 * Per spec, the normative statistic is median wall-clock time.
 * Mean-only publication is forbidden.
 */
export interface LapicBenchmarkStatistics {
  readonly medianMs: number
  readonly sampleCount: number
  /** Median Absolute Deviation / median ratio. */
  readonly madRatio: number
  /** Interquartile range. */
  readonly iqrMs: number
  readonly minMs: number
  readonly maxMs: number
}

/** Compute basic statistics from a sorted array of durations. */
export function computeBenchmarkStatistics(
  durationsMs: readonly number[]
): LapicBenchmarkStatistics {
  if (durationsMs.length === 0)
    throw new Error('Cannot compute statistics from empty durations')

  const sorted = [...durationsMs].sort((a, b) => a - b)
  const n = sorted.length
  const medianMs = sorted[Math.floor(n / 2)]!

  // Median Absolute Deviation
  const deviations = sorted
    .map((d) => Math.abs(d - medianMs))
    .sort((a, b) => a - b)
  const mad = deviations[Math.floor(n / 2)]!
  const madRatio = medianMs > 0 ? mad / medianMs : 0

  // IQR
  const q1 = sorted[Math.floor(n * 0.25)]!
  const q3 = sorted[Math.floor(n * 0.75)]!
  const iqrMs = q3 - q1

  return {
    medianMs,
    sampleCount: n,
    madRatio,
    iqrMs,
    minMs: sorted[0]!,
    maxMs: sorted[n - 1]!,
  }
}

// ---------------------------------------------------------------------------
// Noise margin
// ---------------------------------------------------------------------------

/**
 * Default noise margin per spec:
 * max(5%, 2 × baselineMADRatio) relative slowdown.
 * Fallback if MAD unavailable: 7%.
 */
export const DEFAULT_NOISE_MARGIN_PERCENT = 5
export const DEFAULT_NOISE_MARGIN_MAD_MULTIPLIER = 2
export const DEFAULT_NOISE_MARGIN_FALLBACK_PERCENT = 7

export function computeNoiseMargin(
  baselineStats: LapicBenchmarkStatistics | undefined
): number {
  if (!baselineStats || baselineStats.sampleCount === 0) {
    return DEFAULT_NOISE_MARGIN_FALLBACK_PERCENT / 100
  }

  const madBased = DEFAULT_NOISE_MARGIN_MAD_MULTIPLIER * baselineStats.madRatio
  const minMargin = DEFAULT_NOISE_MARGIN_PERCENT / 100

  return Math.max(minMargin, madBased)
}

// ---------------------------------------------------------------------------
// Regression gating
// ---------------------------------------------------------------------------

/**
 * Regression triage classifications per spec.
 */
export type LapicRegressionTriageClassification =
  | 'truePerformanceRegression'
  | 'environmentalNoise'
  | 'benchmarkInfrastructureIssue'
  | 'fixtureDriftViolation'
  | 'correctnessBlockedComparison'

/**
 * Check if a candidate median represents a regression exceeding
 * the noise margin relative to the baseline.
 *
 * Regression condition: candidateMedian > baselineMedian × (1 + noiseMargin)
 */
export function isPerformanceRegression(
  baselineStats: LapicBenchmarkStatistics,
  candidateStats: LapicBenchmarkStatistics,
  noiseMargin?: number
): boolean {
  const margin = noiseMargin ?? computeNoiseMargin(baselineStats)
  const threshold = baselineStats.medianMs * (1 + margin)
  return candidateStats.medianMs > threshold
}

/**
 * Full regression gating check. Returns true only when all gating
 * preconditions are met (correctness, environment eligibility, and
 * statistical comparison).
 */
export interface LapicRegressionGateInput {
  readonly environmentClass: LapicBenchmarkEnvironmentClass
  readonly correctnessQualified: boolean
  readonly baselineStats: LapicBenchmarkStatistics
  readonly candidateStats: LapicBenchmarkStatistics
  readonly noiseMargin?: number
}

export interface LapicRegressionGateResult {
  readonly gated: boolean
  readonly reason: string
  readonly classification:
    | LapicRegressionTriageClassification
    | 'not-applicable'
}

export function evaluateRegressionGate(
  input: LapicRegressionGateInput
): LapicRegressionGateResult {
  if (!input.correctnessQualified) {
    return {
      gated: false,
      reason: 'Correctness gates have not passed',
      classification: 'correctnessBlockedComparison',
    }
  }

  if (!isGatingEligible(input.environmentClass)) {
    return {
      gated: false,
      reason: `Environment class '${input.environmentClass}' is not eligible for gating`,
      classification: 'not-applicable',
    }
  }

  const margin = input.noiseMargin ?? computeNoiseMargin(input.baselineStats)
  const regressed = isPerformanceRegression(
    input.baselineStats,
    input.candidateStats,
    margin
  )

  if (regressed) {
    return {
      gated: true,
      reason: `Candidate median ${input.candidateStats.medianMs}ms exceeds baseline ${input.baselineStats.medianMs}ms + ${(margin * 100).toFixed(1)}% noise margin`,
      classification: 'truePerformanceRegression',
    }
  }

  return {
    gated: false,
    reason: 'Candidate within noise margin of baseline',
    classification: 'not-applicable',
  }
}
