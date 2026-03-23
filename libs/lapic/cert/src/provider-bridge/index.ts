/**
 * Provider-bridge export family (lapic-cert-api.md §4.6)
 *
 * Provider-agnostic interfaces for incorporating provider evidence
 * into certificates. MUST NOT expose concrete HiGHS runtime objects
 * or solver invocation APIs.
 */

import type {
  LapicDigest,
  LapicSchemaVersion,
} from '@genshin-optimizer/lapic/core'

// ---------------------------------------------------------------------------
// Provider Evidence Descriptor — provider-agnostic evidence metadata
// ---------------------------------------------------------------------------

/**
 * Provider-agnostic descriptor for an evidence payload emitted by any
 * LP provider during a correctness-critical solve.
 */
export interface LapicProviderEvidenceDescriptor {
  /** Opaque provider family identifier (e.g. 'highs', 'glpk'). */
  readonly providerFamily: string
  /** Provider-specific profile identifier. */
  readonly providerProfileId: string
  /** Provider version string. */
  readonly providerVersion: string
  /** Content hash of the serialized evidence payload. */
  readonly evidenceDigest: LapicDigest
  /** Schema version of the evidence payload. */
  readonly evidenceSchemaVersion: LapicSchemaVersion
  /** Artifact kind used when persisting this evidence. */
  readonly evidenceArtifactKind: string
}

// ---------------------------------------------------------------------------
// Deterministic Profile Descriptor — provider-agnostic config identity
// ---------------------------------------------------------------------------

/**
 * Provider-agnostic descriptor for a deterministic provider configuration.
 * Identifies the exact reproducibility contract a provider claims.
 */
export interface LapicDeterministicProfileDescriptor {
  /** Opaque provider family identifier. */
  readonly providerFamily: string
  /** Provider-specific profile identifier. */
  readonly providerProfileId: string
  /** Content hash of the full configuration record. */
  readonly configRecordDigest: LapicDigest
  /** Platform fingerprint under which determinism is guaranteed. */
  readonly platformFingerprint: string
  /** Build fingerprint under which determinism is guaranteed. */
  readonly buildFingerprint: string
}

// ---------------------------------------------------------------------------
// Evidence Serialization Contract — provider-agnostic round-trip guarantee
// ---------------------------------------------------------------------------

/**
 * Contract that a provider evidence serializer must satisfy.
 * The cert layer calls these methods without knowing the concrete
 * provider type.
 */
export interface LapicEvidenceSerializationContract<TEvidence = unknown> {
  /** Serialize evidence to a deterministic byte-equivalent representation. */
  serialize(evidence: TEvidence): string
  /** Deserialize evidence from its serialized representation. */
  deserialize(serialized: string): TEvidence
  /** Compute the content hash of the serialized evidence. */
  computeDigest(evidence: TEvidence): LapicDigest
  /** Schema kind identifier for the evidence payload. */
  readonly schemaKind: string
  /** Schema version for the evidence payload. */
  readonly schemaVersion: LapicSchemaVersion
}

// ---------------------------------------------------------------------------
// Replay Eligibility Classification — provider-agnostic replay decision
// ---------------------------------------------------------------------------

/**
 * Provider-agnostic replay eligibility classification.
 * Determines whether evidence can be replayed, requires exact replay,
 * or is diagnostic-only.
 */
export type LapicProviderReplayEligibility =
  | 'providerReplayEligible'
  | 'exactReplayRequired'
  | 'diagnosticOnly'

/**
 * Provider-agnostic replay eligibility assessment result.
 */
export interface LapicReplayEligibilityAssessment {
  readonly eligibility: LapicProviderReplayEligibility
  readonly evidenceDescriptor: LapicProviderEvidenceDescriptor
  readonly profileDescriptor: LapicDeterministicProfileDescriptor
  readonly diagnosticNotes: readonly string[]
}
