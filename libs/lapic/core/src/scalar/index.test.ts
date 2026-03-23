import {
  SIGN_NEGATIVE,
  SIGN_POSITIVE,
  SIGN_ZERO,
  type LapicExactDecimal,
  type LapicExactRational,
  decodeDecimalCanonicalV1,
  decodeRationalCanonicalV1,
  decodeSignCode,
  decodeULEB128,
  encodeDecimalCanonicalV1,
  encodeDecimalEnvelope,
  encodeRationalCanonicalV1,
  encodeRationalEnvelope,
  encodeSignCode,
  encodeULEB128,
  normalizeExactDecimal,
  normalizeExactRational,
  validateExactDecimal,
  validateExactRational,
} from './index'

// ---------------------------------------------------------------------------
// ULEB128 (§5)
// ---------------------------------------------------------------------------

describe('ULEB128', () => {
  describe('encodeULEB128', () => {
    it('encodes 0', () => {
      expect(encodeULEB128(0)).toEqual(new Uint8Array([0x00]))
    })

    it('encodes values below 128 in one byte', () => {
      expect(encodeULEB128(1)).toEqual(new Uint8Array([0x01]))
      expect(encodeULEB128(127)).toEqual(new Uint8Array([0x7f]))
    })

    it('encodes 128 in two bytes', () => {
      expect(encodeULEB128(128)).toEqual(new Uint8Array([0x80, 0x01]))
    })

    it('encodes 300 correctly', () => {
      // 300 = 0b100101100 → lower 7: 0101100 (0x2C | 0x80), upper: 10 (0x02)
      expect(encodeULEB128(300)).toEqual(new Uint8Array([0xac, 0x02]))
    })

    it('encodes 16383 (max two-byte ULEB128)', () => {
      // 16383 = 0x3FFF → 0xFF 0x7F
      expect(encodeULEB128(16383)).toEqual(new Uint8Array([0xff, 0x7f]))
    })

    it('encodes 16384 (three bytes)', () => {
      expect(encodeULEB128(16384)).toEqual(new Uint8Array([0x80, 0x80, 0x01]))
    })

    it('throws on negative values', () => {
      expect(() => encodeULEB128(-1)).toThrow('non-negative')
    })
  })

  describe('decodeULEB128', () => {
    it('round-trips small values', () => {
      for (const v of [0, 1, 42, 127]) {
        const buf = encodeULEB128(v)
        expect(decodeULEB128(buf, 0)).toEqual([v, buf.length])
      }
    })

    it('round-trips multi-byte values', () => {
      for (const v of [128, 255, 300, 16383, 16384, 100000, 2097151]) {
        const buf = encodeULEB128(v)
        expect(decodeULEB128(buf, 0)).toEqual([v, buf.length])
      }
    })

    it('decodes at a nonzero offset', () => {
      const buf = new Uint8Array([0xff, ...encodeULEB128(42)])
      expect(decodeULEB128(buf, 1)).toEqual([42, 1])
    })

    it('throws on unexpected end of buffer', () => {
      // A byte with continuation bit set, but no next byte
      expect(() => decodeULEB128(new Uint8Array([0x80]), 0)).toThrow(
        'unexpected end of buffer'
      )
    })

    it('throws on values too large for u32', () => {
      // 5 continuation bytes + 1 final → shift would exceed 28
      const buf = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x01])
      expect(() => decodeULEB128(buf, 0)).toThrow('too large')
    })
  })
})

// ---------------------------------------------------------------------------
// Sign code (§6.1)
// ---------------------------------------------------------------------------

describe('sign codes', () => {
  it('encodes and decodes all sign values', () => {
    expect(encodeSignCode(0)).toBe(SIGN_ZERO)
    expect(encodeSignCode(1)).toBe(SIGN_POSITIVE)
    expect(encodeSignCode(-1)).toBe(SIGN_NEGATIVE)

    expect(decodeSignCode(SIGN_ZERO)).toBe(0)
    expect(decodeSignCode(SIGN_POSITIVE)).toBe(1)
    expect(decodeSignCode(SIGN_NEGATIVE)).toBe(-1)
  })

  it('throws on invalid sign code', () => {
    expect(() => decodeSignCode(0x03)).toThrow('Invalid sign code')
    expect(() => decodeSignCode(0xff)).toThrow('Invalid sign code')
  })
})

// ---------------------------------------------------------------------------
// Exact-decimal normalization and validation (§3.2)
// ---------------------------------------------------------------------------

describe('normalizeExactDecimal', () => {
  it('normalizes zero', () => {
    const result = normalizeExactDecimal({
      sign: 1,
      coefficient: BigInt(0),
      scale: 5,
    })
    expect(result).toEqual({ sign: 0, coefficient: BigInt(0), scale: 0 })
  })

  it('strips trailing zeros from coefficient', () => {
    // 12300 × 10^(-5) → 123 × 10^(-3) (stripped 2 trailing zeros, scale decreases by 2)
    const result = normalizeExactDecimal({
      sign: 1,
      coefficient: BigInt(12300),
      scale: 5,
    })
    expect(result.coefficient).toBe(BigInt(123))
    expect(result.scale).toBe(3)
    expect(result.sign).toBe(1)
  })

  it('does not strip non-trailing zeros', () => {
    const result = normalizeExactDecimal({
      sign: -1,
      coefficient: BigInt(101),
      scale: 2,
    })
    expect(result.coefficient).toBe(BigInt(101))
    expect(result.scale).toBe(2)
  })

  it('clamps scale to 0 when all zeros are stripped', () => {
    // 1000 × 10^(-2) → 1 × 10^(1) → clamped to scale 0
    const result = normalizeExactDecimal({
      sign: 1,
      coefficient: BigInt(1000),
      scale: 2,
    })
    expect(result.coefficient).toBe(BigInt(1))
    expect(result.scale).toBe(0)
  })
})

describe('validateExactDecimal', () => {
  it('accepts valid normalized decimals', () => {
    expect(
      validateExactDecimal({ sign: 0, coefficient: BigInt(0), scale: 0 })
    ).toBeNull()
    expect(
      validateExactDecimal({ sign: 1, coefficient: BigInt(123), scale: 2 })
    ).toBeNull()
    expect(
      validateExactDecimal({ sign: -1, coefficient: BigInt(7), scale: 0 })
    ).toBeNull()
  })

  it('rejects zero coefficient with non-zero sign', () => {
    expect(
      validateExactDecimal({ sign: 1, coefficient: BigInt(0), scale: 0 })
    ).toContain('sign 0')
  })

  it('rejects zero coefficient with non-zero scale', () => {
    expect(
      validateExactDecimal({ sign: 0, coefficient: BigInt(0), scale: 3 })
    ).toContain('scale 0')
  })

  it('rejects non-zero coefficient with sign 0', () => {
    expect(
      validateExactDecimal({ sign: 0, coefficient: BigInt(5), scale: 0 })
    ).toContain('sign 0')
  })

  it('rejects negative coefficient', () => {
    expect(
      validateExactDecimal({ sign: 1, coefficient: BigInt(-5), scale: 0 })
    ).toContain('non-negative')
  })

  it('rejects negative scale', () => {
    expect(
      validateExactDecimal({ sign: 1, coefficient: BigInt(5), scale: -1 })
    ).toContain('non-negative')
  })

  it('rejects coefficient divisible by 10', () => {
    expect(
      validateExactDecimal({ sign: 1, coefficient: BigInt(120), scale: 2 })
    ).toContain('divisible by 10')
  })
})

// ---------------------------------------------------------------------------
// Exact-rational normalization and validation (§7.1)
// ---------------------------------------------------------------------------

describe('normalizeExactRational', () => {
  it('normalizes zero', () => {
    const result = normalizeExactRational({
      sign: 1,
      numerator: BigInt(0),
      denominator: BigInt(7),
    })
    expect(result).toEqual({
      sign: 0,
      numerator: BigInt(0),
      denominator: BigInt(1),
    })
  })

  it('reduces by GCD', () => {
    const result = normalizeExactRational({
      sign: 1,
      numerator: BigInt(6),
      denominator: BigInt(4),
    })
    expect(result.numerator).toBe(BigInt(3))
    expect(result.denominator).toBe(BigInt(2))
  })

  it('normalizes negative numerator', () => {
    const result = normalizeExactRational({
      sign: -1,
      numerator: BigInt(-12),
      denominator: BigInt(8),
    })
    expect(result.numerator).toBe(BigInt(3))
    expect(result.denominator).toBe(BigInt(2))
    expect(result.sign).toBe(-1)
  })

  it('already-reduced fraction is unchanged', () => {
    const result = normalizeExactRational({
      sign: 1,
      numerator: BigInt(7),
      denominator: BigInt(3),
    })
    expect(result.numerator).toBe(BigInt(7))
    expect(result.denominator).toBe(BigInt(3))
  })
})

describe('validateExactRational', () => {
  it('accepts valid normalized rationals', () => {
    expect(
      validateExactRational({
        sign: 0,
        numerator: BigInt(0),
        denominator: BigInt(1),
      })
    ).toBeNull()
    expect(
      validateExactRational({
        sign: 1,
        numerator: BigInt(3),
        denominator: BigInt(7),
      })
    ).toBeNull()
    expect(
      validateExactRational({
        sign: -1,
        numerator: BigInt(1),
        denominator: BigInt(2),
      })
    ).toBeNull()
  })

  it('rejects non-positive denominator', () => {
    expect(
      validateExactRational({
        sign: 1,
        numerator: BigInt(1),
        denominator: BigInt(0),
      })
    ).toContain('positive')
    expect(
      validateExactRational({
        sign: 1,
        numerator: BigInt(1),
        denominator: BigInt(-1),
      })
    ).toContain('positive')
  })

  it('rejects zero numerator with non-zero sign', () => {
    expect(
      validateExactRational({
        sign: 1,
        numerator: BigInt(0),
        denominator: BigInt(1),
      })
    ).toContain('sign 0')
  })

  it('rejects zero numerator with non-unit denominator', () => {
    expect(
      validateExactRational({
        sign: 0,
        numerator: BigInt(0),
        denominator: BigInt(3),
      })
    ).toContain('denominator 1')
  })

  it('rejects non-zero numerator with sign 0', () => {
    expect(
      validateExactRational({
        sign: 0,
        numerator: BigInt(5),
        denominator: BigInt(3),
      })
    ).toContain('sign 0')
  })

  it('rejects negative numerator', () => {
    expect(
      validateExactRational({
        sign: 1,
        numerator: BigInt(-5),
        denominator: BigInt(3),
      })
    ).toContain('non-negative')
  })

  it('rejects non-coprime numerator/denominator', () => {
    expect(
      validateExactRational({
        sign: 1,
        numerator: BigInt(4),
        denominator: BigInt(6),
      })
    ).toContain('coprime')
  })
})

// ---------------------------------------------------------------------------
// decimalCanonicalV1 encode/decode round-trip (§6)
// ---------------------------------------------------------------------------

describe('decimalCanonicalV1 encode/decode', () => {
  function roundTrip(d: LapicExactDecimal): LapicExactDecimal {
    return decodeDecimalCanonicalV1(encodeDecimalCanonicalV1(d))
  }

  it('round-trips zero', () => {
    const zero: LapicExactDecimal = {
      sign: 0,
      coefficient: BigInt(0),
      scale: 0,
    }
    expect(roundTrip(zero)).toEqual(zero)
  })

  it('round-trips positive integer', () => {
    const val: LapicExactDecimal = {
      sign: 1,
      coefficient: BigInt(42),
      scale: 0,
    }
    expect(roundTrip(val)).toEqual(val)
  })

  it('round-trips negative fractional', () => {
    // -1.23 = sign:-1, coefficient:123, scale:2
    const val: LapicExactDecimal = {
      sign: -1,
      coefficient: BigInt(123),
      scale: 2,
    }
    expect(roundTrip(val)).toEqual(val)
  })

  it('round-trips large coefficient', () => {
    const val: LapicExactDecimal = {
      sign: 1,
      coefficient: BigInt('123456789012345678901'),
      scale: 10,
    }
    expect(roundTrip(val)).toEqual(val)
  })

  it('round-trips single-digit coefficient', () => {
    const val: LapicExactDecimal = {
      sign: -1,
      coefficient: BigInt(1),
      scale: 0,
    }
    expect(roundTrip(val)).toEqual(val)
  })

  it('produces deterministic bytes', () => {
    const val: LapicExactDecimal = {
      sign: 1,
      coefficient: BigInt(999),
      scale: 3,
    }
    const bytes1 = encodeDecimalCanonicalV1(val)
    const bytes2 = encodeDecimalCanonicalV1(val)
    expect(bytes1).toEqual(bytes2)
  })

  it('throws on un-normalized input', () => {
    expect(() =>
      encodeDecimalCanonicalV1({ sign: 1, coefficient: BigInt(120), scale: 1 })
    ).toThrow('divisible by 10')
  })

  it('throws on truncated buffer', () => {
    const full = encodeDecimalCanonicalV1({
      sign: 1,
      coefficient: BigInt(42),
      scale: 0,
    })
    expect(() => decodeDecimalCanonicalV1(full.slice(0, 1))).toThrow()
  })

  it('throws on empty buffer', () => {
    expect(() => decodeDecimalCanonicalV1(new Uint8Array(0))).toThrow()
  })
})

// ---------------------------------------------------------------------------
// rationalCanonicalV1 encode/decode round-trip (§7)
// ---------------------------------------------------------------------------

describe('rationalCanonicalV1 encode/decode', () => {
  function roundTrip(r: LapicExactRational): LapicExactRational {
    return decodeRationalCanonicalV1(encodeRationalCanonicalV1(r))
  }

  it('round-trips zero', () => {
    const zero: LapicExactRational = {
      sign: 0,
      numerator: BigInt(0),
      denominator: BigInt(1),
    }
    expect(roundTrip(zero)).toEqual(zero)
  })

  it('round-trips positive integer-like rational', () => {
    const val: LapicExactRational = {
      sign: 1,
      numerator: BigInt(7),
      denominator: BigInt(1),
    }
    expect(roundTrip(val)).toEqual(val)
  })

  it('round-trips negative fraction', () => {
    const val: LapicExactRational = {
      sign: -1,
      numerator: BigInt(3),
      denominator: BigInt(7),
    }
    expect(roundTrip(val)).toEqual(val)
  })

  it('round-trips large numerator and denominator', () => {
    const val: LapicExactRational = {
      sign: 1,
      numerator: BigInt('999999999999999999937'),
      denominator: BigInt('1000000000000000000003'),
    }
    expect(roundTrip(val)).toEqual(val)
  })

  it('produces deterministic bytes', () => {
    const val: LapicExactRational = {
      sign: -1,
      numerator: BigInt(22),
      denominator: BigInt(7),
    }
    const bytes1 = encodeRationalCanonicalV1(val)
    const bytes2 = encodeRationalCanonicalV1(val)
    expect(bytes1).toEqual(bytes2)
  })

  it('throws on non-coprime input', () => {
    expect(() =>
      encodeRationalCanonicalV1({
        sign: 1,
        numerator: BigInt(4),
        denominator: BigInt(6),
      })
    ).toThrow('coprime')
  })

  it('throws on truncated buffer', () => {
    const full = encodeRationalCanonicalV1({
      sign: 1,
      numerator: BigInt(3),
      denominator: BigInt(7),
    })
    expect(() => decodeRationalCanonicalV1(full.slice(0, 2))).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Scalar envelopes (§9)
// ---------------------------------------------------------------------------

describe('scalar envelopes', () => {
  it('creates a decimal envelope', () => {
    const d: LapicExactDecimal = { sign: 1, coefficient: BigInt(42), scale: 0 }
    const env = encodeDecimalEnvelope(d)
    expect(env.scalarEncodingKind).toBe('decimalCanonicalV1')
    expect(env.payloadLength).toBe(env.payloadBytes.length)
    // Decode from envelope payload
    const decoded = decodeDecimalCanonicalV1(env.payloadBytes)
    expect(decoded).toEqual(d)
  })

  it('creates a rational envelope', () => {
    const r: LapicExactRational = {
      sign: -1,
      numerator: BigInt(3),
      denominator: BigInt(7),
    }
    const env = encodeRationalEnvelope(r)
    expect(env.scalarEncodingKind).toBe('rationalCanonicalV1')
    expect(env.payloadLength).toBe(env.payloadBytes.length)
    const decoded = decodeRationalCanonicalV1(env.payloadBytes)
    expect(decoded).toEqual(r)
  })

  it('envelope payload is a copy', () => {
    const d: LapicExactDecimal = { sign: 1, coefficient: BigInt(99), scale: 1 }
    const env = encodeDecimalEnvelope(d)
    // Mutating payloadBytes should not affect the source
    env.payloadBytes[0] = 0xff
    const decoded = decodeDecimalCanonicalV1(encodeDecimalCanonicalV1(d))
    expect(decoded).toEqual(d)
  })
})

// ---------------------------------------------------------------------------
// Content-hash stability (§10)
// ---------------------------------------------------------------------------

describe('content-hash stability', () => {
  it('identical decimals produce identical bytes', () => {
    const a: LapicExactDecimal = {
      sign: 1,
      coefficient: BigInt(314159),
      scale: 5,
    }
    const b: LapicExactDecimal = {
      sign: 1,
      coefficient: BigInt(314159),
      scale: 5,
    }
    const bytesA = encodeDecimalCanonicalV1(a)
    const bytesB = encodeDecimalCanonicalV1(b)
    expect(bytesA).toEqual(bytesB)
  })

  it('different decimals produce different bytes', () => {
    const a: LapicExactDecimal = {
      sign: 1,
      coefficient: BigInt(314159),
      scale: 5,
    }
    const b: LapicExactDecimal = {
      sign: 1,
      coefficient: BigInt(314159),
      scale: 4,
    }
    const bytesA = encodeDecimalCanonicalV1(a)
    const bytesB = encodeDecimalCanonicalV1(b)
    // At least one byte must differ
    expect(
      bytesA.length === bytesB.length && bytesA.every((v, i) => v === bytesB[i])
    ).toBe(false)
  })

  it('identical rationals produce identical bytes', () => {
    const a: LapicExactRational = {
      sign: -1,
      numerator: BigInt(22),
      denominator: BigInt(7),
    }
    const b: LapicExactRational = {
      sign: -1,
      numerator: BigInt(22),
      denominator: BigInt(7),
    }
    expect(encodeRationalCanonicalV1(a)).toEqual(encodeRationalCanonicalV1(b))
  })
})
