import { createLapicHarnessReportManifest } from '../audit/builders'
import {
  createLapicAdapterParityValidationSummary,
  createLapicBenchmarkReport,
  createLapicGoldenEnumerationHarnessConfiguration,
  createLapicPublicationReadyReportManifest,
  createLapicRegressionClassificationSummary,
} from './builders'
import { classifyLapicBenchmarkRegression } from './index'
import {
  validateLapicAdapterParityValidationSummary,
  validateLapicGoldenEnumerationHarnessConfiguration,
  validateLapicHarnessReportManifest,
  validateLapicPublicationReadyReportManifest,
  validateLapicRegressionClassificationSummary,
} from './validation'

describe('lapic debug benchmark', () => {
  it('omits undefined optional fields from benchmark constructor helpers', () => {
    const benchmark = createLapicBenchmarkReport(
      'benchmark-id',
      'browser',
      true
    )
    const publicationManifest = createLapicPublicationReadyReportManifest(
      benchmark,
      createLapicRegressionClassificationSummary('none', 'stable')
    )

    expect('upgradeFrontierCostShare' in benchmark).toBe(false)
    expect('finalOptimality' in publicationManifest).toBe(false)
  })

  it('validates harness and publication helper shapes', () => {
    const artifactRef = {
      artifactId: 'artifact-id',
      artifactKind: 'certificate' as const,
      contentHash: 'content-hash',
    }

    expect(
      validateLapicGoldenEnumerationHarnessConfiguration(
        createLapicGoldenEnumerationHarnessConfiguration('fixture-id', 3)
      ).ok
    ).toBe(true)
    expect(
      validateLapicAdapterParityValidationSummary(
        createLapicAdapterParityValidationSummary('gi', true)
      ).ok
    ).toBe(true)
    expect(
      validateLapicHarnessReportManifest(
        createLapicHarnessReportManifest('report-digest', [artifactRef])
      ).ok
    ).toBe(true)
    expect(
      validateLapicRegressionClassificationSummary(
        createLapicRegressionClassificationSummary(
          'performance',
          'cost share increased'
        )
      ).ok
    ).toBe(true)
    expect(
      validateLapicPublicationReadyReportManifest(
        createLapicPublicationReadyReportManifest(
          createLapicBenchmarkReport('benchmark-id', 'node', true, 0.1, 0.2),
          createLapicRegressionClassificationSummary(
            'none',
            'no regression detected'
          )
        )
      ).ok
    ).toBe(true)
  })

  it('classifies benchmark regressions deterministically', () => {
    const performanceRegression = classifyLapicBenchmarkRegression(
      createLapicBenchmarkReport('baseline', 'node', true, 0.1, 0.1),
      createLapicBenchmarkReport('candidate', 'node', true, 0.2, 0.11)
    )
    const correctnessRegression = classifyLapicBenchmarkRegression(
      createLapicBenchmarkReport('baseline', 'node', true, 0.1, 0.1),
      createLapicBenchmarkReport('candidate', 'node', false, 0.1, 0.1)
    )
    const noRegression = classifyLapicBenchmarkRegression(
      createLapicBenchmarkReport('baseline', 'node', true, 0.1, 0.1),
      createLapicBenchmarkReport('candidate', 'node', true, 0.11, 0.1)
    )

    expect(performanceRegression.classification).toBe('performance')
    expect(correctnessRegression.classification).toBe('correctness')
    expect(noRegression.classification).toBe('none')
  })
})