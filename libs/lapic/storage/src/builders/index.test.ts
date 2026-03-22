import { createLapicStateLayoutDescriptor } from '@genshin-optimizer/lapic/core'
import {
  createLapicArtifactRefFromWriteRequest,
  createLapicArtifactWriteRequest,
  createLapicFrontierBlock,
  createLapicFrontierIndex,
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
    const artifactRef = createLapicArtifactRefFromWriteRequest(
      createWriteRequest()
    )

    expect(artifactRef.artifactId).toBe('frontier-block:content-hash')
    expect(artifactRef.artifactKind).toBe('frontier-block')
    expect(artifactRef.contentHash).toBe('content-hash')
  })

  it('clones frontier rows and exact-signature metadata deterministically', () => {
    const block = createLapicFrontierBlock({
      blockId: 'frontier:block',
      layout: createLapicStateLayoutDescriptor({
        layoutId: 'layout-id',
        teamLayoutDigest: 'team-layout-digest',
        slotIds: ['flower'],
        frameAxisIdentity: {
          axisKind: 'none',
          frameIds: [],
        },
        dominanceProjectionIds: ['dominance:flower'],
      }),
      stateIds: ['state:flower:flower-a'],
      rows: [
        {
          stateId: 'state:flower:flower-a',
          slotId: 'flower',
          candidateId: 'flower-a',
          candidateDigest: 'feature:flower-a',
          compatibilityDigest: 'compat:flower-a',
          exactSignatureGroupKey: {
            occupiedSlotMask: 1,
            actorIds: [],
            exclusiveResourceKeys: [],
            frameAxisIdentityDigest: 'frame-axis-digest',
            adapterSemanticMode: 'gi-legacy-validated',
            discreteTeamModeKey: 'flower',
          },
          rowDigest: 'row:flower-a',
        },
      ],
      rowCount: 1,
    })

    expect(block.rows).toHaveLength(1)
    expect(block.rows[0]?.stateId).toBe('state:flower:flower-a')
    expect(block.rows[0]?.compatibilityDigest).toBe('compat:flower-a')
    expect(block.rows[0]?.exactSignatureGroupKey.discreteTeamModeKey).toBe(
      'flower'
    )
    expect(block.rows[0]).not.toBeUndefined()
  })

  it('clones frontier index exact-signature group summaries deterministically', () => {
    const index = createLapicFrontierIndex({
      indexId: 'frontier-index:problem-digest',
      blockIds: ['frontier:problem-digest:flower'],
      compatibilityDigest: 'frontier-index:problem-digest:group-a',
      exactSignatureGroups: [
        {
          groupDigest: 'frontier-group:problem-digest:group-a',
          blockIds: ['frontier:problem-digest:flower'],
          slotIds: ['flower'],
          rowDigests: ['row:flower-a'],
          rowCount: 1,
          occupiedSlotMask: 1,
          adapterSemanticMode: 'gi-legacy-validated',
          frameAxisIdentityDigest: 'frame-axis-digest',
          discreteTeamModeKey: 'flower',
        },
      ],
    })

    expect(index.exactSignatureGroups).toHaveLength(1)
    expect(index.exactSignatureGroups[0]?.groupDigest).toBe(
      'frontier-group:problem-digest:group-a'
    )
    expect(index.exactSignatureGroups[0]?.rowCount).toBe(1)
    expect(index.exactSignatureGroups[0]?.adapterSemanticMode).toBe(
      'gi-legacy-validated'
    )
  })
})
