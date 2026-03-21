import type {
  LapicCertificate,
  LapicFinalOptimalityPayload,
} from '@genshin-optimizer/lapic/cert'
import type { LapicBoundedExactBestCandidate } from './combination'
import type { LapicBoundedExactSolveOptions } from './types'

export function createFinalOptimalityCertificate(
  options: LapicBoundedExactSolveOptions,
  winners: readonly LapicBoundedExactBestCandidate[],
  frontierBlockIds: readonly string[]
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
      thresholdPruneSummaryDigest: `threshold-prune:none:${options.problem.problemDigest}`,
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
