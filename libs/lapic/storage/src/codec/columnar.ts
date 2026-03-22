import type {
  LapicCandidateId,
  LapicDigest,
  LapicExactSignatureGroupKey,
  LapicSlotId,
  LapicStateLayoutDescriptor,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicBlockLayoutDescriptor,
  LapicFrontierBlock,
  LapicFrontierStateRow,
} from '../types'

/**
 * Columnar representation of frontier block rows.
 * Each field is stored as a parallel array rather than an array of structs.
 * This enables better compression ratios for large blocks because identical
 * values in the same column compress together.
 */
export interface LapicColumnarFrontierLayout {
  readonly layoutDescriptor: LapicBlockLayoutDescriptor
  readonly layout: LapicStateLayoutDescriptor
  readonly blockId: string
  readonly stateIds: readonly string[]
  readonly rowCount: number
  readonly columns: LapicFrontierColumnSet
}

export interface LapicFrontierColumnSet {
  readonly stateId: readonly string[]
  readonly slotId: readonly LapicSlotId[]
  readonly candidateId: readonly LapicCandidateId[]
  readonly candidateDigest: readonly LapicDigest[]
  readonly compatibilityDigest: readonly LapicDigest[]
  readonly exactSignatureGroupKey: readonly LapicExactSignatureGroupKey[]
  readonly rowDigest: readonly LapicDigest[]
}

/**
 * Transform a row-oriented frontier block into columnar layout.
 * Row order is preserved exactly — row[i] corresponds to column[i] in all arrays.
 */
export function frontierBlockToColumnar(
  block: LapicFrontierBlock
): LapicColumnarFrontierLayout {
  const rows = block.rows

  const columns: LapicFrontierColumnSet = {
    stateId: rows.map((r) => r.stateId),
    slotId: rows.map((r) => r.slotId),
    candidateId: rows.map((r) => r.candidateId),
    candidateDigest: rows.map((r) => r.candidateDigest),
    compatibilityDigest: rows.map((r) => r.compatibilityDigest),
    exactSignatureGroupKey: rows.map((r) => r.exactSignatureGroupKey),
    rowDigest: rows.map((r) => r.rowDigest),
  }

  return {
    layoutDescriptor: {
      layoutKind: 'columnar',
      stateOrderDigest: block.layout.stateOrderDigest ?? '',
    },
    layout: block.layout,
    blockId: block.blockId,
    stateIds: block.stateIds,
    rowCount: block.rowCount,
    columns,
  }
}

/**
 * Transform a columnar frontier layout back into a row-oriented frontier block.
 * Column[i] is reassembled into row[i].
 */
export function columnarToFrontierBlock(
  columnar: LapicColumnarFrontierLayout
): LapicFrontierBlock {
  const { columns, rowCount } = columnar

  const rows: LapicFrontierStateRow[] = []
  for (let i = 0; i < rowCount; i++) {
    rows.push({
      stateId: columns.stateId[i]!,
      slotId: columns.slotId[i]!,
      candidateId: columns.candidateId[i]!,
      candidateDigest: columns.candidateDigest[i]!,
      compatibilityDigest: columns.compatibilityDigest[i]!,
      exactSignatureGroupKey: columns.exactSignatureGroupKey[i]!,
      rowDigest: columns.rowDigest[i]!,
    })
  }

  return {
    blockId: columnar.blockId,
    layout: {
      ...columnar.layout,
      stateOrderDigest: columnar.layoutDescriptor.stateOrderDigest,
    },
    stateIds: [...columnar.stateIds],
    rows,
    rowCount,
  }
}

/**
 * Compute a simple digest of column cardinalities for compression-ratio estimation.
 * Lower unique-count-to-rowCount ratios indicate better columnar compression.
 */
export function estimateColumnarCompressionBenefit(
  columnar: LapicColumnarFrontierLayout
): LapicColumnarCompressionEstimate {
  const { columns, rowCount } = columnar
  if (rowCount === 0) {
    return { rowCount: 0, columnCardinalities: {}, estimatedBenefitRatio: 1.0 }
  }

  const cardinalities: Record<string, number> = {}
  for (const [key, values] of Object.entries(columns)) {
    const uniqueCount = new Set(
      (values as readonly unknown[]).map((v) =>
        typeof v === 'object' ? JSON.stringify(v) : String(v)
      )
    ).size
    cardinalities[key] = uniqueCount
  }

  const totalColumns = Object.keys(cardinalities).length
  const avgCardinality =
    Object.values(cardinalities).reduce((a, b) => a + b, 0) / totalColumns
  const estimatedBenefitRatio = avgCardinality / rowCount

  return {
    rowCount,
    columnCardinalities: cardinalities,
    estimatedBenefitRatio,
  }
}

export interface LapicColumnarCompressionEstimate {
  readonly rowCount: number
  readonly columnCardinalities: Record<string, number>
  /** Ratio < 1 means columnar will compress better than row-oriented. */
  readonly estimatedBenefitRatio: number
}
