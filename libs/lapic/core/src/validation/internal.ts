import { createLapicDiagnostic } from '../diagnostics'
import type { LapicDiagnostic, LapicFrameAxisIdentity } from '../types'

export function validateLapicFrameAxisIdentity(
  frameAxisIdentity: LapicFrameAxisIdentity,
  path: readonly string[]
): readonly LapicDiagnostic[] {
  const diagnostics: LapicDiagnostic[] = []

  if (
    frameAxisIdentity.axisKind === 'none' &&
    frameAxisIdentity.frameIds.length
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'frameAxisIdentity.frameIds must be empty when axisKind is none.',
        [...path, 'frameIds'],
        { axisKind: frameAxisIdentity.axisKind }
      )
    )

  frameAxisIdentity.frameIds.forEach((frameId, index) => {
    if (!frameId)
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'frameAxisIdentity.frameIds must not contain empty values.',
          [...path, 'frameIds', String(index)]
        )
      )
  })

  return diagnostics
}
