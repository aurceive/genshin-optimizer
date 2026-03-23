import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicDiagnostic,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import { srLapicAdapterCapabilities } from './types'
import type {
  SrLapicAdapterCapabilities,
  SrLapicAdapterRequest,
  SrLapicSourceSnapshotDescriptor,
} from './types'

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function srAdapterFailure(
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

export function validateSrLapicSourceSnapshotDescriptor(
  sourceSnapshots: SrLapicSourceSnapshotDescriptor
): LapicValidationResult<SrLapicSourceSnapshotDescriptor> {
  if (!isRecord(sourceSnapshots))
    return srAdapterFailure('SR source snapshot descriptor must be a record.', [
      'sourceSnapshots',
    ])

  if (
    !isNonEmptyString(sourceSnapshots.relicSnapshotDigest) ||
    !isNonEmptyString(sourceSnapshots.characterSnapshotDigest) ||
    !isNonEmptyString(sourceSnapshots.lightConeSnapshotDigest) ||
    !isNonEmptyString(sourceSnapshots.formulaSnapshotDigest)
  )
    return srAdapterFailure(
      'SR source snapshot descriptor requires non-empty relic, character, light-cone, and formula digests.',
      ['sourceSnapshots']
    )

  if (
    sourceSnapshots.optConfigSnapshotDigest !== undefined &&
    !isNonEmptyString(sourceSnapshots.optConfigSnapshotDigest)
  )
    return srAdapterFailure(
      'SR optConfig snapshot digest must be a non-empty string when present.',
      ['sourceSnapshots', 'optConfigSnapshotDigest']
    )

  return createLapicSuccessResult(sourceSnapshots)
}

export function validateSrLapicAdapterCapabilities(
  capabilities: SrLapicAdapterCapabilities
): LapicValidationResult<SrLapicAdapterCapabilities> {
  if (!isRecord(capabilities))
    return srAdapterFailure('SR adapter capabilities must be a record.', [
      'capabilities',
    ])

  if (capabilities.adapterKind !== 'sr')
    return srAdapterFailure(
      'SR adapter capabilities adapterKind must be `sr`.',
      ['capabilities', 'adapterKind']
    )

  if (
    !Array.isArray(capabilities.supportedPotentialSolveModes) ||
    !Array.isArray(capabilities.supportedFormulaCompilationModes) ||
    !Array.isArray(capabilities.supportedCandidateDomainClasses) ||
    !Array.isArray(capabilities.explicitlyUnsupportedSemantics)
  )
    return srAdapterFailure(
      'SR adapter capabilities lists must all be arrays.',
      ['capabilities']
    )

  return createLapicSuccessResult(capabilities)
}

export function validateSrLapicAdapterRequest(
  request: SrLapicAdapterRequest
): LapicValidationResult<SrLapicAdapterRequest> {
  if (!isRecord(request))
    return srAdapterFailure('SR adapter request must be a record.', ['request'])

  if (request.adapterKind !== 'sr')
    return srAdapterFailure('SR lapic adapter received a non-SR request.', [
      'adapterKind',
    ])

  if (!isRecord(request.normalizationInput))
    return srAdapterFailure(
      'SR adapter request must include normalizationInput.',
      ['normalizationInput']
    )

  const requestedPotentialSolveModes =
    request.requestedPotentialSolveModes ??
    (request.normalizationInput.potentialConfiguration
      ? [request.normalizationInput.potentialConfiguration.solveMode]
      : [])

  const unsupportedMode = requestedPotentialSolveModes.find(
    (mode) =>
      !srLapicAdapterCapabilities.supportedPotentialSolveModes.includes(mode)
  )

  if (unsupportedMode)
    return srAdapterFailure(
      'SR lapic adapter does not yet support the requested potential-aware solve mode.',
      ['requestedPotentialSolveModes'],
      { unsupportedPotentialSolveMode: unsupportedMode }
    )

  return createLapicSuccessResult(request)
}
