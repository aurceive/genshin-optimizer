import type {
  LapicFrontierBlock,
  LapicFrontierIndex,
  LapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import {
  columnarToFrontierBlock,
  createFrontierBlockJsonCodec,
  createFrontierIndexJsonCodec,
  createLapicFrontierBlock,
  createLapicFrontierIndex,
  createLapicStorageEnvelope,
  deterministicJsonStringify,
  frontierBlockToColumnar,
} from '@genshin-optimizer/lapic/storage'
import fc from 'fast-check'

// ---------------------------------------------------------------------------
// Property: Deterministic JSON serialization
// ---------------------------------------------------------------------------

/**
 * Property: deterministicJsonStringify is idempotent.
 * serialize(parse(serialize(x))) === serialize(x)
 */
export function propDeterministicJsonIdempotent(value: unknown): boolean {
  const serialized = deterministicJsonStringify(value)
  const parsed = JSON.parse(serialized) as unknown
  const reSerialized = deterministicJsonStringify(parsed)
  return serialized === reSerialized
}

/**
 * Property: two structurally equal objects produce the same deterministic JSON.
 * Verifies key-sort stability.
 */
export function propDeterministicJsonStability(
  a: unknown,
  b: unknown
): boolean {
  return deterministicJsonStringify(a) === deterministicJsonStringify(b)
}

// ---------------------------------------------------------------------------
// Property: Frontier Block JSON codec round-trip
// ---------------------------------------------------------------------------

/**
 * Property: encode(decode(encode(block))) === encode(block)
 * Stronger than simple round-trip — validates canonical form.
 */
export function propFrontierBlockCodecRoundTrip(
  block: LapicFrontierBlock
): boolean {
  const codec = createFrontierBlockJsonCodec()
  const encoded = codec.encode(block)
  const decoded = codec.decode(encoded)
  const reEncoded = codec.encode(decoded)

  if (encoded.length !== reEncoded.length) return false
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] !== reEncoded[i]) return false
  }
  return true
}

/**
 * Property: decoded block has same rowCount as original.
 */
export function propFrontierBlockRowCountPreserved(
  block: LapicFrontierBlock
): boolean {
  const codec = createFrontierBlockJsonCodec()
  const decoded = codec.decode(codec.encode(block))
  return (
    decoded.rowCount === block.rowCount &&
    decoded.rows.length === block.rows.length &&
    decoded.stateIds.length === block.stateIds.length
  )
}

// ---------------------------------------------------------------------------
// Property: Frontier Index JSON codec round-trip
// ---------------------------------------------------------------------------

export function propFrontierIndexCodecRoundTrip(
  index: LapicFrontierIndex
): boolean {
  const codec = createFrontierIndexJsonCodec()
  const encoded = codec.encode(index)
  const decoded = codec.decode(encoded)
  const reEncoded = codec.encode(decoded)

  if (encoded.length !== reEncoded.length) return false
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] !== reEncoded[i]) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Property: Columnar layout round-trip
// ---------------------------------------------------------------------------

/**
 * Property: row → columnar → row is lossless.
 */
export function propColumnarRoundTrip(block: LapicFrontierBlock): boolean {
  const columnar = frontierBlockToColumnar(block)
  const reconstructed = columnarToFrontierBlock(columnar)

  if (reconstructed.blockId !== block.blockId) return false
  if (reconstructed.rowCount !== block.rowCount) return false
  if (reconstructed.rows.length !== block.rows.length) return false

  for (let i = 0; i < block.rows.length; i++) {
    const orig = block.rows[i]!
    const rt = reconstructed.rows[i]!
    if (rt.stateId !== orig.stateId) return false
    if (rt.slotId !== orig.slotId) return false
    if (rt.candidateId !== orig.candidateId) return false
    if (rt.candidateDigest !== orig.candidateDigest) return false
    if (rt.compatibilityDigest !== orig.compatibilityDigest) return false
    if (rt.rowDigest !== orig.rowDigest) return false
  }
  return true
}

/**
 * Property: columnar layout marks layoutKind as 'columnar'.
 */
export function propColumnarLayoutKind(block: LapicFrontierBlock): boolean {
  const columnar = frontierBlockToColumnar(block)
  return columnar.layoutDescriptor.layoutKind === 'columnar'
}

/**
 * Property: columnar column lengths all equal rowCount.
 */
export function propColumnarColumnLengths(block: LapicFrontierBlock): boolean {
  const columnar = frontierBlockToColumnar(block)
  const { columns, rowCount } = columnar
  return (
    columns.stateId.length === rowCount &&
    columns.slotId.length === rowCount &&
    columns.candidateId.length === rowCount &&
    columns.candidateDigest.length === rowCount &&
    columns.compatibilityDigest.length === rowCount &&
    columns.exactSignatureGroupKey.length === rowCount &&
    columns.rowDigest.length === rowCount
  )
}

// ---------------------------------------------------------------------------
// Property: Builder clone determinism
// ---------------------------------------------------------------------------

/**
 * Property: createLapicFrontierBlock clone produces structurally equal output.
 */
export function propFrontierBlockCloneDeterminism(
  block: LapicFrontierBlock
): boolean {
  const cloned = createLapicFrontierBlock(block)
  return (
    deterministicJsonStringify(cloned) === deterministicJsonStringify(block)
  )
}

/**
 * Property: createLapicFrontierIndex clone produces structurally equal output.
 */
export function propFrontierIndexCloneDeterminism(
  index: LapicFrontierIndex
): boolean {
  const cloned = createLapicFrontierIndex(index)
  return (
    deterministicJsonStringify(cloned) === deterministicJsonStringify(index)
  )
}

// ---------------------------------------------------------------------------
// Property: Storage envelope clone determinism
// ---------------------------------------------------------------------------

/**
 * Property: createLapicStorageEnvelope clone preserves all fields.
 */
export function propEnvelopeCloneDeterminism(
  envelope: LapicStorageEnvelope
): boolean {
  const cloned = createLapicStorageEnvelope(envelope)
  return (
    deterministicJsonStringify(cloned) === deterministicJsonStringify(envelope)
  )
}

// ---------------------------------------------------------------------------
// Composite property runner helpers
// ---------------------------------------------------------------------------

export interface LapicPropertyResult {
  readonly propertyName: string
  readonly passed: boolean
  readonly numRuns: number
  readonly seed?: number
  readonly counterexample?: string
}

/**
 * Run a fast-check property and capture the result as a structured report.
 */
export function runLapicProperty<T>(
  propertyName: string,
  arb: fc.Arbitrary<T>,
  predicate: (value: T) => boolean,
  options?: { numRuns?: number; seed?: number }
): LapicPropertyResult {
  const numRuns = options?.numRuns ?? 100
  const seed = options?.seed

  try {
    fc.assert(
      fc.property(arb, (v) => predicate(v)),
      {
        numRuns,
        ...(seed !== undefined ? { seed } : {}),
        verbose: false,
      }
    )
    return {
      propertyName,
      passed: true,
      numRuns,
      ...(seed !== undefined ? { seed } : {}),
    }
  } catch (e) {
    return {
      propertyName,
      passed: false,
      numRuns,
      ...(seed !== undefined ? { seed } : {}),
      counterexample: String(e),
    }
  }
}
