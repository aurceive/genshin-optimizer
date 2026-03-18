import type {
  LapicCertificate,
  LapicFinalOptimalitySummary,
  LapicReplayResult,
} from '@genshin-optimizer/lapic/cert'
import type {
  LapicCompatibilitySignature,
  LapicDigest,
  LapicExactSignatureGroupKey,
  LapicTeamProvenance,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicFailureRecord,
  LapicProgressEvent,
  LapicSessionSummary,
  LapicTraceEvent,
} from '@genshin-optimizer/lapic/runtime'
import type {
  LapicArtifactRef,
  LapicCheckpointClosureVerificationResult,
  LapicIntegrityScanResult,
} from '@genshin-optimizer/lapic/storage'

export const lapicDebugPackageName = 'lapic-debug'
export const lapicDebugSchemaVersion = '0.1.0-draft'

export type LapicDebugSchemaVersion = typeof lapicDebugSchemaVersion

export interface LapicInspectionRequest {
  readonly artifactRef: LapicArtifactRef
  readonly includePayloadSummary: boolean
}

export interface LapicArtifactSummary {
  readonly artifactRef: LapicArtifactRef
  readonly envelopeDigest: LapicDigest
}

export interface LapicStateBlockInspectionView {
  readonly blockRef: LapicArtifactRef
  readonly compatibilitySignature?: LapicCompatibilitySignature
  readonly exactSignatureGroupKey?: LapicExactSignatureGroupKey
  readonly provenance?: LapicTeamProvenance
}

export interface LapicCertificateInspectionView {
  readonly certificate: LapicCertificate
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

export interface LapicAuditReport {
  readonly session: LapicSessionSummary
  readonly traceEvents: readonly LapicTraceEvent[]
  readonly replayCoverage?: LapicCertificateReplayCoverageSummary
  readonly integrityScan?: LapicIntegrityScanResult
}

export interface LapicDebugSkeletonMarker {
  readonly packageName: typeof lapicDebugPackageName
  readonly schemaVersion: LapicDebugSchemaVersion
}

export const lapicDebugSkeleton: LapicDebugSkeletonMarker = {
  packageName: lapicDebugPackageName,
  schemaVersion: lapicDebugSchemaVersion,
}
