# Frontier Storage and Block Codec Specification

## Status

- Draft
- Depends on: [Exact Optimizer Engine](./exact-optimizer-engine.md)
- Depends on: [Canonical Optimizer IR Specification](./canonical-optimizer-ir.md)
- Depends on: [Relaxation and Certificate System Specification](./relaxation-and-certificate-system.md)
- Scope: persistence contracts for frontier blocks, indexes, spill files, and checkpoint-compatible storage artifacts
- Audience: storage, solver, runtime, certification, and tooling maintainers

## 1. Purpose

This document specifies the persistent and in-memory storage architecture for the exact optimizer engine.

The storage subsystem must support all of the following without weakening correctness:

- exact partial-state frontier storage,
- deterministic block identity and serialization,
- spill and reload under memory pressure,
- checkpoint-compatible persistence,
- certificate and relaxation co-location or reference linkage,
- offline replay and audit tooling.

The storage layer is not a cache-only optimization. It is part of the correctness envelope because certificates, frontier blocks, threshold snapshots, and replay inputs all depend on deterministic persistence contracts.

## 2. Design Principles

### 2.1 Content Addressing First

All persisted correctness-relevant artifacts must be content-addressed over canonical serialized payload.

### 2.2 Deterministic Serialization

Identical logical artifacts must serialize identically under the same schema version and arithmetic policy.

### 2.3 Spill Is Semantics-Preserving

Moving a frontier block from hot memory to persisted storage must not alter ordering, visibility, identity, or replayability.

### 2.4 Storage Must Preserve Exact Provenance

Storage is not allowed to drop provenance information required by S-IR, certificate replay, or final result audit.

### 2.5 Schema Evolution Must Be Explicit

No stored artifact may rely on implicit decoder behavior or out-of-band schema knowledge.

## 3. Storage Scope

The storage subsystem is responsible for persisting and retrieving:

- frontier blocks,
- frontier indexes,
- block-level metadata,
- threshold snapshots,
- certificate records,
- relaxation descriptors and evidence references,
- checkpoint manifests,
- block compaction artifacts,
- deterministic debug exports.

The storage subsystem is not responsible for rendering diagnostics or scheduling worker execution, though it must expose metadata needed by those layers.

## 4. Artifact Taxonomy

All stored objects belong to one of the following artifact kinds.

### 4.1 FrontierBlock

Stores a homogeneous collection of S-IR states under one exact signature family and codec schema.

### 4.2 FrontierIndex

Stores searchable metadata over frontier blocks to support exact joins, skyline grouping, and selective reload.

### 4.3 BlockManifest

Stores summary metadata and integrity information for a block.

### 4.4 ThresholdSnapshot

Stores top-N threshold state relevant to threshold-sensitive certificates.

### 4.5 CertificateRecord

Stores persisted C-IR certificates and replay recipes.

### 4.6 RelaxationRecord

Stores R-IR descriptors and provider evidence references required for replay.

### 4.7 CheckpointManifest

Stores the full persisted entry point for resuming or replaying a solve.

### 4.8 DebugView

Stores deterministic text or binary inspection-oriented exports. DebugView artifacts are non-canonical and must not be used as primary persistence for correctness-critical state.

## 5. Storage Tiers

### 5.1 Hot Tier

The hot tier contains resident in-memory blocks and indexes used by active search.

Required properties:

- low-latency access,
- deterministic ordering views,
- exact identity preservation,
- zero lossy compaction.

### 5.2 Warm Tier

The warm tier contains persisted blocks and manifests available for fast reload.

Required browser backend:

- IndexedDB via strict abstraction.

Required Node backend:

- filesystem-backed block store via the same abstraction contract.

### 5.3 Cold Tier

The cold tier contains exported checkpoint and audit artifacts intended for offline replay, debugging, or cross-machine archival.

Cold tier support is required at the format level even if not always materialized locally.

## 6. Storage Object Identity

### 6.1 General Rule

Every artifact must have:

- logical identifier,
- content hash,
- schema version,
- artifact kind.

### 6.2 Identity Components

Artifact identity must be derived from:

- canonical payload bytes,
- schema kind,
- schema version,
- arithmetic policy where relevant.

Runtime location, creation timestamp, and backend-specific object handles must not affect identity.

### 6.3 Referential Model

All cross-artifact references must use logical IDs and content hashes, never process-local pointers.

## 7. Canonical Storage Envelope

Every persisted artifact must be wrapped in a storage envelope with the following fields.

- artifactKind
- schemaVersion
- payloadEncoding
- payloadLength
- contentHash
- checksum
- compressionCodec if any
- creationEngineVersion
- arithmeticPolicyId if relevant
- dependencyDigestSet

The payload bytes covered by contentHash and checksum must be the post-serialization, pre-transport canonical bytes.

## 8. Frontier Block Model

### 8.1 Purpose

The frontier block is the primary persistence unit for S-IR states.

### 8.2 Homogeneity Requirements

A FrontierBlock must be homogeneous with respect to:

- partitionId,
- exact signature family,
- state key layout version,
- arithmetic representation class,
- provenance encoding strategy,
- codec schema version.

Mixing incompatible state layouts in one block is forbidden.

### 8.3 FrontierBlock Schema

Every FrontierBlock must contain:

- blockId
- partitionId
- signatureFamilyId
- stateLayoutId
- stateCount
- canonicalStateOrder descriptor
- payloadOffsets or column descriptors
- provenanceLayout descriptor
- blockBoundsSummary
- compatibilitySummary
- skylineSummary
- referencedManifestId
- optional referencedCertificateIds
- optional referencedRelaxationIds

### 8.4 State Order Inside Block

The order of states inside a block must be deterministic. The canonical order must be derivable from persisted metadata.

Required ordering basis:

1. exact discrete signature,
2. canonical comparable projection,
3. canonical incomparable projection,
4. canonical provenance digest.

### 8.5 Block Bounds Summary

Each block must store exact summary metadata used for search and pruning prechecks, including:

- coordinate-wise lower summary bounds where exact,
- coordinate-wise upper summary bounds where exact,
- objective lower and upper summary bounds if available,
- unresolved region summary,
- compatibility signature summary,
- certificate-context summary.

Summaries may be conservative but must not be unsound.

## 9. Block Codec Model

### 9.1 Codec Requirements

Every block codec must be:

- deterministic,
- schema-versioned,
- capable of zero-loss round-trip,
- explicit about scalar encoding,
- explicit about optional field presence,
- explicit about endianness.

### 9.2 Supported Logical Layout Families

The architecture supports two logical layout families.

#### Row-Oriented Logical Layout

Suitable for debugging, small blocks, and exact replay tooling.

#### Columnar Logical Layout

Suitable for large frontier blocks, skyline operations, joins, and selective decoding.

The production default is columnar logical layout. Row-oriented layout is permitted only when explicitly selected and fully schema-compatible.

### 9.3 Scalar Encoding Classes

The codec must support:

- fixed-width signed integers,
- fixed-width unsigned integers,
- exact-decimal or rational scalar encoding,
- enum dictionary encoding,
- bitset encoding,
- content-address references,
- length-delimited nested sections.

Native floating-point wire encoding is forbidden for correctness-critical fields unless the field is explicitly classified as non-canonical telemetry.

### 9.4 Provenance Encoding

Provenance may be encoded as:

- exact item id tuples,
- sorted item id sets with deterministic multiplicity representation,
- reference into a deterministic provenance table,
- generator descriptor plus exact range manifest.

The encoding must remain lossless and replay-sufficient.

### 9.5 Compression Layer

Compression may be applied after canonical serialization if and only if:

- canonical bytes are hashed before transport-specific wrapping,
- decompression is deterministic,
- block identity remains defined by uncompressed canonical bytes,
- compression choice is stored in the envelope.

## 10. Frontier Index Model

### 10.1 Purpose

Frontier indexes support selective block retrieval and exact join planning.

### 10.2 Required Index Families

The storage layer must support:

- signature-group index,
- compatibility index,
- bounds-range index,
- block residency index,
- checkpoint membership index.

### 10.3 Signature-Group Index

Maps exact signature groups to block IDs and block-local ranges.

### 10.4 Compatibility Index

Supports exact or conservative retrieval of blocks that can join with a given compatibility signature.

False positives are allowed. False negatives are forbidden.

### 10.5 Bounds-Range Index

Supports retrieval by coarse admissible bound range for queue and pruning prechecks.

### 10.6 Residency Index

Tracks whether a block is:

- resident in hot memory,
- spilled to warm storage,
- compacted into another artifact,
- superseded by a new canonical block,
- only present in checkpoint export.

## 11. Block Manifest Specification

Each block must have a manifest record containing:

- blockId
- contentHash
- schemaVersion
- partitionId
- signatureFamilyId
- stateCount
- byteLength
- payloadEncoding
- compressionCodec
- blockBoundsSummary digest
- integrity status
- parentBlockIds if derived by split or compaction
- supersedesBlockIds if applicable
- checkpointMembershipIds

The manifest is authoritative for discovery and integrity checks. A raw payload without a valid manifest is not a valid frontier block.

## 12. Checkpoint Compatibility

### 12.1 Checkpoint Membership

Every persisted artifact may belong to zero or more checkpoints. Membership must be tracked explicitly.

### 12.2 Minimal Checkpoint Closure

A checkpoint is valid only if its transitive artifact closure is complete.

The closure must include:

- analyzed problem digest,
- all frontier blocks reachable from active indexes,
- active queue descriptors,
- incumbent state,
- threshold snapshots,
- certificates required for replay and resume,
- relaxation records referenced by persisted certificates.

### 12.3 Resume Contract

Resuming from checkpoint must not require reconstructing correctness-critical artifacts from nondeterministic runtime behavior.

## 13. Spill and Reload Semantics

### 13.1 Spill Triggering

The runtime may spill frontier blocks under memory pressure, queue pressure, or checkpointing demand.

### 13.2 Spill Correctness Rules

Spill is legal only if:

- manifest is persisted before block becomes unloadable,
- indexes are updated atomically with respect to visibility,
- content hash and checksum validate,
- any dependent queue descriptors still refer to stable block identity.

### 13.3 Reload Rules

Reload must validate:

- envelope,
- schema version compatibility,
- checksum,
- content hash,
- manifest linkage.

On failure, the block must be treated as unavailable and the checkpoint or solve must enter invalid state until repaired.

## 14. Compaction and Block Rewriting

### 14.1 Allowed Rewrites

Block rewriting is allowed only for:

- merging adjacent homogeneous blocks,
- removing dominated states after certified compaction,
- re-encoding with a different compatible codec,
- checkpoint packaging.

### 14.2 Rewrite Requirements

Every rewrite must:

- produce new block identities,
- preserve exact represented state set unless explicitly certified compaction removes dominated states,
- record lineage in manifests,
- update indexes transactionally.

### 14.3 Certified Compaction

If compaction removes states, it must reference DominanceCert artifacts or equivalent exact proofs. Space-saving compaction without proof is forbidden.

## 15. Transaction Model

### 15.1 Atomic Visibility Requirement

Persisted artifacts that depend on one another must become visible atomically at the logical layer.

This applies to:

- block plus manifest,
- block plus index entry,
- checkpoint manifest plus artifact membership table,
- supersede and compaction rewrites.

### 15.2 Backend Abstraction Rule

Because browser and Node persistence backends differ, the storage abstraction must expose logical transactions even if backend implementation uses staged commits.

### 15.3 Crash Consistency

After crash or interruption, recovery must yield one of two states only:

- last fully committed logical state,
- newer fully committed logical state.

Half-visible logical states are forbidden.

## 16. Integrity and Verification

### 16.1 Integrity Checks

The storage layer must verify:

- checksum integrity,
- content-hash integrity,
- manifest-to-payload linkage,
- reference closure for checkpoints,
- codec compatibility.

### 16.2 Verification Levels

The system must support:

- lightweight integrity check on hot reload,
- full artifact verification on checkpoint import,
- audit verification for offline replay and debugging.

### 16.3 Audit Export

The storage layer must support deterministic audit export containing:

- manifests,
- selected payloads or references,
- integrity reports,
- checkpoint closure graph.

## 17. Browser and Node Backends

### 17.1 Browser Backend

The browser backend must use IndexedDB behind a storage abstraction with:

- logical transactions,
- key-range iteration,
- block streaming or chunked read support,
- background integrity verification hooks.

The optimizer core must not depend on IndexedDB API details.

### 17.2 Node Backend

The Node backend must use filesystem-backed storage with:

- atomic rename or equivalent commit semantics,
- manifest journaling,
- block streaming support,
- deterministic directory layout.

### 17.3 Common Abstraction

Both backends must implement the same logical interfaces for:

- putArtifact
- getArtifact
- commitLogicalTransaction
- scanIndex
- importCheckpoint
- exportCheckpoint
- verifyArtifact

## 18. Schema Evolution

### 18.1 General Rule

Any change affecting serialized payload meaning requires schema version increment.

### 18.2 Compatible Additions

Compatible additions may include:

- optional manifest fields,
- optional summaries,
- new non-required indexes,
- new compression codecs that do not change canonical payload bytes.

### 18.3 Incompatible Changes

Incompatible changes include:

- state key layout changes,
- scalar representation changes,
- provenance encoding semantics changes,
- index semantics changes affecting retrieval completeness.

These require:

- version bump,
- migration plan,
- checkpoint replay compatibility statement.

## 19. Debug and Inspection Formats

### 19.1 Deterministic Text Export

The storage layer must support deterministic text export for:

- manifests,
- block summaries,
- checkpoint closure graphs,
- block lineage.

### 19.2 Non-Canonical Nature

These inspection formats are not canonical persistence formats and must never be used as the sole source for correctness-critical resume.

## 20. Open Design Questions

### 20.1 Columnar Layout Details for Large Sparse Feature Vectors

место требует дополнительного анализа

The high-level requirement is fixed, but the final sparse column encoding strategy depends on measured frontier distributions.

### 20.2 Cross-Checkpoint Deduplicated Artifact Packs

место требует дополнительного анализа

The architecture should likely support deduplicated checkpoint packs, but the exact packaging contract is not yet frozen.

## 21. Accepted Decisions

- Canonical correctness-critical scalar wire representation is exact-decimal-first. General rational form is retained only for verification escape paths where required. See [decision-log.md](./decision-log.md).

## 22. Compliance Checklist

The storage subsystem is compliant only if all answers below are yes.

1. Can every frontier block be serialized and reloaded with zero loss?
2. Are all correctness-relevant artifacts content-addressed and schema-versioned?
3. Can spill and reload occur without altering exact search semantics?
4. Can a checkpoint reconstruct the full correctness-critical artifact closure?
5. Are compaction rewrites lineage-tracked and proof-backed where states are removed?

## 23. Required Follow-On Specifications

This document must be followed by:

1. [Runtime Protocol and Checkpoint Specification](./runtime-protocol-and-checkpoint-specification.md).
2. [Validation and Benchmark Specification](./validation-and-benchmark-specification.md).

These are required before production storage implementation is considered architecturally ready.
