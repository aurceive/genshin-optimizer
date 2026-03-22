/**
 * Filesystem-backed artifact store for Node.js environments.
 *
 * Layout: `{rootDir}/{artifactKind}/{artifactId}.json`
 *
 * Write semantics: atomic via temp-file + rename to prevent
 * partial writes from corrupting stored artifacts.
 *
 * All stored artifacts are JSON-encoded objects containing
 * the storage envelope and payload digest.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  createLapicArtifactRef,
  createLapicArtifactRefFromWriteRequest,
  createLapicBackendCapabilityDescriptor,
  createLapicStorageEnvelope,
} from '../builders'
import type {
  LapicArtifactRef,
  LapicArtifactStore,
  LapicArtifactWriteRequest,
  LapicBackendCapabilityDescriptor,
  LapicStorageEnvelope,
} from '../types'
import {
  validateLapicArtifactReadRequest,
  validateLapicArtifactWriteRequest,
} from '../validation'

// ---------------------------------------------------------------------------
// On-disk record shape
// ---------------------------------------------------------------------------

interface LapicFilesystemArtifactRecord {
  readonly artifactRef: LapicArtifactRef
  readonly envelope: LapicStorageEnvelope
  readonly payloadDigest: string
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the filesystem artifact store.
 */
export interface LapicFilesystemArtifactStoreConfig {
  /** Root directory for all stored artifacts. */
  readonly rootDir: string
}

/**
 * Extended store interface that adds filesystem-specific operations.
 */
export interface LapicFilesystemArtifactStore extends LapicArtifactStore {
  /** List all artifact references in the store. */
  listArtifactRefs(): readonly LapicArtifactRef[]
  /** Delete all artifacts (removes the root directory tree). */
  clear(): void
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function artifactDir(rootDir: string, artifactKind: string): string {
  return path.join(rootDir, artifactKind)
}

function artifactPath(
  rootDir: string,
  artifactKind: string,
  artifactId: string
): string {
  // Sanitize artifactId for filesystem safety (replace colons with dashes)
  const safeId = artifactId.replace(/:/g, '-')
  return path.join(rootDir, artifactKind, `${safeId}.json`)
}

function tempPath(filePath: string): string {
  return `${filePath}.tmp.${Date.now()}`
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a filesystem-backed artifact store.
 *
 * Artifacts are stored as JSON files under a deterministic directory
 * layout: `{rootDir}/{artifactKind}/{sanitizedArtifactId}.json`.
 *
 * Write operations use atomic temp-file + rename to prevent partial
 * writes from corrupting the store.
 */
export function createLapicFilesystemArtifactStore(
  config: LapicFilesystemArtifactStoreConfig
): LapicFilesystemArtifactStore {
  const { rootDir } = config

  const capabilities: LapicBackendCapabilityDescriptor =
    createLapicBackendCapabilityDescriptor({
      backendKind: 'filesystem',
      supportsTransactions: false,
      supportsCompression: false,
    })

  // Ensure root directory exists
  fs.mkdirSync(rootDir, { recursive: true })

  return {
    capabilities,

    async read(request) {
      const validation = validateLapicArtifactReadRequest(request)
      if (!validation.ok) {
        const details = validation.diagnostics
          .map((d) => d.message)
          .join('; ')
        throw new Error(
          `Invalid filesystem store read request: ${details || 'unknown validation failure'}`
        )
      }

      const filePath = artifactPath(
        rootDir,
        request.artifactRef.artifactKind,
        request.artifactRef.artifactId
      )

      if (!fs.existsSync(filePath)) {
        throw new Error(
          `Artifact not found in filesystem store: ${request.artifactRef.artifactId}`
        )
      }

      const raw = fs.readFileSync(filePath, 'utf-8')
      const record: LapicFilesystemArtifactRecord = JSON.parse(raw)

      // Verify ref consistency
      if (
        record.artifactRef.artifactKind !==
          request.artifactRef.artifactKind ||
        record.artifactRef.contentHash !==
          request.artifactRef.contentHash
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
        const details = validation.diagnostics
          .map((d) => d.message)
          .join('; ')
        throw new Error(
          `Invalid filesystem store write request: ${details || 'unknown validation failure'}`
        )
      }

      const artifactRef = createLapicArtifactRefFromWriteRequest(request)

      // Ensure kind directory exists
      const kindDir = artifactDir(rootDir, artifactRef.artifactKind)
      fs.mkdirSync(kindDir, { recursive: true })

      const filePath = artifactPath(
        rootDir,
        artifactRef.artifactKind,
        artifactRef.artifactId
      )

      const record: LapicFilesystemArtifactRecord = {
        artifactRef: createLapicArtifactRef(artifactRef),
        envelope: createLapicStorageEnvelope(request.envelope),
        payloadDigest: request.payloadDigest,
      }

      // Atomic write: temp file → rename
      const tmp = tempPath(filePath)
      fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf-8')
      fs.renameSync(tmp, filePath)

      return { artifactRef, committed: true }
    },

    listArtifactRefs() {
      const refs: LapicArtifactRef[] = []

      if (!fs.existsSync(rootDir)) return refs

      const kindDirs = fs.readdirSync(rootDir, { withFileTypes: true })
      for (const entry of kindDirs) {
        if (!entry.isDirectory()) continue
        const kindPath = path.join(rootDir, entry.name)
        const files = fs.readdirSync(kindPath, { withFileTypes: true })
        for (const file of files) {
          if (!file.isFile() || !file.name.endsWith('.json')) continue
          try {
            const raw = fs.readFileSync(
              path.join(kindPath, file.name),
              'utf-8'
            )
            const record: LapicFilesystemArtifactRecord = JSON.parse(raw)
            refs.push(createLapicArtifactRef(record.artifactRef))
          } catch {
            // Skip corrupted files during enumeration
          }
        }
      }

      return refs
    },

    clear() {
      if (fs.existsSync(rootDir)) {
        fs.rmSync(rootDir, { recursive: true, force: true })
      }
    },
  }
}
