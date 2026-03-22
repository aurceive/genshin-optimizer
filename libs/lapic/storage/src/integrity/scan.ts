import {
  createLapicArtifactRef,
  createLapicArtifactRefKey,
  createLapicIntegrityScanResult,
} from '../builders'
import type {
  LapicArtifactIntegrityScanRequest,
  LapicArtifactStore,
  LapicCorruptionClassification,
  LapicIntegrityScanResult,
} from '../types'
import { validateLapicArtifactReadResult } from '../validation/artifacts'

export async function scanLapicArtifactIntegrity(
  store: LapicArtifactStore,
  request: LapicArtifactIntegrityScanRequest
): Promise<LapicIntegrityScanResult> {
  const classifications = new Set<LapicCorruptionClassification>()
  const affectedArtifacts = new Map<
    string,
    ReturnType<typeof createLapicArtifactRef>
  >()

  for (const artifactRef of request.artifactRefs) {
    try {
      const readResult = await store.read({ artifactRef })
      const readValidation = validateLapicArtifactReadResult(readResult)
      if (!readValidation.ok) {
        classifications.add('schema-mismatch')
        affectedArtifacts.set(
          createLapicArtifactRefKey(artifactRef),
          createLapicArtifactRef(artifactRef)
        )
        continue
      }

      if (readResult.envelope.artifactKind !== artifactRef.artifactKind) {
        classifications.add('schema-mismatch')
        affectedArtifacts.set(
          createLapicArtifactRefKey(artifactRef),
          createLapicArtifactRef(artifactRef)
        )
      }

      if (readResult.envelope.contentHash !== artifactRef.contentHash) {
        classifications.add('checksum-mismatch')
        affectedArtifacts.set(
          createLapicArtifactRefKey(artifactRef),
          createLapicArtifactRef(artifactRef)
        )
      }
    } catch {
      classifications.add('missing-artifact')
      affectedArtifacts.set(
        createLapicArtifactRefKey(artifactRef),
        createLapicArtifactRef(artifactRef)
      )
    }
  }

  return createLapicIntegrityScanResult(
    [...classifications],
    [...affectedArtifacts.values()]
  )
}
