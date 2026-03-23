/**
 * IndexedDB-backed artifact store for browser environments.
 *
 * Layout: objectStore 'artifacts' keyed by artifactId, containing
 * { artifactRef, envelope, payloadDigest } records.
 *
 * This is a minimal viable implementation satisfying the store interface
 * contract from frontier-storage-and-codec.md §17.1. Full production
 * features (compaction, migration, quota management) are deferred.
 */

import {
  createLapicArtifactRef,
  createLapicArtifactRefFromWriteRequest,
  createLapicBackendCapabilityDescriptor,
  createLapicStorageEnvelope,
} from '../builders'
import type {
  LapicArtifactKind,
  LapicArtifactRef,
  LapicArtifactStore,
  LapicBackendCapabilityDescriptor,
  LapicStorageEnvelope,
} from '../types'
import {
  validateLapicArtifactReadRequest,
  validateLapicArtifactWriteRequest,
} from '../validation'

// ---------------------------------------------------------------------------
// On-disk record shape (stored in IndexedDB object store)
// ---------------------------------------------------------------------------

interface LapicIndexedDBArtifactRecord {
  readonly artifactId: string
  readonly artifactRef: LapicArtifactRef
  readonly envelope: LapicStorageEnvelope
  readonly payloadDigest: string
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface LapicIndexedDBArtifactStoreConfig {
  /** IndexedDB database name. Defaults to 'lapic-artifact-store'. */
  readonly databaseName?: string
  /** IndexedDB database version. Defaults to 1. */
  readonly databaseVersion?: number
}

const DEFAULT_DB_NAME = 'lapic-artifact-store'
const DEFAULT_DB_VERSION = 1
const STORE_NAME = 'artifacts'

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function openDatabase(dbName: string, dbVersion: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'artifactId' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(
        new Error(
          `Failed to open IndexedDB database '${dbName}': ${request.error?.message ?? 'unknown error'}`
        )
      )
  })
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(
        new Error(
          `IndexedDB request failed: ${request.error?.message ?? 'unknown error'}`
        )
      )
  })
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an IndexedDB-backed artifact store for browser environments.
 *
 * Artifacts are stored in an IndexedDB object store keyed by artifactId.
 * The store supports transactions natively via IndexedDB transactions.
 */
export function createLapicIndexedDBArtifactStore(
  config: LapicIndexedDBArtifactStoreConfig = {}
): LapicArtifactStore {
  const dbName = config.databaseName ?? DEFAULT_DB_NAME
  const dbVersion = config.databaseVersion ?? DEFAULT_DB_VERSION

  let dbPromise: Promise<IDBDatabase> | null = null
  const getDb = () => {
    if (!dbPromise) dbPromise = openDatabase(dbName, dbVersion)
    return dbPromise
  }

  const capabilities: LapicBackendCapabilityDescriptor =
    createLapicBackendCapabilityDescriptor({
      backendKind: 'indexeddb',
      supportsTransactions: true,
      supportsCompression: false,
    })

  return {
    capabilities,

    async read(request) {
      const validation = validateLapicArtifactReadRequest(request)
      if (!validation.ok) {
        const details = validation.diagnostics.map((d) => d.message).join('; ')
        throw new Error(
          `Invalid IndexedDB store read request: ${details || 'unknown validation failure'}`
        )
      }

      const db = await getDb()
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const record = await idbRequest<LapicIndexedDBArtifactRecord | undefined>(
        store.get(request.artifactRef.artifactId)
      )

      if (!record) {
        throw new Error(
          `Artifact not found in IndexedDB store: ${request.artifactRef.artifactId}`
        )
      }

      if (
        record.artifactRef.artifactKind !== request.artifactRef.artifactKind ||
        record.artifactRef.contentHash !== request.artifactRef.contentHash
      ) {
        throw new Error(
          `Artifact reference mismatch for ${request.artifactRef.artifactId}`
        )
      }

      return {
        envelope: createLapicStorageEnvelope(record.envelope),
        payloadDigest: record.payloadDigest,
      }
    },

    async write(request) {
      const validation = validateLapicArtifactWriteRequest(request)
      if (!validation.ok) {
        const details = validation.diagnostics.map((d) => d.message).join('; ')
        throw new Error(
          `Invalid IndexedDB store write request: ${details || 'unknown validation failure'}`
        )
      }

      const artifactRef = createLapicArtifactRefFromWriteRequest(request)
      const record: LapicIndexedDBArtifactRecord = {
        artifactId: artifactRef.artifactId,
        artifactRef: createLapicArtifactRef(artifactRef),
        envelope: createLapicStorageEnvelope(request.envelope),
        payloadDigest: request.payloadDigest,
      }

      const db = await getDb()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      await idbRequest(store.put(record))

      return { artifactRef, committed: true }
    },

    async scanIndex(artifactKind: LapicArtifactKind) {
      const db = await getDb()
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const allRecords = await idbRequest<LapicIndexedDBArtifactRecord[]>(
        store.getAll()
      )

      const matchingRefs = allRecords
        .filter((r) => r.artifactRef.artifactKind === artifactKind)
        .map((r) => createLapicArtifactRef(r.artifactRef))

      return {
        artifactKind,
        matchingRefs,
        totalCount: matchingRefs.length,
      }
    },

    async commitLogicalTransaction(transaction) {
      const db = await getDb()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const committedRefs: LapicArtifactRef[] = []

      for (const writeReq of transaction.writes) {
        const validation = validateLapicArtifactWriteRequest(writeReq)
        if (!validation.ok) {
          const details = validation.diagnostics
            .map((d) => d.message)
            .join('; ')
          return {
            transactionId: transaction.transactionId,
            committed: false,
            committedRefs: [],
            diagnostics: [`Write validation failed: ${details || 'unknown'}`],
          }
        }

        const artifactRef = createLapicArtifactRefFromWriteRequest(writeReq)
        const record: LapicIndexedDBArtifactRecord = {
          artifactId: artifactRef.artifactId,
          artifactRef: createLapicArtifactRef(artifactRef),
          envelope: createLapicStorageEnvelope(writeReq.envelope),
          payloadDigest: writeReq.payloadDigest,
        }
        await idbRequest(store.put(record))
        committedRefs.push(artifactRef)
      }

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
          'importCheckpoint requires external transfer not yet supported by the IndexedDB store',
        ],
      }
    },

    async exportCheckpoint(descriptor) {
      return descriptor
    },

    async verifyArtifact(artifactRef) {
      const db = await getDb()
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const record = await idbRequest<LapicIndexedDBArtifactRecord | undefined>(
        store.get(artifactRef.artifactId)
      )

      if (!record) {
        return {
          ok: false,
          classifications: ['missing-artifact' as const],
          affectedArtifacts: [createLapicArtifactRef(artifactRef)],
        }
      }

      if (record.artifactRef.contentHash !== artifactRef.contentHash) {
        return {
          ok: false,
          classifications: ['checksum-mismatch' as const],
          affectedArtifacts: [createLapicArtifactRef(artifactRef)],
        }
      }

      return { ok: true, classifications: [], affectedArtifacts: [] }
    },
  }
}
