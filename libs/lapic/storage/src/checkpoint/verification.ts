import { createLapicArtifactRefKey, createLapicCheckpointClosureVerificationResult } from '../builders'
import { scanLapicArtifactIntegrity } from '../integrity'
import type {
  LapicArtifactStore,
  LapicCheckpointClosureVerificationResult,
  LapicClosureMaterializationRequest,
} from '../types'
import { materializeLapicCheckpointClosureInventory } from './inventory'

export async function verifyLapicCheckpointClosure(
  store: LapicArtifactStore,
  request: LapicClosureMaterializationRequest
): Promise<LapicCheckpointClosureVerificationResult> {
  const integrityScan = await scanLapicArtifactIntegrity(store, {
    artifactRefs: request.artifactRefs,
  })

  const affectedKeys = integrityScan.ok
    ? new Set<string>()
    : new Set(integrityScan.affectedArtifacts.map(createLapicArtifactRefKey))
  const inventory = materializeLapicCheckpointClosureInventory(
    request,
    integrityScan.ok
      ? request.artifactRefs
      : request.artifactRefs.filter(
          (artifactRef) => !affectedKeys.has(createLapicArtifactRefKey(artifactRef))
        )
  )

  const diagnostics = [
    ...inventory.missingArtifacts.map(
      (artifactRef) => `Missing artifact: ${artifactRef.artifactId}`
    ),
    ...integrityScan.classifications
      .filter((classification) => classification !== 'missing-artifact')
      .map((classification) => `Integrity classification: ${classification}`),
  ]

  return createLapicCheckpointClosureVerificationResult(
    request.checkpointId,
    diagnostics.length === 0,
    diagnostics.length === 0,
    diagnostics
  )
}
