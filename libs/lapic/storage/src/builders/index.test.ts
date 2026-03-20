import {
  createLapicArtifactRefFromWriteRequest,
  createLapicArtifactWriteRequest,
  createLapicStorageEnvelope,
} from './index'

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

describe('lapic storage builders', () => {
  it('creates a deterministic artifact ref from a write request', () => {
    const artifactRef = createLapicArtifactRefFromWriteRequest(createWriteRequest())

    expect(artifactRef.artifactId).toBe('frontier-block:content-hash')
    expect(artifactRef.artifactKind).toBe('frontier-block')
    expect(artifactRef.contentHash).toBe('content-hash')
  })
})
