import {
  createLapicArtifactRefKey,
  createLapicCheckpointClosureInventory,
} from '../builders'
import type {
  LapicArtifactRef,
  LapicCheckpointClosureInventory,
  LapicClosureMaterializationRequest,
} from '../types'

export function materializeLapicCheckpointClosureInventory(
  request: LapicClosureMaterializationRequest,
  availableArtifacts: readonly LapicArtifactRef[]
): LapicCheckpointClosureInventory {
  const availableKeys = new Set(
    availableArtifacts.map(createLapicArtifactRefKey)
  )
  const missingArtifacts = request.artifactRefs.filter(
    (artifactRef) => !availableKeys.has(createLapicArtifactRefKey(artifactRef))
  )

  return createLapicCheckpointClosureInventory(
    request.checkpointId,
    request.artifactRefs,
    missingArtifacts
  )
}
