import { createLapicRecoveryEligibilityClassification } from '../builders'
import type {
  LapicFailedSessionSummary,
  LapicRecoveryEligibilityClassification,
} from '../types'

export function createLapicRuntimeRecoveryEligibility(
  failedSummary: LapicFailedSessionSummary
): LapicRecoveryEligibilityClassification {
  switch (failedSummary.failure.failureClass) {
    case 'workerFailure':
    case 'providerFailure':
      return createLapicRecoveryEligibilityClassification(
        true,
        'Session may be retried from the last checkpoint once executor health is restored.'
      )
    case 'checkpointClosureFailure':
    case 'storageIntegrityFailure':
      return createLapicRecoveryEligibilityClassification(
        false,
        'Session cannot be recovered until persistence integrity issues are repaired.'
      )
    default:
      return createLapicRecoveryEligibilityClassification(
        false,
        'Failure class is not automatically eligible for recovery.'
      )
  }
}