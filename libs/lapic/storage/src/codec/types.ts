import type {
  LapicCompressionCodec,
  LapicPayloadEncoding,
} from '../types'

/**
 * Generic codec that encodes a domain object to bytes and decodes bytes
 * back to the domain object. Round-trip must be lossless.
 */
export interface LapicCodec<T> {
  readonly encoding: LapicPayloadEncoding
  readonly compressionCodec: LapicCompressionCodec
  encode(value: T): Uint8Array
  decode(bytes: Uint8Array): T
}

/** Metadata emitted alongside encoded payload for envelope construction. */
export interface LapicCodecPayloadMetadata {
  readonly encoding: LapicPayloadEncoding
  readonly compressionCodec: LapicCompressionCodec
  readonly payloadLength: number
}

/** Result of encoding a domain object through a codec. */
export interface LapicCodecEncodeResult {
  readonly payload: Uint8Array
  readonly metadata: LapicCodecPayloadMetadata
}

/** Deterministic JSON serialization options. */
export interface LapicDeterministicJsonOptions {
  /** Whether to sort object keys for canonical output. Default: true. */
  readonly sortKeys?: boolean
  /** Indentation for readability. Default: none (compact). */
  readonly indent?: number
}
