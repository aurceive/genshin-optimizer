import {
  createLapicArtifactWriteRequest,
  createLapicStorageEnvelope,
} from '../builders'
import { createLapicMemoryArtifactStore } from './memory'

function createWriteRequest() {
  return createLapicArtifactWriteRequest(
    createLapicStorageEnvelope({
      artifactKind: 'frontier-block',
      schemaVersion: '0.1.0-draft',
      payloadEncoding: 'json',
      payloadLength: 128,
      contentHash: 'content-hash',
      checksum: {
        algorithm: 'sha256',
        checksum: 'checksum-value',
      },
      compressionCodec: 'none',
      creationEngineVersion: 'engine-version',
      arithmeticPolicyId: 'arith-policy',
      dependencyDigestSet: ['dep-a', 'dep-b'],
    }),
    'payload-digest'
  )
}

describe('lapic storage memory store', () => {
  it('round-trips writes and reads through the in-memory artifact store', async () => {
    const store = createLapicMemoryArtifactStore()
    const writeRequest = createWriteRequest()
    const commitResult = await store.write(writeRequest)
    const readResult = await store.read({ artifactRef: commitResult.artifactRef })

    expect(commitResult.committed).toBe(true)
    expect(readResult.envelope.contentHash).toBe('content-hash')
    expect(readResult.payloadDigest).toBe('payload-digest')
    expect(store.listArtifactRefs()).toHaveLength(1)
  })
})