import type {
  LapicCertificate,
  LapicPotentialDecisionBasis,
  LapicReplayResult,
} from '@genshin-optimizer/lapic/cert'
import type {
  LapicCandidateId,
  LapicDigest,
  LapicPotentialSummaryDescriptor,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicFailureRecord,
  LapicProgressEvent,
} from '@genshin-optimizer/lapic/runtime'
import type { LapicArtifactRef } from '@genshin-optimizer/lapic/storage'
import type {
  LapicArtifactSummary,
  LapicCertificateInspectionView,
  LapicFailureTimelineView,
  LapicFormulaRegionDecompositionExportDescriptor,
  LapicFrontierSkylineVisualizationExportDescriptor,
  LapicInspectionRequest,
  LapicPhaseSummary,
  LapicPotentialGraphInspectionDescriptor,
  LapicPotentialSummaryView,
  LapicStateBlockInspectionView,
  LapicThresholdLineageView,
  LapicTraceQuery,
} from '../types'

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
    ...(potentialSummaryDigests.length > 0
      ? { potentialSummaryDigests: [...potentialSummaryDigests] }
      : {}),
  }
}

export function createLapicStateBlockInspectionView(
  input: LapicStateBlockInspectionView
): LapicStateBlockInspectionView {
  return {
    blockRef: input.blockRef,
    ...(input.compatibilitySignature !== undefined
      ? { compatibilitySignature: input.compatibilitySignature }
      : {}),
    ...(input.exactSignatureGroupKey !== undefined
      ? { exactSignatureGroupKey: input.exactSignatureGroupKey }
      : {}),
    ...(input.potentialFrontierDigests !== undefined
      ? { potentialFrontierDigests: [...input.potentialFrontierDigests] }
      : {}),
    ...(input.potentialSummaries !== undefined
      ? { potentialSummaries: [...input.potentialSummaries] }
      : {}),
    ...(input.provenance !== undefined ? { provenance: input.provenance } : {}),
  }
}

export function createLapicCertificateInspectionView(
  certificate: LapicCertificate,
  potentialDecisionBasis?: LapicPotentialDecisionBasis,
  replaySummary?: LapicReplayResult
): LapicCertificateInspectionView {
  return {
    certificate,
    ...(potentialDecisionBasis !== undefined ? { potentialDecisionBasis } : {}),
    ...(replaySummary !== undefined ? { replaySummary } : {}),
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