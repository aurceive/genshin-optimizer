import { createLapicStorageEnvelope } from '../builders'
import { validateLapicStorageEnvelope } from './envelope'

function createStorageEnvelopeFixture() {
  return createLapicStorageEnvelope({
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
  })
}

describe('lapic storage envelope validation', () => {
  it('validates a well-formed storage envelope', () => {
    const result = validateLapicStorageEnvelope(createStorageEnvelopeFixture())

    expect(result.ok).toBe(true)
  })

  it('rejects an invalid storage envelope with duplicate dependency digests', () => {
    const result = validateLapicStorageEnvelope({
      ...createStorageEnvelopeFixture(),
      dependencyDigestSet: ['dep-a', 'dep-a'],
    })

    expect(result.ok).toBe(false)
  })
})
