import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicDigest, LapicValidationResult } from '@genshin-optimizer/lapic/core'
import {
  hasUniqueValues,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from '@genshin-optimizer/lapic/core/validation'
import type {
  LapicArtifactKind,
  LapicBackendKind,
  LapicBlockLayoutDescriptor,
  LapicCompressionCodec,
  LapicCorruptionClassification,
  LapicPayloadEncoding,
} from '../types'

const lapicArtifactKinds = [
  'canonical-problem',
  'frontier-block',
  'frontier-index',
  'certificate',
  'checkpoint-manifest',
  'debug-export',
] as const satisfies readonly LapicArtifactKind[]

const lapicPayloadEncodings = [
  'json',
  'cbor',
  'msgpack',
  'raw-bytes',
] as const satisfies readonly LapicPayloadEncoding[]

const lapicCompressionCodecs = [
  'none',
  'gzip',
  'brotli',
] as const satisfies readonly LapicCompressionCodec[]

const lapicBackendKinds = [
  'indexeddb',
  'filesystem',
  'memory',
] as const satisfies readonly LapicBackendKind[]

const lapicBlockLayoutKinds = [
  'row',
  'columnar',
] as const satisfies readonly LapicBlockLayoutDescriptor['layoutKind'][]

const lapicCorruptionClassifications = [
  'missing-artifact',
  'checksum-mismatch',
  'manifest-closure-failure',
  'schema-mismatch',
] as const satisfies readonly LapicCorruptionClassification[]

export {
  hasUniqueValues,
  isBoolean,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
}

export function isValidDigestArray(values: readonly LapicDigest[]): boolean {
  return values.every(isNonEmptyString) && hasUniqueValues(values)
}

export function createStorageFailure<T>(
  message: string,
  path?: readonly string[],
  details?: Readonly<Record<string, string | number | boolean | null>>
): LapicValidationResult<T> {
  return createLapicFailureResult([
    createLapicDiagnostic('error', 'SchemaViolation', message, path, details),
  ])
}

export function validateArtifactKind(
  artifactKind: unknown,
  path: readonly string[]
): LapicValidationResult<LapicArtifactKind> {
  if (
    !isNonEmptyString(artifactKind) ||
    !lapicArtifactKinds.includes(artifactKind as LapicArtifactKind)
  )
    return createStorageFailure('Artifact kind must be supported.', path)

  return createLapicSuccessResult(artifactKind as LapicArtifactKind)
}

export function isLapicPayloadEncoding(value: unknown): value is LapicPayloadEncoding {
  return isNonEmptyString(value) && lapicPayloadEncodings.includes(value as LapicPayloadEncoding)
}

export function isLapicCompressionCodec(value: unknown): value is LapicCompressionCodec {
  return isNonEmptyString(value) && lapicCompressionCodecs.includes(value as LapicCompressionCodec)
}

export function isLapicBackendKind(value: unknown): value is LapicBackendKind {
  return isNonEmptyString(value) && lapicBackendKinds.includes(value as LapicBackendKind)
}

export function isLapicBlockLayoutKind(
  value: unknown
): value is LapicBlockLayoutDescriptor['layoutKind'] {
  return (
    isNonEmptyString(value) &&
    lapicBlockLayoutKinds.includes(value as LapicBlockLayoutDescriptor['layoutKind'])
  )
}

export function isLapicCorruptionClassification(
  value: unknown
): value is LapicCorruptionClassification {
  return (
    isNonEmptyString(value) &&
    lapicCorruptionClassifications.includes(value as LapicCorruptionClassification)
  )
}
