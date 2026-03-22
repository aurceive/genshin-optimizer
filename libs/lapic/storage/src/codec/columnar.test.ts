import type { LapicFrontierBlock } from '../types'
import {
  columnarToFrontierBlock,
  estimateColumnarCompressionBenefit,
  frontierBlockToColumnar,
} from './columnar'

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

function makeTestBlock(rowCount = 4): LapicFrontierBlock {
  const rows = Array.from({ length: rowCount }, (_, i) => makeTestRow(i))
  return {
    blockId: 'block-col-test',
    layout: { stateOrderDigest: 'col-order-digest' },
    stateIds: rows.map((r) => r.stateId),
    rows,
    rowCount,
  }
}

describe('frontierBlockToColumnar', () => {
  it('transforms row block into columnar layout', () => {
    const block = makeTestBlock()
    const columnar = frontierBlockToColumnar(block)

    expect(columnar.layoutDescriptor.layoutKind).toBe('columnar')
    expect(columnar.layoutDescriptor.stateOrderDigest).toBe('col-order-digest')
    expect(columnar.blockId).toBe(block.blockId)
    expect(columnar.rowCount).toBe(4)
    expect(columnar.stateIds).toEqual(block.stateIds)
  })

  it('splits rows into parallel column arrays', () => {
    const block = makeTestBlock(3)
    const columnar = frontierBlockToColumnar(block)

    expect(columnar.columns.stateId).toEqual(['state-0', 'state-1', 'state-2'])
    expect(columnar.columns.slotId).toEqual(['slot-0', 'slot-1', 'slot-2'])
    expect(columnar.columns.candidateId).toEqual([
      'cand-0',
      'cand-1',
      'cand-2',
    ])
    expect(columnar.columns.candidateDigest).toEqual([
      'digest-cand-0',
      'digest-cand-1',
      'digest-cand-2',
    ])
    // All rows share the same compatibilityDigest
    expect(columnar.columns.compatibilityDigest).toEqual([
      'compat-shared',
      'compat-shared',
      'compat-shared',
    ])
    expect(columnar.columns.rowDigest).toHaveLength(3)
  })

  it('handles empty block', () => {
    const block = makeTestBlock(0)
    const columnar = frontierBlockToColumnar(block)

    expect(columnar.rowCount).toBe(0)
    expect(columnar.columns.stateId).toEqual([])
    expect(columnar.columns.slotId).toEqual([])
  })
})

describe('columnarToFrontierBlock', () => {
  it('reconstructs the original block from columnar layout', () => {
    const original = makeTestBlock(5)
    const columnar = frontierBlockToColumnar(original)
    const reconstructed = columnarToFrontierBlock(columnar)

    expect(reconstructed.blockId).toBe(original.blockId)
    expect(reconstructed.rowCount).toBe(original.rowCount)
    expect(reconstructed.stateIds).toEqual(original.stateIds)
    expect(reconstructed.rows).toEqual(original.rows)
  })

  it('lossless round-trip for all row fields', () => {
    const original = makeTestBlock(10)
    const columnar = frontierBlockToColumnar(original)
    const roundTripped = columnarToFrontierBlock(columnar)

    for (let i = 0; i < original.rowCount; i++) {
      expect(roundTripped.rows[i]).toEqual(original.rows[i])
    }
  })

  it('handles single-row block', () => {
    const original = makeTestBlock(1)
    const columnar = frontierBlockToColumnar(original)
    const roundTripped = columnarToFrontierBlock(columnar)

    expect(roundTripped.rows).toHaveLength(1)
    expect(roundTripped.rows[0]!.stateId).toBe('state-0')
  })

  it('handles empty block round-trip', () => {
    const original = makeTestBlock(0)
    const columnar = frontierBlockToColumnar(original)
    const roundTripped = columnarToFrontierBlock(columnar)

    expect(roundTripped.rows).toHaveLength(0)
    expect(roundTripped.rowCount).toBe(0)
  })

  it('preserves exactSignatureGroupKey structure on round-trip', () => {
    const original = makeTestBlock(2)
    const columnar = frontierBlockToColumnar(original)
    const roundTripped = columnarToFrontierBlock(columnar)

    for (let i = 0; i < 2; i++) {
      const origKey = original.rows[i]!.exactSignatureGroupKey
      const rtKey = roundTripped.rows[i]!.exactSignatureGroupKey
      expect(rtKey.occupiedSlotMask).toBe(origKey.occupiedSlotMask)
      expect(rtKey.actorIds).toEqual(origKey.actorIds)
      expect(rtKey.exclusiveResourceKeys).toEqual(origKey.exclusiveResourceKeys)
      expect(rtKey.frameAxisIdentityDigest).toBe(origKey.frameAxisIdentityDigest)
      expect(rtKey.adapterSemanticMode).toBe(origKey.adapterSemanticMode)
    }
  })
})

describe('estimateColumnarCompressionBenefit', () => {
  it('returns ratio of 1.0 for empty block', () => {
    const columnar = frontierBlockToColumnar(makeTestBlock(0))
    const estimate = estimateColumnarCompressionBenefit(columnar)

    expect(estimate.rowCount).toBe(0)
    expect(estimate.estimatedBenefitRatio).toBe(1.0)
  })

  it('shows low ratio when columns have repeated values', () => {
    // compatibilityDigest is always 'compat-shared' → cardinality 1 for 10 rows
    const block = makeTestBlock(10)
    const columnar = frontierBlockToColumnar(block)
    const estimate = estimateColumnarCompressionBenefit(columnar)

    expect(estimate.rowCount).toBe(10)
    expect(estimate.columnCardinalities['compatibilityDigest']).toBe(1)
    expect(estimate.estimatedBenefitRatio).toBeLessThan(1.0)
  })

  it('shows higher ratio when all column values are unique', () => {
    const block = makeTestBlock(5)
    const columnar = frontierBlockToColumnar(block)
    const estimate = estimateColumnarCompressionBenefit(columnar)

    // stateId, candidateId, candidateDigest, rowDigest are all unique
    expect(estimate.columnCardinalities['stateId']).toBe(5)
    expect(estimate.columnCardinalities['candidateId']).toBe(5)
  })

  it('returns cardinalities for all column names', () => {
    const block = makeTestBlock(3)
    const columnar = frontierBlockToColumnar(block)
    const estimate = estimateColumnarCompressionBenefit(columnar)

    const expectedColumns = [
      'stateId',
      'slotId',
      'candidateId',
      'candidateDigest',
      'compatibilityDigest',
      'exactSignatureGroupKey',
      'rowDigest',
    ]
    for (const col of expectedColumns) {
      expect(estimate.columnCardinalities).toHaveProperty(col)
    }
  })
})
