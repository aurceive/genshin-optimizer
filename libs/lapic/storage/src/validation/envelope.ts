import {
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type { LapicChecksumMetadata, LapicStorageValidator } from '../types'
import {
  createStorageFailure,
  isLapicCompressionCodec,
  isLapicPayloadEncoding,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
  isValidDigestArray,
  validateArtifactKind,
} from './internal'

export const validateLapicStorageEnvelope: LapicStorageValidator = (
  envelope
) => {
  if (!isRecord(envelope))
    return createStorageFailure('Storage envelope must be a record.', [
      'storageEnvelope',
    ])

  const kindValidation = validateArtifactKind(envelope.artifactKind, [
    'artifactKind',
  ])
  if (!kindValidation.ok) return kindValidation

  if (!isNonEmptyString(envelope.schemaVersion))
    return createStorageFailure('Schema version must be a non-empty string.', [
      'schemaVersion',
    ])

  if (!isLapicPayloadEncoding(envelope.payloadEncoding))
    return createStorageFailure('Payload encoding must be supported.', [
      'payloadEncoding',
    ])

  if (!isNonNegativeInteger(envelope.payloadLength))
    return createStorageFailure(
      'Payload length must be a non-negative integer.',
      ['payloadLength']
    )

  if (!isNonEmptyString(envelope.contentHash))
    return createStorageFailure('Content hash must be a non-empty string.', [
      'contentHash',
    ])

  const checksumValidation = validateLapicChecksumMetadata(envelope.checksum)
  if (!checksumValidation.ok)
    return createLapicFailureResult(
      checksumValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['checksum', ...(diagnostic.path ?? [])],
      }))
    )

  if (!isLapicCompressionCodec(envelope.compressionCodec))
    return createStorageFailure('Compression codec must be supported.', [
      'compressionCodec',
    ])

  if (!isNonEmptyString(envelope.creationEngineVersion))
    return createStorageFailure(
      'Creation engine version must be a non-empty string.',
      ['creationEngineVersion']
    )

  if (!isNonEmptyString(envelope.arithmeticPolicyId))
    return createStorageFailure(
      'Arithmetic policy id must be a non-empty string.',
      ['arithmeticPolicyId']
    )

  if (
    !Array.isArray(envelope.dependencyDigestSet) ||
    !isValidDigestArray(envelope.dependencyDigestSet)
  )
    return createStorageFailure(
      'Dependency digest set must contain unique non-empty digests.',
      ['dependencyDigestSet']
    )

  return createLapicSuccessResult(envelope)
}

export function validateLapicChecksumMetadata(
  checksum: LapicChecksumMetadata
): LapicValidationResult<LapicChecksumMetadata> {
  if (!isRecord(checksum))
    return createStorageFailure('Checksum metadata must be a record.', [
      'checksum',
    ])

  if (!isNonEmptyString(checksum.algorithm))
    return createStorageFailure(
      'Checksum algorithm must be a non-empty string.',
      ['algorithm']
    )

  if (!isNonEmptyString(checksum.checksum))
    return createStorageFailure('Checksum value must be a non-empty string.', [
      'checksum',
    ])

  return createLapicSuccessResult(checksum)
}
