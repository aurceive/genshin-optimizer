import { createLapicFailureResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import {
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from '@genshin-optimizer/lapic/core/validation'

export { isBoolean, isNonEmptyString, isNonNegativeInteger, isRecord }

export function createDebugFailure<T>(
  message: string,
  path?: readonly string[]
): LapicValidationResult<T> {
  return createLapicFailureResult([
    {
      severity: 'error',
      code: 'SchemaViolation',
      message,
      ...(path !== undefined ? { path } : {}),
    },
  ])
}
