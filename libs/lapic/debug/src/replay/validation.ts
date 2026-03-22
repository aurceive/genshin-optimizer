import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import { validateLapicArtifactRef } from '@genshin-optimizer/lapic/storage'
import type {
  LapicOfflineReplayBundleDescriptor,
  LapicReplayClosureSummary,
  LapicReplayInspectionRequest,
} from '../types'
import {
  createDebugFailure,
  isNonEmptyString,
  isRecord,
} from '../validation/internal'

export function validateLapicReplayInspectionRequest(
  request: LapicReplayInspectionRequest
): LapicValidationResult<LapicReplayInspectionRequest> {
  if (!isRecord(request))
    return createDebugFailure('Replay inspection request must be a record.', [
      'replayInspectionRequest',
    ])

  if (!isNonEmptyString(request.certificateId))
    return createDebugFailure('Certificate id must be a non-empty string.', [
      'certificateId',
    ])

  return createLapicSuccessResult(request)
}

export function validateLapicReplayClosureSummary(
  summary: LapicReplayClosureSummary
): LapicValidationResult<LapicReplayClosureSummary> {
  if (!isRecord(summary))
    return createDebugFailure('Replay closure summary must be a record.', [
      'replayClosureSummary',
    ])

  if (!isRecord(summary.replayResult))
    return createDebugFailure('Replay result must be a record.', [
      'replayResult',
    ])

  if (!Array.isArray(summary.closureArtifacts))
    return createDebugFailure('Closure artifacts must be an array.', [
      'closureArtifacts',
    ])

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
    return createDebugFailure('Bundle digest must be a non-empty string.', [
      'bundleDigest',
    ])

  if (!Array.isArray(descriptor.artifactRefs))
    return createDebugFailure('Artifact refs must be an array.', [
      'artifactRefs',
    ])

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
