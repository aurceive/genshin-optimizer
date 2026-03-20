import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '../diagnostics'
import {
  createLapicExactSignatureGroupKey,
  createLapicExactSignatureGroupOrderingKey,
  validateLapicCompatibilitySignature,
  validateLapicExactSignatureGroupKey,
} from '../signatures'
import {
  compareLapicStringArrays,
  createLapicActorUniquenessClaimOrderingKey,
} from '../signatures/internal'
import type {
  LapicDiagnostic,
  LapicSirState,
  LapicStateLayoutDescriptor,
} from '../types'
import { validateLapicFrameAxisIdentity } from '../validation'

export function createLapicStateLayoutDescriptor(
  layout: LapicStateLayoutDescriptor
): LapicStateLayoutDescriptor {
  return layout
}

export function areLapicSirStatesExactComparable(
  left: LapicSirState,
  right: LapicSirState
): boolean {
  const leftComparisonKey = createLapicExactSignatureGroupOrderingKey(
    left.exactSignatureGroupKey
  )
  const rightComparisonKey = createLapicExactSignatureGroupOrderingKey(
    right.exactSignatureGroupKey
  )

  if (!leftComparisonKey.ok || !rightComparisonKey.ok) return false

  return compareLapicStringArrays(leftComparisonKey.value, rightComparisonKey.value) === 0
}

export function createLapicSirStateIdentityOrderingKey(state: LapicSirState) {
  const validation = validateLapicSirState(state)
  if (!validation.ok) return validation

  const exactSignatureOrderingKey = createLapicExactSignatureGroupOrderingKey(
    state.exactSignatureGroupKey
  )
  if (!exactSignatureOrderingKey.ok) return exactSignatureOrderingKey

  const actorUniquenessClaimKeys = state.compatibilitySignature.actorUniquenessClaims
    .map(createLapicActorUniquenessClaimOrderingKey)
    .sort()
  const branchToggleKeys = state.compatibilitySignature.branchCompatibilityToggles
    .map((toggle) => `${toggle.toggleId}|${toggle.enabled ? '1' : '0'}`)
    .sort()

  return createLapicSuccessResult([
    ...exactSignatureOrderingKey.value,
    state.dominanceProjection.projectionId,
    state.dominanceProjection.vectorDigest,
    state.potentialOrderingDigest ?? '',
    ...[...(state.potentialSummaryDigests ?? [])].sort(),
    ...actorUniquenessClaimKeys,
    ...branchToggleKeys,
    state.stateId,
  ])
}

export function compareLapicSirStateIdentity(left: LapicSirState, right: LapicSirState) {
  const leftValidation = validateLapicSirState(left)
  if (!leftValidation.ok) return leftValidation

  const rightValidation = validateLapicSirState(right)
  if (!rightValidation.ok) return rightValidation

  if (!areLapicSirStatesExactComparable(left, right))
    return createLapicFailureResult([
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'S-IR state identity comparison requires equal exact signature group keys.',
        ['exactSignatureGroupKey']
      ),
    ])

  const leftOrderingKey = createLapicSirStateIdentityOrderingKey(left)
  if (!leftOrderingKey.ok) return leftOrderingKey

  const rightOrderingKey = createLapicSirStateIdentityOrderingKey(right)
  if (!rightOrderingKey.ok) return rightOrderingKey

  return createLapicSuccessResult(
    compareLapicStringArrays(leftOrderingKey.value, rightOrderingKey.value)
  )
}

export function createLapicSirState(state: LapicSirState): LapicSirState {
  return {
    ...state,
    exactSignatureGroupKey: createLapicExactSignatureGroupKey(
      state.exactSignatureGroupKey
    ),
  }
}

export function validateLapicStateLayoutDescriptor(layout: LapicStateLayoutDescriptor) {
  const diagnostics: LapicDiagnostic[] = []

  if (!layout.layoutId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'layoutId must not be empty.',
        ['layout', 'layoutId']
      )
    )

  if (!layout.teamLayoutDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'teamLayoutDigest must not be empty.',
        ['layout', 'teamLayoutDigest']
      )
    )

  if (!layout.slotIds.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'slotIds must not be empty.',
        ['layout', 'slotIds']
      )
    )

  layout.slotIds.forEach((slotId, index) => {
    if (!slotId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'slotIds must not contain empty values.',
          ['layout', 'slotIds', String(index)]
        )
      )
  })

  diagnostics.push(
    ...validateLapicFrameAxisIdentity(layout.frameAxisIdentity, [
      'layout',
      'frameAxisIdentity',
    ])
  )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(layout)
}

export function validateLapicSirState(state: LapicSirState) {
  const layoutValidation = validateLapicStateLayoutDescriptor(state.layout)
  if (!layoutValidation.ok) return layoutValidation

  const keyValidation = validateLapicExactSignatureGroupKey(
    state.exactSignatureGroupKey
  )
  if (!keyValidation.ok) return keyValidation

  const compatibilityValidation = validateLapicCompatibilitySignature(
    state.compatibilitySignature
  )
  if (!compatibilityValidation.ok) return compatibilityValidation

  const diagnostics: LapicDiagnostic[] = []

  if (!state.stateId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'stateId must not be empty.',
        ['stateId']
      )
    )

  if (!state.dominanceProjection.projectionId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'dominanceProjection.projectionId must not be empty.',
        ['dominanceProjection', 'projectionId']
      )
    )

  if (!state.dominanceProjection.vectorDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'dominanceProjection.vectorDigest must not be empty.',
        ['dominanceProjection', 'vectorDigest']
      )
    )

  if (
    state.layout.frameAxisIdentity.axisKind !==
    state.compatibilitySignature.frameAxisIdentity.axisKind
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'state layout frame axis kind must match the compatibility signature frame axis kind.',
        ['compatibilitySignature', 'frameAxisIdentity', 'axisKind'],
        {
          layoutAxisKind: state.layout.frameAxisIdentity.axisKind,
          compatibilityAxisKind: state.compatibilitySignature.frameAxisIdentity.axisKind,
        }
      )
    )

  if (
    state.layout.frameAxisIdentity.frameIds.length !==
      state.compatibilitySignature.frameAxisIdentity.frameIds.length ||
    state.layout.frameAxisIdentity.frameIds.some(
      (frameId, index) =>
        frameId !== state.compatibilitySignature.frameAxisIdentity.frameIds[index]
    )
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'state layout frame axis identity must match the compatibility signature frame axis identity.',
        ['compatibilitySignature', 'frameAxisIdentity']
      )
    )

  if (
    state.exactSignatureGroupKey.occupiedSlotMask !==
    state.compatibilitySignature.occupiedSlotMask
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'exactSignatureGroupKey.occupiedSlotMask must match compatibilitySignature.occupiedSlotMask.',
        ['exactSignatureGroupKey', 'occupiedSlotMask'],
        {
          exactSignatureOccupiedSlotMask: state.exactSignatureGroupKey.occupiedSlotMask,
          compatibilityOccupiedSlotMask: state.compatibilitySignature.occupiedSlotMask,
        }
      )
    )

  if (
    state.exactSignatureGroupKey.adapterSemanticMode !==
    state.compatibilitySignature.adapterSemanticMode
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'exactSignatureGroupKey.adapterSemanticMode must match compatibilitySignature.adapterSemanticMode.',
        ['exactSignatureGroupKey', 'adapterSemanticMode'],
        {
          exactSignatureAdapterSemanticMode: state.exactSignatureGroupKey.adapterSemanticMode,
          compatibilityAdapterSemanticMode: state.compatibilitySignature.adapterSemanticMode,
        }
      )
    )

  if (
    state.provenance.compatibilitySignatureSchemaVersion !==
    state.compatibilitySignature.schemaVersion
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'InvariantViolation',
        'provenance.compatibilitySignatureSchemaVersion must match compatibilitySignature.schemaVersion.',
        ['provenance', 'compatibilitySignatureSchemaVersion'],
        {
          provenanceSchemaVersion: state.provenance.compatibilitySignatureSchemaVersion,
          compatibilitySchemaVersion: state.compatibilitySignature.schemaVersion,
        }
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(state)
}
