import type {
  LapicIntegrityScanResult,
  LapicRepairRecommendationSummary,
} from '../types'

export function createLapicRepairRecommendationSummary(
  scan: LapicIntegrityScanResult
): LapicRepairRecommendationSummary {
  if (scan.ok)
    return {
      canRepairDeterministically: true,
      actions: ['No repair required.'],
    }

  const actions = new Set<string>()
  let canRepairDeterministically = true

  if (scan.classifications.includes('missing-artifact'))
    actions.add('Re-materialize missing artifacts from canonical sources.')

  if (scan.classifications.includes('checksum-mismatch')) {
    actions.add(
      'Re-encode corrupted artifacts and replace checksum-mismatched entries.'
    )
    canRepairDeterministically = false
  }

  if (scan.classifications.includes('schema-mismatch')) {
    actions.add(
      'Migrate or regenerate artifacts with the expected storage schema.'
    )
    canRepairDeterministically = false
  }

  if (scan.classifications.includes('manifest-closure-failure'))
    actions.add(
      'Regenerate checkpoint manifests to restore closure completeness.'
    )

  return {
    canRepairDeterministically,
    actions: [...actions],
  }
}
