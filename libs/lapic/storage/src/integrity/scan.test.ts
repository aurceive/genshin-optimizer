import {
  createLapicArtifactRefFromWriteRequest,
  createLapicArtifactWriteRequest,
  createLapicStorageEnvelope,
} from '../builders'
import { createLapicMemoryArtifactStore } from '../store/memory'
import { createLapicRepairRecommendationSummary } from './repair'
import { scanLapicArtifactIntegrity } from './scan'

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

describe('lapic storage integrity scan', () => {
  it('detects missing artifacts during integrity scan', async () => {
    const store = createLapicMemoryArtifactStore()
    const missingArtifact = createLapicArtifactRefFromWriteRequest(
      createWriteRequest()
    )
    const scan = await scanLapicArtifactIntegrity(store, {
      artifactRefs: [missingArtifact],
    })

    expect(scan.ok).toBe(false)
    expect(scan.classifications).toContain('missing-artifact')
    expect(scan.affectedArtifacts).toEqual([missingArtifact])
  })

  it('produces actionable repair recommendations from integrity failures', () => {
    const summary = createLapicRepairRecommendationSummary({
      ok: false,
      classifications: ['missing-artifact', 'schema-mismatch'],
      affectedArtifacts: [
        createLapicArtifactRefFromWriteRequest(createWriteRequest()),
      ],
    })

    expect(summary.canRepairDeterministically).toBe(false)
    expect(summary.actions).toContain(
      'Re-materialize missing artifacts from canonical sources.'
    )
    expect(summary.actions).toContain(
      'Migrate or regenerate artifacts with the expected storage schema.'
    )
  })
})
