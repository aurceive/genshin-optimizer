/**
 * Stateless evaluator builder for partition dispatch workers.
 *
 * Used by both secondary compute workers (LapicComputeWorker) and
 * the primary worker's local in-process dispatcher.  Returns a
 * single-argument evaluator: (combination) → validation result.
 */

import type { ArtifactBuildData } from '@genshin-optimizer/gi/solver'
import type { precompute } from '@genshin-optimizer/gi/wr'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactCombinationEvaluation,
} from '@genshin-optimizer/lapic/runtime'

export function buildPartitionEvaluator(
  compute: ReturnType<typeof precompute>,
  artifactById: Map<string, ArtifactBuildData>,
  constraintMinimums: readonly number[],
  slotCount: number
): (
  combination: LapicBoundedExactCandidateCombination
) => LapicValidationResult<LapicBoundedExactCombinationEvaluation> {
  return (combination) => {
    const buffer: ArtifactBuildData[] = []
    for (const candidate of combination.candidates) {
      const art = artifactById.get(candidate.candidateId)
      if (!art) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'ARTIFACT_NOT_FOUND',
              message: `Artifact not found: ${candidate.candidateId}`,
              path: ['candidateId'],
            },
          ],
        }
      }
      buffer.push(art)
    }

    const result = compute(
      buffer as readonly {
        readonly values: Readonly<Record<string, number>>
      }[] & { length: typeof slotCount }
    )

    for (let c = 0; c < constraintMinimums.length; c++) {
      if (result[c] < constraintMinimums[c]) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'CONSTRAINT_VIOLATED',
              message: `Constraint ${c} violated: ${result[c]} < ${constraintMinimums[c]}`,
              path: ['constraint', String(c)],
            },
          ],
        }
      }
    }

    const objectiveValue = result[constraintMinimums.length]
    return {
      ok: true,
      value: {
        objectiveValue: String(objectiveValue),
        evidenceDigest: `gi-precompute:${objectiveValue}`,
      },
      diagnostics: [],
    }
  }
}
