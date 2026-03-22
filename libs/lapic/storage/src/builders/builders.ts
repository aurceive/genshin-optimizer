import type { LapicDigest } from '@genshin-optimizer/lapic/core'
import type {
  LapicArtifactReadRequest,
  LapicArtifactRef,
  LapicArtifactWriteRequest,
  LapicBackendCapabilityDescriptor,
  LapicBlockLayoutDescriptor,
  LapicBlockManifest,
  LapicCheckpointClosureInventory,
  LapicCheckpointClosureVerificationResult,
  LapicCheckpointManifest,
  LapicClosureExportDescriptor,
  LapicClosureImportDescriptor,
  LapicCorruptionClassification,
  LapicDebugArtifactSummary,
  LapicFrontierBlock,
  LapicFrontierIndex,
  LapicIntegrityScanResult,
  LapicStorageEnvelope,
} from '../types'

export function createLapicStorageEnvelope(
  input: LapicStorageEnvelope
): LapicStorageEnvelope {
  return {
    artifactKind: input.artifactKind,
    schemaVersion: input.schemaVersion,
    payloadEncoding: input.payloadEncoding,
    payloadLength: input.payloadLength,
    contentHash: input.contentHash,
    checksum: input.checksum,
    compressionCodec: input.compressionCodec,
    creationEngineVersion: input.creationEngineVersion,
    arithmeticPolicyId: input.arithmeticPolicyId,
    dependencyDigestSet: [...input.dependencyDigestSet],
  }
}

export function createLapicArtifactRef(
  input: LapicArtifactRef
): LapicArtifactRef {
  return {
    artifactId: input.artifactId,
    artifactKind: input.artifactKind,
    contentHash: input.contentHash,
  }
}

export function createLapicFrontierBlock(
  input: LapicFrontierBlock
): LapicFrontierBlock {
  return {
    blockId: input.blockId,
    layout: input.layout,
    stateIds: [...input.stateIds],
    rows: input.rows.map((row) => ({
      stateId: row.stateId,
      slotId: row.slotId,
      candidateId: row.candidateId,
      candidateDigest: row.candidateDigest,
      compatibilityDigest: row.compatibilityDigest,
      exactSignatureGroupKey: {
        occupiedSlotMask: row.exactSignatureGroupKey.occupiedSlotMask,
        actorIds: [...row.exactSignatureGroupKey.actorIds],
        exclusiveResourceKeys: [
          ...row.exactSignatureGroupKey.exclusiveResourceKeys,
        ],
        frameAxisIdentityDigest:
          row.exactSignatureGroupKey.frameAxisIdentityDigest,
        adapterSemanticMode: row.exactSignatureGroupKey.adapterSemanticMode,
        ...(row.exactSignatureGroupKey.discreteTeamModeKey
          ? {
              discreteTeamModeKey:
                row.exactSignatureGroupKey.discreteTeamModeKey,
            }
          : {}),
      },
      rowDigest: row.rowDigest,
    })),
    rowCount: input.rowCount,
  }
}

export function createLapicFrontierIndex(
  input: LapicFrontierIndex
): LapicFrontierIndex {
  return {
    indexId: input.indexId,
    blockIds: [...input.blockIds],
    compatibilityDigest: input.compatibilityDigest,
    exactSignatureGroups: input.exactSignatureGroups.map((group) => ({
      groupDigest: group.groupDigest,
      blockIds: [...group.blockIds],
      slotIds: [...group.slotIds],
      rowDigests: [...group.rowDigests],
      rowCount: group.rowCount,
      occupiedSlotMask: group.occupiedSlotMask,
      adapterSemanticMode: group.adapterSemanticMode,
      frameAxisIdentityDigest: group.frameAxisIdentityDigest,
      ...(group.discreteTeamModeKey !== undefined
        ? { discreteTeamModeKey: group.discreteTeamModeKey }
        : {}),
    })),
  }
}

export function createLapicBlockLayoutDescriptor(
  input: LapicBlockLayoutDescriptor
): LapicBlockLayoutDescriptor {
  return {
    layoutKind: input.layoutKind,
    stateOrderDigest: input.stateOrderDigest,
  }
}

export function createLapicBlockManifest(
  input: LapicBlockManifest
): LapicBlockManifest {
  return {
    manifestId: input.manifestId,
    blockRef: input.blockRef,
    lineageParentIds: [...input.lineageParentIds],
    supersededByIds: [...input.supersededByIds],
  }
}

export function createLapicCheckpointManifest(
  input: LapicCheckpointManifest
): LapicCheckpointManifest {
  return {
    checkpointId: input.checkpointId,
    artifactRefs: input.artifactRefs.map((artifactRef) =>
      createLapicArtifactRef(artifactRef)
    ),
    closureDigest: input.closureDigest,
  }
}

export function createLapicCheckpointClosureInventory(
  checkpointId: string,
  requiredArtifacts: readonly LapicArtifactRef[],
  missingArtifacts: readonly LapicArtifactRef[] = []
): LapicCheckpointClosureInventory {
  return {
    checkpointId,
    requiredArtifacts: requiredArtifacts.map((artifactRef) =>
      createLapicArtifactRef(artifactRef)
    ),
    missingArtifacts: missingArtifacts.map((artifactRef) =>
      createLapicArtifactRef(artifactRef)
    ),
  }
}

export function createLapicArtifactReadRequest(
  artifactRef: LapicArtifactRef
): LapicArtifactReadRequest {
  return { artifactRef: createLapicArtifactRef(artifactRef) }
}

export function createLapicArtifactWriteRequest(
  envelope: LapicStorageEnvelope,
  payloadDigest: LapicDigest
): LapicArtifactWriteRequest {
  return {
    envelope: createLapicStorageEnvelope(envelope),
    payloadDigest,
  }
}

export function createLapicBackendCapabilityDescriptor(
  input: LapicBackendCapabilityDescriptor
): LapicBackendCapabilityDescriptor {
  return {
    backendKind: input.backendKind,
    supportsTransactions: input.supportsTransactions,
    supportsCompression: input.supportsCompression,
  }
}

export function createLapicArtifactRefFromWriteRequest(
  request: LapicArtifactWriteRequest
): LapicArtifactRef {
  return createLapicArtifactRef({
    artifactId: `${request.envelope.artifactKind}:${request.envelope.contentHash}`,
    artifactKind: request.envelope.artifactKind,
    contentHash: request.envelope.contentHash,
  })
}

export function createLapicCheckpointClosureVerificationResult(
  checkpointId: string,
  resumable: boolean,
  replayable: boolean,
  diagnostics: readonly string[] = []
): LapicCheckpointClosureVerificationResult {
  return {
    checkpointId,
    resumable,
    replayable,
    diagnostics: [...diagnostics],
  }
}

export function createLapicClosureExportDescriptor(
  checkpointId: string,
  exportDigest: LapicDigest
): LapicClosureExportDescriptor {
  return {
    checkpointId,
    exportDigest,
  }
}

export function createLapicClosureImportDescriptor(
  checkpointId: string,
  importDigest: LapicDigest
): LapicClosureImportDescriptor {
  return {
    checkpointId,
    importDigest,
  }
}

export function createLapicIntegrityScanResult(
  classifications: readonly LapicCorruptionClassification[],
  affectedArtifacts: readonly LapicArtifactRef[]
): LapicIntegrityScanResult {
  return {
    ok: classifications.length === 0,
    classifications: [...classifications],
    affectedArtifacts: affectedArtifacts.map((artifactRef) =>
      createLapicArtifactRef(artifactRef)
    ),
  }
}

export function createLapicDebugArtifactSummary(
  artifactRef: LapicArtifactRef,
  summaryDigest: LapicDigest
): LapicDebugArtifactSummary {
  return {
    artifactRef: createLapicArtifactRef(artifactRef),
    summaryDigest,
  }
}

export function createLapicArtifactRefKey(
  artifactRef: LapicArtifactRef
): string {
  return [
    artifactRef.artifactId,
    artifactRef.artifactKind,
    artifactRef.contentHash,
  ].join('|')
}
