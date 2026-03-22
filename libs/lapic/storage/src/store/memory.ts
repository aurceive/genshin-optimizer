import {
  createLapicArtifactRef,
  createLapicArtifactRefFromWriteRequest,
  createLapicBackendCapabilityDescriptor,
  createLapicStorageEnvelope,
} from '../builders'
import type {
  LapicArtifactWriteRequest,
  LapicMemoryArtifactStore,
  LapicMemoryArtifactStoreEntry,
  LapicMemoryArtifactStoreOptions,
} from '../types'
import {
  validateLapicArtifactReadRequest,
  validateLapicArtifactWriteRequest,
} from '../validation'

export function createLapicMemoryArtifactStore(
  options: LapicMemoryArtifactStoreOptions = {}
): LapicMemoryArtifactStore {
  const capabilities = createLapicBackendCapabilityDescriptor({
    backendKind: 'memory',
    supportsTransactions: options.supportsTransactions ?? true,
    supportsCompression: options.supportsCompression ?? false,
  })

  const entries = new Map<string, LapicMemoryArtifactStoreEntry>()

  const writeValidatedEntry = (request: LapicArtifactWriteRequest) => {
    const validation = validateLapicArtifactWriteRequest(request)
    if (!validation.ok) {
      const details = validation.diagnostics.map((d) => d.message).join('; ')
      throw new Error(
        `Invalid memory store write request: ${details || 'unknown validation failure'}`
      )
    }

    const artifactRef = createLapicArtifactRefFromWriteRequest(request)
    entries.set(artifactRef.artifactId, {
      artifactRef,
      envelope: createLapicStorageEnvelope(request.envelope),
      payloadDigest: request.payloadDigest,
    })
  }

  options.entries?.forEach(writeValidatedEntry)

  return {
    capabilities,
    async read(request) {
      const validation = validateLapicArtifactReadRequest(request)
      if (!validation.ok) {
        const details = validation.diagnostics.map((d) => d.message).join('; ')
        throw new Error(
          `Invalid artifact read request: ${details || 'unknown validation failure'}`
        )
      }

      const entry = entries.get(request.artifactRef.artifactId)
      if (!entry)
        throw new Error(
          `Artifact not found in memory store: ${request.artifactRef.artifactId}`
        )

      if (
        entry.artifactRef.artifactKind !== request.artifactRef.artifactKind ||
        entry.artifactRef.contentHash !== request.artifactRef.contentHash
      )
        throw new Error(
          `Artifact reference mismatch for ${request.artifactRef.artifactId}`
        )

      return {
        envelope: createLapicStorageEnvelope(entry.envelope),
        payloadDigest: entry.payloadDigest,
      }
    },
    async write(request) {
      writeValidatedEntry(request)
      const artifactRef = createLapicArtifactRefFromWriteRequest(request)
      return {
        artifactRef,
        committed: true,
      }
    },
    listArtifactRefs() {
      return [...entries.values()].map((entry) =>
        createLapicArtifactRef(entry.artifactRef)
      )
    },
    snapshot() {
      return [...entries.values()].map((entry) => ({
        artifactRef: createLapicArtifactRef(entry.artifactRef),
        envelope: createLapicStorageEnvelope(entry.envelope),
        payloadDigest: entry.payloadDigest,
      }))
    },
  }
}
