import {
  createLapicArtifactWriteRequest,
  createLapicStorageEnvelope,
} from '../builders'
import { createLapicMemoryArtifactStore } from '../store/memory'
import { verifyLapicCheckpointClosure } from './verification'

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

describe('lapic storage checkpoint verification', () => {
  it('verifies checkpoint closure against the artifact store', async () => {
    const store = createLapicMemoryArtifactStore()
    const writeRequest = createWriteRequest()
    const committed = await store.write(writeRequest)
    const verification = await verifyLapicCheckpointClosure(store, {
      checkpointId: 'checkpoint-id',
      artifactRefs: [committed.artifactRef],
    })

    expect(verification.resumable).toBe(true)
    expect(verification.replayable).toBe(true)
    expect(verification.diagnostics).toEqual([])
  })
})
