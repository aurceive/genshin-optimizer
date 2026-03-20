import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import { validateLapicArtifactRef } from '@genshin-optimizer/lapic/storage'
import type {
  LapicAdapterParityValidationSummary,
  LapicBenchmarkReport,
  LapicGoldenEnumerationHarnessConfiguration,
  LapicHarnessReportManifest,
  LapicPublicationReadyReportManifest,
  LapicRegressionClassificationSummary,
  LapicSolveSliceHarnessReport,
} from '../types'
import {
  createDebugFailure,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from '../validation/internal'

export function validateLapicBenchmarkReport(
  report: LapicBenchmarkReport
): LapicValidationResult<LapicBenchmarkReport> {
  if (!isRecord(report))
    return createDebugFailure('Benchmark report must be a record.', ['benchmarkReport'])

  if (!isNonEmptyString(report.benchmarkId))
    return createDebugFailure('Benchmark id must be a non-empty string.', ['benchmarkId'])

  if (!isNonEmptyString(report.environmentLabel))
    return createDebugFailure(
      'Environment label must be a non-empty string.',
      ['environmentLabel']
    )

  if (!isBoolean(report.correctnessQualified))
    return createDebugFailure(
      'correctnessQualified must be boolean.',
      ['correctnessQualified']
    )

  return createLapicSuccessResult(report)
}

export function validateLapicGoldenEnumerationHarnessConfiguration(
  configuration: LapicGoldenEnumerationHarnessConfiguration
): LapicValidationResult<LapicGoldenEnumerationHarnessConfiguration> {
  if (!isRecord(configuration))
    return createDebugFailure(
      'Golden enumeration harness configuration must be a record.',
      ['goldenEnumerationHarnessConfiguration']
    )

  if (!isNonEmptyString(configuration.fixtureId))
    return createDebugFailure('Fixture id must be a non-empty string.', ['fixtureId'])

  if (
    !isNonNegativeInteger(configuration.expectedTopN) ||
    configuration.expectedTopN < 1
  )
    return createDebugFailure('expectedTopN must be a positive integer.', ['expectedTopN'])

  return createLapicSuccessResult(configuration)
}

export function validateLapicAdapterParityValidationSummary(
  summary: LapicAdapterParityValidationSummary
): LapicValidationResult<LapicAdapterParityValidationSummary> {
  if (!isRecord(summary))
    return createDebugFailure(
      'Adapter parity validation summary must be a record.',
      ['adapterParityValidationSummary']
    )

  if (!isNonEmptyString(summary.adapterKind))
    return createDebugFailure('Adapter kind must be a non-empty string.', ['adapterKind'])

  if (!isBoolean(summary.parityMaintained))
    return createDebugFailure('parityMaintained must be boolean.', ['parityMaintained'])

  return createLapicSuccessResult(summary)
}

export function validateLapicHarnessReportManifest(
  manifest: LapicHarnessReportManifest
): LapicValidationResult<LapicHarnessReportManifest> {
  if (!isRecord(manifest))
    return createDebugFailure(
      'Harness report manifest must be a record.',
      ['harnessReportManifest']
    )

  if (!isNonEmptyString(manifest.reportDigest))
    return createDebugFailure('Report digest must be a non-empty string.', ['reportDigest'])

  if (!Array.isArray(manifest.relatedArtifacts))
    return createDebugFailure('Related artifacts must be an array.', ['relatedArtifacts'])

  for (const [index, artifactRef] of manifest.relatedArtifacts.entries()) {
    const validation = validateLapicArtifactRef(artifactRef)
    if (!validation.ok)
      return createDebugFailure(
        validation.diagnostics[0]?.message ??
          'Related artifacts must contain valid artifact refs.',
        ['relatedArtifacts', String(index)]
      )
  }

  return createLapicSuccessResult(manifest)
}

export function validateLapicRegressionClassificationSummary(
  summary: LapicRegressionClassificationSummary
): LapicValidationResult<LapicRegressionClassificationSummary> {
  if (!isRecord(summary))
    return createDebugFailure(
      'Regression classification summary must be a record.',
      ['regressionClassificationSummary']
    )

  if (
    summary.classification !== 'none' &&
    summary.classification !== 'performance' &&
    summary.classification !== 'correctness'
  )
    return createDebugFailure('Regression classification must be supported.', ['classification'])

  if (!isNonEmptyString(summary.explanation))
    return createDebugFailure('Explanation must be a non-empty string.', ['explanation'])

  return createLapicSuccessResult(summary)
}

export function validateLapicPublicationReadyReportManifest(
  manifest: LapicPublicationReadyReportManifest
): LapicValidationResult<LapicPublicationReadyReportManifest> {
  if (!isRecord(manifest))
    return createDebugFailure(
      'Publication ready report manifest must be a record.',
      ['publicationReadyReportManifest']
    )

  const benchmarkValidation = validateLapicBenchmarkReport(manifest.benchmark)
  if (!benchmarkValidation.ok) return benchmarkValidation

  const regressionValidation = validateLapicRegressionClassificationSummary(
    manifest.regressionSummary
  )
  if (!regressionValidation.ok) return regressionValidation

  return createLapicSuccessResult(manifest)
}

export function validateLapicSolveSliceHarnessReport(
  report: LapicSolveSliceHarnessReport
): LapicValidationResult<LapicSolveSliceHarnessReport> {
  if (!isRecord(report))
    return createDebugFailure(
      'Solve slice harness report must be a record.',
      ['solveSliceHarnessReport']
    )

  const harnessManifestValidation = validateLapicHarnessReportManifest(
    report.harnessManifest
  )
  if (!harnessManifestValidation.ok) return harnessManifestValidation

  const publicationManifestValidation = validateLapicPublicationReadyReportManifest(
    report.publicationManifest
  )
  if (!publicationManifestValidation.ok) return publicationManifestValidation

  if (!Array.isArray(report.phaseSummaries))
    return createDebugFailure('phaseSummaries must be an array.', ['phaseSummaries'])

  if (!Array.isArray(report.thresholdLineage))
    return createDebugFailure(
      'thresholdLineage must be an array.',
      ['thresholdLineage']
    )

  return createLapicSuccessResult(report)
}
