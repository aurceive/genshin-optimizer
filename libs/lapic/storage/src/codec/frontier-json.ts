import type { LapicFrontierBlock, LapicFrontierIndex } from '../types'
import type {
  LapicCodec,
  LapicCodecEncodeResult,
  LapicDeterministicJsonOptions,
} from './types'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * Recursively serialize a value to JSON with sorted keys for canonical output.
 * This ensures content-hash stability across serialization invocations.
 */
export function deterministicJsonStringify(
  value: unknown,
  options: LapicDeterministicJsonOptions = {}
): string {
  const { sortKeys = true, indent } = options

  if (!sortKeys) {
    return indent !== undefined
      ? JSON.stringify(value, null, indent)
      : JSON.stringify(value)
  }

  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(val).sort()) {
        sorted[k] = val[k]
      }
      return sorted
    }
    return val
  }, indent)
}

function encodeDeterministicJson<T>(value: T, options?: LapicDeterministicJsonOptions): Uint8Array {
  const json = deterministicJsonStringify(value, options)
  return textEncoder.encode(json)
}

function decodeDeterministicJson<T>(bytes: Uint8Array): T {
  const json = textDecoder.decode(bytes)
  return JSON.parse(json) as T
}

/**
 * Create a deterministic JSON codec for LapicFrontierBlock.
 * Sorted keys ensure content-hash stability.
 */
export function createFrontierBlockJsonCodec(
  options?: LapicDeterministicJsonOptions
): LapicCodec<LapicFrontierBlock> {
  return {
    encoding: 'json',
    compressionCodec: 'none',
    encode(value: LapicFrontierBlock): Uint8Array {
      return encodeDeterministicJson(value, options)
    },
    decode(bytes: Uint8Array): LapicFrontierBlock {
      return decodeDeterministicJson<LapicFrontierBlock>(bytes)
    },
  }
}

/**
 * Create a deterministic JSON codec for LapicFrontierIndex.
 */
export function createFrontierIndexJsonCodec(
  options?: LapicDeterministicJsonOptions
): LapicCodec<LapicFrontierIndex> {
  return {
    encoding: 'json',
    compressionCodec: 'none',
    encode(value: LapicFrontierIndex): Uint8Array {
      return encodeDeterministicJson(value, options)
    },
    decode(bytes: Uint8Array): LapicFrontierIndex {
      return decodeDeterministicJson<LapicFrontierIndex>(bytes)
    },
  }
}

/**
 * Encode a frontier block and return both payload and metadata for envelope construction.
 */
export function encodeFrontierBlockWithMetadata(
  block: LapicFrontierBlock,
  codec: LapicCodec<LapicFrontierBlock>
): LapicCodecEncodeResult {
  const payload = codec.encode(block)
  return {
    payload,
    metadata: {
      encoding: codec.encoding,
      compressionCodec: codec.compressionCodec,
      payloadLength: payload.byteLength,
    },
  }
}

/**
 * Encode a frontier index and return both payload and metadata for envelope construction.
 */
export function encodeFrontierIndexWithMetadata(
  index: LapicFrontierIndex,
  codec: LapicCodec<LapicFrontierIndex>
): LapicCodecEncodeResult {
  const payload = codec.encode(index)
  return {
    payload,
    metadata: {
      encoding: codec.encoding,
      compressionCodec: codec.compressionCodec,
      payloadLength: payload.byteLength,
    },
  }
}
