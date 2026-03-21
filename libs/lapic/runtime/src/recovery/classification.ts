import { createLapicRecoveryEligibilityClassification } from '../builders'
import type {
  LapicFailedSessionSummary,
  LapicFailureClass,
  LapicRecoveryEligibilityClassification,
} from '../types'

export function createLapicRuntimeRecoveryEligibility(
  failedSummary: LapicFailedSessionSummary
): LapicRecoveryEligibilityClassification {
  const failureClass: LapicFailureClass = failedSummary.failure.failureClass
  switch (failureClass) {
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
    case 'protocolFailure':
    case 'arithmeticVerificationFailure':
    case 'schemaCompatibilityFailure':
      return createLapicRecoveryEligibilityClassification(
        false,
        'Failure class is not automatically eligible for recovery.'
      )
    default: {
      const _exhaustive: never = failureClass
      return createLapicRecoveryEligibilityClassification(
        false,
        `Unknown failure class '${_exhaustive as string}' is not eligible for recovery.`
      )
    }
  }
}
