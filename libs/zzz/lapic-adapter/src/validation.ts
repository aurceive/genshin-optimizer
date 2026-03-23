import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicDiagnostic,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import { zzzLapicAdapterCapabilities } from './types'
import type {
  ZzzLapicAdapterCapabilities,
  ZzzLapicAdapterRequest,
  ZzzLapicSourceSnapshotDescriptor,
} from './types'

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function zzzAdapterFailure(
  message: string,
  path?: readonly string[],
  details?: Readonly<Record<string, string | number | boolean | null>>
): LapicValidationResult<never> {
  const diagnostic: LapicDiagnostic = {
    severity: 'error',
    code: 'NormalizationFailure',
    message,
    ...(path !== undefined ? { path } : {}),
    ...(details !== undefined ? { details } : {}),
  }

  return {
    ok: false,
    diagnostics: [diagnostic],
  }
}

export function validateZzzLapicSourceSnapshotDescriptor(
  sourceSnapshots: ZzzLapicSourceSnapshotDescriptor
): LapicValidationResult<ZzzLapicSourceSnapshotDescriptor> {
  if (!isRecord(sourceSnapshots))
    return zzzAdapterFailure(
      'ZZZ source snapshot descriptor must be a record.',
      ['sourceSnapshots']
    )

  if (
    !isNonEmptyString(sourceSnapshots.discSnapshotDigest) ||
    !isNonEmptyString(sourceSnapshots.characterSnapshotDigest) ||
    !isNonEmptyString(sourceSnapshots.wengineSnapshotDigest) ||
    !isNonEmptyString(sourceSnapshots.formulaSnapshotDigest)
  )
    return zzzAdapterFailure(
      'ZZZ source snapshot descriptor requires non-empty disc, character, wengine, and formula digests.',
      ['sourceSnapshots']
    )

  if (
    sourceSnapshots.optConfigSnapshotDigest !== undefined &&
    !isNonEmptyString(sourceSnapshots.optConfigSnapshotDigest)
  )
    return zzzAdapterFailure(
      'ZZZ optConfig snapshot digest must be a non-empty string when present.',
      ['sourceSnapshots', 'optConfigSnapshotDigest']
    )

  return createLapicSuccessResult(sourceSnapshots)
}

export function validateZzzLapicAdapterCapabilities(
  capabilities: ZzzLapicAdapterCapabilities
): LapicValidationResult<ZzzLapicAdapterCapabilities> {
  if (!isRecord(capabilities))
    return zzzAdapterFailure('ZZZ adapter capabilities must be a record.', [
      'capabilities',
    ])

  if (capabilities.adapterKind !== 'zzz')
    return zzzAdapterFailure(
      'ZZZ adapter capabilities adapterKind must be `zzz`.',
      ['capabilities', 'adapterKind']
    )

  if (
    !Array.isArray(capabilities.supportedPotentialSolveModes) ||
    !Array.isArray(capabilities.supportedFormulaCompilationModes) ||
    !Array.isArray(capabilities.supportedCandidateDomainClasses) ||
    !Array.isArray(capabilities.explicitlyUnsupportedSemantics)
  )
    return zzzAdapterFailure(
      'ZZZ adapter capabilities lists must all be arrays.',
      ['capabilities']
    )

  return createLapicSuccessResult(capabilities)
}

export function validateZzzLapicAdapterRequest(
  request: ZzzLapicAdapterRequest
): LapicValidationResult<ZzzLapicAdapterRequest> {
  if (!isRecord(request))
    return zzzAdapterFailure('ZZZ adapter request must be a record.', [
      'request',
    ])

  if (request.adapterKind !== 'zzz')
    return zzzAdapterFailure('ZZZ lapic adapter received a non-ZZZ request.', [
      'adapterKind',
    ])

  if (!isRecord(request.normalizationInput))
    return zzzAdapterFailure(
      'ZZZ adapter request must include normalizationInput.',
      ['normalizationInput']
    )

  const requestedPotentialSolveModes =
    request.requestedPotentialSolveModes ??
    (request.normalizationInput.potentialConfiguration
      ? [request.normalizationInput.potentialConfiguration.solveMode]
      : [])

  const unsupportedMode = requestedPotentialSolveModes.find(
    (mode) =>
      !zzzLapicAdapterCapabilities.supportedPotentialSolveModes.includes(mode)
  )

  if (unsupportedMode)
    return zzzAdapterFailure(
      'ZZZ lapic adapter does not yet support the requested potential-aware solve mode.',
      ['requestedPotentialSolveModes'],
      { unsupportedPotentialSolveMode: unsupportedMode }
    )

  return createLapicSuccessResult(request)
}
