/**
 * Exact-decimal wire format (exact-decimal-wire-format.md)
 *
 * Binary encoding for canonical exact-decimal and exact-rational scalars.
 * Guarantees: normalization, deterministic byte layout, content-hash stability.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LapicScalarEncodingKind =
  | 'decimalCanonicalV1'
  | 'rationalCanonicalV1'
  | 'rationalVerificationV1'

export type LapicScalarFieldClassification =
  | 'canonicalDecimal'
  | 'canonicalRational'
  | 'verificationRationalOnly'
  | 'nonCanonicalTelemetry'

/** §6.1 Sign codes. */
export const SIGN_ZERO = 0x00 as const
export const SIGN_POSITIVE = 0x01 as const
export const SIGN_NEGATIVE = 0x02 as const

export type LapicSignCode =
  | typeof SIGN_ZERO
  | typeof SIGN_POSITIVE
  | typeof SIGN_NEGATIVE

/** Decoded exact-decimal value: value = sign × coefficient × 10^(-scale). */
export interface LapicExactDecimal {
  readonly sign: -1 | 0 | 1
  readonly coefficient: bigint
  readonly scale: number
}

/** Decoded exact-rational value: value = sign × numerator / denominator. */
export interface LapicExactRational {
  readonly sign: -1 | 0 | 1
  readonly numerator: bigint
  readonly denominator: bigint
}

/** Scalar envelope for wire encoding. */
export interface LapicScalarEnvelope {
  readonly scalarEncodingKind: LapicScalarEncodingKind
  readonly payloadLength: number
  readonly payloadBytes: Uint8Array
}

// ---------------------------------------------------------------------------
// ULEB128 primitives (§5)
// ---------------------------------------------------------------------------

/** Encode an unsigned integer as ULEB128 bytes. */
export function encodeULEB128(value: number): Uint8Array {
  if (value < 0) throw new Error('ULEB128 value must be non-negative')
  const bytes: number[] = []
  do {
    let byte = value & 0x7f
    value >>>= 7
    if (value !== 0) byte |= 0x80
    bytes.push(byte)
  } while (value !== 0)
  return new Uint8Array(bytes)
}

/** Decode a ULEB128 value from a buffer at the given offset. Returns [value, bytesRead]. */
export function decodeULEB128(
  buf: Uint8Array,
  offset: number
): [number, number] {
  let result = 0
  let shift = 0
  let bytesRead = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (offset + bytesRead >= buf.length)
      throw new Error('ULEB128 decode: unexpected end of buffer')
    const byte = buf[offset + bytesRead]!
    result |= (byte & 0x7f) << shift
    bytesRead++
    if ((byte & 0x80) === 0) break
    shift += 7
    if (shift > 28) throw new Error('ULEB128 decode: value too large for u32')
  }
  return [result >>> 0, bytesRead]
}

// ---------------------------------------------------------------------------
// Sign code encoding (§6.1)
// ---------------------------------------------------------------------------

export function encodeSignCode(sign: -1 | 0 | 1): LapicSignCode {
  switch (sign) {
    case 0:
      return SIGN_ZERO
    case 1:
      return SIGN_POSITIVE
    case -1:
      return SIGN_NEGATIVE
  }
}

export function decodeSignCode(code: number): -1 | 0 | 1 {
  switch (code) {
    case SIGN_ZERO:
      return 0
    case SIGN_POSITIVE:
      return 1
    case SIGN_NEGATIVE:
      return -1
    default:
      throw new Error(`Invalid sign code: 0x${code.toString(16)}`)
  }
}

// ---------------------------------------------------------------------------
// BigInt magnitude encoding (§6.2) — big-endian, no leading zeros
// ---------------------------------------------------------------------------

function bigintToMagnitudeBytes(value: bigint): Uint8Array {
  if (value === BigInt(0)) return new Uint8Array(0)
  if (value < BigInt(0)) throw new Error('Magnitude must be non-negative')
  const hex = value.toString(16)
  const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex
  const bytes = new Uint8Array(paddedHex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(paddedHex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function magnitudeBytesToBigint(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return BigInt(0)
  let result = BigInt(0)
  for (const byte of bytes) {
    result = (result << BigInt(8)) | BigInt(byte)
  }
  return result
}

// ---------------------------------------------------------------------------
// Normalization (§3.2, §3.3)
// ---------------------------------------------------------------------------

/** Normalize an exact-decimal value per §3.2. */
export function normalizeExactDecimal(d: LapicExactDecimal): LapicExactDecimal {
  if (d.coefficient === BigInt(0))
    return { sign: 0, coefficient: BigInt(0), scale: 0 }
  let coeff = d.coefficient < BigInt(0) ? -d.coefficient : d.coefficient
  const sign = d.sign === 0 ? (d.coefficient === BigInt(0) ? 0 : 1) : d.sign
  let scale = d.scale
  while (coeff > BigInt(0) && coeff % BigInt(10) === BigInt(0)) {
    coeff /= BigInt(10)
    scale--
  }
  return {
    sign: sign as -1 | 0 | 1,
    coefficient: coeff,
    scale: Math.max(0, scale),
  }
}

/** Normalize an exact-rational value per §7.1. */
export function normalizeExactRational(
  r: LapicExactRational
): LapicExactRational {
  if (r.numerator === BigInt(0))
    return { sign: 0, numerator: BigInt(0), denominator: BigInt(1) }
  const num = r.numerator < BigInt(0) ? -r.numerator : r.numerator
  const den = r.denominator < BigInt(0) ? -r.denominator : r.denominator
  const g = gcd(num, den)
  return {
    sign: r.sign,
    numerator: num / g,
    denominator: den / g,
  }
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < BigInt(0) ? -a : a
  b = b < BigInt(0) ? -b : b
  while (b > BigInt(0)) {
    const temp = b
    b = a % b
    a = temp
  }
  return a
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateExactDecimal(d: LapicExactDecimal): string | null {
  if (d.coefficient === BigInt(0)) {
    if (d.sign !== 0) return 'Zero coefficient must have sign 0'
    if (d.scale !== 0) return 'Zero coefficient must have scale 0'
    return null
  }
  if (d.sign === 0) return 'Non-zero coefficient must not have sign 0'
  if (d.coefficient < BigInt(0)) return 'Coefficient must be non-negative'
  if (d.scale < 0) return 'Scale must be non-negative'
  if (d.coefficient % BigInt(10) === BigInt(0))
    return 'Coefficient must not be divisible by 10'
  return null
}

export function validateExactRational(r: LapicExactRational): string | null {
  if (r.denominator <= BigInt(0)) return 'Denominator must be positive'
  if (r.numerator === BigInt(0)) {
    if (r.sign !== 0) return 'Zero numerator must have sign 0'
    if (r.denominator !== BigInt(1))
      return 'Zero numerator must have denominator 1'
    return null
  }
  if (r.sign === 0) return 'Non-zero numerator must not have sign 0'
  if (r.numerator < BigInt(0)) return 'Numerator must be non-negative'
  if (gcd(r.numerator, r.denominator) !== BigInt(1))
    return 'Numerator and denominator must be coprime'
  return null
}

// ---------------------------------------------------------------------------
// decimalCanonicalV1 encode/decode (§6)
// ---------------------------------------------------------------------------

export function encodeDecimalCanonicalV1(d: LapicExactDecimal): Uint8Array {
  const error = validateExactDecimal(d)
  if (error) throw new Error(`Invalid exact-decimal for encoding: ${error}`)

  const signByte = encodeSignCode(d.sign)
  const scaleBytes = encodeULEB128(d.scale)
  const magnitudeBytes = bigintToMagnitudeBytes(d.coefficient)
  const magnitudeLenBytes = encodeULEB128(magnitudeBytes.length)

  const result = new Uint8Array(
    1 + scaleBytes.length + magnitudeLenBytes.length + magnitudeBytes.length
  )
  let offset = 0
  result[offset++] = signByte
  result.set(scaleBytes, offset)
  offset += scaleBytes.length
  result.set(magnitudeLenBytes, offset)
  offset += magnitudeLenBytes.length
  result.set(magnitudeBytes, offset)

  return result
}

export function decodeDecimalCanonicalV1(buf: Uint8Array): LapicExactDecimal {
  let offset = 0

  if (offset >= buf.length) throw new Error('Unexpected end of buffer at sign')
  const sign = decodeSignCode(buf[offset++]!)

  const [scale, scaleLen] = decodeULEB128(buf, offset)
  offset += scaleLen

  const [magLen, magLenBytes] = decodeULEB128(buf, offset)
  offset += magLenBytes

  if (offset + magLen > buf.length)
    throw new Error('Unexpected end of buffer at coefficient')
  const magnitude = buf.slice(offset, offset + magLen)
  const coefficient = magnitudeBytesToBigint(magnitude)

  const result: LapicExactDecimal = { sign, coefficient, scale }
  const error = validateExactDecimal(result)
  if (error) throw new Error(`Decoded invalid exact-decimal: ${error}`)

  return result
}

// ---------------------------------------------------------------------------
// rationalCanonicalV1 encode/decode (§7)
// ---------------------------------------------------------------------------

export function encodeRationalCanonicalV1(r: LapicExactRational): Uint8Array {
  const error = validateExactRational(r)
  if (error) throw new Error(`Invalid exact-rational for encoding: ${error}`)

  const signByte = encodeSignCode(r.sign)
  const numMag = bigintToMagnitudeBytes(r.numerator)
  const numLenBytes = encodeULEB128(numMag.length)
  const denMag = bigintToMagnitudeBytes(r.denominator)
  const denLenBytes = encodeULEB128(denMag.length)

  const result = new Uint8Array(
    1 + numLenBytes.length + numMag.length + denLenBytes.length + denMag.length
  )
  let offset = 0
  result[offset++] = signByte
  result.set(numLenBytes, offset)
  offset += numLenBytes.length
  result.set(numMag, offset)
  offset += numMag.length
  result.set(denLenBytes, offset)
  offset += denLenBytes.length
  result.set(denMag, offset)

  return result
}

export function decodeRationalCanonicalV1(buf: Uint8Array): LapicExactRational {
  let offset = 0

  if (offset >= buf.length) throw new Error('Unexpected end of buffer at sign')
  const sign = decodeSignCode(buf[offset++]!)

  const [numLen, numLenBytes] = decodeULEB128(buf, offset)
  offset += numLenBytes
  if (offset + numLen > buf.length)
    throw new Error('Unexpected end of buffer at numerator')
  const numerator = magnitudeBytesToBigint(buf.slice(offset, offset + numLen))
  offset += numLen

  const [denLen, denLenBytes] = decodeULEB128(buf, offset)
  offset += denLenBytes
  if (offset + denLen > buf.length)
    throw new Error('Unexpected end of buffer at denominator')
  const denominator = magnitudeBytesToBigint(buf.slice(offset, offset + denLen))

  const result: LapicExactRational = { sign, numerator, denominator }
  const error = validateExactRational(result)
  if (error) throw new Error(`Decoded invalid exact-rational: ${error}`)

  return result
}

// ---------------------------------------------------------------------------
// Scalar envelope helpers (§9)
// ---------------------------------------------------------------------------

export function createScalarEnvelope(
  kind: LapicScalarEncodingKind,
  payloadBytes: Uint8Array
): LapicScalarEnvelope {
  return {
    scalarEncodingKind: kind,
    payloadLength: payloadBytes.length,
    payloadBytes: new Uint8Array(payloadBytes),
  }
}

/** Encode an exact-decimal into a scalar envelope. */
export function encodeDecimalEnvelope(
  d: LapicExactDecimal
): LapicScalarEnvelope {
  return createScalarEnvelope('decimalCanonicalV1', encodeDecimalCanonicalV1(d))
}

/** Encode an exact-rational into a scalar envelope. */
export function encodeRationalEnvelope(
  r: LapicExactRational
): LapicScalarEnvelope {
  return createScalarEnvelope(
    'rationalCanonicalV1',
    encodeRationalCanonicalV1(r)
  )
}
