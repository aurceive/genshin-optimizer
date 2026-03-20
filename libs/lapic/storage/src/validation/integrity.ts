import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicArtifactIntegrityScanRequest,
  LapicIntegrityScanResult,
  LapicRepairRecommendationSummary,
} from '../types'
import { validateArtifactRefArray } from './artifacts'
import {
  createStorageFailure,
  isBoolean,
  isLapicCorruptionClassification,
  isNonEmptyString,
  isRecord,
} from './internal'

export function validateLapicArtifactIntegrityScanRequest(
  request: LapicArtifactIntegrityScanRequest
): LapicValidationResult<LapicArtifactIntegrityScanRequest> {
  if (!isRecord(request))
    return createStorageFailure(
      'Artifact integrity scan request must be a record.',
      ['artifactIntegrityScanRequest']
    )

  return validateArtifactRefArray(request.artifactRefs, ['artifactRefs']).ok
    ? createLapicSuccessResult(request)
    : createStorageFailure(
        'Artifact refs must contain unique valid artifact references.',
        ['artifactRefs']
      )
}

export function validateLapicIntegrityScanResult(
  result: LapicIntegrityScanResult
): LapicValidationResult<LapicIntegrityScanResult> {
  if (!isRecord(result))
    return createStorageFailure('Integrity scan result must be a record.', ['integrityScanResult'])

  if (!isBoolean(result.ok))
    return createStorageFailure('Integrity result ok must be a boolean.', ['ok'])

  if (
    !Array.isArray(result.classifications) ||
    !result.classifications.every(isLapicCorruptionClassification)
  )
    return createStorageFailure(
      'Integrity classifications must be supported values.',
      ['classifications']
    )

  const artifactValidation = validateArtifactRefArray(result.affectedArtifacts, ['affectedArtifacts'])
  if (!artifactValidation.ok) return artifactValidation

  return createLapicSuccessResult(result)
}

export function validateLapicRepairRecommendationSummary(
  summary: LapicRepairRecommendationSummary
): LapicValidationResult<LapicRepairRecommendationSummary> {
  if (!isRecord(summary))
    return createStorageFailure(
      'Repair recommendation summary must be a record.',
      ['repairRecommendationSummary']
    )

  if (!isBoolean(summary.canRepairDeterministically))
    return createStorageFailure(
      'canRepairDeterministically must be a boolean.',
      ['canRepairDeterministically']
    )

  if (!Array.isArray(summary.actions) || !summary.actions.every(isNonEmptyString))
    return createStorageFailure('Repair actions must contain non-empty strings.', ['actions'])

  return createLapicSuccessResult(summary)
}