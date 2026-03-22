import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  createLapicArtifactWriteRequest,
  createLapicStorageEnvelope,
} from '../builders'
import { createLapicFilesystemArtifactStore } from './filesystem'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lapic-fs-test-'))
}

function createWriteRequest(
  artifactKind: 'frontier-block' | 'certificate' | 'checkpoint-manifest' = 'frontier-block',
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

describe('createLapicFilesystemArtifactStore', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = makeTempDir()
  })

  afterEach(() => {
    if (fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true, force: true })
    }
  })

  it('creates the root directory on construction', () => {
    const newRoot = path.join(rootDir, 'nested', 'store')
    createLapicFilesystemArtifactStore({ rootDir: newRoot })
    expect(fs.existsSync(newRoot)).toBe(true)
  })

  it('reports filesystem backend capabilities', () => {
    const store = createLapicFilesystemArtifactStore({ rootDir })
    expect(store.capabilities.backendKind).toBe('filesystem')
    expect(store.capabilities.supportsTransactions).toBe(false)
    expect(store.capabilities.supportsCompression).toBe(false)
  })

  describe('write', () => {
    it('writes an artifact to disk', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      const request = createWriteRequest()
      const result = await store.write(request)

      expect(result.committed).toBe(true)
      expect(result.artifactRef.artifactKind).toBe('frontier-block')
      expect(result.artifactRef.contentHash).toBe('content-hash-1')
    })

    it('creates kind subdirectory', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      await store.write(createWriteRequest())

      const kindDir = path.join(rootDir, 'frontier-block')
      expect(fs.existsSync(kindDir)).toBe(true)
    })

    it('stores valid JSON on disk', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      const result = await store.write(createWriteRequest())

      const files = fs.readdirSync(
        path.join(rootDir, 'frontier-block')
      )
      expect(files.length).toBe(1)
      expect(files[0]!.endsWith('.json')).toBe(true)

      const raw = fs.readFileSync(
        path.join(rootDir, 'frontier-block', files[0]!),
        'utf-8'
      )
      const record = JSON.parse(raw)
      expect(record.artifactRef.artifactId).toBe(
        result.artifactRef.artifactId
      )
      expect(record.payloadDigest).toBe('payload-digest-1')
    })

    it('leaves no temp files after successful write', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      await store.write(createWriteRequest())

      const files = fs.readdirSync(
        path.join(rootDir, 'frontier-block')
      )
      const tmpFiles = files.filter((f) => f.includes('.tmp.'))
      expect(tmpFiles).toHaveLength(0)
    })
  })

  describe('read', () => {
    it('round-trips a write and read', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
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
      const store = createLapicFilesystemArtifactStore({ rootDir })
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
      const store = createLapicFilesystemArtifactStore({ rootDir })

      await expect(
        store.read({
          artifactRef: {
            artifactId: 'nonexistent',
            artifactKind: 'frontier-block',
            contentHash: 'missing',
          },
        })
      ).rejects.toThrow('Artifact not found')
    })

    it('throws on content hash mismatch', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      const request = createWriteRequest()
      const commitResult = await store.write(request)

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

  describe('listArtifactRefs', () => {
    it('returns empty list for empty store', () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      expect(store.listArtifactRefs()).toHaveLength(0)
    })

    it('lists all written artifacts', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      await store.write(createWriteRequest('frontier-block', 'hash-1'))
      await store.write(createWriteRequest('certificate', 'hash-2'))
      await store.write(
        createWriteRequest('checkpoint-manifest', 'hash-3')
      )

      const refs = store.listArtifactRefs()
      expect(refs).toHaveLength(3)

      const kinds = refs.map((r) => r.artifactKind).sort()
      expect(kinds).toEqual([
        'certificate',
        'checkpoint-manifest',
        'frontier-block',
      ])
    })

    it('skips non-JSON files', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      await store.write(createWriteRequest())

      // Write a non-JSON file
      fs.writeFileSync(
        path.join(rootDir, 'frontier-block', 'notes.txt'),
        'not an artifact'
      )

      const refs = store.listArtifactRefs()
      expect(refs).toHaveLength(1)
    })
  })

  describe('clear', () => {
    it('removes all stored artifacts', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      await store.write(createWriteRequest('frontier-block', 'hash-1'))
      await store.write(createWriteRequest('certificate', 'hash-2'))

      expect(store.listArtifactRefs()).toHaveLength(2)

      store.clear()

      expect(fs.existsSync(rootDir)).toBe(false)
    })

    it('is safe to call on empty store', () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      expect(() => store.clear()).not.toThrow()
    })
  })

  describe('deterministic layout', () => {
    it('places artifacts under {rootDir}/{kind}/', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      await store.write(createWriteRequest('frontier-block'))
      await store.write(createWriteRequest('certificate', 'hash-c'))

      expect(fs.existsSync(path.join(rootDir, 'frontier-block'))).toBe(
        true
      )
      expect(fs.existsSync(path.join(rootDir, 'certificate'))).toBe(true)
    })

    it('sanitizes artifact IDs with colons', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })
      await store.write(createWriteRequest())

      const files = fs.readdirSync(
        path.join(rootDir, 'frontier-block')
      )
      // Artifact ID is "frontier-block:content-hash-1", colons become dashes
      expect(files[0]).not.toContain(':')
      expect(files[0]!.endsWith('.json')).toBe(true)
    })
  })

  describe('multiple stores on same directory', () => {
    it('shares artifacts between store instances', async () => {
      const store1 = createLapicFilesystemArtifactStore({ rootDir })
      const commitResult = await store1.write(createWriteRequest())

      const store2 = createLapicFilesystemArtifactStore({ rootDir })
      const readResult = await store2.read({
        artifactRef: commitResult.artifactRef,
      })

      expect(readResult.payloadDigest).toBe('payload-digest-1')
    })
  })

  describe('overwrite behavior', () => {
    it('overwrites existing artifact with same ID', async () => {
      const store = createLapicFilesystemArtifactStore({ rootDir })

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
})
