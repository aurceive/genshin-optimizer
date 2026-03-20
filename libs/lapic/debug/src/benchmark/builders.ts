import type { LapicFinalOptimalitySummary } from '@genshin-optimizer/lapic/cert'
import type {
  LapicAdapterParityValidationSummary,
  LapicBenchmarkReport,
  LapicGoldenEnumerationHarnessConfiguration,
  LapicPublicationReadyReportManifest,
  LapicRegressionClassificationSummary,
} from '../types'

export function createLapicGoldenEnumerationHarnessConfiguration(
  fixtureId: string,
  expectedTopN: number
): LapicGoldenEnumerationHarnessConfiguration {
  return {
    fixtureId,
    expectedTopN,
  }
}

export function createLapicAdapterParityValidationSummary(
  adapterKind: string,
  parityMaintained: boolean
): LapicAdapterParityValidationSummary {
  return {
    adapterKind,
    parityMaintained,
  }
}

export function createLapicBenchmarkReport(
  benchmarkId: string,
  environmentLabel: string,
  correctnessQualified: boolean,
  upgradeFrontierCostShare?: number,
  graphOutputCostShare?: number
): LapicBenchmarkReport {
  return {
    benchmarkId,
    environmentLabel,
    correctnessQualified,
    ...(upgradeFrontierCostShare !== undefined ? { upgradeFrontierCostShare } : {}),
    ...(graphOutputCostShare !== undefined ? { graphOutputCostShare } : {}),
  }
}

export function createLapicRegressionClassificationSummary(
  classification: LapicRegressionClassificationSummary['classification'],
  explanation: string
): LapicRegressionClassificationSummary {
  return {
    classification,
    explanation,
  }
}

export function createLapicPublicationReadyReportManifest(
  benchmark: LapicBenchmarkReport,
  regressionSummary: LapicRegressionClassificationSummary,
  finalOptimality?: LapicFinalOptimalitySummary
): LapicPublicationReadyReportManifest {
  return {
    benchmark,
    regressionSummary,
    ...(finalOptimality !== undefined ? { finalOptimality } : {}),
  }
}
