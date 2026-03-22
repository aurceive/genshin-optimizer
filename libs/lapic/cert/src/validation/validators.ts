import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicDiagnostic,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import {
  validateLapicBoundPrunePayload,
  validateLapicBranchReachabilityPayload,
  validateLapicDominancePayload,
  validateLapicFinalOptimalityPayload,
  validateLapicInfeasibilityPayload,
} from '../payloads'
import { validateLapicReplayRecipe } from '../replay'
import type {
  LapicCertificate,
  LapicCertificateDecisionClass,
  LapicCertificateKind,
} from '../types'

function isDecisionClassCompatible(
  certKind: LapicCertificateKind,
  decisionClass: LapicCertificateDecisionClass
): boolean {
  switch (certKind) {
    case 'BranchReachabilityCert':
      return decisionClass === 'exact-prune'
    case 'InfeasibilityCert':
      return (
        decisionClass === 'exact-prune' || decisionClass === 'relaxation-prune'
      )
    case 'BoundPruneCert':
      return (
        decisionClass === 'exact-prune' || decisionClass === 'relaxation-prune'
      )
    case 'DominanceCert':
      return decisionClass === 'dominance-prune'
    case 'FinalOptimalityCert':
      return decisionClass === 'optimality-proof'
  }
}

export function validateLapicCertificate(
  certificate: LapicCertificate
): LapicValidationResult<LapicCertificate> {
  const diagnostics: LapicDiagnostic[] = []

  if (!certificate.certId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'certId must not be empty.',
        ['certId']
      )
    )

  if (!certificate.problemId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'problemId must not be empty.',
        ['problemId']
      )
    )

  if (!certificate.arithmeticPolicyId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'arithmeticPolicyId must not be empty.',
        ['arithmeticPolicyId']
      )
    )

  if (!certificate.evidenceDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'evidenceDigest must not be empty.',
        ['evidenceDigest']
      )
    )

  if (
    !isDecisionClassCompatible(certificate.certKind, certificate.decisionClass)
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'decisionClass is incompatible with certKind.',
        ['decisionClass'],
        {
          certKind: certificate.certKind,
          decisionClass: certificate.decisionClass,
        }
      )
    )

  const replayRecipeValidation = validateLapicReplayRecipe(
    certificate.replayRecipe
  )
  if (!replayRecipeValidation.ok)
    diagnostics.push(...replayRecipeValidation.diagnostics)

  switch (certificate.certKind) {
    case 'BranchReachabilityCert':
      if (!('selectedArm' in certificate.payload))
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'BranchReachabilityCert payload shape is invalid.',
            ['payload']
          )
        )
      else {
        const payloadValidation = validateLapicBranchReachabilityPayload(
          certificate.payload
        )
        if (!payloadValidation.ok)
          diagnostics.push(...payloadValidation.diagnostics)
      }
      break
    case 'InfeasibilityCert':
      if (!('witnessDigest' in certificate.payload))
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'InfeasibilityCert payload shape is invalid.',
            ['payload']
          )
        )
      else {
        const payloadValidation = validateLapicInfeasibilityPayload(
          certificate.payload
        )
        if (!payloadValidation.ok)
          diagnostics.push(...payloadValidation.diagnostics)
      }
      break
    case 'BoundPruneCert':
      if (!('thresholdDigest' in certificate.payload))
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'BoundPruneCert payload shape is invalid.',
            ['payload']
          )
        )
      else {
        const payloadValidation = validateLapicBoundPrunePayload(
          certificate.payload
        )
        if (!payloadValidation.ok)
          diagnostics.push(...payloadValidation.diagnostics)
      }
      break
    case 'DominanceCert':
      if (!('dominatingStateId' in certificate.payload))
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'DominanceCert payload shape is invalid.',
            ['payload']
          )
        )
      else {
        const payloadValidation = validateLapicDominancePayload(
          certificate.payload
        )
        if (!payloadValidation.ok)
          diagnostics.push(...payloadValidation.diagnostics)
      }
      break
    case 'FinalOptimalityCert':
      if (!('winningStateId' in certificate.payload))
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'FinalOptimalityCert payload shape is invalid.',
            ['payload']
          )
        )
      else {
        const payloadValidation = validateLapicFinalOptimalityPayload(
          certificate.payload
        )
        if (!payloadValidation.ok)
          diagnostics.push(...payloadValidation.diagnostics)
      }
      break
  }

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(certificate)
}
