import type { LapicBenchmarkReport } from '../types'
import type { LapicRegressionClassificationSummary } from '../types'
import { createLapicRegressionClassificationSummary } from './builders'

export function classifyLapicBenchmarkRegression(
  baseline: LapicBenchmarkReport,
  candidate: LapicBenchmarkReport
): LapicRegressionClassificationSummary {
  if (baseline.correctnessQualified && !candidate.correctnessQualified)
    return createLapicRegressionClassificationSummary(
      'correctness',
      'Candidate benchmark lost correctness qualification relative to baseline.'
    )

  const upgradeDelta =
    (candidate.upgradeFrontierCostShare ?? 0) -
    (baseline.upgradeFrontierCostShare ?? 0)
  const graphDelta =
    (candidate.graphOutputCostShare ?? 0) - (baseline.graphOutputCostShare ?? 0)

  if (upgradeDelta > 0.05 || graphDelta > 0.05)
    return createLapicRegressionClassificationSummary(
      'performance',
      'Candidate benchmark increased measured upgrade-frontier or graph-output cost share.'
    )

  return createLapicRegressionClassificationSummary(
    'none',
    'Candidate benchmark preserved correctness qualification without material cost-share regression.'
  )
}
