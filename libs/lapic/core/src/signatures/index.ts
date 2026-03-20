import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '../diagnostics'
import type {
  LapicCompatibilitySignature,
  LapicCompatibilitySignatureSchemaVersion,
  LapicDeterministicOrderingRelation,
  LapicDiagnostic,
  LapicExactSignatureGroupKey,
  LapicExactSignatureGroupKeyDerivationInput,
} from '../types'
import { lapicCompatibilitySignatureSchemaVersion } from '../types'
import { validateLapicFrameAxisIdentity } from '../validation'
import {
  compareLapicStringArrays,
  createLapicResourceClaimOrderingKey,
} from './internal'

export function createLapicCompatibilitySignature(
  signature: Omit<LapicCompatibilitySignature, 'schemaVersion'> & {
    readonly schemaVersion?: LapicCompatibilitySignatureSchemaVersion
  }
): LapicCompatibilitySignature {
  return {
    schemaVersion:
      signature.schemaVersion ?? lapicCompatibilitySignatureSchemaVersion,
    occupiedSlotMask: signature.occupiedSlotMask,
    actorUniquenessClaims: signature.actorUniquenessClaims,
    exclusiveResourceClaims: signature.exclusiveResourceClaims,
    aggregateCounts: signature.aggregateCounts,
    remainingAggregateObligations: signature.remainingAggregateObligations,
    providedCapabilityFacts: signature.providedCapabilityFacts,
    remainingRequiredCapabilityFacts: signature.remainingRequiredCapabilityFacts,
    branchCompatibilityToggles: signature.branchCompatibilityToggles,
    frameAxisIdentity: signature.frameAxisIdentity,
    adapterSemanticMode: signature.adapterSemanticMode,
  }
}

export function createLapicExactSignatureGroupKey(
  key: LapicExactSignatureGroupKey
): LapicExactSignatureGroupKey {
  return {
    occupiedSlotMask: key.occupiedSlotMask,
    actorIds: [...key.actorIds].sort(),
    exclusiveResourceKeys: [...key.exclusiveResourceKeys].sort(),
    frameAxisIdentityDigest: key.frameAxisIdentityDigest,
    adapterSemanticMode: key.adapterSemanticMode,
    discreteTeamModeKey: key.discreteTeamModeKey,
  }
}

export function createLapicExactSignatureGroupKeyFromCompatibilitySignature(
  derivationInput: LapicExactSignatureGroupKeyDerivationInput
) {
  const compatibilityValidation = validateLapicCompatibilitySignature(
    derivationInput.compatibilitySignature
  )
  if (!compatibilityValidation.ok) return compatibilityValidation

  if (!derivationInput.frameAxisIdentityDigest)
    return createLapicFailureResult([
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'frameAxisIdentityDigest must not be empty.',
        ['frameAxisIdentityDigest']
      ),
    ])

  const actorIds = derivationInput.compatibilitySignature.actorUniquenessClaims
    .map((claim) => claim.actorId)
    .sort()
  const exclusiveResourceKeys =
    derivationInput.compatibilitySignature.exclusiveResourceClaims
      .map(createLapicResourceClaimOrderingKey)
      .sort()

  return createLapicSuccessResult({
    occupiedSlotMask: derivationInput.compatibilitySignature.occupiedSlotMask,
    actorIds,
    exclusiveResourceKeys,
    frameAxisIdentityDigest: derivationInput.frameAxisIdentityDigest,
    adapterSemanticMode:
      derivationInput.compatibilitySignature.adapterSemanticMode,
    discreteTeamModeKey: derivationInput.discreteTeamModeKey,
  })
}

export function createLapicExactSignatureGroupOrderingKey(
  key: LapicExactSignatureGroupKey
) {
  const canonicalKey = createLapicExactSignatureGroupKey(key)
  const validation = validateLapicExactSignatureGroupKey(canonicalKey)
  if (!validation.ok) return validation

  return createLapicSuccessResult([
    String(canonicalKey.occupiedSlotMask),
    canonicalKey.adapterSemanticMode,
    canonicalKey.frameAxisIdentityDigest,
    canonicalKey.discreteTeamModeKey ?? '',
    ...canonicalKey.actorIds,
    ...canonicalKey.exclusiveResourceKeys,
  ])
}

export function compareLapicExactSignatureGroupKeys(
  left: LapicExactSignatureGroupKey,
  right: LapicExactSignatureGroupKey
) {
  const leftOrderingKey = createLapicExactSignatureGroupOrderingKey(left)
  if (!leftOrderingKey.ok) return leftOrderingKey

  const rightOrderingKey = createLapicExactSignatureGroupOrderingKey(right)
  if (!rightOrderingKey.ok) return rightOrderingKey

  return createLapicSuccessResult(
    compareLapicStringArrays(leftOrderingKey.value, rightOrderingKey.value)
  )
}

export function validateLapicCompatibilitySignature(
  signature: LapicCompatibilitySignature
) {
  const diagnostics: LapicDiagnostic[] = []

  if (signature.schemaVersion !== lapicCompatibilitySignatureSchemaVersion)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'compatibility signature schemaVersion must match the core compatibility signature schema.',
        ['schemaVersion'],
        {
          schemaVersion: signature.schemaVersion,
          expectedSchemaVersion: lapicCompatibilitySignatureSchemaVersion,
        }
      )
    )

  if (!Number.isInteger(signature.occupiedSlotMask) || signature.occupiedSlotMask < 0)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'occupiedSlotMask must be a non-negative integer.',
        ['occupiedSlotMask'],
        { occupiedSlotMask: signature.occupiedSlotMask }
      )
    )

  if (!signature.adapterSemanticMode)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'adapterSemanticMode must not be empty.',
        ['adapterSemanticMode']
      )
    )

  diagnostics.push(
    ...validateLapicFrameAxisIdentity(signature.frameAxisIdentity, [
      'frameAxisIdentity',
    ])
  )

  signature.actorUniquenessClaims.forEach((claim, index) => {
    if (!claim.actorId || !claim.family || !claim.claimedBySlotId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'actor uniqueness claims must include actorId, family, and claimedBySlotId.',
          ['actorUniquenessClaims', String(index)]
        )
      )
  })

  signature.exclusiveResourceClaims.forEach((claim, index) => {
    if (!claim.resourceKind || !claim.resourceId || !claim.claimedBySlotId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'exclusive resource claims must include resourceKind, resourceId, and claimedBySlotId.',
          ['exclusiveResourceClaims', String(index)]
        )
      )
  })

  signature.aggregateCounts.forEach((count, index) => {
    if (!count.counterId || count.value < 0)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'aggregateCounts must include a counterId and a non-negative value.',
          ['aggregateCounts', String(index)],
          { counterId: count.counterId, value: count.value }
        )
      )
  })

  signature.remainingAggregateObligations.forEach((obligation, index) => {
    if (!obligation.counterId || obligation.minimumRequired < 0)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'remainingAggregateObligations must include a counterId and a non-negative minimumRequired.',
          ['remainingAggregateObligations', String(index)],
          {
            counterId: obligation.counterId,
            minimumRequired: obligation.minimumRequired,
          }
        )
      )
  })

  ;[
    ['providedCapabilityFacts', signature.providedCapabilityFacts],
    ['remainingRequiredCapabilityFacts', signature.remainingRequiredCapabilityFacts],
  ].forEach(([collectionName, facts]) => {
    facts.forEach((fact, index) => {
      if (!fact.capabilityId)
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'capability facts must include capabilityId.',
            [collectionName, String(index), 'capabilityId']
          )
        )

      if (fact.scope === 'specific-target-slot' && !fact.targetSlotId)
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'specific-target-slot capability facts must declare targetSlotId.',
            [collectionName, String(index), 'targetSlotId'],
            { capabilityId: fact.capabilityId }
          )
        )
    })
  })

  signature.branchCompatibilityToggles.forEach((toggle, index) => {
    if (!toggle.toggleId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'branchCompatibilityToggles must include toggleId.',
          ['branchCompatibilityToggles', String(index), 'toggleId']
        )
      )
  })

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(signature)
}

export function validateLapicExactSignatureGroupKey(
  key: LapicExactSignatureGroupKey
) {
  const diagnostics: LapicDiagnostic[] = []

  if (!Number.isInteger(key.occupiedSlotMask) || key.occupiedSlotMask < 0)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'occupiedSlotMask must be a non-negative integer.',
        ['occupiedSlotMask'],
        { occupiedSlotMask: key.occupiedSlotMask }
      )
    )

  if (!key.frameAxisIdentityDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'frameAxisIdentityDigest must not be empty.',
        ['frameAxisIdentityDigest']
      )
    )

  if (!key.adapterSemanticMode)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'adapterSemanticMode must not be empty.',
        ['adapterSemanticMode']
      )
    )

  key.actorIds.forEach((actorId, index) => {
    if (!actorId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'actorIds must not contain empty values.',
          ['actorIds', String(index)]
        )
      )
  })

  key.exclusiveResourceKeys.forEach((resourceKey, index) => {
    if (!resourceKey)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'exclusiveResourceKeys must not contain empty values.',
          ['exclusiveResourceKeys', String(index)]
        )
      )
  })

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(key)
}
