import fc from 'fast-check'
import {
  arbArtifactKind,
  arbArtifactRef,
  arbCandidateId,
  arbCompressionCodec,
  arbDigest,
  arbExactSignatureGroupKey,
  arbFrontierBlock,
  arbFrontierGroupSummary,
  arbFrontierIndex,
  arbFrontierStateRow,
  arbOccupiedSlotMask,
  arbPayloadEncoding,
  arbSlotId,
  arbStorageEnvelope,
} from './generators'

describe('primitive arbitraries', () => {
  it('arbDigest produces lowercase hex strings of valid length', () => {
    fc.assert(
      fc.property(arbDigest(), (d) => {
        expect(d.length).toBeGreaterThanOrEqual(16)
        expect(d.length).toBeLessThanOrEqual(64)
        expect(d).toMatch(/^[0-9a-f]+$/)
      }),
      { numRuns: 50 }
    )
  })

  it('arbSlotId produces valid slot identifiers', () => {
    fc.assert(
      fc.property(arbSlotId(), (s) => {
        expect(s).toMatch(/^slot-\d$/)
      }),
      { numRuns: 20 }
    )
  })

  it('arbCandidateId produces valid candidate identifiers', () => {
    fc.assert(
      fc.property(arbCandidateId(), (c) => {
        expect(c).toMatch(/^cand-\d+$/)
      }),
      { numRuns: 20 }
    )
  })

  it('arbOccupiedSlotMask produces valid bitmask', () => {
    fc.assert(
      fc.property(arbOccupiedSlotMask(), (m) => {
        expect(m).toBeGreaterThanOrEqual(1)
        expect(m).toBeLessThanOrEqual(255)
        expect(Number.isInteger(m)).toBe(true)
      }),
      { numRuns: 20 }
    )
  })
})

describe('arbExactSignatureGroupKey', () => {
  it('produces valid group key structures', () => {
    fc.assert(
      fc.property(arbExactSignatureGroupKey(), (key) => {
        expect(key.occupiedSlotMask).toBeGreaterThanOrEqual(1)
        expect(key.actorIds.length).toBeGreaterThanOrEqual(1)
        expect(typeof key.frameAxisIdentityDigest).toBe('string')
        expect(typeof key.adapterSemanticMode).toBe('string')
      }),
      { numRuns: 30 }
    )
  })
})

describe('arbFrontierStateRow', () => {
  it('produces valid row structures', () => {
    fc.assert(
      fc.property(arbFrontierStateRow(), (row) => {
        expect(row.stateId).toMatch(/^state-/)
        expect(typeof row.slotId).toBe('string')
        expect(typeof row.candidateId).toBe('string')
        expect(typeof row.candidateDigest).toBe('string')
        expect(typeof row.compatibilityDigest).toBe('string')
        expect(typeof row.rowDigest).toBe('string')
        expect(row.exactSignatureGroupKey).toBeDefined()
      }),
      { numRuns: 30 }
    )
  })
})

describe('arbFrontierBlock', () => {
  it('produces blocks with consistent rowCount', () => {
    fc.assert(
      fc.property(arbFrontierBlock(), (block) => {
        expect(block.rowCount).toBe(block.rows.length)
        expect(block.stateIds.length).toBe(block.rows.length)
      }),
      { numRuns: 30 }
    )
  })

  it('produces blocks with valid blockId', () => {
    fc.assert(
      fc.property(arbFrontierBlock(), (block) => {
        expect(block.blockId).toMatch(/^block-/)
      }),
      { numRuns: 20 }
    )
  })
})

describe('arbFrontierIndex', () => {
  it('produces valid index structures', () => {
    fc.assert(
      fc.property(arbFrontierIndex(), (idx) => {
        expect(idx.indexId).toMatch(/^index-/)
        expect(typeof idx.compatibilityDigest).toBe('string')
        expect(Array.isArray(idx.blockIds)).toBe(true)
        expect(Array.isArray(idx.exactSignatureGroups)).toBe(true)
      }),
      { numRuns: 20 }
    )
  })
})

describe('arbFrontierGroupSummary', () => {
  it('produces valid group summary structures', () => {
    fc.assert(
      fc.property(arbFrontierGroupSummary(), (group) => {
        expect(group.blockIds.length).toBeGreaterThanOrEqual(1)
        expect(group.slotIds.length).toBeGreaterThanOrEqual(1)
        expect(group.rowCount).toBeGreaterThanOrEqual(1)
        expect(typeof group.groupDigest).toBe('string')
      }),
      { numRuns: 20 }
    )
  })
})

describe('arbStorageEnvelope', () => {
  it('produces valid envelope structures', () => {
    fc.assert(
      fc.property(arbStorageEnvelope(), (env) => {
        expect([
          'canonical-problem',
          'frontier-block',
          'frontier-index',
          'certificate',
          'checkpoint-manifest',
          'solve-checkpoint',
          'debug-export',
        ]).toContain(env.artifactKind)
        expect(env.payloadLength).toBeGreaterThanOrEqual(0)
        expect(env.checksum.algorithm).toBe('sha256')
        expect(Array.isArray(env.dependencyDigestSet)).toBe(true)
      }),
      { numRuns: 30 }
    )
  })
})

describe('arbArtifactRef', () => {
  it('produces refs with consistent kind and id', () => {
    fc.assert(
      fc.property(arbArtifactRef(), (ref) => {
        expect(ref.artifactId).toContain(ref.artifactKind)
        expect(typeof ref.contentHash).toBe('string')
      }),
      { numRuns: 20 }
    )
  })
})

describe('arbArtifactKind / arbPayloadEncoding / arbCompressionCodec', () => {
  it('arbArtifactKind produces one of the valid kinds', () => {
    fc.assert(
      fc.property(arbArtifactKind(), (kind) => {
        expect([
          'canonical-problem',
          'frontier-block',
          'frontier-index',
          'certificate',
          'checkpoint-manifest',
          'solve-checkpoint',
          'debug-export',
        ]).toContain(kind)
      }),
      { numRuns: 20 }
    )
  })

  it('arbPayloadEncoding produces valid encodings', () => {
    fc.assert(
      fc.property(arbPayloadEncoding(), (enc) => {
        expect(['json', 'cbor', 'msgpack', 'raw-bytes']).toContain(enc)
      }),
      { numRuns: 20 }
    )
  })

  it('arbCompressionCodec produces valid codecs', () => {
    fc.assert(
      fc.property(arbCompressionCodec(), (cc) => {
        expect(['none', 'gzip', 'brotli']).toContain(cc)
      }),
      { numRuns: 20 }
    )
  })
})
