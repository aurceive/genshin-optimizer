import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import { validateLapicArtifactRef } from '@genshin-optimizer/lapic/storage'
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
  LapicTraceQuery,
} from '../types'
import {
  createDebugFailure,
  isBoolean,
  isNonEmptyString,
  isRecord,
} from '../validation/internal'

export function validateLapicInspectionRequest(
  request: LapicInspectionRequest
): LapicValidationResult<LapicInspectionRequest> {
  if (!isRecord(request))
    return createDebugFailure('Inspection request must be a record.', [
      'inspectionRequest',
    ])

  if (!isNonEmptyString(request.artifactRef?.artifactId))
    return createDebugFailure('Artifact ref id must be a non-empty string.', [
      'artifactRef',
      'artifactId',
    ])

  if (!isBoolean(request.includePayloadSummary))
    return createDebugFailure('includePayloadSummary must be boolean.', [
      'includePayloadSummary',
    ])

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
    return createDebugFailure('Artifact summary must be a record.', [
      'artifactSummary',
    ])

  if (!isNonEmptyString(summary.artifactRef?.artifactId))
    return createDebugFailure(
      'Artifact summary must include a valid artifact ref.',
      ['artifactRef']
    )

  if (!isNonEmptyString(summary.envelopeDigest))
    return createDebugFailure('Envelope digest must be a non-empty string.', [
      'envelopeDigest',
    ])

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
    return createDebugFailure('State block inspection view must be a record.', [
      'stateBlockInspectionView',
    ])

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

  if (view.potentialSummaries && !Array.isArray(view.potentialSummaries))
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
    return createDebugFailure('Certificate inspection view must be a record.', [
      'certificateInspectionView',
    ])

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
    return createDebugFailure('Export digest must be a non-empty string.', [
      'exportDigest',
    ])

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
    return createDebugFailure('Potential summary view must be a record.', [
      'potentialSummaryView',
    ])

  if (!isNonEmptyString(view.candidateId))
    return createDebugFailure('Candidate id must be a non-empty string.', [
      'candidateId',
    ])

  if (!Array.isArray(view.summaries))
    return createDebugFailure('Summaries must be an array.', ['summaries'])

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
    return createDebugFailure('Session id must be a non-empty string.', [
      'sessionId',
    ])

  if (!isBoolean(query.includeFailures))
    return createDebugFailure('includeFailures must be boolean.', [
      'includeFailures',
    ])

  return createLapicSuccessResult(query)
}

export function validateLapicPhaseSummary(
  summary: LapicPhaseSummary
): LapicValidationResult<LapicPhaseSummary> {
  if (!isRecord(summary))
    return createDebugFailure('Phase summary must be a record.', [
      'phaseSummary',
    ])

  if (!isNonEmptyString(summary.sessionId))
    return createDebugFailure('Session id must be a non-empty string.', [
      'sessionId',
    ])

  if (!isNonEmptyString(summary.phase))
    return createDebugFailure('Phase must be a non-empty string.', ['phase'])

  if (!Array.isArray(summary.progressEvents))
    return createDebugFailure('Progress events must be an array.', [
      'progressEvents',
    ])

  return createLapicSuccessResult(summary)
}

export function validateLapicFailureTimelineView(
  view: LapicFailureTimelineView
): LapicValidationResult<LapicFailureTimelineView> {
  if (!isRecord(view))
    return createDebugFailure('Failure timeline view must be a record.', [
      'failureTimelineView',
    ])

  if (!Array.isArray(view.failures))
    return createDebugFailure('Failures must be an array.', ['failures'])

  return createLapicSuccessResult(view)
}
