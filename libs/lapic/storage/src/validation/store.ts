import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type { LapicBackendCapabilityDescriptor } from '../types'
import { createStorageFailure, isBoolean, isLapicBackendKind, isRecord } from './internal'

export function validateLapicBackendCapabilityDescriptor(
  descriptor: LapicBackendCapabilityDescriptor
): LapicValidationResult<LapicBackendCapabilityDescriptor> {
  if (!isRecord(descriptor))
    return createStorageFailure(
      'Backend capability descriptor must be a record.',
      ['backendCapabilityDescriptor']
    )

  if (!isLapicBackendKind(descriptor.backendKind))
    return createStorageFailure('Backend kind must be supported.', ['backendKind'])

  if (!isBoolean(descriptor.supportsTransactions))
    return createStorageFailure('supportsTransactions must be a boolean.', ['supportsTransactions'])

  if (!isBoolean(descriptor.supportsCompression))
    return createStorageFailure('supportsCompression must be a boolean.', ['supportsCompression'])

  return createLapicSuccessResult(descriptor)
}
