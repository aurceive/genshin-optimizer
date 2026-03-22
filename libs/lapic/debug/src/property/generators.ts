import fc from 'fast-check'
import type {
  LapicCandidateId,
  LapicDigest,
  LapicExactSignatureGroupKey,
  LapicSlotId,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicArtifactKind,
  LapicArtifactRef,
  LapicCompressionCodec,
  LapicFrontierBlock,
  LapicFrontierGroupSummary,
  LapicFrontierIndex,
  LapicFrontierStateRow,
  LapicPayloadEncoding,
  LapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'

// ---------------------------------------------------------------------------
// Primitive arbitraries
// ---------------------------------------------------------------------------

/** Hex-based digest string (16–64 chars). */
export function arbDigest(): fc.Arbitrary<LapicDigest> {
  return fc.stringMatching(/^[0-9a-f]{16,64}$/)
}

/** Short human-readable identifier (e.g. `slot-3`). */
export function arbSlotId(): fc.Arbitrary<LapicSlotId> {
  return fc.integer({ min: 0, max: 7 }).map((n) => `slot-${n}`)
}

/** Candidate identifier (e.g. `cand-42`). */
export function arbCandidateId(): fc.Arbitrary<LapicCandidateId> {
  return fc.integer({ min: 0, max: 999 }).map((n) => `cand-${n}`)
}

/** Adapter semantic mode string. */
export function arbAdapterSemanticMode(): fc.Arbitrary<string> {
  return fc.constantFrom('gi-team-dps', 'gi-solo-dps', 'sr-team-dps', 'zzz-team-dps')
}

/** Occupied slot bitmask (3-bit). */
export function arbOccupiedSlotMask(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 255 })
}

// ---------------------------------------------------------------------------
// Domain arbitraries — Exact Signature Group Key
// ---------------------------------------------------------------------------

export function arbExactSignatureGroupKey(): fc.Arbitrary<LapicExactSignatureGroupKey> {
  return fc.record({
    occupiedSlotMask: arbOccupiedSlotMask(),
    actorIds: fc.array(arbCandidateId(), { minLength: 1, maxLength: 4 }),
    exclusiveResourceKeys: fc.array(fc.string({ minLength: 1, maxLength: 8 }), {
      maxLength: 3,
    }),
    frameAxisIdentityDigest: arbDigest(),
    adapterSemanticMode: arbAdapterSemanticMode(),
    discreteTeamModeKey: fc.option(fc.string({ minLength: 1, maxLength: 16 }), {
      nil: undefined,
    }),
  })
}

// ---------------------------------------------------------------------------
// Domain arbitraries — Frontier State Row
// ---------------------------------------------------------------------------

export function arbFrontierStateRow(): fc.Arbitrary<LapicFrontierStateRow> {
  return fc.record({
    stateId: arbDigest().map((d) => `state-${d}`),
    slotId: arbSlotId(),
    candidateId: arbCandidateId(),
    candidateDigest: arbDigest(),
    compatibilityDigest: arbDigest(),
    exactSignatureGroupKey: arbExactSignatureGroupKey(),
    rowDigest: arbDigest(),
  })
}

// ---------------------------------------------------------------------------
// Domain arbitraries — Frontier Block
// ---------------------------------------------------------------------------

export function arbFrontierBlock(
  maxRows = 20
): fc.Arbitrary<LapicFrontierBlock> {
  return fc
    .array(arbFrontierStateRow(), { minLength: 0, maxLength: maxRows })
    .chain((rows) =>
      arbDigest().map((orderDigest) => ({
        blockId: `block-${orderDigest.slice(0, 12)}`,
        layout: { stateOrderDigest: orderDigest },
        stateIds: rows.map((r) => r.stateId),
        rows,
        rowCount: rows.length,
      }))
    )
}

// ---------------------------------------------------------------------------
// Domain arbitraries — Frontier Group Summary
// ---------------------------------------------------------------------------

export function arbFrontierGroupSummary(): fc.Arbitrary<LapicFrontierGroupSummary> {
  return fc.record({
    groupDigest: arbDigest(),
    blockIds: fc.array(arbDigest().map((d) => `block-${d.slice(0, 12)}`), {
      minLength: 1,
      maxLength: 5,
    }),
    slotIds: fc.array(arbSlotId(), { minLength: 1, maxLength: 4 }),
    rowDigests: fc.array(arbDigest(), { minLength: 1, maxLength: 10 }),
    rowCount: fc.integer({ min: 1, max: 100 }),
    occupiedSlotMask: arbOccupiedSlotMask(),
    adapterSemanticMode: arbAdapterSemanticMode(),
    frameAxisIdentityDigest: arbDigest(),
    discreteTeamModeKey: fc.option(fc.string({ minLength: 1, maxLength: 16 }), {
      nil: undefined,
    }),
  })
}

// ---------------------------------------------------------------------------
// Domain arbitraries — Frontier Index
// ---------------------------------------------------------------------------

export function arbFrontierIndex(): fc.Arbitrary<LapicFrontierIndex> {
  return fc.record({
    indexId: arbDigest().map((d) => `index-${d.slice(0, 12)}`),
    blockIds: fc.array(arbDigest().map((d) => `block-${d.slice(0, 12)}`), {
      minLength: 0,
      maxLength: 8,
    }),
    compatibilityDigest: arbDigest(),
    exactSignatureGroups: fc.array(arbFrontierGroupSummary(), {
      minLength: 0,
      maxLength: 4,
    }),
  })
}

// ---------------------------------------------------------------------------
// Domain arbitraries — Storage Envelope
// ---------------------------------------------------------------------------

export function arbArtifactKind(): fc.Arbitrary<LapicArtifactKind> {
  return fc.constantFrom(
    'canonical-problem',
    'frontier-block',
    'frontier-index',
    'certificate',
    'checkpoint-manifest',
    'solve-checkpoint',
    'debug-export'
  )
}

export function arbPayloadEncoding(): fc.Arbitrary<LapicPayloadEncoding> {
  return fc.constantFrom('json', 'cbor', 'msgpack', 'raw-bytes')
}

export function arbCompressionCodec(): fc.Arbitrary<LapicCompressionCodec> {
  return fc.constantFrom('none', 'gzip', 'brotli')
}

export function arbStorageEnvelope(): fc.Arbitrary<LapicStorageEnvelope> {
  return fc.record({
    artifactKind: arbArtifactKind(),
    schemaVersion: fc.constant('0.1.0-draft' as const),
    payloadEncoding: arbPayloadEncoding(),
    payloadLength: fc.integer({ min: 0, max: 10_000_000 }),
    contentHash: arbDigest(),
    checksum: fc.record({
      algorithm: fc.constant('sha256'),
      checksum: arbDigest(),
    }),
    compressionCodec: arbCompressionCodec(),
    creationEngineVersion: fc.constant('lapic-0.1.0-test'),
    arithmeticPolicyId: fc.constantFrom('ieee754-double', 'exact-rational'),
    dependencyDigestSet: fc.array(arbDigest(), { maxLength: 5 }),
  })
}

// ---------------------------------------------------------------------------
// Domain arbitraries — Artifact Ref
// ---------------------------------------------------------------------------

export function arbArtifactRef(): fc.Arbitrary<LapicArtifactRef> {
  return arbArtifactKind().chain((kind) =>
    arbDigest().map((hash) => ({
      artifactId: `${kind}:${hash.slice(0, 16)}`,
      artifactKind: kind,
      contentHash: hash,
    }))
  )
}
