import type {
  LapicCertificate,
  LapicFinalOptimalityPayload,
} from '@genshin-optimizer/lapic/cert'
import type { LapicBoundedExactCombinationEvaluation, LapicBoundedExactSolveOptions } from './types'

export function createFinalOptimalityCertificate(
  options: LapicBoundedExactSolveOptions,
  winningStateId: string,
  winningEvaluation: LapicBoundedExactCombinationEvaluation,
  frontierBlockIds: readonly string[]
): LapicCertificate<LapicFinalOptimalityPayload> {
  return {
    certId: `cert:final:${options.problem.problemDigest}`,
    certKind: 'FinalOptimalityCert',
    schemaVersion: '0.1.0-draft',
    problemId: options.problem.problemId,
    arithmeticPolicyId: options.problem.arithmeticPolicyId,
    decisionClass: 'optimality-proof',
    referencedStateIds: [winningStateId],
    referencedBlockIds: [...frontierBlockIds],
    referencedRegionIds: [],
    referencedRelaxIds: [],
    incumbentDigest: winningEvaluation.objectiveValue,
    evidenceDigest: winningEvaluation.evidenceDigest,
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
      winningStateId,
      optimalityGap: '0',
      finalThresholdDigest: `threshold:${options.problem.problemDigest}:top-1`,
      finalIncumbentSetDigest: `incumbent:${winningStateId}`,
      queueExhaustionSummaryDigest: `queue-exhausted:${options.problem.problemDigest}`,
      thresholdPruneSummaryDigest: `threshold-prune:none:${options.problem.problemDigest}`,
      escalatedReplaySummaryDigest: `replay:none:${options.problem.problemDigest}`,
      stableOrderCompletenessDigest: `stable-order:${winningStateId}`,
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
