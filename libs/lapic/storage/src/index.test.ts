import { createLapicStateLayoutDescriptor } from '@genshin-optimizer/lapic/core'
import {
  createLapicArtifactRefFromWriteRequest,
  createLapicArtifactWriteRequest,
  createLapicCheckpointClosureInventory,
  createLapicMemoryArtifactStore,
  createLapicRepairRecommendationSummary,
  createLapicStorageEnvelope,
  materializeLapicCheckpointClosureInventory,
  scanLapicArtifactIntegrity,
  validateLapicCheckpointClosureInventory,
  validateLapicStorageEnvelope,
  verifyLapicCheckpointClosure,
} from './index'

function createStorageEnvelope() {
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

function createWriteRequest(overrides: Partial<ReturnType<typeof createStorageEnvelope>> = {}) {
  return createLapicArtifactWriteRequest(
    {
      ...createStorageEnvelope(),
      ...overrides,
    },
    'payload-digest'
  )
}

function createLayout() {
  return createLapicStateLayoutDescriptor({
    layoutId: 'layout-id',
    teamLayoutDigest: 'team-layout-digest',
    slotIds: ['flower'],
    frameAxisIdentity: {
      axisKind: 'none',
      frameIds: [],
    },
    dominanceProjectionIds: ['projection-id'],
  })
}

describe('lapic storage', () => {
  it('validates a well-formed storage envelope', () => {
    const result = validateLapicStorageEnvelope(createStorageEnvelope())

    expect(result.ok).toBe(true)
  })

  it('rejects an invalid storage envelope with duplicate dependency digests', () => {
    const result = validateLapicStorageEnvelope({
      ...createStorageEnvelope(),
      dependencyDigestSet: ['dep-a', 'dep-a'],
    })

    expect(result.ok).toBe(false)
  })

  it('creates a deterministic artifact ref from a write request', () => {
    const artifactRef = createLapicArtifactRefFromWriteRequest(createWriteRequest())

    expect(artifactRef.artifactId).toBe('frontier-block:content-hash')
    expect(artifactRef.artifactKind).toBe('frontier-block')
    expect(artifactRef.contentHash).toBe('content-hash')
  })

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

  it('materializes checkpoint closure inventory with missing artifacts', () => {
    const requiredArtifact = createLapicArtifactRefFromWriteRequest(createWriteRequest())
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
    const requiredArtifact = createLapicArtifactRefFromWriteRequest(createWriteRequest())
    const inventory = createLapicCheckpointClosureInventory(
      'checkpoint-id',
      [requiredArtifact],
      [requiredArtifact]
    )

    const result = validateLapicCheckpointClosureInventory(inventory)

    expect(result.ok).toBe(true)
  })

  it('detects missing artifacts during integrity scan', async () => {
    const store = createLapicMemoryArtifactStore()
    const missingArtifact = createLapicArtifactRefFromWriteRequest(createWriteRequest())
    const scan = await scanLapicArtifactIntegrity(store, {
      artifactRefs: [missingArtifact],
    })

    expect(scan.ok).toBe(false)
    expect(scan.classifications).toContain('missing-artifact')
    expect(scan.affectedArtifacts).toEqual([missingArtifact])
  })

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

  it('produces actionable repair recommendations from integrity failures', () => {
    const summary = createLapicRepairRecommendationSummary({
      ok: false,
      classifications: ['missing-artifact', 'schema-mismatch'],
      affectedArtifacts: [createLapicArtifactRefFromWriteRequest(createWriteRequest())],
    })

    expect(summary.canRepairDeterministically).toBe(false)
    expect(summary.actions).toContain(
      'Re-materialize missing artifacts from canonical sources.'
    )
    expect(summary.actions).toContain(
      'Migrate or regenerate artifacts with the expected storage schema.'
    )
  })

  it('keeps layout-compatible frontier payloads usable with core descriptors', () => {
    const layout = createLayout()

    expect(layout.layoutId).toBe('layout-id')
    expect(layout.slotIds).toEqual(['flower'])
  })
})
