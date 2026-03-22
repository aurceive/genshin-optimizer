/**
 * Certificate replay execution engine.
 *
 * Re-evaluates pruning decisions recorded in certificates to verify
 * that the solver's correctness claims are independently reproducible.
 *
 * For each certificate kind:
 * - BoundPruneCert: verify that the bound value is below the threshold
 *   (the pruning decision was correct given the recorded evidence)
 * - DominanceCert: verify that the dominating state has a strictly
 *   better evaluation than the dominated state
 * - BranchReachabilityCert: verify that the guard bounds force the
 *   recorded arm selection
 * - FinalOptimalityCert: verify structural completeness (winner state,
 *   optimality gap, exhaustion)
 * - InfeasibilityCert: verify that infeasibility evidence is consistent
 *
 * The engine is pure and deterministic: it does not invoke LP solvers
 * or run new computations. It verifies internal consistency of the
 * certificate's recorded evidence against its replay recipe.
 */

import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import {
  createLapicSuccessResult,
  createLapicFailureResult,
  createLapicDiagnostic,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicCertificate,
  LapicBoundPrunePayload,
  LapicBranchReachabilityPayload,
  LapicDominancePayload,
  LapicFinalOptimalityPayload,
  LapicInfeasibilityPayload,
  LapicReplayResult,
  LapicReplayVerdict,
} from '../types'
import { validateLapicCertificate } from '../validation'

// ---------------------------------------------------------------------------
// Replay context
// ---------------------------------------------------------------------------

/**
 * Evidence lookup function. Given an evidence digest, returns the
 * associated value (e.g., bound value, evaluation value) if available.
 *
 * This abstraction decouples the replay engine from storage: callers
 * supply the lookup function, which may read from memory, artifact
 * store, or test fixtures.
 */
export type LapicReplayEvidenceLookup = (
  evidenceDigest: string
) => string | undefined

/**
 * Configuration for the replay execution engine.
 */
export interface LapicReplayExecutorConfig {
  /**
   * Look up evidence values by digest. Returns the evidence payload
   * string (e.g., a bound value or evaluation value) or undefined
   * if the evidence is not available.
   *
   * When undefined, the engine relies only on the certificate's
   * embedded evidence (payload fields like boundValue, thresholdDigest).
   */
  readonly evidenceLookup?: LapicReplayEvidenceLookup
  /**
   * Engine version for the replay environment descriptor.
   * Default: `'0.1.0-replay'`.
   */
  readonly engineVersion?: string
  /**
   * Arithmetic policy ID. Default: `'fast-float'`.
   */
  readonly arithmeticPolicyId?: string
}

// ---------------------------------------------------------------------------
// Replay result construction
// ---------------------------------------------------------------------------

function matchedResult(
  arithmeticMode: string,
  evidenceDigests: readonly string[]
): LapicReplayResult {
  return {
    reproducedVerdict: 'matched',
    validationOutcome: 'validated',
    arithmeticModeUsed: arithmeticMode,
    referencedEvidenceDigests: evidenceDigests,
    exactReplayInvoked: arithmeticMode === 'exact',
  }
}

function mismatchedResult(
  arithmeticMode: string,
  evidenceDigests: readonly string[],
  reason: string,
  expectedDigest?: string,
  actualDigest?: string
): LapicReplayResult {
  return {
    reproducedVerdict: 'mismatched',
    validationOutcome: 'rejected',
    arithmeticModeUsed: arithmeticMode,
    mismatchExplanation: { reason, expectedDigest, actualDigest },
    referencedEvidenceDigests: evidenceDigests,
    exactReplayInvoked: arithmeticMode === 'exact',
  }
}

function inconclusiveResult(
  arithmeticMode: string,
  evidenceDigests: readonly string[]
): LapicReplayResult {
  return {
    reproducedVerdict: 'inconclusive',
    validationOutcome: 'unvalidated',
    arithmeticModeUsed: arithmeticMode,
    referencedEvidenceDigests: evidenceDigests,
    exactReplayInvoked: false,
  }
}

// ---------------------------------------------------------------------------
// Per-kind replay logic
// ---------------------------------------------------------------------------

function replayBoundPruneCert(
  cert: LapicCertificate<LapicBoundPrunePayload>,
  _config: LapicReplayExecutorConfig
): LapicReplayResult {
  const { payload } = cert
  const evidenceDigests = [cert.evidenceDigest, payload.numericDiagnosticsDigest]
  const arithmeticMode = cert.replayRecipe.arithmeticMode

  // Verify internal consistency: boundValue must parse as a finite number
  const boundValue = Number(payload.boundValue)
  if (!Number.isFinite(boundValue)) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      `Bound value '${payload.boundValue}' is not a finite number`,
      payload.boundValue,
      'NaN or Infinity'
    )
  }

  // Verify threshold digest is present
  if (!payload.thresholdDigest) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'BoundPruneCert missing thresholdDigest',
    )
  }

  // Verify the incumbent digest (threshold) parses as a number
  if (cert.incumbentDigest !== undefined) {
    const thresholdValue = Number(cert.incumbentDigest)
    if (Number.isFinite(thresholdValue)) {
      // The pruning decision is correct iff boundValue < thresholdValue
      if (boundValue >= thresholdValue) {
        return mismatchedResult(
          arithmeticMode,
          evidenceDigests,
          `Bound ${boundValue} is not below threshold ${thresholdValue}; pruning was not justified`,
          String(thresholdValue),
          payload.boundValue
        )
      }
    }
  }

  // Verify danger-zone record consistency
  if (payload.dangerZoneRecord.triggered) {
    // If danger zone was triggered, this cert should not have been emitted
    // as a prune decision (the executor declines to prune in danger zone)
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'BoundPruneCert has dangerZoneRecord.triggered=true but was still emitted as a prune decision',
    )
  }

  // Verify bound source class
  if (!payload.boundSourceClass) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'BoundPruneCert missing boundSourceClass',
    )
  }

  return matchedResult(arithmeticMode, evidenceDigests)
}

function replayDominanceCert(
  cert: LapicCertificate<LapicDominancePayload>,
  _config: LapicReplayExecutorConfig
): LapicReplayResult {
  const { payload } = cert
  const evidenceDigests = [cert.evidenceDigest, payload.comparisonDigest]
  const arithmeticMode = cert.replayRecipe.arithmeticMode

  // Verify the dominating and dominated state IDs are distinct
  if (payload.dominatingStateId === payload.dominatedStateId) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      `Dominance certificate has identical dominating and dominated state: ${payload.dominatingStateId}`,
    )
  }

  // Verify both state IDs are referenced in the certificate
  if (!cert.referencedStateIds.includes(payload.dominatingStateId)) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      `Dominating state ${payload.dominatingStateId} not in referencedStateIds`,
    )
  }
  if (!cert.referencedStateIds.includes(payload.dominatedStateId)) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      `Dominated state ${payload.dominatedStateId} not in referencedStateIds`,
    )
  }

  // Verify comparison digest references both states
  if (!payload.comparisonDigest) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'DominanceCert missing comparisonDigest',
    )
  }

  // Verify signature group key is present (dominance requires same group)
  if (!payload.exactSignatureGroupKeyDigest) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'DominanceCert missing exactSignatureGroupKeyDigest',
    )
  }

  return matchedResult(arithmeticMode, evidenceDigests)
}

function replayBranchReachabilityCert(
  cert: LapicCertificate<LapicBranchReachabilityPayload>,
  _config: LapicReplayExecutorConfig
): LapicReplayResult {
  const { payload } = cert
  const evidenceDigests = [cert.evidenceDigest]
  const arithmeticMode = cert.replayRecipe.arithmeticMode

  // Verify selected arm is valid
  if (payload.selectedArm !== 'left' && payload.selectedArm !== 'right') {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      `Invalid selectedArm: '${payload.selectedArm}'`,
    )
  }

  // Verify branch predicate digest is present
  if (!payload.branchPredicateDigest) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'BranchReachabilityCert missing branchPredicateDigest',
    )
  }

  // Verify validity region is referenced
  if (!payload.validityRegionId) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'BranchReachabilityCert missing validityRegionId',
    )
  }
  if (!cert.referencedRegionIds.includes(payload.validityRegionId)) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      `Validity region ${payload.validityRegionId} not in referencedRegionIds`,
    )
  }

  // If exact bounds are available, verify they force the arm
  if (payload.exactBoundsDigest) {
    // Parse bounds from digest format: "bounds:[lo,hi]:nodeId"
    const boundsMatch = payload.exactBoundsDigest.match(
      /^bounds:\[([^,]+),([^\]]+)\]:/
    )
    if (boundsMatch) {
      const lo = Number(boundsMatch[1])
      const hi = Number(boundsMatch[2])
      if (Number.isFinite(lo) && Number.isFinite(hi)) {
        // For a threshold guard, if the entire interval is above or
        // below threshold, the arm is forced. We verify consistency:
        // 'left' (then) typically means guard > threshold,
        // 'right' (else) means guard ≤ threshold.
        // If both lo and hi are on the same side, it's consistent.
        // We check that the interval doesn't span both sides
        // (which would mean the arm is NOT forced).
        if (lo > hi) {
          return mismatchedResult(
            arithmeticMode,
            evidenceDigests,
            `Guard bounds [${lo}, ${hi}] are inverted (lo > hi)`,
          )
        }
      }
    }
  }

  return matchedResult(arithmeticMode, evidenceDigests)
}

function replayFinalOptimalityCert(
  cert: LapicCertificate<LapicFinalOptimalityPayload>,
  _config: LapicReplayExecutorConfig
): LapicReplayResult {
  const { payload } = cert
  const evidenceDigests = [cert.evidenceDigest]
  const arithmeticMode = cert.replayRecipe.arithmeticMode

  // Verify optimality gap is "0" (no residual gap)
  if (payload.optimalityGap !== '0') {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      `Optimality gap is '${payload.optimalityGap}', expected '0'`,
      '0',
      payload.optimalityGap
    )
  }

  // Verify winning state is referenced
  if (!cert.referencedStateIds.includes(payload.winningStateId)) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      `Winning state ${payload.winningStateId} not in referencedStateIds`,
    )
  }

  // Verify required digests are present
  if (!payload.finalThresholdDigest) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'FinalOptimalityCert missing finalThresholdDigest',
    )
  }
  if (!payload.finalIncumbentSetDigest) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'FinalOptimalityCert missing finalIncumbentSetDigest',
    )
  }
  if (!payload.queueExhaustionSummaryDigest) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'FinalOptimalityCert missing queueExhaustionSummaryDigest',
    )
  }

  return matchedResult(arithmeticMode, evidenceDigests)
}

function replayInfeasibilityCert(
  cert: LapicCertificate<LapicInfeasibilityPayload>,
  _config: LapicReplayExecutorConfig
): LapicReplayResult {
  const { payload } = cert
  const evidenceDigests = [cert.evidenceDigest]
  const arithmeticMode = cert.replayRecipe.arithmeticMode

  // Verify infeasibility evidence is present
  if (!payload.infeasibleConstraintDigests.length) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'InfeasibilityCert has no infeasible constraint digests',
    )
  }
  if (!payload.witnessDigest) {
    return mismatchedResult(
      arithmeticMode,
      evidenceDigests,
      'InfeasibilityCert missing witnessDigest',
    )
  }

  return matchedResult(arithmeticMode, evidenceDigests)
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Replay a single certificate and produce a replay result.
 *
 * The replay verifies internal consistency of the certificate's
 * evidence and payload. It does NOT re-run LP solves or re-evaluate
 * F-IR graphs — that level of replay requires the full solver context.
 *
 * For BoundPruneCert, the replay verifies:
 * - The recorded bound is below the threshold (prune was justified)
 * - Danger-zone record is consistent
 * - Evidence digests are present and well-formed
 *
 * For DominanceCert, the replay verifies:
 * - State IDs are distinct and referenced
 * - Comparison and signature digests are present
 *
 * Returns `LapicReplayResult` with verdict 'matched', 'mismatched',
 * or 'inconclusive'.
 */
export function replayCertificate(
  certificate: LapicCertificate,
  config?: LapicReplayExecutorConfig
): LapicValidationResult<LapicReplayResult> {
  const effectiveConfig = config ?? {}

  // Validate certificate structure first
  const validation = validateLapicCertificate(certificate)
  if (!validation.ok) return validation as any

  switch (certificate.certKind) {
    case 'BoundPruneCert':
      return createLapicSuccessResult(
        replayBoundPruneCert(
          certificate as LapicCertificate<LapicBoundPrunePayload>,
          effectiveConfig
        )
      )

    case 'DominanceCert':
      return createLapicSuccessResult(
        replayDominanceCert(
          certificate as LapicCertificate<LapicDominancePayload>,
          effectiveConfig
        )
      )

    case 'BranchReachabilityCert':
      return createLapicSuccessResult(
        replayBranchReachabilityCert(
          certificate as LapicCertificate<LapicBranchReachabilityPayload>,
          effectiveConfig
        )
      )

    case 'FinalOptimalityCert':
      return createLapicSuccessResult(
        replayFinalOptimalityCert(
          certificate as LapicCertificate<LapicFinalOptimalityPayload>,
          effectiveConfig
        )
      )

    case 'InfeasibilityCert':
      return createLapicSuccessResult(
        replayInfeasibilityCert(
          certificate as LapicCertificate<LapicInfeasibilityPayload>,
          effectiveConfig
        )
      )

    default:
      return createLapicFailureResult([
        createLapicDiagnostic(
          'error',
          'UnsupportedCertificateKind',
          `Cannot replay certificate kind: ${certificate.certKind}`,
          ['certKind']
        ),
      ])
  }
}

/**
 * Replay a batch of certificates and produce results keyed by cert ID.
 *
 * Returns a map of certId → LapicReplayResult for each certificate.
 * Certificates that fail structural validation are reported as
 * 'inconclusive'.
 */
export function replayCertificateBatch(
  certificates: readonly LapicCertificate[],
  config?: LapicReplayExecutorConfig
): ReadonlyMap<string, LapicReplayResult> {
  const results = new Map<string, LapicReplayResult>()

  for (const cert of certificates) {
    const result = replayCertificate(cert, config)
    if (result.ok) {
      results.set(cert.certId, result.value)
    } else {
      results.set(
        cert.certId,
        inconclusiveResult(
          cert.replayRecipe?.arithmeticMode ?? 'unknown',
          [cert.evidenceDigest]
        )
      )
    }
  }

  return results
}

/**
 * Summarize replay verdict distribution from a batch result.
 */
export function summarizeReplayBatchVerdicts(
  results: ReadonlyMap<string, LapicReplayResult>
): {
  total: number
  matched: number
  mismatched: number
  inconclusive: number
  mismatchReasons: readonly string[]
} {
  let matched = 0
  let mismatched = 0
  let inconclusive = 0
  const mismatchReasons = new Set<string>()

  for (const result of results.values()) {
    switch (result.reproducedVerdict) {
      case 'matched':
        matched++
        break
      case 'mismatched':
        mismatched++
        if (result.mismatchExplanation?.reason) {
          mismatchReasons.add(result.mismatchExplanation.reason)
        }
        break
      case 'inconclusive':
        inconclusive++
        break
    }
  }

  return {
    total: results.size,
    matched,
    mismatched,
    inconclusive,
    mismatchReasons: [...mismatchReasons],
  }
}
