import {
  createLapicArtifactRef,
  createLapicArtifactRefFromWriteRequest,
  createLapicBackendCapabilityDescriptor,
  createLapicStorageEnvelope,
} from '../builders'
import type {
  LapicArtifactKind,
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
    async scanIndex(artifactKind: LapicArtifactKind) {
      const matchingRefs = [...entries.values()]
        .filter((e) => e.artifactRef.artifactKind === artifactKind)
        .map((e) => createLapicArtifactRef(e.artifactRef))
      return {
        artifactKind,
        matchingRefs,
        totalCount: matchingRefs.length,
      }
    },
    async commitLogicalTransaction(transaction) {
      const committedRefs = transaction.writes.map((request) => {
        writeValidatedEntry(request)
        return createLapicArtifactRefFromWriteRequest(request)
      })
      return {
        transactionId: transaction.transactionId,
        committed: true,
        committedRefs,
        diagnostics: [],
      }
    },
    async importCheckpoint(descriptor) {
      return {
        checkpointId: descriptor.checkpointId,
        resumable: false,
        replayable: false,
        diagnostics: [
          'importCheckpoint is not supported by the in-memory store',
        ],
      }
    },
    async exportCheckpoint(descriptor) {
      return descriptor
    },
    async verifyArtifact(artifactRef) {
      const entry = entries.get(artifactRef.artifactId)
      if (!entry) {
        return {
          ok: false,
          classifications: ['missing-artifact' as const],
          affectedArtifacts: [createLapicArtifactRef(artifactRef)],
        }
      }
      return {
        ok: true,
        classifications: [],
        affectedArtifacts: [],
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
