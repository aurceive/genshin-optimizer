# lapic storage Persistence API Specification

## Status

- Draft
- Depends on: [Frontier Storage and Codec Specification](../frontier-storage-and-codec.md)
- Depends on: [Canonical Optimizer IR Specification](../canonical-ir.md)
- Depends on: [exact-decimal-wire-format.md](./exact-decimal-wire-format.md)
- Scope: public package surface for libs/lapic/storage, including artifact envelopes, block codecs, manifests, storage backends, checkpoint closures, and integrity tooling contracts
- Audience: lapic storage, lapic runtime, lapic cert, lapic core, and tooling maintainers

## 1. Purpose

This document freezes the low-level public API surface for `libs/lapic/storage`.

It refines the storage architecture into package-level contracts that runtime, certification, and tooling may depend on without reaching into backend-specific internals.

The goal is to define:

- stable public storage data types,
- artifact envelope and manifest interfaces,
- backend abstraction contracts,
- checkpoint closure interfaces,
- integrity verification entrypoints.

## 2. Package Responsibility Boundary

`lapic storage` owns:

- canonical artifact envelope encoding and decoding,
- frontier block and index codec interfaces,
- block manifest and lineage model,
- warm-tier and cold-tier storage abstractions,
- checkpoint closure inventory model,
- artifact integrity verification and scan helpers,
- deterministic debug export framing for persisted artifacts.

`lapic storage` MUST NOT own:

- canonical IR construction,
- certificate replay logic,
- runtime scheduler policy,
- game-specific adapter semantics,
- provider-specific LP invocation.

## 3. Public Surface Model

The public API MUST be organized into stable export families.

The initial export families are:

- `artifact-envelope`
- `block-codec`
- `manifest-model`
- `artifact-store`
- `checkpoint-closure`
- `integrity`
- `debug-export`

## 4. Required Export Families

### 4.1 artifact-envelope

The `artifact-envelope` surface MUST export:

- artifact kind tags,
- storage envelope type,
- payload encoding descriptors,
- content hash metadata types,
- checksum metadata types,
- canonical encode and decode entrypoints.

#### 4.1.1 Storage Envelope Type

The public envelope type MUST include typed fields for at least:

- `artifactKind`
- `schemaVersion`
- `payloadEncoding`
- `payloadLength`
- `contentHash`
- `checksum`
- `compressionCodec`
- `creationEngineVersion`
- `arithmeticPolicyId`
- `dependencyDigestSet`

### 4.2 block-codec

The `block-codec` surface MUST export:

- frontier block type,
- frontier index type,
- block layout descriptor types,
- encode and decode interfaces for blocks and indexes,
- row and columnar logical layout descriptors,
- state-order descriptor types.

The public codec surface MAY expose multiple concrete codec implementations, but each MUST conform to the same canonical payload contract.

### 4.3 manifest-model

The `manifest-model` surface MUST export:

- block manifest type,
- checkpoint manifest type,
- artifact reference type,
- supersession and lineage descriptor types,
- closure inventory type.

Manifest APIs MUST support deterministic lineage reasoning without requiring backend-specific path knowledge.

### 4.4 artifact-store

The `artifact-store` surface MUST export:

- logical block store interface,
- logical manifest store interface,
- artifact read request and result types,
- artifact write request and commit result types,
- logical transaction or staged-commit abstraction,
- backend capability descriptor types.

#### 4.4.1 Backend Contract

The backend abstraction MUST support:

- browser IndexedDB implementation,
- Node filesystem implementation,
- deterministic in-memory test implementation.

The public interface MUST hide backend-specific handles such as IndexedDB transactions or raw filesystem descriptors.

### 4.5 checkpoint-closure

The `checkpoint-closure` surface MUST export:

- checkpoint closure inventory type,
- closure materialization request type,
- closure verification result type,
- closure export descriptor type,
- closure import descriptor type.

Checkpoint closure APIs MUST be sufficient to prove that a checkpoint can be resumed or replayed without runtime-only references.

### 4.6 integrity

The `integrity` surface MUST export:

- artifact integrity scan request type,
- scan result type,
- corruption classification enum,
- deterministic repair recommendation summary type,
- manifest-to-payload verification helpers.

Integrity APIs MAY diagnose problems, but they MUST NOT mutate artifacts implicitly during validation.

### 4.7 debug-export

The `debug-export` surface MUST export:

- deterministic debug export request type,
- debug artifact summary type,
- non-canonical inspection payload descriptor types.

Debug exports MUST be explicitly classified as non-canonical and MUST NOT be usable as correctness-critical persistence.

## 5. Cross-Package Dependency Rules

### 5.1 lapic storage to lapic core

lapic storage MAY depend on:

- state layout descriptors,
- canonical identity helpers,
- schema constants,
- scalar abstraction interfaces.

lapic storage MUST NOT depend on lapic core builder internals.

### 5.2 lapic runtime to lapic storage

lapic runtime MAY depend on:

- artifact store interfaces,
- checkpoint closure APIs,
- integrity verification entrypoints,
- manifest models.

lapic storage MUST NOT depend on runtime worker protocol messages.

### 5.3 lapic cert to lapic storage

lapic cert MAY depend on:

- certificate and relaxation record artifact references,
- evidence retention descriptors,
- checkpoint closure inventory interfaces.

lapic storage MUST NOT depend on certificate replay execution.

## 6. Mutability and Ownership Rules

- Public persisted artifact objects MUST be logically immutable after encode or decode completion.
- Store interfaces MUST make commit boundaries explicit.
- Public APIs MUST distinguish logical artifact identity from backend location.
- No public API may expose mutable backend-resident cursors whose mutation changes correctness-relevant state silently.

## 7. Error Model

The lapic storage public surface MUST use a structured error model with at least:

- `EnvelopeSchemaViolation`
- `CodecSchemaViolation`
- `IntegrityFailure`
- `ManifestClosureFailure`
- `BackendCapabilityMismatch`
- `ArtifactNotFound`
- `InternalBugDetected`

## 8. Determinism Rules

All canonical encode, decode, manifest, and integrity entrypoints MUST be deterministic with respect to:

- logical artifact payload,
- schema version,
- arithmetic policy,
- declared codec configuration.

They MUST NOT depend on:

- filesystem enumeration order,
- IndexedDB key iteration quirks,
- wall-clock timestamps,
- backend-specific opaque object identity.

## 9. Forbidden Public API Shapes

The following are forbidden in the lapic storage public surface:

- APIs that accept or return raw IndexedDB transaction handles,
- APIs that require Node filesystem paths as the primary logical artifact identity,
- envelope decoders that silently coerce corrupted payloads,
- manifest APIs that rely on mutable global registries populated by import side effect,
- checkpoint closure APIs that require live runtime memory to complete verification.

## 10. Versioning Policy

- Breaking semantic changes to artifact envelopes, manifests, or checkpoint closure meaning require explicit schema or package-major version increments.
- Additive metadata fields are allowed only when canonical payload meaning remains unambiguous.
- Backend implementation changes MUST NOT change canonical artifact bytes.

## 11. Initial Package Layout Recommendation

The package MAY organize source files internally as:

- `artifact-envelope/`
- `block-codec/`
- `manifest-model/`
- `artifact-store/`
- `checkpoint-closure/`
- `integrity/`
- `debug-export/`

This internal layout is recommended, not yet mandatory, but the export-family split above is normative.

## 12. Compliance Checklist

Before `lapic storage` may be treated as a stable dependency for other lapic packages, it MUST demonstrate:

- lossless frontier block round-trip on governed fixtures,
- deterministic manifest lineage behavior,
- backend-independent logical artifact identity,
- checkpoint closure verification without runtime-only references,
- no public dependency on backend-native handles or runtime internals.
