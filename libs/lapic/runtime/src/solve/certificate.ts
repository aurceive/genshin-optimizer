import type {
  LapicBoundPrunePayload,
  LapicBranchReachabilityPayload,
  LapicCertificate,
  LapicDangerZoneHandlingRecord,
  LapicDominancePayload,
  LapicFinalOptimalityPayload,
} from '@genshin-optimizer/lapic/cert'
import type { LapicBoundedExactBestCandidate } from './combination'
import type { LapicBoundedExactSolveOptions } from './types'

// ---------------------------------------------------------------------------
// Branch-reachability certificate
// ---------------------------------------------------------------------------

/** Context for creating a branch-reachability certificate. */
export interface LapicBranchReachabilityCertificateContext {
  /** F-IR node ID of the thresholdSelect whose branch is forced. */
  readonly branchNodeId: string
  /** F-IR node ID of the guard predicate. */
  readonly guardNodeId: string
  /** Which arm is proven reachable. Mapped to payload's 'left'/'right'. */
  readonly forcedArm: 'then' | 'else'
  /** Guard lower bound (evidence). */
  readonly guardLower?: number
  /** Guard upper bound (evidence). */
  readonly guardUpper?: number
  /** A-IR region ID where this forcing is valid. */
  readonly validityRegionId: string
  /** Sequential step counter for ordering certificates. */
  readonly stepIndex: number
}

export function createBranchReachabilityCertificate(
  options: LapicBoundedExactSolveOptions,
  context: LapicBranchReachabilityCertificateContext
): LapicCertificate<LapicBranchReachabilityPayload> {
  const branchPredicateDigest = `branch:${context.branchNodeId}:guard:${context.guardNodeId}:${options.problem.problemDigest}`
  const exactBoundsDigest =
    context.guardLower !== undefined && context.guardUpper !== undefined
      ? `bounds:[${context.guardLower},${context.guardUpper}]:${context.guardNodeId}`
      : undefined
  // Map 'then'/'else' to the payload's 'left'/'right' convention
  const selectedArm: 'left' | 'right' =
    context.forcedArm === 'then' ? 'left' : 'right'

  return {
    certId: `cert:branch-reach:${options.problem.problemDigest}:${context.branchNodeId}:step-${context.stepIndex}`,
    certKind: 'BranchReachabilityCert',
    schemaVersion: '0.1.0-draft',
    problemId: options.problem.problemId,
    arithmeticPolicyId: options.problem.arithmeticPolicyId,
    decisionClass: 'exact-prune',
    referencedStateIds: [],
    referencedBlockIds: [],
    referencedRegionIds: [context.validityRegionId],
    referencedRelaxIds: [],
    evidenceDigest: exactBoundsDigest ?? branchPredicateDigest,
    replayRecipe: {
      requiredIrObjects: [options.problem.objective.expressionDigest],
      requiredRegionPredicates: [context.validityRegionId],
      arithmeticMode: 'exact',
      replayPathKind: 'single-certificate',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: context.stepIndex,
    validationStatus: 'validated',
    payload: {
      branchPredicateDigest,
      ...(exactBoundsDigest !== undefined ? { exactBoundsDigest } : {}),
      selectedArm,
      validityRegionId: context.validityRegionId,
    },
  }
}

// ---------------------------------------------------------------------------
// Bound-prune certificate
// ---------------------------------------------------------------------------

/** Context for creating a bound-prune certificate. */
export interface LapicBoundPruneCertificateContext {
  /** The computed admissible upper bound value. */
  readonly boundValue: string
  /** Evidence digest from the bound provider. */
  readonly boundEvidenceDigest: string
  /** Current incumbent threshold value. */
  readonly thresholdValue: string
  /** Which domain level the prune occurred at. */
  readonly domainIndex: number
  /** Sequential step counter for ordering certificates. */
  readonly stepIndex: number
  /** Frontier block IDs referenced by this prune decision. */
  readonly frontierBlockIds: readonly string[]
  /** Danger-zone handling record for this prune decision.
   *  When omitted, defaults to `{ triggered: false, verificationReplayInvoked: false }`. */
  readonly dangerZoneRecord?: LapicDangerZoneHandlingRecord
}

export function createBoundPruneCertificate(
  options: LapicBoundedExactSolveOptions,
  context: LapicBoundPruneCertificateContext
): LapicCertificate<LapicBoundPrunePayload> {
  const regionId = `region:domain-${context.domainIndex}:${options.problem.problemDigest}`
  const thresholdDigest = `threshold:${options.problem.problemDigest}:${context.thresholdValue}`

  return {
    certId: `cert:bound-prune:${options.problem.problemDigest}:step-${context.stepIndex}`,
    certKind: 'BoundPruneCert',
    schemaVersion: '0.1.0-draft',
    problemId: options.problem.problemId,
    arithmeticPolicyId: options.problem.arithmeticPolicyId,
    decisionClass: 'relaxation-prune',
    referencedStateIds: [],
    referencedBlockIds: [...context.frontierBlockIds],
    referencedRegionIds: [regionId],
    referencedRelaxIds: [],
    incumbentDigest: context.thresholdValue,
    evidenceDigest: context.boundEvidenceDigest,
    replayRecipe: {
      requiredIrObjects: [options.problem.objective.expressionDigest],
      requiredRegionPredicates: [regionId],
      arithmeticMode: 'interval',
      replayPathKind: 'single-certificate',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: context.stepIndex,
    validationStatus: 'validated',
    payload: {
      thresholdDigest,
      boundSourceClass: 'relaxationDerived',
      boundValue: context.boundValue,
      validityRegionId: regionId,
      numericDiagnosticsDigest: `numeric:${context.boundEvidenceDigest}`,
      dangerZoneRecord: context.dangerZoneRecord ?? {
        triggered: false,
        verificationReplayInvoked: false,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Final optimality certificate
// ---------------------------------------------------------------------------

export function createFinalOptimalityCertificate(
  options: LapicBoundedExactSolveOptions,
  winners: readonly LapicBoundedExactBestCandidate[],
  frontierBlockIds: readonly string[],
  pruneCertificateIds: readonly string[] = []
): LapicCertificate<LapicFinalOptimalityPayload> {
  const bestWinner = winners[0]!
  const allStateIds = winners.map((winner) => winner.stateId)
  const topN = winners.length
  const incumbentSetDigest = allStateIds.join(',')

  return {
    certId: `cert:final:${options.problem.problemDigest}`,
    certKind: 'FinalOptimalityCert',
    schemaVersion: '0.1.0-draft',
    problemId: options.problem.problemId,
    arithmeticPolicyId: options.problem.arithmeticPolicyId,
    decisionClass: 'optimality-proof',
    referencedStateIds: allStateIds,
    referencedBlockIds: [...frontierBlockIds],
    referencedRegionIds: [],
    referencedRelaxIds: [],
    incumbentDigest: bestWinner.evaluation.objectiveValue,
    evidenceDigest: bestWinner.evaluation.evidenceDigest,
    replayRecipe: {
      requiredIrObjects: [options.problem.objective.expressionDigest],
      requiredRegionPredicates: [],
      arithmeticMode: 'exact',
      replayPathKind: 'full-replay',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: 1,
    validationStatus: 'validated',
    payload: {
      winningStateId: bestWinner.stateId,
      optimalityGap: '0',
      finalThresholdDigest: `threshold:${options.problem.problemDigest}:top-${topN}`,
      finalIncumbentSetDigest: `incumbent:${incumbentSetDigest}`,
      queueExhaustionSummaryDigest: `queue-exhausted:${options.problem.problemDigest}`,
      thresholdPruneSummaryDigest:
        pruneCertificateIds.length > 0
          ? `threshold-prune:${pruneCertificateIds.length}:${options.problem.problemDigest}`
          : `threshold-prune:none:${options.problem.problemDigest}`,
      escalatedReplaySummaryDigest: `replay:none:${options.problem.problemDigest}`,
      stableOrderCompletenessDigest: `stable-order:${incumbentSetDigest}`,
    },
  }
}

export function createInfeasibilityCertificate(
  options: LapicBoundedExactSolveOptions,
  frontierBlockIds: readonly string[]
): LapicCertificate {
  return {
    certId: `cert:infeasible:${options.problem.problemDigest}`,
    certKind: 'InfeasibilityCert',
    schemaVersion: '0.1.0-draft',
    problemId: options.problem.problemId,
    arithmeticPolicyId: options.problem.arithmeticPolicyId,
    decisionClass: 'exact-prune',
    referencedStateIds: [],
    referencedBlockIds: [...frontierBlockIds],
    referencedRegionIds: [],
    referencedRelaxIds: [],
    evidenceDigest: `evidence:infeasible:${options.problem.problemDigest}`,
    replayRecipe: {
      requiredIrObjects: [options.problem.objective.expressionDigest],
      requiredRegionPredicates: [],
      arithmeticMode: 'exact',
      replayPathKind: 'full-replay',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: 1,
    validationStatus: 'validated',
    payload: {
      evidenceSourceClass: 'exactSymbolic',
      infeasibleConstraintDigests: options.problem.constraints.map(
        (constraint) => constraint.expressionDigest
      ),
      witnessDigest: `witness:infeasible:${options.problem.problemDigest}`,
      affectedBlockIds: [...frontierBlockIds],
      replayPathRequirement: 'bounded-cartesian-exhaustion',
    },
  }
}

// ---------------------------------------------------------------------------
// Dominance certificate
// ---------------------------------------------------------------------------

/** Context for creating a dominance certificate. */
export interface LapicDominanceCertificateContext {
  /** State ID of the dominating (superior) candidate combination. */
  readonly dominatingStateId: string
  /** State ID of the dominated (inferior) candidate combination. */
  readonly dominatedStateId: string
  /** Evidence digest of the dominating evaluation. */
  readonly dominatingEvidenceDigest: string
  /** Evidence digest of the dominated evaluation. */
  readonly dominatedEvidenceDigest: string
  /** Signature group key shared by both combinations (e.g., same slot partition). */
  readonly signatureGroupKey: string
  /** Sequential step counter for ordering certificates. */
  readonly stepIndex: number
  /** Frontier block IDs referenced by this dominance decision. */
  readonly frontierBlockIds: readonly string[]
}

export function createDominanceCertificate(
  options: LapicBoundedExactSolveOptions,
  context: LapicDominanceCertificateContext
): LapicCertificate<LapicDominancePayload> {
  const comparisonDigest = `dominance:${context.dominatingStateId}>${context.dominatedStateId}:${options.problem.problemDigest}`
  const signatureDigest = `sig-group:${context.signatureGroupKey}:${options.problem.problemDigest}`

  return {
    certId: `cert:dominance:${options.problem.problemDigest}:step-${context.stepIndex}`,
    certKind: 'DominanceCert',
    schemaVersion: '0.1.0-draft',
    problemId: options.problem.problemId,
    arithmeticPolicyId: options.problem.arithmeticPolicyId,
    decisionClass: 'dominance-prune',
    referencedStateIds: [context.dominatingStateId, context.dominatedStateId],
    referencedBlockIds: [...context.frontierBlockIds],
    referencedRegionIds: [],
    referencedRelaxIds: [],
    incumbentDigest: context.dominatingEvidenceDigest,
    evidenceDigest: comparisonDigest,
    replayRecipe: {
      requiredIrObjects: [options.problem.objective.expressionDigest],
      requiredRegionPredicates: [],
      arithmeticMode: 'exact',
      replayPathKind: 'single-certificate',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: context.stepIndex,
    validationStatus: 'validated',
    payload: {
      dominatingStateId: context.dominatingStateId,
      dominatedStateId: context.dominatedStateId,
      comparisonDigest,
      exactSignatureGroupKeyDigest: signatureDigest,
      compatibilityInclusionDigest: `compat:${context.dominatingStateId}:${context.dominatedStateId}`,
      monotoneProjectionDigest: `monotone:${options.problem.objective.expressionDigest}`,
      upperBoundProfileDigest: `ub-profile:${context.dominatingEvidenceDigest}`,
      strengthComparisonDigest: `strength:${context.dominatingEvidenceDigest}>${context.dominatedEvidenceDigest}`,
    },
  }
}
