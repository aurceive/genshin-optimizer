import 'fake-indexeddb/auto'
import {
  createLapicArtifactWriteRequest,
  createLapicStorageEnvelope,
} from '../builders'
import type { LapicArtifactKind, LapicArtifactStore } from '../types'
import { createLapicIndexedDBArtifactStore } from './indexeddb'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let dbCounter = 0

function uniqueDbName(): string {
  return `lapic-idb-test-${Date.now()}-${++dbCounter}`
}

function createWriteRequest(
  artifactKind: LapicArtifactKind = 'frontier-block',
  contentHash = 'content-hash-1'
) {
  return createLapicArtifactWriteRequest(
    createLapicStorageEnvelope({
      artifactKind,
      schemaVersion: '0.1.0-draft',
      payloadEncoding: 'json',
      payloadLength: 128,
      contentHash,
      checksum: {
        algorithm: 'sha256',
        checksum: 'checksum-value',
      },
      compressionCodec: 'none',
      creationEngineVersion: 'engine-version',
      arithmeticPolicyId: 'arith-policy',
      dependencyDigestSet: ['dep-a'],
    }),
    'payload-digest-1'
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLapicIndexedDBArtifactStore', () => {
  let store: LapicArtifactStore

  beforeEach(() => {
    store = createLapicIndexedDBArtifactStore({
      databaseName: uniqueDbName(),
    })
  })

  it('reports indexeddb backend capabilities', () => {
    expect(store.capabilities.backendKind).toBe('indexeddb')
    expect(store.capabilities.supportsTransactions).toBe(true)
    expect(store.capabilities.supportsCompression).toBe(false)
  })

  // -------------------------------------------------------------------------
  // write
  // -------------------------------------------------------------------------

  describe('write', () => {
    it('writes an artifact and returns committed ref', async () => {
      const request = createWriteRequest()
      const result = await store.write(request)

      expect(result.committed).toBe(true)
      expect(result.artifactRef.artifactKind).toBe('frontier-block')
      expect(result.artifactRef.contentHash).toBe('content-hash-1')
      expect(result.artifactRef.artifactId).toBeTruthy()
    })

    it('writes different artifact kinds', async () => {
      const r1 = await store.write(createWriteRequest('frontier-block', 'h1'))
      const r2 = await store.write(createWriteRequest('certificate', 'h2'))
      const r3 = await store.write(
        createWriteRequest('checkpoint-manifest', 'h3')
      )

      expect(r1.artifactRef.artifactKind).toBe('frontier-block')
      expect(r2.artifactRef.artifactKind).toBe('certificate')
      expect(r3.artifactRef.artifactKind).toBe('checkpoint-manifest')
    })
  })

  // -------------------------------------------------------------------------
  // read
  // -------------------------------------------------------------------------

  describe('read', () => {
    it('round-trips a write and read', async () => {
      const request = createWriteRequest()
      const commitResult = await store.write(request)
      const readResult = await store.read({
        artifactRef: commitResult.artifactRef,
      })

      expect(readResult.envelope.contentHash).toBe('content-hash-1')
      expect(readResult.envelope.artifactKind).toBe('frontier-block')
      expect(readResult.payloadDigest).toBe('payload-digest-1')
    })

    it('preserves all envelope fields', async () => {
      const request = createWriteRequest()
      const commitResult = await store.write(request)
      const readResult = await store.read({
        artifactRef: commitResult.artifactRef,
      })

      expect(readResult.envelope.schemaVersion).toBe('0.1.0-draft')
      expect(readResult.envelope.payloadEncoding).toBe('json')
      expect(readResult.envelope.payloadLength).toBe(128)
      expect(readResult.envelope.checksum.algorithm).toBe('sha256')
      expect(readResult.envelope.compressionCodec).toBe('none')
      expect(readResult.envelope.arithmeticPolicyId).toBe('arith-policy')
      expect(readResult.envelope.dependencyDigestSet).toEqual(['dep-a'])
    })

    it('throws on missing artifact', async () => {
      await expect(
        store.read({
          artifactRef: {
            artifactId: 'nonexistent',
            artifactKind: 'frontier-block',
            contentHash: 'missing',
          },
        })
      ).rejects.toThrow('not found')
    })

    it('throws on content hash mismatch', async () => {
      const commitResult = await store.write(createWriteRequest())
      await expect(
        store.read({
          artifactRef: {
            ...commitResult.artifactRef,
            contentHash: 'wrong-hash',
          },
        })
      ).rejects.toThrow('mismatch')
    })
  })

  // -------------------------------------------------------------------------
  // scanIndex
  // -------------------------------------------------------------------------

  describe('scanIndex', () => {
    it('returns empty result for empty store', async () => {
      const result = await store.scanIndex('frontier-block')
      expect(result.matchingRefs).toHaveLength(0)
      expect(result.totalCount).toBe(0)
      expect(result.artifactKind).toBe('frontier-block')
    })

    it('filters by artifact kind', async () => {
      await store.write(createWriteRequest('frontier-block', 'h1'))
      await store.write(createWriteRequest('certificate', 'h2'))
      await store.write(createWriteRequest('frontier-block', 'h3'))

      const frontierResult = await store.scanIndex('frontier-block')
      expect(frontierResult.totalCount).toBe(2)
      expect(frontierResult.matchingRefs).toHaveLength(2)

      const certResult = await store.scanIndex('certificate')
      expect(certResult.totalCount).toBe(1)

      const checkpointResult = await store.scanIndex('checkpoint-manifest')
      expect(checkpointResult.totalCount).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // commitLogicalTransaction
  // -------------------------------------------------------------------------

  describe('commitLogicalTransaction', () => {
    it('commits multiple writes atomically', async () => {
      const result = await store.commitLogicalTransaction({
        transactionId: 'tx-1',
        writes: [
          createWriteRequest('frontier-block', 'h1'),
          createWriteRequest('certificate', 'h2'),
        ],
      })

      expect(result.committed).toBe(true)
      expect(result.transactionId).toBe('tx-1')
      expect(result.committedRefs).toHaveLength(2)
      expect(result.diagnostics).toHaveLength(0)

      // Verify reads work
      for (const ref of result.committedRefs) {
        const readResult = await store.read({ artifactRef: ref })
        expect(readResult.payloadDigest).toBe('payload-digest-1')
      }
    })

    it('commits empty transaction', async () => {
      const result = await store.commitLogicalTransaction({
        transactionId: 'tx-empty',
        writes: [],
      })

      expect(result.committed).toBe(true)
      expect(result.committedRefs).toHaveLength(0)
    })

    it('artifacts from transaction are scannable', async () => {
      await store.commitLogicalTransaction({
        transactionId: 'tx-scan',
        writes: [
          createWriteRequest('frontier-block', 'h1'),
          createWriteRequest('frontier-block', 'h2'),
          createWriteRequest('certificate', 'h3'),
        ],
      })

      const frontierResult = await store.scanIndex('frontier-block')
      expect(frontierResult.totalCount).toBe(2)

      const certResult = await store.scanIndex('certificate')
      expect(certResult.totalCount).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // importCheckpoint / exportCheckpoint
  // -------------------------------------------------------------------------

  describe('checkpoint operations', () => {
    it('importCheckpoint returns non-resumable result', async () => {
      const result = await store.importCheckpoint({
        checkpointId: 'cp-1',
        schemaVersion: '0.1.0-draft',
        artifactRefs: [],
      })

      expect(result.resumable).toBe(false)
      expect(result.replayable).toBe(false)
      expect(result.diagnostics.length).toBeGreaterThan(0)
    })

    it('exportCheckpoint returns the descriptor unchanged', async () => {
      const descriptor = {
        checkpointId: 'cp-export-1',
        schemaVersion: '0.1.0-draft',
        artifactRefs: [],
      }
      const result = await store.exportCheckpoint(descriptor)
      expect(result).toBe(descriptor)
    })
  })

  // -------------------------------------------------------------------------
  // verifyArtifact
  // -------------------------------------------------------------------------

  describe('verifyArtifact', () => {
    it('verifies existing artifact with matching hash', async () => {
      const commitResult = await store.write(createWriteRequest())
      const result = await store.verifyArtifact(commitResult.artifactRef)

      expect(result.ok).toBe(true)
      expect(result.classifications).toHaveLength(0)
      expect(result.affectedArtifacts).toHaveLength(0)
    })

    it('detects missing artifact', async () => {
      const result = await store.verifyArtifact({
        artifactId: 'nonexistent',
        artifactKind: 'frontier-block',
        contentHash: 'missing',
      })

      expect(result.ok).toBe(false)
      expect(result.classifications).toContain('missing-artifact')
      expect(result.affectedArtifacts).toHaveLength(1)
    })

    it('detects content hash mismatch', async () => {
      const commitResult = await store.write(createWriteRequest())
      const result = await store.verifyArtifact({
        ...commitResult.artifactRef,
        contentHash: 'tampered-hash',
      })

      expect(result.ok).toBe(false)
      expect(result.classifications).toContain('checksum-mismatch')
    })
  })

  // -------------------------------------------------------------------------
  // overwrite behavior
  // -------------------------------------------------------------------------

  describe('overwrite behavior', () => {
    it('overwrites existing artifact with same ID', async () => {
      await store.write(createWriteRequest('frontier-block', 'same-hash'))
      const request2 = createLapicArtifactWriteRequest(
        createLapicStorageEnvelope({
          artifactKind: 'frontier-block',
          schemaVersion: '0.1.0-draft',
          payloadEncoding: 'json',
          payloadLength: 256,
          contentHash: 'same-hash',
          checksum: { algorithm: 'sha256', checksum: 'new-checksum' },
          compressionCodec: 'none',
          creationEngineVersion: 'engine-v2',
          arithmeticPolicyId: 'arith-policy',
          dependencyDigestSet: [],
        }),
        'new-payload-digest'
      )
      const commitResult = await store.write(request2)
      const readResult = await store.read({
        artifactRef: commitResult.artifactRef,
      })

      expect(readResult.payloadDigest).toBe('new-payload-digest')
      expect(readResult.envelope.payloadLength).toBe(256)
    })
  })

  // -------------------------------------------------------------------------
  // isolation between stores
  // -------------------------------------------------------------------------

  describe('database isolation', () => {
    it('separate databases do not share artifacts', async () => {
      const store2 = createLapicIndexedDBArtifactStore({
        databaseName: uniqueDbName(),
      })

      const commitResult = await store.write(createWriteRequest())

      await expect(
        store2.read({ artifactRef: commitResult.artifactRef })
      ).rejects.toThrow('not found')
    })
  })
})
