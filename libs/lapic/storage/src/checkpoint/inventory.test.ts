import {
  createLapicArtifactRefFromWriteRequest,
  createLapicArtifactWriteRequest,
  createLapicCheckpointClosureInventory,
  createLapicStorageEnvelope,
} from '../builders'
import { validateLapicCheckpointClosureInventory } from '../validation/checkpoint'
import { materializeLapicCheckpointClosureInventory } from './inventory'

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

describe('lapic storage checkpoint inventory', () => {
  it('materializes checkpoint closure inventory with missing artifacts', () => {
    const requiredArtifact = createLapicArtifactRefFromWriteRequest(
      createWriteRequest()
    )
    const inventory = materializeLapicCheckpointClosureInventory(
      {
        checkpointId: 'checkpoint-id',
        artifactRefs: [requiredArtifact],
      },
      []
    )

    expect(inventory.missingArtifacts).toEqual([requiredArtifact])
  })

  it('validates checkpoint closure inventory when missing artifacts are a subset of required artifacts', () => {
    const requiredArtifact = createLapicArtifactRefFromWriteRequest(
      createWriteRequest()
    )
    const inventory = createLapicCheckpointClosureInventory(
      'checkpoint-id',
      [requiredArtifact],
      [requiredArtifact]
    )

    const result = validateLapicCheckpointClosureInventory(inventory)

    expect(result.ok).toBe(true)
  })
})
