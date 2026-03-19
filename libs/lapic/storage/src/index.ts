import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
  validateLapicStateLayoutDescriptor,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicArithmeticPolicyId,
  LapicContentHash,
  LapicDigest,
  LapicDiagnostic,
  LapicSchemaVersion,
  LapicStateLayoutDescriptor,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'

export const lapicStoragePackageName = 'lapic-storage'
export const lapicStorageSchemaVersion = '0.1.0-draft'

export type LapicStorageSchemaVersion = typeof lapicStorageSchemaVersion
export type LapicArtifactKind =
  | 'canonical-problem'
  | 'frontier-block'
  | 'frontier-index'
  | 'certificate'
  | 'checkpoint-manifest'
  | 'debug-export'
export type LapicPayloadEncoding = 'json' | 'cbor' | 'msgpack' | 'raw-bytes'
export type LapicCompressionCodec = 'none' | 'gzip' | 'brotli'
export type LapicBackendKind = 'indexeddb' | 'filesystem' | 'memory'

export interface LapicChecksumMetadata {
  readonly algorithm: string
  readonly checksum: string
}

export interface LapicStorageEnvelope {
  readonly artifactKind: LapicArtifactKind
  readonly schemaVersion: LapicSchemaVersion | LapicStorageSchemaVersion
  readonly payloadEncoding: LapicPayloadEncoding
  readonly payloadLength: number
  readonly contentHash: LapicContentHash
  readonly checksum: LapicChecksumMetadata
  readonly compressionCodec: LapicCompressionCodec
  readonly creationEngineVersion: string
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
  readonly dependencyDigestSet: readonly LapicDigest[]
}

export interface LapicArtifactRef {
  readonly artifactId: string
  readonly artifactKind: LapicArtifactKind
  readonly contentHash: LapicContentHash
}

export interface LapicFrontierBlock {
  readonly blockId: string
  readonly layout: LapicStateLayoutDescriptor
  readonly stateIds: readonly string[]
  readonly rowCount: number
}

export interface LapicFrontierIndex {
  readonly indexId: string
  readonly blockIds: readonly string[]
  readonly compatibilityDigest: LapicDigest
}

export interface LapicBlockLayoutDescriptor {
  readonly layoutKind: 'row' | 'columnar'
  readonly stateOrderDigest: LapicDigest
}

export interface LapicBlockManifest {
  readonly manifestId: string
  readonly blockRef: LapicArtifactRef
  readonly lineageParentIds: readonly string[]
  readonly supersededByIds: readonly string[]
}

export interface LapicCheckpointManifest {
  readonly checkpointId: string
  readonly artifactRefs: readonly LapicArtifactRef[]
  readonly closureDigest: LapicDigest
}

export interface LapicCheckpointClosureInventory {
  readonly checkpointId: string
  readonly requiredArtifacts: readonly LapicArtifactRef[]
  readonly missingArtifacts: readonly LapicArtifactRef[]
}

export interface LapicArtifactReadRequest {
  readonly artifactRef: LapicArtifactRef
}

export interface LapicArtifactReadResult {
  readonly envelope: LapicStorageEnvelope
  readonly payloadDigest: LapicDigest
}

export interface LapicArtifactWriteRequest {
  readonly envelope: LapicStorageEnvelope
  readonly payloadDigest: LapicDigest
}

export interface LapicArtifactWriteCommitResult {
  readonly artifactRef: LapicArtifactRef
  readonly committed: boolean
}

export interface LapicBackendCapabilityDescriptor {
  readonly backendKind: LapicBackendKind
  readonly supportsTransactions: boolean
  readonly supportsCompression: boolean
}

export interface LapicArtifactStore {
  readonly capabilities: LapicBackendCapabilityDescriptor
  read(request: LapicArtifactReadRequest): Promise<LapicArtifactReadResult>
  write(
    request: LapicArtifactWriteRequest
  ): Promise<LapicArtifactWriteCommitResult>
}

export interface LapicClosureMaterializationRequest {
  readonly checkpointId: string
  readonly artifactRefs: readonly LapicArtifactRef[]
}

export interface LapicCheckpointClosureVerificationResult {
  readonly checkpointId: string
  readonly resumable: boolean
  readonly replayable: boolean
  readonly diagnostics: readonly string[]
}

export interface LapicClosureExportDescriptor {
  readonly checkpointId: string
  readonly exportDigest: LapicDigest
}

export interface LapicClosureImportDescriptor {
  readonly checkpointId: string
  readonly importDigest: LapicDigest
}

export type LapicCorruptionClassification =
  | 'missing-artifact'
  | 'checksum-mismatch'
  | 'manifest-closure-failure'
  | 'schema-mismatch'

export interface LapicArtifactIntegrityScanRequest {
  readonly artifactRefs: readonly LapicArtifactRef[]
}

export interface LapicIntegrityScanResult {
  readonly ok: boolean
  readonly classifications: readonly LapicCorruptionClassification[]
  readonly affectedArtifacts: readonly LapicArtifactRef[]
}

export interface LapicRepairRecommendationSummary {
  readonly canRepairDeterministically: boolean
  readonly actions: readonly string[]
}

export interface LapicDebugExportRequest {
  readonly artifactRef: LapicArtifactRef
  readonly viewKind: string
}

export interface LapicDebugArtifactSummary {
  readonly artifactRef: LapicArtifactRef
  readonly summaryDigest: LapicDigest
}

export type LapicStorageValidator = (
  envelope: LapicStorageEnvelope
) => LapicValidationResult<LapicStorageEnvelope>

export interface LapicMemoryArtifactStoreEntry {
  readonly artifactRef: LapicArtifactRef
  readonly envelope: LapicStorageEnvelope
  readonly payloadDigest: LapicDigest
}

export interface LapicMemoryArtifactStoreOptions {
  readonly entries?: readonly LapicArtifactWriteRequest[]
  readonly supportsTransactions?: boolean
  readonly supportsCompression?: boolean
}

export interface LapicMemoryArtifactStore extends LapicArtifactStore {
  listArtifactRefs(): readonly LapicArtifactRef[]
  snapshot(): readonly LapicMemoryArtifactStoreEntry[]
}

export interface LapicStorageSkeletonMarker {
  readonly packageName: typeof lapicStoragePackageName
  readonly schemaVersion: LapicStorageSchemaVersion
}

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

function isRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && value >= 0
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

function isValidDigestArray(values: readonly LapicDigest[]): boolean {
  return values.every(isNonEmptyString) && hasUniqueValues(values)
}

function createStorageFailure(
  message: string,
  path?: readonly string[],
  details?: Readonly<Record<string, string | number | boolean | null>>
): LapicValidationResult<never> {
  return createLapicFailureResult([
    createLapicDiagnostic(
      'error',
      'SchemaViolation',
      message,
      path,
      details
    ),
  ])
}

function validateArtifactKind(
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

function validateArtifactRefArray(
  artifactRefs: readonly LapicArtifactRef[],
  path: readonly string[]
): LapicValidationResult<readonly LapicArtifactRef[]> {
  const diagnostics: LapicDiagnostic[] = []
  const seenKeys = new Set<string>()

  artifactRefs.forEach((artifactRef, index) => {
    const validation = validateLapicArtifactRef(artifactRef)
    if (!validation.ok) {
      diagnostics.push(
        ...validation.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          path: [...path, String(index), ...(diagnostic.path ?? [])],
        }))
      )
      return
    }

    const key = createLapicArtifactRefKey(artifactRef)
    if (seenKeys.has(key))
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'Artifact references must be unique.',
          [...path, String(index)]
        )
      )
    else seenKeys.add(key)
  })

  return diagnostics.length
    ? createLapicFailureResult(diagnostics)
    : createLapicSuccessResult(artifactRefs)
}

export function createLapicStorageEnvelope(
  input: LapicStorageEnvelope
): LapicStorageEnvelope {
  return {
    artifactKind: input.artifactKind,
    schemaVersion: input.schemaVersion,
    payloadEncoding: input.payloadEncoding,
    payloadLength: input.payloadLength,
    contentHash: input.contentHash,
    checksum: input.checksum,
    compressionCodec: input.compressionCodec,
    creationEngineVersion: input.creationEngineVersion,
    arithmeticPolicyId: input.arithmeticPolicyId,
    dependencyDigestSet: [...input.dependencyDigestSet],
  }
}

export function createLapicArtifactRef(
  input: LapicArtifactRef
): LapicArtifactRef {
  return {
    artifactId: input.artifactId,
    artifactKind: input.artifactKind,
    contentHash: input.contentHash,
  }
}

export function createLapicFrontierBlock(
  input: LapicFrontierBlock
): LapicFrontierBlock {
  return {
    blockId: input.blockId,
    layout: input.layout,
    stateIds: [...input.stateIds],
    rowCount: input.rowCount,
  }
}

export function createLapicFrontierIndex(
  input: LapicFrontierIndex
): LapicFrontierIndex {
  return {
    indexId: input.indexId,
    blockIds: [...input.blockIds],
    compatibilityDigest: input.compatibilityDigest,
  }
}

export function createLapicBlockLayoutDescriptor(
  input: LapicBlockLayoutDescriptor
): LapicBlockLayoutDescriptor {
  return {
    layoutKind: input.layoutKind,
    stateOrderDigest: input.stateOrderDigest,
  }
}

export function createLapicBlockManifest(
  input: LapicBlockManifest
): LapicBlockManifest {
  return {
    manifestId: input.manifestId,
    blockRef: input.blockRef,
    lineageParentIds: [...input.lineageParentIds],
    supersededByIds: [...input.supersededByIds],
  }
}

export function createLapicCheckpointManifest(
  input: LapicCheckpointManifest
): LapicCheckpointManifest {
  return {
    checkpointId: input.checkpointId,
    artifactRefs: input.artifactRefs.map((artifactRef) =>
      createLapicArtifactRef(artifactRef)
    ),
    closureDigest: input.closureDigest,
  }
}

export function createLapicCheckpointClosureInventory(
  checkpointId: string,
  requiredArtifacts: readonly LapicArtifactRef[],
  missingArtifacts: readonly LapicArtifactRef[] = []
): LapicCheckpointClosureInventory {
  return {
    checkpointId,
    requiredArtifacts: requiredArtifacts.map((artifactRef) =>
      createLapicArtifactRef(artifactRef)
    ),
    missingArtifacts: missingArtifacts.map((artifactRef) =>
      createLapicArtifactRef(artifactRef)
    ),
  }
}

export function createLapicArtifactReadRequest(
  artifactRef: LapicArtifactRef
): LapicArtifactReadRequest {
  return { artifactRef: createLapicArtifactRef(artifactRef) }
}

export function createLapicArtifactWriteRequest(
  envelope: LapicStorageEnvelope,
  payloadDigest: LapicDigest
): LapicArtifactWriteRequest {
  return {
    envelope: createLapicStorageEnvelope(envelope),
    payloadDigest,
  }
}

export function createLapicBackendCapabilityDescriptor(
  input: LapicBackendCapabilityDescriptor
): LapicBackendCapabilityDescriptor {
  return {
    backendKind: input.backendKind,
    supportsTransactions: input.supportsTransactions,
    supportsCompression: input.supportsCompression,
  }
}

export function createLapicArtifactRefFromWriteRequest(
  request: LapicArtifactWriteRequest
): LapicArtifactRef {
  return createLapicArtifactRef({
    artifactId: `${request.envelope.artifactKind}:${request.envelope.contentHash}`,
    artifactKind: request.envelope.artifactKind,
    contentHash: request.envelope.contentHash,
  })
}

export function createLapicCheckpointClosureVerificationResult(
  checkpointId: string,
  resumable: boolean,
  replayable: boolean,
  diagnostics: readonly string[] = []
): LapicCheckpointClosureVerificationResult {
  return {
    checkpointId,
    resumable,
    replayable,
    diagnostics: [...diagnostics],
  }
}

export function createLapicClosureExportDescriptor(
  checkpointId: string,
  exportDigest: LapicDigest
): LapicClosureExportDescriptor {
  return {
    checkpointId,
    exportDigest,
  }
}

export function createLapicClosureImportDescriptor(
  checkpointId: string,
  importDigest: LapicDigest
): LapicClosureImportDescriptor {
  return {
    checkpointId,
    importDigest,
  }
}

export function createLapicIntegrityScanResult(
  classifications: readonly LapicCorruptionClassification[],
  affectedArtifacts: readonly LapicArtifactRef[]
): LapicIntegrityScanResult {
  return {
    ok: classifications.length === 0,
    classifications: [...classifications],
    affectedArtifacts: affectedArtifacts.map((artifactRef) =>
      createLapicArtifactRef(artifactRef)
    ),
  }
}

export function createLapicRepairRecommendationSummary(
  scan: LapicIntegrityScanResult
): LapicRepairRecommendationSummary {
  if (scan.ok)
    return {
      canRepairDeterministically: true,
      actions: ['No repair required.'],
    }

  const actions = new Set<string>()
  let canRepairDeterministically = true

  if (scan.classifications.includes('missing-artifact'))
    actions.add('Re-materialize missing artifacts from canonical sources.')

  if (scan.classifications.includes('checksum-mismatch')) {
    actions.add('Re-encode corrupted artifacts and replace checksum-mismatched entries.')
    canRepairDeterministically = false
  }

  if (scan.classifications.includes('schema-mismatch')) {
    actions.add('Migrate or regenerate artifacts with the expected storage schema.')
    canRepairDeterministically = false
  }

  if (scan.classifications.includes('manifest-closure-failure'))
    actions.add('Regenerate checkpoint manifests to restore closure completeness.')

  return {
    canRepairDeterministically,
    actions: [...actions],
  }
}

export function createLapicDebugArtifactSummary(
  artifactRef: LapicArtifactRef,
  summaryDigest: LapicDigest
): LapicDebugArtifactSummary {
  return {
    artifactRef: createLapicArtifactRef(artifactRef),
    summaryDigest,
  }
}

export function createLapicArtifactRefKey(artifactRef: LapicArtifactRef): string {
  return [
    artifactRef.artifactId,
    artifactRef.artifactKind,
    artifactRef.contentHash,
  ].join('|')
}

export const validateLapicStorageEnvelope: LapicStorageValidator = (
  envelope
) => {
  if (!isRecord(envelope))
    return createStorageFailure(
      'Storage envelope must be a record.',
      ['storageEnvelope']
    )

  const kindValidation = validateArtifactKind(
    envelope.artifactKind,
    ['artifactKind']
  )
  if (!kindValidation.ok) return kindValidation

  if (!isNonEmptyString(envelope.schemaVersion))
    return createStorageFailure(
      'Schema version must be a non-empty string.',
      ['schemaVersion']
    )

  if (
    !isNonEmptyString(envelope.payloadEncoding) ||
    !lapicPayloadEncodings.includes(
      envelope.payloadEncoding as LapicPayloadEncoding
    )
  )
    return createStorageFailure(
      'Payload encoding must be supported.',
      ['payloadEncoding']
    )

  if (!isNonNegativeInteger(envelope.payloadLength))
    return createStorageFailure(
      'Payload length must be a non-negative integer.',
      ['payloadLength']
    )

  if (!isNonEmptyString(envelope.contentHash))
    return createStorageFailure(
      'Content hash must be a non-empty string.',
      ['contentHash']
    )

  const checksumValidation = validateLapicChecksumMetadata(envelope.checksum)
  if (!checksumValidation.ok)
    return createLapicFailureResult(
      checksumValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['checksum', ...(diagnostic.path ?? [])],
      }))
    )

  if (
    !isNonEmptyString(envelope.compressionCodec) ||
    !lapicCompressionCodecs.includes(
      envelope.compressionCodec as LapicCompressionCodec
    )
  )
    return createStorageFailure(
      'Compression codec must be supported.',
      ['compressionCodec']
    )

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
    return createStorageFailure(
      'Checksum metadata must be a record.',
      ['checksum']
    )

  if (!isNonEmptyString(checksum.algorithm))
    return createStorageFailure(
      'Checksum algorithm must be a non-empty string.',
      ['algorithm']
    )

  if (!isNonEmptyString(checksum.checksum))
    return createStorageFailure(
      'Checksum value must be a non-empty string.',
      ['checksum']
    )

  return createLapicSuccessResult(checksum)
}

export function validateLapicArtifactRef(
  artifactRef: LapicArtifactRef
): LapicValidationResult<LapicArtifactRef> {
  if (!isRecord(artifactRef))
    return createStorageFailure(
      'Artifact reference must be a record.',
      ['artifactRef']
    )

  if (!isNonEmptyString(artifactRef.artifactId))
    return createStorageFailure(
      'Artifact id must be a non-empty string.',
      ['artifactId']
    )

  const kindValidation = validateArtifactKind(
    artifactRef.artifactKind,
    ['artifactKind']
  )
  if (!kindValidation.ok) return kindValidation

  if (!isNonEmptyString(artifactRef.contentHash))
    return createStorageFailure(
      'Artifact content hash must be a non-empty string.',
      ['contentHash']
    )

  return createLapicSuccessResult(artifactRef)
}

export function validateLapicFrontierBlock(
  block: LapicFrontierBlock
): LapicValidationResult<LapicFrontierBlock> {
  if (!isRecord(block))
    return createStorageFailure(
      'Frontier block must be a record.',
      ['frontierBlock']
    )

  if (!isNonEmptyString(block.blockId))
    return createStorageFailure('Block id must be a non-empty string.', ['blockId'])

  const layoutValidation = validateLapicStateLayoutDescriptor(block.layout)
  if (!layoutValidation.ok)
    return createLapicFailureResult(
      layoutValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['layout', ...(diagnostic.path ?? [])],
      }))
    )

  if (
    !Array.isArray(block.stateIds) ||
    !block.stateIds.every(isNonEmptyString) ||
    !hasUniqueValues(block.stateIds)
  )
    return createStorageFailure(
      'State ids must contain unique non-empty strings.',
      ['stateIds']
    )

  if (!isNonNegativeInteger(block.rowCount))
    return createStorageFailure(
      'Row count must be a non-negative integer.',
      ['rowCount']
    )

  if (block.rowCount !== block.stateIds.length)
    return createStorageFailure(
      'Row count must match the number of state ids.',
      ['rowCount']
    )

  return createLapicSuccessResult(block)
}

export function validateLapicFrontierIndex(
  index: LapicFrontierIndex
): LapicValidationResult<LapicFrontierIndex> {
  if (!isRecord(index))
    return createStorageFailure(
      'Frontier index must be a record.',
      ['frontierIndex']
    )

  if (!isNonEmptyString(index.indexId))
    return createStorageFailure('Index id must be a non-empty string.', ['indexId'])

  if (
    !Array.isArray(index.blockIds) ||
    !index.blockIds.every(isNonEmptyString) ||
    !hasUniqueValues(index.blockIds)
  )
    return createStorageFailure(
      'Block ids must contain unique non-empty strings.',
      ['blockIds']
    )

  if (!isNonEmptyString(index.compatibilityDigest))
    return createStorageFailure(
      'Compatibility digest must be a non-empty string.',
      ['compatibilityDigest']
    )

  return createLapicSuccessResult(index)
}

export function validateLapicBlockLayoutDescriptor(
  descriptor: LapicBlockLayoutDescriptor
): LapicValidationResult<LapicBlockLayoutDescriptor> {
  if (!isRecord(descriptor))
    return createStorageFailure(
      'Block layout descriptor must be a record.',
      ['blockLayoutDescriptor']
    )

  if (
    !isNonEmptyString(descriptor.layoutKind) ||
    !lapicBlockLayoutKinds.includes(descriptor.layoutKind)
  )
    return createStorageFailure(
      'Block layout kind must be supported.',
      ['layoutKind']
    )

  if (!isNonEmptyString(descriptor.stateOrderDigest))
    return createStorageFailure(
      'State order digest must be a non-empty string.',
      ['stateOrderDigest']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicBlockManifest(
  manifest: LapicBlockManifest
): LapicValidationResult<LapicBlockManifest> {
  if (!isRecord(manifest))
    return createStorageFailure(
      'Block manifest must be a record.',
      ['blockManifest']
    )

  if (!isNonEmptyString(manifest.manifestId))
    return createStorageFailure(
      'Manifest id must be a non-empty string.',
      ['manifestId']
    )

  const blockRefValidation = validateLapicArtifactRef(manifest.blockRef)
  if (!blockRefValidation.ok)
    return createLapicFailureResult(
      blockRefValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['blockRef', ...(diagnostic.path ?? [])],
      }))
    )

  if (
    !Array.isArray(manifest.lineageParentIds) ||
    !manifest.lineageParentIds.every(isNonEmptyString) ||
    !hasUniqueValues(manifest.lineageParentIds)
  )
    return createStorageFailure(
      'Lineage parent ids must contain unique non-empty strings.',
      ['lineageParentIds']
    )

  if (
    !Array.isArray(manifest.supersededByIds) ||
    !manifest.supersededByIds.every(isNonEmptyString) ||
    !hasUniqueValues(manifest.supersededByIds)
  )
    return createStorageFailure(
      'Superseded-by ids must contain unique non-empty strings.',
      ['supersededByIds']
    )

  return createLapicSuccessResult(manifest)
}

export function validateLapicCheckpointManifest(
  manifest: LapicCheckpointManifest
): LapicValidationResult<LapicCheckpointManifest> {
  if (!isRecord(manifest))
    return createStorageFailure(
      'Checkpoint manifest must be a record.',
      ['checkpointManifest']
    )

  if (!isNonEmptyString(manifest.checkpointId))
    return createStorageFailure(
      'Checkpoint id must be a non-empty string.',
      ['checkpointId']
    )

  if (!Array.isArray(manifest.artifactRefs))
    return createStorageFailure(
      'Checkpoint artifact refs must be an array.',
      ['artifactRefs']
    )

  const artifactValidation = validateArtifactRefArray(
    manifest.artifactRefs,
    ['artifactRefs']
  )
  if (!artifactValidation.ok) return artifactValidation

  if (!isNonEmptyString(manifest.closureDigest))
    return createStorageFailure(
      'Closure digest must be a non-empty string.',
      ['closureDigest']
    )

  return createLapicSuccessResult(manifest)
}

export function validateLapicCheckpointClosureInventory(
  inventory: LapicCheckpointClosureInventory
): LapicValidationResult<LapicCheckpointClosureInventory> {
  if (!isRecord(inventory))
    return createStorageFailure(
      'Checkpoint closure inventory must be a record.',
      ['checkpointClosureInventory']
    )

  if (!isNonEmptyString(inventory.checkpointId))
    return createStorageFailure(
      'Checkpoint id must be a non-empty string.',
      ['checkpointId']
    )

  const requiredValidation = validateArtifactRefArray(
    inventory.requiredArtifacts,
    ['requiredArtifacts']
  )
  if (!requiredValidation.ok) return requiredValidation

  const missingValidation = validateArtifactRefArray(
    inventory.missingArtifacts,
    ['missingArtifacts']
  )
  if (!missingValidation.ok) return missingValidation

  const requiredKeys = new Set(
    inventory.requiredArtifacts.map(createLapicArtifactRefKey)
  )

  const missingOutsideClosure = inventory.missingArtifacts.filter(
    (artifactRef) => !requiredKeys.has(createLapicArtifactRefKey(artifactRef))
  )

  if (missingOutsideClosure.length)
    return createStorageFailure(
      'Missing artifacts must be a subset of required artifacts.',
      ['missingArtifacts']
    )

  return createLapicSuccessResult(inventory)
}

export function validateLapicArtifactReadRequest(
  request: LapicArtifactReadRequest
): LapicValidationResult<LapicArtifactReadRequest> {
  if (!isRecord(request))
    return createStorageFailure(
      'Artifact read request must be a record.',
      ['artifactReadRequest']
    )

  const artifactRefValidation = validateLapicArtifactRef(request.artifactRef)
  if (!artifactRefValidation.ok)
    return createLapicFailureResult(
      artifactRefValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['artifactRef', ...(diagnostic.path ?? [])],
      }))
    )

  return createLapicSuccessResult(request)
}

export function validateLapicArtifactReadResult(
  result: LapicArtifactReadResult
): LapicValidationResult<LapicArtifactReadResult> {
  if (!isRecord(result))
    return createStorageFailure(
      'Artifact read result must be a record.',
      ['artifactReadResult']
    )

  const envelopeValidation = validateLapicStorageEnvelope(result.envelope)
  if (!envelopeValidation.ok)
    return createLapicFailureResult(
      envelopeValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['envelope', ...(diagnostic.path ?? [])],
      }))
    )

  if (!isNonEmptyString(result.payloadDigest))
    return createStorageFailure(
      'Payload digest must be a non-empty string.',
      ['payloadDigest']
    )

  return createLapicSuccessResult(result)
}

export function validateLapicArtifactWriteRequest(
  request: LapicArtifactWriteRequest
): LapicValidationResult<LapicArtifactWriteRequest> {
  if (!isRecord(request))
    return createStorageFailure(
      'Artifact write request must be a record.',
      ['artifactWriteRequest']
    )

  const envelopeValidation = validateLapicStorageEnvelope(request.envelope)
  if (!envelopeValidation.ok)
    return createLapicFailureResult(
      envelopeValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['envelope', ...(diagnostic.path ?? [])],
      }))
    )

  if (!isNonEmptyString(request.payloadDigest))
    return createStorageFailure(
      'Payload digest must be a non-empty string.',
      ['payloadDigest']
    )

  return createLapicSuccessResult(request)
}

export function validateLapicArtifactWriteCommitResult(
  result: LapicArtifactWriteCommitResult
): LapicValidationResult<LapicArtifactWriteCommitResult> {
  if (!isRecord(result))
    return createStorageFailure(
      'Artifact write commit result must be a record.',
      ['artifactWriteCommitResult']
    )

  const artifactRefValidation = validateLapicArtifactRef(result.artifactRef)
  if (!artifactRefValidation.ok)
    return createLapicFailureResult(
      artifactRefValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['artifactRef', ...(diagnostic.path ?? [])],
      }))
    )

  if (!isBoolean(result.committed))
    return createStorageFailure(
      'Committed flag must be a boolean.',
      ['committed']
    )

  return createLapicSuccessResult(result)
}

export function validateLapicBackendCapabilityDescriptor(
  descriptor: LapicBackendCapabilityDescriptor
): LapicValidationResult<LapicBackendCapabilityDescriptor> {
  if (!isRecord(descriptor))
    return createStorageFailure(
      'Backend capability descriptor must be a record.',
      ['backendCapabilityDescriptor']
    )

  if (
    !isNonEmptyString(descriptor.backendKind) ||
    !lapicBackendKinds.includes(descriptor.backendKind as LapicBackendKind)
  )
    return createStorageFailure(
      'Backend kind must be supported.',
      ['backendKind']
    )

  if (!isBoolean(descriptor.supportsTransactions))
    return createStorageFailure(
      'supportsTransactions must be a boolean.',
      ['supportsTransactions']
    )

  if (!isBoolean(descriptor.supportsCompression))
    return createStorageFailure(
      'supportsCompression must be a boolean.',
      ['supportsCompression']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicClosureMaterializationRequest(
  request: LapicClosureMaterializationRequest
): LapicValidationResult<LapicClosureMaterializationRequest> {
  if (!isRecord(request))
    return createStorageFailure(
      'Closure materialization request must be a record.',
      ['closureMaterializationRequest']
    )

  if (!isNonEmptyString(request.checkpointId))
    return createStorageFailure(
      'Checkpoint id must be a non-empty string.',
      ['checkpointId']
    )

  return validateArtifactRefArray(request.artifactRefs, ['artifactRefs']).ok
    ? createLapicSuccessResult(request)
    : createStorageFailure(
        'Artifact refs must contain unique valid artifact references.',
        ['artifactRefs']
      )
}

export function validateLapicCheckpointClosureVerificationResult(
  result: LapicCheckpointClosureVerificationResult
): LapicValidationResult<LapicCheckpointClosureVerificationResult> {
  if (!isRecord(result))
    return createStorageFailure(
      'Checkpoint closure verification result must be a record.',
      ['checkpointClosureVerificationResult']
    )

  if (!isNonEmptyString(result.checkpointId))
    return createStorageFailure(
      'Checkpoint id must be a non-empty string.',
      ['checkpointId']
    )

  if (!isBoolean(result.resumable))
    return createStorageFailure(
      'Resumable must be a boolean.',
      ['resumable']
    )

  if (!isBoolean(result.replayable))
    return createStorageFailure(
      'Replayable must be a boolean.',
      ['replayable']
    )

  if (
    !Array.isArray(result.diagnostics) ||
    !result.diagnostics.every(isNonEmptyString)
  )
    return createStorageFailure(
      'Diagnostics must contain non-empty strings.',
      ['diagnostics']
    )

  return createLapicSuccessResult(result)
}

export function validateLapicClosureExportDescriptor(
  descriptor: LapicClosureExportDescriptor
): LapicValidationResult<LapicClosureExportDescriptor> {
  if (!isRecord(descriptor))
    return createStorageFailure(
      'Closure export descriptor must be a record.',
      ['closureExportDescriptor']
    )

  if (!isNonEmptyString(descriptor.checkpointId))
    return createStorageFailure(
      'Checkpoint id must be a non-empty string.',
      ['checkpointId']
    )

  if (!isNonEmptyString(descriptor.exportDigest))
    return createStorageFailure(
      'Export digest must be a non-empty string.',
      ['exportDigest']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicClosureImportDescriptor(
  descriptor: LapicClosureImportDescriptor
): LapicValidationResult<LapicClosureImportDescriptor> {
  if (!isRecord(descriptor))
    return createStorageFailure(
      'Closure import descriptor must be a record.',
      ['closureImportDescriptor']
    )

  if (!isNonEmptyString(descriptor.checkpointId))
    return createStorageFailure(
      'Checkpoint id must be a non-empty string.',
      ['checkpointId']
    )

  if (!isNonEmptyString(descriptor.importDigest))
    return createStorageFailure(
      'Import digest must be a non-empty string.',
      ['importDigest']
    )

  return createLapicSuccessResult(descriptor)
}

export function validateLapicArtifactIntegrityScanRequest(
  request: LapicArtifactIntegrityScanRequest
): LapicValidationResult<LapicArtifactIntegrityScanRequest> {
  if (!isRecord(request))
    return createStorageFailure(
      'Artifact integrity scan request must be a record.',
      ['artifactIntegrityScanRequest']
    )

  return validateArtifactRefArray(request.artifactRefs, ['artifactRefs']).ok
    ? createLapicSuccessResult(request)
    : createStorageFailure(
        'Artifact refs must contain unique valid artifact references.',
        ['artifactRefs']
      )
}

export function validateLapicIntegrityScanResult(
  result: LapicIntegrityScanResult
): LapicValidationResult<LapicIntegrityScanResult> {
  if (!isRecord(result))
    return createStorageFailure(
      'Integrity scan result must be a record.',
      ['integrityScanResult']
    )

  if (!isBoolean(result.ok))
    return createStorageFailure('Integrity result ok must be a boolean.', ['ok'])

  if (
    !Array.isArray(result.classifications) ||
    !result.classifications.every(
      (classification) =>
        isNonEmptyString(classification) &&
        lapicCorruptionClassifications.includes(
          classification as LapicCorruptionClassification
        )
    )
  )
    return createStorageFailure(
      'Integrity classifications must be supported values.',
      ['classifications']
    )

  const artifactValidation = validateArtifactRefArray(
    result.affectedArtifacts,
    ['affectedArtifacts']
  )
  if (!artifactValidation.ok) return artifactValidation

  return createLapicSuccessResult(result)
}

export function validateLapicRepairRecommendationSummary(
  summary: LapicRepairRecommendationSummary
): LapicValidationResult<LapicRepairRecommendationSummary> {
  if (!isRecord(summary))
    return createStorageFailure(
      'Repair recommendation summary must be a record.',
      ['repairRecommendationSummary']
    )

  if (!isBoolean(summary.canRepairDeterministically))
    return createStorageFailure(
      'canRepairDeterministically must be a boolean.',
      ['canRepairDeterministically']
    )

  if (!Array.isArray(summary.actions) || !summary.actions.every(isNonEmptyString))
    return createStorageFailure(
      'Repair actions must contain non-empty strings.',
      ['actions']
    )

  return createLapicSuccessResult(summary)
}

export function validateLapicDebugExportRequest(
  request: LapicDebugExportRequest
): LapicValidationResult<LapicDebugExportRequest> {
  if (!isRecord(request))
    return createStorageFailure(
      'Debug export request must be a record.',
      ['debugExportRequest']
    )

  const artifactRefValidation = validateLapicArtifactRef(request.artifactRef)
  if (!artifactRefValidation.ok)
    return createLapicFailureResult(
      artifactRefValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['artifactRef', ...(diagnostic.path ?? [])],
      }))
    )

  if (!isNonEmptyString(request.viewKind))
    return createStorageFailure(
      'View kind must be a non-empty string.',
      ['viewKind']
    )

  return createLapicSuccessResult(request)
}

export function validateLapicDebugArtifactSummary(
  summary: LapicDebugArtifactSummary
): LapicValidationResult<LapicDebugArtifactSummary> {
  if (!isRecord(summary))
    return createStorageFailure(
      'Debug artifact summary must be a record.',
      ['debugArtifactSummary']
    )

  const artifactRefValidation = validateLapicArtifactRef(summary.artifactRef)
  if (!artifactRefValidation.ok)
    return createLapicFailureResult(
      artifactRefValidation.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['artifactRef', ...(diagnostic.path ?? [])],
      }))
    )

  if (!isNonEmptyString(summary.summaryDigest))
    return createStorageFailure(
      'Summary digest must be a non-empty string.',
      ['summaryDigest']
    )

  return createLapicSuccessResult(summary)
}

export function materializeLapicCheckpointClosureInventory(
  request: LapicClosureMaterializationRequest,
  availableArtifacts: readonly LapicArtifactRef[]
): LapicCheckpointClosureInventory {
  const availableKeys = new Set(availableArtifacts.map(createLapicArtifactRefKey))
  const missingArtifacts = request.artifactRefs.filter(
    (artifactRef) => !availableKeys.has(createLapicArtifactRefKey(artifactRef))
  )

  return createLapicCheckpointClosureInventory(
    request.checkpointId,
    request.artifactRefs,
    missingArtifacts
  )
}

export async function scanLapicArtifactIntegrity(
  store: LapicArtifactStore,
  request: LapicArtifactIntegrityScanRequest
): Promise<LapicIntegrityScanResult> {
  const classifications = new Set<LapicCorruptionClassification>()
  const affectedArtifacts = new Map<string, LapicArtifactRef>()

  for (const artifactRef of request.artifactRefs) {
    try {
      const readResult = await store.read({ artifactRef })
      const readValidation = validateLapicArtifactReadResult(readResult)
      if (!readValidation.ok) {
        classifications.add('schema-mismatch')
        affectedArtifacts.set(
          createLapicArtifactRefKey(artifactRef),
          createLapicArtifactRef(artifactRef)
        )
        continue
      }

      if (readResult.envelope.artifactKind !== artifactRef.artifactKind) {
        classifications.add('schema-mismatch')
        affectedArtifacts.set(
          createLapicArtifactRefKey(artifactRef),
          createLapicArtifactRef(artifactRef)
        )
      }

      if (readResult.envelope.contentHash !== artifactRef.contentHash) {
        classifications.add('checksum-mismatch')
        affectedArtifacts.set(
          createLapicArtifactRefKey(artifactRef),
          createLapicArtifactRef(artifactRef)
        )
      }
    } catch {
      classifications.add('missing-artifact')
      affectedArtifacts.set(
        createLapicArtifactRefKey(artifactRef),
        createLapicArtifactRef(artifactRef)
      )
    }
  }

  return createLapicIntegrityScanResult(
    [...classifications],
    [...affectedArtifacts.values()]
  )
}

export async function verifyLapicCheckpointClosure(
  store: LapicArtifactStore,
  request: LapicClosureMaterializationRequest
): Promise<LapicCheckpointClosureVerificationResult> {
  const integrityScan = await scanLapicArtifactIntegrity(store, {
    artifactRefs: request.artifactRefs,
  })

  const inventory = materializeLapicCheckpointClosureInventory(
    request,
    integrityScan.ok
      ? request.artifactRefs
      : request.artifactRefs.filter(
          (artifactRef) =>
            !integrityScan.affectedArtifacts.some(
              (affectedArtifact) =>
                createLapicArtifactRefKey(affectedArtifact) ===
                createLapicArtifactRefKey(artifactRef)
            )
        )
  )

  const diagnostics = [
    ...inventory.missingArtifacts.map(
      (artifactRef) => `Missing artifact: ${artifactRef.artifactId}`
    ),
    ...integrityScan.classifications
      .filter((classification) => classification !== 'missing-artifact')
      .map((classification) => `Integrity classification: ${classification}`),
  ]

  return createLapicCheckpointClosureVerificationResult(
    request.checkpointId,
    diagnostics.length === 0,
    diagnostics.length === 0,
    diagnostics
  )
}

export function createLapicMemoryArtifactStore(
  options: LapicMemoryArtifactStoreOptions = {}
): LapicMemoryArtifactStore {
  const capabilities = createLapicBackendCapabilityDescriptor({
    backendKind: 'memory',
    supportsTransactions: options.supportsTransactions ?? true,
    supportsCompression: options.supportsCompression ?? false,
  })

  const entries = new Map<string, LapicMemoryArtifactStoreEntry>()

  const writeValidatedEntry = (request: LapicArtifactWriteRequest) => {
    const validation = validateLapicArtifactWriteRequest(request)
    if (!validation.ok) {
      const detail = validation.diagnostics[0]?.message ?? 'unknown validation failure'
      throw new Error(`Invalid memory store write request: ${detail}`)
    }

    const artifactRef = createLapicArtifactRefFromWriteRequest(request)
    entries.set(artifactRef.artifactId, {
      artifactRef,
      envelope: createLapicStorageEnvelope(request.envelope),
      payloadDigest: request.payloadDigest,
    })
  }

  options.entries?.forEach(writeValidatedEntry)

  return {
    capabilities,
    async read(request) {
      const validation = validateLapicArtifactReadRequest(request)
      if (!validation.ok) {
        const detail = validation.diagnostics[0]?.message ?? 'unknown validation failure'
        throw new Error(`Invalid artifact read request: ${detail}`)
      }

      const entry = entries.get(request.artifactRef.artifactId)
      if (!entry)
        throw new Error(
          `Artifact not found in memory store: ${request.artifactRef.artifactId}`
        )

      if (
        entry.artifactRef.artifactKind !== request.artifactRef.artifactKind ||
        entry.artifactRef.contentHash !== request.artifactRef.contentHash
      )
        throw new Error(
          `Artifact reference mismatch for ${request.artifactRef.artifactId}`
        )

      return {
        envelope: createLapicStorageEnvelope(entry.envelope),
        payloadDigest: entry.payloadDigest,
      }
    },
    async write(request) {
      writeValidatedEntry(request)
      const artifactRef = createLapicArtifactRefFromWriteRequest(request)
      return {
        artifactRef,
        committed: true,
      }
    },
    listArtifactRefs() {
      return [...entries.values()].map((entry) =>
        createLapicArtifactRef(entry.artifactRef)
      )
    },
    snapshot() {
      return [...entries.values()].map((entry) => ({
        artifactRef: createLapicArtifactRef(entry.artifactRef),
        envelope: createLapicStorageEnvelope(entry.envelope),
        payloadDigest: entry.payloadDigest,
      }))
    },
  }
}

export const lapicStorageSkeleton: LapicStorageSkeletonMarker = {
  packageName: lapicStoragePackageName,
  schemaVersion: lapicStorageSchemaVersion,
}
