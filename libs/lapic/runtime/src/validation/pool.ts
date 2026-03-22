/**
 * Validators for the worker pool transport layer.
 *
 * Covers:
 * - `LapicPoolTransportConfig` — handles array + backend kind
 * - `LapicWorkerHandle` — interface shape validation
 */

import {
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type { LapicPoolTransportConfig, LapicWorkerHandle } from '../worker/pool'
import {
  createRuntimeFailure,
  isNonEmptyString,
  isRecord,
  lapicWorkerBackendKinds,
} from './internal'
import type { LapicWorkerBackendKind } from '../types'

// ---------------------------------------------------------------------------
// Worker handle validation
// ---------------------------------------------------------------------------

/**
 * Validate that an object conforms to the `LapicWorkerHandle` interface.
 *
 * Checks:
 * - workerId is a non-empty string
 * - dispatch, requestPause, terminate are functions
 */
export function validateLapicWorkerHandle(
  handle: LapicWorkerHandle,
  path: readonly string[] = ['workerHandle']
): LapicValidationResult<LapicWorkerHandle> {
  if (!isRecord(handle))
    return createRuntimeFailure('Worker handle must be a record.', path)

  if (!isNonEmptyString(handle.workerId))
    return createRuntimeFailure(
      'Worker handle workerId must be a non-empty string.',
      [...path, 'workerId']
    )

  if (typeof handle.dispatch !== 'function')
    return createRuntimeFailure(
      'Worker handle must have a dispatch function.',
      [...path, 'dispatch']
    )

  if (typeof handle.requestPause !== 'function')
    return createRuntimeFailure(
      'Worker handle must have a requestPause function.',
      [...path, 'requestPause']
    )

  if (typeof handle.terminate !== 'function')
    return createRuntimeFailure(
      'Worker handle must have a terminate function.',
      [...path, 'terminate']
    )

  return createLapicSuccessResult(handle)
}

// ---------------------------------------------------------------------------
// Pool config validation
// ---------------------------------------------------------------------------

/**
 * Validate a `LapicPoolTransportConfig`.
 *
 * Checks:
 * - Config is a record
 * - handles is a non-empty array
 * - Each handle conforms to `LapicWorkerHandle`
 * - All workerIds are unique
 * - backendKind is a valid `LapicWorkerBackendKind`
 */
export function validateLapicPoolTransportConfig(
  config: LapicPoolTransportConfig
): LapicValidationResult<LapicPoolTransportConfig> {
  if (!isRecord(config))
    return createRuntimeFailure(
      'Pool transport config must be a record.',
      ['poolTransportConfig']
    )

  if (!Array.isArray(config.handles) || config.handles.length === 0)
    return createRuntimeFailure(
      'Pool transport config must have at least one worker handle.',
      ['poolTransportConfig', 'handles']
    )

  // Validate each handle
  for (let i = 0; i < config.handles.length; i++) {
    const handleValidation = validateLapicWorkerHandle(
      config.handles[i]!,
      ['poolTransportConfig', 'handles', String(i)]
    )
    if (!handleValidation.ok) return handleValidation
  }

  // Check for duplicate workerIds
  const workerIds = new Set<string>()
  for (const handle of config.handles) {
    if (workerIds.has(handle.workerId))
      return createRuntimeFailure(
        `Duplicate workerId '${handle.workerId}' in pool transport config.`,
        ['poolTransportConfig', 'handles']
      )
    workerIds.add(handle.workerId)
  }

  if (
    !isNonEmptyString(config.backendKind) ||
    !lapicWorkerBackendKinds.includes(config.backendKind as LapicWorkerBackendKind)
  )
    return createRuntimeFailure(
      `Backend kind must be one of: ${lapicWorkerBackendKinds.join(', ')}.`,
      ['poolTransportConfig', 'backendKind']
    )

  return createLapicSuccessResult(config)
}
