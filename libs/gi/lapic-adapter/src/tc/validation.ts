/**
 * GI TC Subproblem — Request Validation
 *
 * Validates TC adapter requests, ensuring the adapterKind is 'gi-tc'
 * and all required fields are present. Prevents TC requests from
 * accidentally being processed by the artifact optimization path.
 */

import type {
  LapicDiagnostic,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import {
  giLapicTcAdapterKind,
  type GiLapicTcAdapterRequest,
  type GiLapicTcOptimizationRequest,
} from './types'

function tcFailure(
  message: string,
  path: readonly string[] = []
): LapicValidationResult<never> {
  const diagnostic: LapicDiagnostic = {
    severity: 'error',
    code: 'InvalidInput',
    message,
    ...(path.length > 0 ? { path: [...path] } : {}),
  }
  return { ok: false, diagnostics: [diagnostic] }
}

export function validateGiLapicTcOptimizationRequest(
  request: unknown
): LapicValidationResult<GiLapicTcOptimizationRequest> {
  if (typeof request !== 'object' || request === null)
    return tcFailure('TC optimization request must be an object')

  const r = request as Record<string, unknown>

  if (typeof r['targetFormula'] !== 'string' || r['targetFormula'].length === 0)
    return tcFailure('targetFormula must be a non-empty string', [
      'targetFormula',
    ])

  if (typeof r['rollBudget'] !== 'number' || r['rollBudget'] < 0)
    return tcFailure('rollBudget must be a non-negative number', ['rollBudget'])

  if (typeof r['topN'] !== 'number' || r['topN'] < 1)
    return tcFailure('topN must be a positive integer', ['topN'])

  return {
    ok: true,
    value: r as unknown as GiLapicTcOptimizationRequest,
    diagnostics: [],
  }
}

export function validateGiLapicTcAdapterRequest(
  request: unknown
): LapicValidationResult<GiLapicTcAdapterRequest> {
  if (typeof request !== 'object' || request === null)
    return tcFailure('TC adapter request must be an object')

  const r = request as Record<string, unknown>

  if (r['adapterKind'] !== giLapicTcAdapterKind)
    return tcFailure(
      `adapterKind must be '${giLapicTcAdapterKind}', got '${String(r['adapterKind'])}'`,
      ['adapterKind']
    )

  if (
    typeof r['normalizationInput'] !== 'object' ||
    r['normalizationInput'] === null
  )
    return tcFailure('normalizationInput must be an object', [
      'normalizationInput',
    ])

  const tcReqValidation = validateGiLapicTcOptimizationRequest(r['tcRequest'])
  if (!tcReqValidation.ok) return tcReqValidation

  return {
    ok: true,
    value: r as unknown as GiLapicTcAdapterRequest,
    diagnostics: [],
  }
}

/**
 * Guard: returns true if the given request's adapterKind is 'gi-tc'.
 * Use to route adapter requests to the correct sub-family.
 */
export function isGiLapicTcRequest(request: {
  readonly adapterKind: string
}): request is GiLapicTcAdapterRequest {
  return request.adapterKind === giLapicTcAdapterKind
}
