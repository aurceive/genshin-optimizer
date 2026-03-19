import { createLapicCertificateSummary } from '@genshin-optimizer/lapic/cert'
import type {
  LapicCertificate,
  LapicFinalOptimalitySummary,
  LapicPotentialDecisionBasis,
  LapicReplayResult,
} from '@genshin-optimizer/lapic/cert'
import {
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicCandidateId,
  LapicCompatibilitySignature,
  LapicDigest,
  LapicExactSignatureGroupKey,
  LapicPotentialSummaryDescriptor,
  LapicTeamProvenance,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicFailureRecord,
  LapicProgressEvent,
  LapicSessionSummary,
  LapicTraceEvent,
} from '@genshin-optimizer/lapic/runtime'
import {
  createLapicCheckpointClosureInventory,
  createLapicDebugArtifactSummary,
  createLapicIntegrityScanResult,
  scanLapicArtifactIntegrity,
  validateLapicArtifactRef,
} from '@genshin-optimizer/lapic/storage'
import type {
  LapicArtifactRef,
  LapicArtifactStore,
  LapicCheckpointClosureVerificationResult,
  LapicIntegrityScanResult,
} from '@genshin-optimizer/lapic/storage'

export const lapicDebugPackageName = 'lapic-debug'
export const lapicDebugSchemaVersion = '0.1.0-draft'

export type LapicDebugSchemaVersion = typeof lapicDebugSchemaVersion

export interface LapicInspectionRequest {
  readonly artifactRef: LapicArtifactRef
  readonly includePayloadSummary: boolean
  readonly includePotentialViews?: boolean
}

export interface LapicArtifactSummary {
  readonly artifactRef: LapicArtifactRef
  readonly envelopeDigest: LapicDigest
  readonly potentialSummaryDigests?: readonly LapicDigest[]
}

export interface LapicStateBlockInspectionView {
  readonly blockRef: LapicArtifactRef
  readonly compatibilitySignature?: LapicCompatibilitySignature
  readonly exactSignatureGroupKey?: LapicExactSignatureGroupKey
  readonly potentialFrontierDigests?: readonly LapicDigest[]
  readonly potentialSummaries?: readonly LapicPotentialSummaryDescriptor[]
  readonly provenance?: LapicTeamProvenance
}

export interface LapicCertificateInspectionView {
  readonly certificate: LapicCertificate
  readonly potentialDecisionBasis?: LapicPotentialDecisionBasis
  readonly replaySummary?: LapicReplayResult
}

export interface LapicFrontierSkylineVisualizationExportDescriptor {
  readonly artifactRef: LapicArtifactRef
  readonly exportDigest: LapicDigest
}

export interface LapicFormulaRegionDecompositionExportDescriptor {
  readonly regionDigest: LapicDigest
  readonly exportDigest: LapicDigest
}

export interface LapicPotentialSummaryView {
  readonly candidateId: LapicCandidateId
  readonly summaries: readonly LapicPotentialSummaryDescriptor[]
}

export interface LapicPotentialGraphInspectionDescriptor {
  readonly outputDigest: LapicDigest
  readonly graphKind: string
  readonly exactness: string
}

export interface LapicTraceQuery {
  readonly sessionId: string
  readonly includeFailures: boolean
}

export interface LapicPhaseSummary {
  readonly sessionId: string
  readonly phase: string
  readonly progressEvents: readonly LapicProgressEvent[]
}

export interface LapicThresholdLineageView {
  readonly thresholdDigest: LapicDigest
  readonly relatedCertificates: readonly string[]
}

export interface LapicFailureTimelineView {
  readonly failures: readonly LapicFailureRecord[]
}

export interface LapicAuditReportRequest {
  readonly sessionId: string
  readonly includeReplayCoverage: boolean
  readonly includePotentialAudit?: boolean
}

export interface LapicCertificateReplayCoverageSummary {
  readonly replayedCertificateIds: readonly string[]
  readonly missingCertificateIds: readonly string[]
}

export interface LapicCheckpointClosureAuditSummary {
  readonly verification: LapicCheckpointClosureVerificationResult
}

export interface LapicReplayInspectionRequest {
  readonly certificateId: string
}

export interface LapicReplayClosureSummary {
  readonly replayResult: LapicReplayResult
  readonly closureArtifacts: readonly LapicArtifactRef[]
}

export interface LapicOfflineReplayBundleDescriptor {
  readonly bundleDigest: LapicDigest
  readonly artifactRefs: readonly LapicArtifactRef[]
}

export interface LapicGoldenEnumerationHarnessConfiguration {
  readonly fixtureId: string
  readonly expectedTopN: number
}

export interface LapicAdapterParityValidationSummary {
  readonly adapterKind: string
  readonly parityMaintained: boolean
}

export interface LapicHarnessReportManifest {
  readonly reportDigest: LapicDigest
  readonly relatedArtifacts: readonly LapicArtifactRef[]
}

export interface LapicBenchmarkReport {
  readonly benchmarkId: string
  readonly environmentLabel: string
  readonly correctnessQualified: boolean
  readonly upgradeFrontierCostShare?: number
  readonly graphOutputCostShare?: number
}

export interface LapicRegressionClassificationSummary {
  readonly classification: 'none' | 'performance' | 'correctness'
  readonly explanation: string
}

export interface LapicPublicationReadyReportManifest {
  readonly benchmark: LapicBenchmarkReport
  readonly regressionSummary: LapicRegressionClassificationSummary
  readonly finalOptimality?: LapicFinalOptimalitySummary
}

export interface LapicPotentialAuditSummary {
  readonly rankingRelevantCertificateCount: number
  readonly auxiliaryOnlyOutputCount: number
  readonly graphOutputCount: number
}

export interface LapicAuditReport {
  readonly session: LapicSessionSummary
  readonly traceEvents: readonly LapicTraceEvent[]
  readonly replayCoverage?: LapicCertificateReplayCoverageSummary
  readonly integrityScan?: LapicIntegrityScanResult
  readonly potentialAuditSummary?: LapicPotentialAuditSummary
}

export interface LapicDebugSkeletonMarker {
  readonly packageName: typeof lapicDebugPackageName
  readonly schemaVersion: LapicDebugSchemaVersion
}

function isRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && value >= 0
}

function createDebugFailure<T>(
  message: string,
  path?: readonly string[]
): LapicValidationResult<T> {
  return createLapicFailureResult([
    {
      severity: 'error',
      code: 'SchemaViolation',
      message,
      path,
    },
  ])
}

export function createLapicInspectionRequest(
  artifactRef: LapicArtifactRef,
  includePayloadSummary: boolean,
  includePotentialViews = false
): LapicInspectionRequest {
  return {
    artifactRef,
    includePayloadSummary,
    includePotentialViews,
  }
}

export function createLapicArtifactSummary(
  artifactRef: LapicArtifactRef,
  envelopeDigest: LapicDigest,
  potentialSummaryDigests: readonly LapicDigest[] = []
): LapicArtifactSummary {
  return {
    artifactRef,
    envelopeDigest,
    potentialSummaryDigests:
      potentialSummaryDigests.length > 0 ? [...potentialSummaryDigests] : undefined,
  }
}

export function createLapicStateBlockInspectionView(
  input: LapicStateBlockInspectionView
): LapicStateBlockInspectionView {
  return {
    blockRef: input.blockRef,
    compatibilitySignature: input.compatibilitySignature,
    exactSignatureGroupKey: input.exactSignatureGroupKey,
    potentialFrontierDigests: input.potentialFrontierDigests
      ? [...input.potentialFrontierDigests]
      : undefined,
    potentialSummaries: input.potentialSummaries
      ? [...input.potentialSummaries]
      : undefined,
    provenance: input.provenance,
  }
}

export function createLapicCertificateInspectionView(
  certificate: LapicCertificate,
  potentialDecisionBasis?: LapicPotentialDecisionBasis,
  replaySummary?: LapicReplayResult
): LapicCertificateInspectionView {
  return {
    certificate,
    potentialDecisionBasis,
    replaySummary,
  }
}

export function createLapicFrontierSkylineVisualizationExportDescriptor(
  artifactRef: LapicArtifactRef,
  exportDigest: LapicDigest
): LapicFrontierSkylineVisualizationExportDescriptor {
  return {
    artifactRef,
    exportDigest,
  }
}

export function createLapicFormulaRegionDecompositionExportDescriptor(
  regionDigest: LapicDigest,
  exportDigest: LapicDigest
): LapicFormulaRegionDecompositionExportDescriptor {
  return {
    regionDigest,
    exportDigest,
  }
}

export function createLapicPotentialSummaryView(
  candidateId: LapicCandidateId,
  summaries: readonly LapicPotentialSummaryDescriptor[]
): LapicPotentialSummaryView {
  return {
    candidateId,
    summaries: [...summaries],
  }
}

export function createLapicPotentialGraphInspectionDescriptor(
  outputDigest: LapicDigest,
  graphKind: string,
  exactness: string
): LapicPotentialGraphInspectionDescriptor {
  return {
    outputDigest,
    graphKind,
    exactness,
  }
}

export function createLapicTraceQuery(
  sessionId: string,
  includeFailures: boolean
): LapicTraceQuery {
  return {
    sessionId,
    includeFailures,
  }
}

export function createLapicPhaseSummary(
  sessionId: string,
  phase: string,
  progressEvents: readonly LapicProgressEvent[]
): LapicPhaseSummary {
  return {
    sessionId,
    phase,
    progressEvents: [...progressEvents],
  }
}

export function createLapicThresholdLineageView(
  thresholdDigest: LapicDigest,
  relatedCertificates: readonly string[]
): LapicThresholdLineageView {
  return {
    thresholdDigest,
    relatedCertificates: [...relatedCertificates],
  }
}

export function createLapicFailureTimelineView(
  failures: readonly LapicFailureRecord[]
): LapicFailureTimelineView {
  return {
    failures: [...failures],
  }
}

export function createLapicAuditReportRequest(
  sessionId: string,
  includeReplayCoverage: boolean,
  includePotentialAudit = false
): LapicAuditReportRequest {
  return {
    sessionId,
    includeReplayCoverage,
    includePotentialAudit,
  }
}

export function createLapicCertificateReplayCoverageSummary(
  replayedCertificateIds: readonly string[],
  missingCertificateIds: readonly string[]
): LapicCertificateReplayCoverageSummary {
  return {
    replayedCertificateIds: [...replayedCertificateIds],
    missingCertificateIds: [...missingCertificateIds],
  }
}

export function createLapicCheckpointClosureAuditSummary(
  verification: LapicCheckpointClosureVerificationResult
): LapicCheckpointClosureAuditSummary {
  return { verification }
}

export function createLapicReplayInspectionRequest(
  certificateId: string
): LapicReplayInspectionRequest {
  return { certificateId }
}

export function createLapicReplayClosureSummary(
  replayResult: LapicReplayResult,
  closureArtifacts: readonly LapicArtifactRef[]
): LapicReplayClosureSummary {
  return {
    replayResult,
    closureArtifacts: [...closureArtifacts],
  }
}

export function createLapicOfflineReplayBundleDescriptor(
  bundleDigest: LapicDigest,
  artifactRefs: readonly LapicArtifactRef[]
): LapicOfflineReplayBundleDescriptor {
  return {
    bundleDigest,
    artifactRefs: [...artifactRefs],
  }
}

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

export function createLapicHarnessReportManifest(
  reportDigest: LapicDigest,
  relatedArtifacts: readonly LapicArtifactRef[]
): LapicHarnessReportManifest {
  return {
    reportDigest,
    relatedArtifacts: [...relatedArtifacts],
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
    upgradeFrontierCostShare,
    graphOutputCostShare,
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
    finalOptimality,
  }
}

export function createLapicPotentialAuditSummary(
  certificates: readonly LapicCertificate[],
  graphOutputCount: number
): LapicPotentialAuditSummary {
  let rankingRelevantCertificateCount = 0
  let auxiliaryOnlyOutputCount = 0

  certificates.forEach((certificate) => {
    const summaryResult = createLapicCertificateSummary(certificate)
    if (!summaryResult.ok) return

    const participationMode = summaryResult.value.potentialParticipationMode
    if (!participationMode) return

    if (
      participationMode === 'full-ranking' ||
      participationMode === 'rerank' ||
      participationMode === 'governed-bonus'
    )
      rankingRelevantCertificateCount += 1
    else if (participationMode === 'auxiliary-only')
      auxiliaryOnlyOutputCount += 1
  })

  return {
    rankingRelevantCertificateCount,
    auxiliaryOnlyOutputCount,
    graphOutputCount,
  }
}

export function validateLapicInspectionRequest(
  request: LapicInspectionRequest
): LapicValidationResult<LapicInspectionRequest> {
  if (!isRecord(request))
    return createDebugFailure('Inspection request must be a record.', ['inspectionRequest'])

  if (!isNonEmptyString(request.artifactRef?.artifactId))
    return createDebugFailure(
      'Artifact ref id must be a non-empty string.',
      ['artifactRef', 'artifactId']
    )

  if (!isBoolean(request.includePayloadSummary))
    return createDebugFailure(
      'includePayloadSummary must be boolean.',
      ['includePayloadSummary']
    )

  if (
    request.includePotentialViews !== undefined &&
    !isBoolean(request.includePotentialViews)
  )
    return createDebugFailure(
      'includePotentialViews must be boolean when present.',
      ['includePotentialViews']
    )

  return createLapicSuccessResult(request)
}

export function validateLapicArtifactSummary(
  summary: LapicArtifactSummary
): LapicValidationResult<LapicArtifactSummary> {
  if (!isRecord(summary))
    return createDebugFailure('Artifact summary must be a record.', ['artifactSummary'])

  if (!isNonEmptyString(summary.artifactRef?.artifactId))
    return createDebugFailure(
      'Artifact summary must include a valid artifact ref.',
      ['artifactRef']
    )

  if (!isNonEmptyString(summary.envelopeDigest))
    return createDebugFailure(
      'Envelope digest must be a non-empty string.',
      ['envelopeDigest']
    )

  if (
    summary.potentialSummaryDigests &&
    (!Array.isArray(summary.potentialSummaryDigests) ||
      !summary.potentialSummaryDigests.every(isNonEmptyString))
  )
    return createDebugFailure(
      'Potential summary digests must contain non-empty strings.',
      ['potentialSummaryDigests']
    )

  return createLapicSuccessResult(summary)
}

export function validateLapicStateBlockInspectionView(
  view: LapicStateBlockInspectionView
): LapicValidationResult<LapicStateBlockInspectionView> {
  if (!isRecord(view))
    return createDebugFailure(
      'State block inspection view must be a record.',
      ['stateBlockInspectionView']
    )

  const blockRefValidation = validateLapicArtifactRef(view.blockRef)
  if (!blockRefValidation.ok)
    return createDebugFailure(
      blockRefValidation.diagnostics[0]?.message ??
        'Block ref must be a valid artifact ref.',
      ['blockRef']
    )

  if (
    view.potentialFrontierDigests &&
    (!Array.isArray(view.potentialFrontierDigests) ||
      !view.potentialFrontierDigests.every(isNonEmptyString))
  )
    return createDebugFailure(
      'Potential frontier digests must contain non-empty strings.',
      ['potentialFrontierDigests']
    )

  if (
    view.potentialSummaries &&
    !Array.isArray(view.potentialSummaries)
  )
    return createDebugFailure(
      'Potential summaries must be an array when present.',
      ['potentialSummaries']
    )

  return createLapicSuccessResult(view)
}

export function validateLapicCertificateInspectionView(
  view: LapicCertificateInspectionView
): LapicValidationResult<LapicCertificateInspectionView> {
  if (!isRecord(view))
    return createDebugFailure(
      'Certificate inspection view must be a record.',
      ['certificateInspectionView']
    )

  if (!isRecord(view.certificate) || !isNonEmptyString(view.certificate.certId))
    return createDebugFailure(
      'Certificate inspection view must contain a valid certificate.',
      ['certificate']
    )

  return createLapicSuccessResult(view)
}

export function validateLapicFrontierSkylineVisualizationExportDescriptor(
  descriptor: LapicFrontierSkylineVisualizationExportDescriptor
): LapicValidationResult<LapicFrontierSkylineVisualizationExportDescriptor> {
  if (!isRecord(descriptor))
    return createDebugFailure(
      'Frontier skyline visualization export descriptor must be a record.',
      ['frontierSkylineVisualizationExportDescriptor']
    )

  const artifactRefValidation = validateLapicArtifactRef(descriptor.artifactRef)
  if (!artifactRefValidation.ok)
    return createDebugFailure(
      artifactRefValidation.diagnostics[0]?.message ??
        'Artifact ref must be valid.',
      ['artifactRef']
    )

  if (!isNonEmptyString(descriptor.exportDigest))
    return createDebugFailure(
      'Export digest must be a non-empty string.',
      ['exportDigest']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicFormulaRegionDecompositionExportDescriptor(
  descriptor: LapicFormulaRegionDecompositionExportDescriptor
): LapicValidationResult<LapicFormulaRegionDecompositionExportDescriptor> {
  if (!isRecord(descriptor))
    return createDebugFailure(
      'Formula region decomposition export descriptor must be a record.',
      ['formulaRegionDecompositionExportDescriptor']
    )

  if (
    !isNonEmptyString(descriptor.regionDigest) ||
    !isNonEmptyString(descriptor.exportDigest)
  )
    return createDebugFailure(
      'Region and export digests must be non-empty strings.',
      ['formulaRegionDecompositionExportDescriptor']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicPotentialSummaryView(
  view: LapicPotentialSummaryView
): LapicValidationResult<LapicPotentialSummaryView> {
  if (!isRecord(view))
    return createDebugFailure(
      'Potential summary view must be a record.',
      ['potentialSummaryView']
    )

  if (!isNonEmptyString(view.candidateId))
    return createDebugFailure(
      'Candidate id must be a non-empty string.',
      ['candidateId']
    )

  if (!Array.isArray(view.summaries))
    return createDebugFailure(
      'Summaries must be an array.',
      ['summaries']
    )

  return createLapicSuccessResult(view)
}

export function validateLapicPotentialGraphInspectionDescriptor(
  descriptor: LapicPotentialGraphInspectionDescriptor
): LapicValidationResult<LapicPotentialGraphInspectionDescriptor> {
  if (!isRecord(descriptor))
    return createDebugFailure(
      'Potential graph inspection descriptor must be a record.',
      ['potentialGraphInspectionDescriptor']
    )

  if (
    !isNonEmptyString(descriptor.outputDigest) ||
    !isNonEmptyString(descriptor.graphKind) ||
    !isNonEmptyString(descriptor.exactness)
  )
    return createDebugFailure(
      'Output digest, graph kind, and exactness must be non-empty strings.',
      ['potentialGraphInspectionDescriptor']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicTraceQuery(
  query: LapicTraceQuery
): LapicValidationResult<LapicTraceQuery> {
  if (!isRecord(query))
    return createDebugFailure('Trace query must be a record.', ['traceQuery'])

  if (!isNonEmptyString(query.sessionId))
    return createDebugFailure('Session id must be a non-empty string.', ['sessionId'])

  if (!isBoolean(query.includeFailures))
    return createDebugFailure('includeFailures must be boolean.', ['includeFailures'])

  return createLapicSuccessResult(query)
}

export function validateLapicPhaseSummary(
  summary: LapicPhaseSummary
): LapicValidationResult<LapicPhaseSummary> {
  if (!isRecord(summary))
    return createDebugFailure('Phase summary must be a record.', ['phaseSummary'])

  if (!isNonEmptyString(summary.sessionId))
    return createDebugFailure('Session id must be a non-empty string.', ['sessionId'])

  if (!isNonEmptyString(summary.phase))
    return createDebugFailure('Phase must be a non-empty string.', ['phase'])

  if (!Array.isArray(summary.progressEvents))
    return createDebugFailure('Progress events must be an array.', ['progressEvents'])

  return createLapicSuccessResult(summary)
}

export function validateLapicFailureTimelineView(
  view: LapicFailureTimelineView
): LapicValidationResult<LapicFailureTimelineView> {
  if (!isRecord(view))
    return createDebugFailure(
      'Failure timeline view must be a record.',
      ['failureTimelineView']
    )

  if (!Array.isArray(view.failures))
    return createDebugFailure('Failures must be an array.', ['failures'])

  return createLapicSuccessResult(view)
}

export function validateLapicAuditReportRequest(
  request: LapicAuditReportRequest
): LapicValidationResult<LapicAuditReportRequest> {
  if (!isRecord(request))
    return createDebugFailure(
      'Audit report request must be a record.',
      ['auditReportRequest']
    )

  if (!isNonEmptyString(request.sessionId))
    return createDebugFailure('Session id must be a non-empty string.', ['sessionId'])

  if (!isBoolean(request.includeReplayCoverage))
    return createDebugFailure(
      'includeReplayCoverage must be boolean.',
      ['includeReplayCoverage']
    )

  if (
    request.includePotentialAudit !== undefined &&
    !isBoolean(request.includePotentialAudit)
  )
    return createDebugFailure(
      'includePotentialAudit must be boolean when present.',
      ['includePotentialAudit']
    )

  return createLapicSuccessResult(request)
}

export function validateLapicCertificateReplayCoverageSummary(
  summary: LapicCertificateReplayCoverageSummary
): LapicValidationResult<LapicCertificateReplayCoverageSummary> {
  if (!isRecord(summary))
    return createDebugFailure(
      'Certificate replay coverage summary must be a record.',
      ['certificateReplayCoverageSummary']
    )

  if (
    !Array.isArray(summary.replayedCertificateIds) ||
    !summary.replayedCertificateIds.every(isNonEmptyString) ||
    !Array.isArray(summary.missingCertificateIds) ||
    !summary.missingCertificateIds.every(isNonEmptyString)
  )
    return createDebugFailure(
      'Replay coverage id lists must contain non-empty strings.',
      ['certificateReplayCoverageSummary']
    )

  return createLapicSuccessResult(summary)
}

export function validateLapicCheckpointClosureAuditSummary(
  summary: LapicCheckpointClosureAuditSummary
): LapicValidationResult<LapicCheckpointClosureAuditSummary> {
  if (!isRecord(summary))
    return createDebugFailure(
      'Checkpoint closure audit summary must be a record.',
      ['checkpointClosureAuditSummary']
    )

  if (
    !isRecord(summary.verification) ||
    !isNonEmptyString(summary.verification.checkpointId)
  )
    return createDebugFailure(
      'Verification must be a valid checkpoint verification result.',
      ['verification']
    )

  return createLapicSuccessResult(summary)
}

export function validateLapicBenchmarkReport(
  report: LapicBenchmarkReport
): LapicValidationResult<LapicBenchmarkReport> {
  if (!isRecord(report))
    return createDebugFailure('Benchmark report must be a record.', ['benchmarkReport'])

  if (!isNonEmptyString(report.benchmarkId))
    return createDebugFailure(
      'Benchmark id must be a non-empty string.',
      ['benchmarkId']
    )

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

export function validateLapicPotentialAuditSummary(
  summary: LapicPotentialAuditSummary
): LapicValidationResult<LapicPotentialAuditSummary> {
  if (!isRecord(summary))
    return createDebugFailure(
      'Potential audit summary must be a record.',
      ['potentialAuditSummary']
    )

  if (
    !isNonNegativeInteger(summary.rankingRelevantCertificateCount) ||
    !isNonNegativeInteger(summary.auxiliaryOnlyOutputCount) ||
    !isNonNegativeInteger(summary.graphOutputCount)
  )
    return createDebugFailure(
      'Potential audit counters must be non-negative integers.',
      ['potentialAuditSummary']
    )

  return createLapicSuccessResult(summary)
}

export function validateLapicAuditReport(
  report: LapicAuditReport
): LapicValidationResult<LapicAuditReport> {
  if (!isRecord(report))
    return createDebugFailure('Audit report must be a record.', ['auditReport'])

  if (!isNonEmptyString(report.session.identity.sessionId))
    return createDebugFailure(
      'Audit report must include a valid session summary.',
      ['session']
    )

  if (!Array.isArray(report.traceEvents))
    return createDebugFailure('Trace events must be an array.', ['traceEvents'])

  return createLapicSuccessResult(report)
}

export function validateLapicReplayInspectionRequest(
  request: LapicReplayInspectionRequest
): LapicValidationResult<LapicReplayInspectionRequest> {
  if (!isRecord(request))
    return createDebugFailure(
      'Replay inspection request must be a record.',
      ['replayInspectionRequest']
    )

  if (!isNonEmptyString(request.certificateId))
    return createDebugFailure(
      'Certificate id must be a non-empty string.',
      ['certificateId']
    )

  return createLapicSuccessResult(request)
}

export function validateLapicReplayClosureSummary(
  summary: LapicReplayClosureSummary
): LapicValidationResult<LapicReplayClosureSummary> {
  if (!isRecord(summary))
    return createDebugFailure(
      'Replay closure summary must be a record.',
      ['replayClosureSummary']
    )

  if (!isRecord(summary.replayResult))
    return createDebugFailure(
      'Replay result must be a record.',
      ['replayResult']
    )

  if (!Array.isArray(summary.closureArtifacts))
    return createDebugFailure(
      'Closure artifacts must be an array.',
      ['closureArtifacts']
    )

  for (const [index, artifactRef] of summary.closureArtifacts.entries()) {
    const validation = validateLapicArtifactRef(artifactRef)
    if (!validation.ok)
      return createDebugFailure(
        validation.diagnostics[0]?.message ??
          'Closure artifacts must contain valid artifact refs.',
        ['closureArtifacts', String(index)]
      )
  }

  return createLapicSuccessResult(summary)
}

export function validateLapicOfflineReplayBundleDescriptor(
  descriptor: LapicOfflineReplayBundleDescriptor
): LapicValidationResult<LapicOfflineReplayBundleDescriptor> {
  if (!isRecord(descriptor))
    return createDebugFailure(
      'Offline replay bundle descriptor must be a record.',
      ['offlineReplayBundleDescriptor']
    )

  if (!isNonEmptyString(descriptor.bundleDigest))
    return createDebugFailure(
      'Bundle digest must be a non-empty string.',
      ['bundleDigest']
    )

  if (!Array.isArray(descriptor.artifactRefs))
    return createDebugFailure(
      'Artifact refs must be an array.',
      ['artifactRefs']
    )

  for (const [index, artifactRef] of descriptor.artifactRefs.entries()) {
    const validation = validateLapicArtifactRef(artifactRef)
    if (!validation.ok)
      return createDebugFailure(
        validation.diagnostics[0]?.message ??
          'Artifact refs must contain valid artifact refs.',
        ['artifactRefs', String(index)]
      )
  }

  return createLapicSuccessResult(descriptor)
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
    return createDebugFailure(
      'Fixture id must be a non-empty string.',
      ['fixtureId']
    )

  if (!isNonNegativeInteger(configuration.expectedTopN) || configuration.expectedTopN < 1)
    return createDebugFailure(
      'expectedTopN must be a positive integer.',
      ['expectedTopN']
    )

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
    return createDebugFailure(
      'Adapter kind must be a non-empty string.',
      ['adapterKind']
    )

  if (!isBoolean(summary.parityMaintained))
    return createDebugFailure(
      'parityMaintained must be boolean.',
      ['parityMaintained']
    )

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
    return createDebugFailure(
      'Report digest must be a non-empty string.',
      ['reportDigest']
    )

  if (!Array.isArray(manifest.relatedArtifacts))
    return createDebugFailure(
      'Related artifacts must be an array.',
      ['relatedArtifacts']
    )

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
    return createDebugFailure(
      'Regression classification must be supported.',
      ['classification']
    )

  if (!isNonEmptyString(summary.explanation))
    return createDebugFailure(
      'Explanation must be a non-empty string.',
      ['explanation']
    )

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
    (candidate.graphOutputCostShare ?? 0) -
    (baseline.graphOutputCostShare ?? 0)

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

export function summarizeLapicTraceByPhase(
  query: LapicTraceQuery,
  progressEvents: readonly LapicProgressEvent[]
): readonly LapicPhaseSummary[] {
  const filtered = progressEvents.filter(
    (event) => event.sessionId === query.sessionId
  )
  const phases = new Map<string, LapicProgressEvent[]>()

  filtered.forEach((event) => {
    const phaseEvents = phases.get(event.phase) ?? []
    phaseEvents.push(event)
    phases.set(event.phase, phaseEvents)
  })

  return [...phases.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([phase, phaseEvents]) =>
      createLapicPhaseSummary(query.sessionId, phase, phaseEvents)
    )
}

export function createLapicThresholdLineageFromCertificates(
  certificates: readonly LapicCertificate[]
): readonly LapicThresholdLineageView[] {
  const thresholdToCertificates = new Map<string, string[]>()

  certificates.forEach((certificate) => {
    const summaryResult = createLapicCertificateSummary(certificate)
    if (!summaryResult.ok || !summaryResult.value.thresholdDigest) return

    const certIds = thresholdToCertificates.get(summaryResult.value.thresholdDigest) ?? []
    certIds.push(certificate.certId)
    thresholdToCertificates.set(summaryResult.value.thresholdDigest, certIds)
  })

  return [...thresholdToCertificates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([thresholdDigest, relatedCertificates]) =>
      createLapicThresholdLineageView(thresholdDigest, relatedCertificates)
    )
}

export function summarizeLapicFailures(
  failures: readonly LapicFailureRecord[],
  sessionId?: string
): LapicFailureTimelineView {
  return createLapicFailureTimelineView(
    sessionId
      ? failures.filter((failure) => failure.sessionId === sessionId)
      : failures
  )
}

export async function inspectLapicArtifact(
  store: LapicArtifactStore,
  request: LapicInspectionRequest
): Promise<LapicValidationResult<LapicArtifactSummary>> {
  const requestValidation = validateLapicInspectionRequest(request)
  if (!requestValidation.ok) return requestValidation

  try {
    const readResult = await store.read({ artifactRef: request.artifactRef })
    const summary = createLapicArtifactSummary(
      request.artifactRef,
      readResult.envelope.contentHash,
      request.includePotentialViews ? [readResult.payloadDigest] : []
    )
    return createLapicSuccessResult(summary)
  } catch {
    return createDebugFailure('Referenced artifact could not be inspected.', [
      'artifactRef',
    ])
  }
}

export async function createLapicCheckpointClosureAuditReport(
  store: LapicArtifactStore,
  verification: LapicCheckpointClosureVerificationResult,
  artifactRefs: readonly LapicArtifactRef[]
): Promise<{
  readonly closure: LapicCheckpointClosureAuditSummary
  readonly integrityScan: LapicIntegrityScanResult
}> {
  const integrityScan = await scanLapicArtifactIntegrity(store, { artifactRefs })

  return {
    closure: createLapicCheckpointClosureAuditSummary(verification),
    integrityScan,
  }
}

export async function createLapicAuditReport(
  store: LapicArtifactStore,
  request: LapicAuditReportRequest,
  session: LapicSessionSummary,
  traceEvents: readonly LapicTraceEvent[],
  certificates: readonly LapicCertificate[],
  artifactRefs: readonly LapicArtifactRef[]
): Promise<LapicAuditReport> {
  const integrityScan = await scanLapicArtifactIntegrity(store, { artifactRefs })
  const replayedCertificateIds = request.includeReplayCoverage
    ? certificates
        .filter((certificate) => certificate.validationStatus === 'validated')
        .map((certificate) => certificate.certId)
        .sort((left, right) => left.localeCompare(right))
    : undefined
  const missingCertificateIds = request.includeReplayCoverage
    ? certificates
        .filter((certificate) => certificate.validationStatus !== 'validated')
        .map((certificate) => certificate.certId)
        .sort((left, right) => left.localeCompare(right))
    : undefined

  return {
    session,
    traceEvents: [...traceEvents].sort((left, right) =>
      left.eventDigest.localeCompare(right.eventDigest)
    ),
    replayCoverage:
      replayedCertificateIds && missingCertificateIds
        ? createLapicCertificateReplayCoverageSummary(
            replayedCertificateIds,
            missingCertificateIds
          )
        : undefined,
    integrityScan,
    potentialAuditSummary: request.includePotentialAudit
      ? createLapicPotentialAuditSummary(certificates, 0)
      : undefined,
  }
}

export function createLapicReplayCoverageFromCertificates(
  certificates: readonly LapicCertificate[],
  replayedCertificateIds: readonly string[]
): LapicCertificateReplayCoverageSummary {
  const allIds = certificates.map((certificate) => certificate.certId)
  const replayed = [...replayedCertificateIds].sort((left, right) =>
    left.localeCompare(right)
  )
  const missing = allIds
    .filter((certId) => !replayed.includes(certId))
    .sort((left, right) => left.localeCompare(right))

  return createLapicCertificateReplayCoverageSummary(replayed, missing)
}

export function createLapicReplayBundleDescriptor(
  certificateId: string,
  artifactRefs: readonly LapicArtifactRef[]
): LapicOfflineReplayBundleDescriptor {
  return createLapicOfflineReplayBundleDescriptor(
    `replay-bundle:${certificateId}`,
    artifactRefs
  )
}

export function createLapicCheckpointInventoryDebugSummary(
  checkpointId: string,
  requiredArtifacts: readonly LapicArtifactRef[],
  missingArtifacts: readonly LapicArtifactRef[]
) {
  return createLapicCheckpointClosureInventory(
    checkpointId,
    requiredArtifacts,
    missingArtifacts
  )
}

export function createLapicArtifactDebugSummary(
  artifactRef: LapicArtifactRef,
  summaryDigest: LapicDigest
) {
  return createLapicDebugArtifactSummary(artifactRef, summaryDigest)
}

export const lapicDebugSkeleton: LapicDebugSkeletonMarker = {
  packageName: lapicDebugPackageName,
  schemaVersion: lapicDebugSchemaVersion,
}

export {
  createLapicCheckpointClosureInventory,
  createLapicIntegrityScanResult,
}
