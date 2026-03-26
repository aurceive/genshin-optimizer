import type {
  LapicArithmeticPolicyId,
  LapicCandidateId,
  LapicContentHash,
  LapicDigest,
  LapicExactSignatureGroupKey,
  LapicRelaxId,
  LapicSchemaVersion,
  LapicSlotId,
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
  | 'block-manifest'
  | 'threshold-snapshot'
  | 'certificate'
  | 'relaxation-record'
  | 'checkpoint-manifest'
  | 'solve-checkpoint'
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

export interface LapicFrontierStateRow {
  readonly stateId: string
  readonly slotId: LapicSlotId
  readonly candidateId: LapicCandidateId
  readonly candidateDigest: LapicDigest
  readonly compatibilityDigest: LapicDigest
  readonly exactSignatureGroupKey: LapicExactSignatureGroupKey
  readonly rowDigest: LapicDigest
}

export interface LapicFrontierBlock {
  readonly blockId: string
  readonly layout: LapicStateLayoutDescriptor
  readonly stateIds: readonly string[]
  readonly rows: readonly LapicFrontierStateRow[]
  readonly rowCount: number
  /** §8.3 skylineSummary — present when skyline compression was applied. */
  readonly skylineSummary?: LapicSkylineSummary
}

/**
 * Aggregate statistics from skyline compression of this frontier block (§8.3).
 */
export interface LapicSkylineSummary {
  readonly totalRows: number
  readonly keptRows: number
  readonly dominatedCount: number
  readonly groupCount: number
}

export interface LapicFrontierGroupSummary {
  readonly groupDigest: LapicDigest
  readonly blockIds: readonly string[]
  readonly slotIds: readonly LapicSlotId[]
  readonly rowDigests: readonly LapicDigest[]
  readonly rowCount: number
  readonly occupiedSlotMask: number
  readonly adapterSemanticMode: string
  readonly frameAxisIdentityDigest: LapicDigest
  readonly discreteTeamModeKey?: string
}

export interface LapicFrontierIndex {
  readonly indexId: string
  readonly blockIds: readonly string[]
  readonly compatibilityDigest: LapicDigest
  readonly exactSignatureGroups: readonly LapicFrontierGroupSummary[]
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

/**
 * §4.4 ThresholdSnapshot — persisted top-N threshold state relevant to
 * threshold-sensitive certificates.
 */
export interface LapicThresholdSnapshotRecord {
  readonly snapshotId: string
  readonly thresholdDigest: LapicDigest
  readonly incumbentDigest: LapicDigest
  readonly topNValues: readonly number[]
  readonly capturedAtStep: number
  readonly arithmeticPolicyId: LapicArithmeticPolicyId
}

/**
 * §4.5 CertificateRecord — persisted C-IR certificate and replay recipe
 * as a first-class storage artifact.
 */
export interface LapicCertificateRecord {
  readonly recordId: string
  readonly certId: string
  readonly certDigest: LapicDigest
  readonly replayRecipeDigest: LapicDigest
  readonly referencedStateIds: readonly string[]
  readonly emittedAtStep: number
}

/**
 * §4.6 RelaxationRecord — persisted R-IR descriptors and provider evidence
 * references required for replay.
 */
export interface LapicRelaxationRecord {
  readonly recordId: string
  readonly relaxId: LapicRelaxId
  readonly relaxDigest: LapicDigest
  readonly providerEvidenceRefs: readonly LapicDigest[]
  readonly referencedRegionIds: readonly string[]
}

/**
 * §4.8 DebugView — deterministic text or binary inspection export.
 * Non-canonical; must not be used as primary persistence for correctness-critical state.
 */
export interface LapicDebugViewRecord {
  readonly recordId: string
  readonly viewKind: string
  readonly viewDigest: LapicDigest
  readonly sourceArtifactRef: LapicArtifactRef
  readonly createdAtStep: number
}

/**
 * Result of a scanIndex operation — lists artifact references matching
 * a given artifact kind filter.
 */
export interface LapicIndexScanResult {
  readonly artifactKind: LapicArtifactKind
  readonly matchingRefs: readonly LapicArtifactRef[]
  readonly totalCount: number
}

/**
 * Describes a logical transaction to be committed atomically.
 */
export interface LapicLogicalTransaction {
  readonly transactionId: string
  readonly writes: readonly LapicArtifactWriteRequest[]
}

/**
 * Result of committing a logical transaction.
 */
export interface LapicLogicalTransactionCommitResult {
  readonly transactionId: string
  readonly committed: boolean
  readonly committedRefs: readonly LapicArtifactRef[]
  readonly diagnostics: readonly string[]
}

export interface LapicArtifactStore {
  readonly capabilities: LapicBackendCapabilityDescriptor
  read(request: LapicArtifactReadRequest): Promise<LapicArtifactReadResult>
  write(
    request: LapicArtifactWriteRequest
  ): Promise<LapicArtifactWriteCommitResult>
  /** §17.3 Scan stored artifacts by kind. */
  scanIndex(artifactKind: LapicArtifactKind): Promise<LapicIndexScanResult>
  /** §17.3 Atomically commit a group of writes. */
  commitLogicalTransaction(
    transaction: LapicLogicalTransaction
  ): Promise<LapicLogicalTransactionCommitResult>
  /** §17.3 Import a checkpoint closure from an export descriptor. */
  importCheckpoint(
    descriptor: LapicClosureImportDescriptor
  ): Promise<LapicCheckpointClosureVerificationResult>
  /** §17.3 Export a checkpoint closure for external transfer. */
  exportCheckpoint(
    descriptor: LapicClosureExportDescriptor
  ): Promise<LapicClosureExportDescriptor>
  /** §17.3 Verify integrity of a single artifact. */
  verifyArtifact(
    artifactRef: LapicArtifactRef
  ): Promise<LapicIntegrityScanResult>
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

export const lapicStorageSkeleton: LapicStorageSkeletonMarker = {
  packageName: lapicStoragePackageName,
  schemaVersion: lapicStorageSchemaVersion,
}
