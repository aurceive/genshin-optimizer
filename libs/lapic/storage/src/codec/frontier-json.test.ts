import type { LapicFrontierBlock, LapicFrontierIndex } from '../types'
import {
  createFrontierBlockJsonCodec,
  createFrontierIndexJsonCodec,
  deterministicJsonStringify,
  encodeFrontierBlockWithMetadata,
  encodeFrontierIndexWithMetadata,
} from './frontier-json'

function makeTestRow(i: number) {
  return {
    stateId: `state-${i}`,
    slotId: `slot-${i % 3}`,
    candidateId: `cand-${i}`,
    candidateDigest: `digest-cand-${i}`,
    compatibilityDigest: 'compat-shared',
    exactSignatureGroupKey: {
      occupiedSlotMask: 0b111,
      actorIds: [`actor-${i}`],
      exclusiveResourceKeys: [],
      frameAxisIdentityDigest: 'frame-digest-a',
      adapterSemanticMode: 'gi-team-dps',
    },
    rowDigest: `row-digest-${i}`,
  }
}

function makeTestBlock(rowCount = 3): LapicFrontierBlock {
  const rows = Array.from({ length: rowCount }, (_, i) => makeTestRow(i))
  return {
    blockId: 'block-test-1',
    layout: { stateOrderDigest: 'order-digest-abc' },
    stateIds: rows.map((r) => r.stateId),
    rows,
    rowCount,
  }
}

function makeTestIndex(): LapicFrontierIndex {
  return {
    indexId: 'index-test-1',
    blockIds: ['block-a', 'block-b'],
    compatibilityDigest: 'compat-digest-xyz',
    exactSignatureGroups: [
      {
        groupDigest: 'group-digest-1',
        blockIds: ['block-a'],
        slotIds: ['slot-0', 'slot-1'],
        rowDigests: ['rd-1', 'rd-2'],
        rowCount: 2,
        occupiedSlotMask: 0b011,
        adapterSemanticMode: 'gi-team-dps',
        frameAxisIdentityDigest: 'frame-digest-a',
      },
    ],
  }
}

describe('deterministicJsonStringify', () => {
  it('sorts object keys alphabetically', () => {
    const input = { z: 1, a: 2, m: 3 }
    const result = deterministicJsonStringify(input)
    expect(result).toBe('{"a":2,"m":3,"z":1}')
  })

  it('sorts nested object keys recursively', () => {
    const input = { b: { z: 1, a: 2 }, a: 3 }
    const result = deterministicJsonStringify(input)
    expect(result).toBe('{"a":3,"b":{"a":2,"z":1}}')
  })

  it('preserves array element order', () => {
    const input = { arr: [3, 1, 2] }
    const result = deterministicJsonStringify(input)
    expect(result).toBe('{"arr":[3,1,2]}')
  })

  it('handles null values without error', () => {
    const input = { a: null, b: 1 }
    const result = deterministicJsonStringify(input)
    expect(result).toBe('{"a":null,"b":1}')
  })

  it('respects sortKeys=false option', () => {
    const input = { z: 1, a: 2 }
    const result = deterministicJsonStringify(input, { sortKeys: false })
    expect(result).toBe('{"z":1,"a":2}')
  })

  it('respects indent option', () => {
    const input = { a: 1 }
    const result = deterministicJsonStringify(input, { indent: 2 })
    expect(result).toContain('\n')
    expect(result).toContain('  ')
  })

  it('produces identical output for structurally equal objects with different key order', () => {
    const a = { x: 1, y: { b: 2, a: 3 } }
    const b = { y: { a: 3, b: 2 }, x: 1 }
    expect(deterministicJsonStringify(a)).toBe(deterministicJsonStringify(b))
  })
})

describe('createFrontierBlockJsonCodec', () => {
  it('round-trips a frontier block losslessly', () => {
    const codec = createFrontierBlockJsonCodec()
    const block = makeTestBlock()
    const encoded = codec.encode(block)
    const decoded = codec.decode(encoded)
    expect(decoded).toEqual(block)
  })

  it('produces deterministic output across invocations', () => {
    const codec = createFrontierBlockJsonCodec()
    const block = makeTestBlock()
    const a = codec.encode(block)
    const b = codec.encode(block)
    expect(a).toEqual(b)
  })

  it('reports json encoding and no compression', () => {
    const codec = createFrontierBlockJsonCodec()
    expect(codec.encoding).toBe('json')
    expect(codec.compressionCodec).toBe('none')
  })

  it('handles empty frontier block (0 rows)', () => {
    const codec = createFrontierBlockJsonCodec()
    const block: LapicFrontierBlock = {
      blockId: 'block-empty',
      layout: { stateOrderDigest: 'empty-order' },
      stateIds: [],
      rows: [],
      rowCount: 0,
    }
    const decoded = codec.decode(codec.encode(block))
    expect(decoded).toEqual(block)
  })

  it('handles block with many rows', () => {
    const codec = createFrontierBlockJsonCodec()
    const block = makeTestBlock(50)
    const decoded = codec.decode(codec.encode(block))
    expect(decoded.rows).toHaveLength(50)
    expect(decoded.rowCount).toBe(50)
  })

  it('preserves exactSignatureGroupKey optional discreteTeamModeKey', () => {
    const codec = createFrontierBlockJsonCodec()
    const block = makeTestBlock(1)
    const withKey: LapicFrontierBlock = {
      ...block,
      rows: [
        {
          ...block.rows[0]!,
          exactSignatureGroupKey: {
            ...block.rows[0]!.exactSignatureGroupKey,
            discreteTeamModeKey: 'team-mode-abc',
          },
        },
      ],
    }
    const decoded = codec.decode(codec.encode(withKey))
    expect(decoded.rows[0]!.exactSignatureGroupKey.discreteTeamModeKey).toBe(
      'team-mode-abc'
    )
  })

  it('produces byte-identical output for same input regardless of construction order', () => {
    const codec = createFrontierBlockJsonCodec()
    const block1: LapicFrontierBlock = {
      rowCount: 1,
      blockId: 'b',
      rows: [makeTestRow(0)],
      stateIds: ['state-0'],
      layout: { stateOrderDigest: 'd' },
    }
    const block2: LapicFrontierBlock = {
      blockId: 'b',
      layout: { stateOrderDigest: 'd' },
      stateIds: ['state-0'],
      rows: [makeTestRow(0)],
      rowCount: 1,
    }
    expect(codec.encode(block1)).toEqual(codec.encode(block2))
  })
})

describe('createFrontierIndexJsonCodec', () => {
  it('round-trips a frontier index losslessly', () => {
    const codec = createFrontierIndexJsonCodec()
    const index = makeTestIndex()
    const decoded = codec.decode(codec.encode(index))
    expect(decoded).toEqual(index)
  })

  it('produces deterministic output', () => {
    const codec = createFrontierIndexJsonCodec()
    const index = makeTestIndex()
    expect(codec.encode(index)).toEqual(codec.encode(index))
  })

  it('handles index with no groups', () => {
    const codec = createFrontierIndexJsonCodec()
    const index: LapicFrontierIndex = {
      indexId: 'idx-empty',
      blockIds: [],
      compatibilityDigest: 'cd',
      exactSignatureGroups: [],
    }
    expect(codec.decode(codec.encode(index))).toEqual(index)
  })
})

describe('encodeFrontierBlockWithMetadata', () => {
  it('returns payload and correct metadata', () => {
    const codec = createFrontierBlockJsonCodec()
    const block = makeTestBlock()
    const result = encodeFrontierBlockWithMetadata(block, codec)

    expect(result.payload).toBeInstanceOf(Uint8Array)
    expect(result.metadata.encoding).toBe('json')
    expect(result.metadata.compressionCodec).toBe('none')
    expect(result.metadata.payloadLength).toBe(result.payload.byteLength)
    expect(result.metadata.payloadLength).toBeGreaterThan(0)
  })
})

describe('encodeFrontierIndexWithMetadata', () => {
  it('returns payload and correct metadata', () => {
    const codec = createFrontierIndexJsonCodec()
    const index = makeTestIndex()
    const result = encodeFrontierIndexWithMetadata(index, codec)

    expect(result.payload).toBeInstanceOf(Uint8Array)
    expect(result.metadata.encoding).toBe('json')
    expect(result.metadata.payloadLength).toBe(result.payload.byteLength)
  })
})
