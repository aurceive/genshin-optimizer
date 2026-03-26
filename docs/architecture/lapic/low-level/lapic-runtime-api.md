# lapic runtime Session and Protocol API Specification

## Status

- Draft
- Depends on: [Runtime and Checkpoint Specification](../runtime-and-checkpoints.md)
- Depends on: [Frontier Storage and Codec Specification](../frontier-storage-and-codec.md)
- Depends on: [lapic-storage-api.md](./lapic-storage-api.md)
- Depends on: [lapic-cert-api.md](./lapic-cert-api.md)
- Scope: public package surface for libs/lapic/runtime, including solve session model, solve handle API, work units, worker protocol, checkpoint APIs, and failure model
- Audience: lapic runtime, lapic storage, lapic cert, adapter, app integration, and tooling maintainers

## 1. Purpose

This document freezes the low-level public API surface for `libs/lapic/runtime`.

It refines the runtime architecture into package-level contracts that applications, adapters, storage, and certification can depend on without leaking worker or backend implementation details.

The goal is to define:

- stable public solve session and solve handle contracts,
- work unit and scheduler-facing data shapes,
- worker protocol message families,
- checkpoint import and export interfaces,
- failure and diagnostics stream contracts.

## 2. Package Responsibility Boundary

`lapic runtime` owns:

- solve state machine execution,
- session controller and public solve handle,
- planner and scheduler coordination contracts,
- worker protocol and executor abstraction,
- pause, resume, cancellation, and checkpoint orchestration,
- failure record model,
- progress and diagnostics stream contracts.

`lapic runtime` MUST NOT own:

- canonical IR construction,
- persistence codec implementation,
- certificate schema semantics,
- game-specific adapter translation,
- provider-specific LP configuration.

## 3. Public Surface Model

The public API MUST be organized into stable export families.

The initial export families are:

- `session-model`
- `solve-handle`
- `work-units`
- `worker-protocol`
- `checkpoint-api`
- `failure-model`
- `diagnostics-stream`

## 4. Required Export Families

### 4.1 session-model

The `session-model` surface MUST export:

- public solve state enum,
- optional internal diagnostic state enum,
- session identity type,
- session summary type,
- runtime protocol version descriptor,
- active phase descriptor.

The public solve state enum MUST project the internal runtime state machine into the stable externally observable states defined by [runtime-and-checkpoints.md](../runtime-and-checkpoints.md).

#### 4.1.1 Session Identity Type

The public session identity type MUST include typed fields for at least:

- `sessionId`
- `problemDigest`
- `engineVersion`
- `arithmeticPolicyId`
- `runtimeProtocolVersion`
- `createdAtLogicalTimestamp`

### 4.2 solve-handle

The `solve-handle` surface MUST export:

- public solve handle interface,
- solve request type,
- solve completion result type,
- pause request result type,
- cancel request result type,
- session inspection result type.

#### 4.2.1 Solve Request Configuration

The solve request type MUST support at least the following configuration fields:

- `topN` — number of top candidates to retain,
- `skipIntermediateCertificates` — when true, the executor does not emit BoundPruneCert, DominanceCert, or BranchReachabilityCert during the solve. FinalOptimalityCertificate is always emitted regardless.

The default for `skipIntermediateCertificates` is false (full certificate chain).

#### 4.2.2 Solve Handle Contract

The public solve handle MUST support typed entrypoints corresponding to:

- `subscribeProgress`
- `subscribeDiagnostics`
- `requestPause`
- `requestCheckpoint`
- `requestCancel`
- `exportCheckpoint`
- `awaitCompletion`
- `inspectSessionState`

These entrypoints MUST NOT expose mutable scheduler or storage internals directly.

`inspectSessionState` MAY expose internal diagnostic state detail, but ordinary progress and completion APIs MUST use the projected public solve state.

### 4.3 work-units

The `work-units` surface MUST export:

- work unit kind enum,
- work unit envelope type,
- determinism class enum,
- priority descriptor type,
- retry policy type,
- work result summary type.

The priority descriptor type MUST expose the replay-visible ordering-key material required by [runtime-and-checkpoints.md](../runtime-and-checkpoints.md).

The minimum required work unit kinds are:

- `AnalyzeRegion`
- `BuildFrontierBlock`
- `CompactFrontierBlock`
- `JoinFrontierBlocks`
- `ResolveResidualExact`
- `ValidateCertificate`
- `PersistArtifact`
- `ReloadArtifact`

### 4.4 worker-protocol

The `worker-protocol` surface MUST export:

- worker backend kind enum,
- protocol message tags,
- typed worker request and response payloads,
- executor capability descriptor types,
- protocol validation entrypoints.

The minimum required logical message families are:

- `InitSession`
- `LoadArtifacts`
- `StartWork`
- `PauseAtSafePoint`
- `PublishArtifacts`
- `EmitCertificate`
- `ReportFailure`
- `AcknowledgeCheckpoint`
- `Shutdown`

Concrete transport framing may differ between browser and Node, but the logical message schema MUST be shared.

### 4.5 checkpoint-api

The `checkpoint-api` surface MUST export:

- checkpoint request type,
- checkpoint export descriptor type,
- checkpoint import descriptor type,
- checkpoint completion result type,
- pause-to-checkpoint transition summary type.

Checkpoint APIs MUST be sufficient to export and import full correctness-critical closure through lapic storage abstractions.

The checkpoint API surface MUST distinguish between:

- paused authority boundary reached,
- checkpoint materialization in progress,
- authoritative checkpoint export completed.

### 4.6 failure-model

The `failure-model` surface MUST export:

- failure class enum,
- failure record type,
- failed-session summary type,
- recovery eligibility classification.

The minimum required failure classes are:

- `protocolFailure`
- `storageIntegrityFailure`
- `arithmeticVerificationFailure`
- `providerFailure`
- `workerFailure`
- `schemaCompatibilityFailure`
- `checkpointClosureFailure`

### 4.7 diagnostics-stream

The `diagnostics-stream` surface MUST export:

- progress event type,
- trace event type,
- subscription token type,
- observational counter summary types.

Diagnostics streams MUST be explicitly observational and MUST NOT be the sole source of truth for correctness-critical resume state.

## 5. Cross-Package Dependency Rules

### 5.1 lapic runtime to lapic core

lapic runtime MAY depend on stable lapic core surfaces for:

- canonical problem references,
- work planning inputs,
- partition descriptors,
- threshold snapshot shapes,
- state and region references.

lapic runtime MUST NOT depend on lapic core package-private caches or builder internals.

### 5.2 lapic runtime to lapic storage

lapic runtime MAY depend on:

- artifact store interfaces,
- checkpoint closure APIs,
- manifest models,
- integrity verification entrypoints.

lapic runtime MUST NOT depend on backend-native storage handles.

### 5.3 lapic runtime to lapic cert

lapic runtime MAY depend on:

- certificate publication contracts,
- replay request hooks,
- validation entrypoints,
- final optimality summary models.

lapic runtime MUST NOT depend on provider-specific certification internals.

## 6. Mutability and Ownership Rules

- Public solve handle objects MAY be stateful, but all exposed state transitions MUST be mediated through explicit API calls.
- Session inspection results MUST be snapshots, not mutable live references into scheduler internals.
- Worker protocol payloads MUST be immutable after emission.
- Diagnostics subscribers MUST NOT be able to mutate correctness-relevant runtime state.

## 7. Error Model

The lapic runtime public surface MUST use a structured error model with at least:

- `InvalidStateTransition`
- `ProtocolValidationFailure`
- `CheckpointExportFailure`
- `CheckpointImportFailure`
- `FailureEscalation`
- `ExecutorCapabilityMismatch`
- `InternalBugDetected`

## 8. Determinism Rules

All correctness-critical runtime entrypoints MUST be deterministic with respect to:

- problem digest,
- checkpoint state,
- arithmetic policy,
- runtime protocol version,
- declared executor configuration.

They MUST NOT depend on:

- worker-count-specific race outcomes,
- wall-clock timing,
- browser-only scheduling quirks,
- hidden mutable executor state.

## 9. Forbidden Public API Shapes

The following are forbidden in the lapic runtime public surface:

- public scheduler mutation APIs that bypass the solve state machine,
- raw worker handle exposure as correctness-critical control surfaces,
- checkpoint APIs that export partial correctness closures without explicit failure status,
- diagnostics APIs that mutate runtime legality decisions,
- solve completion APIs whose result meaning depends on environment-specific side effects.

## 10. Versioning Policy

- Breaking semantic changes to session states, protocol messages, or checkpoint result meanings require explicit protocol or package-major version increments.
- Additive observational diagnostics are allowed only when they do not affect correctness-critical interpretation.
- Browser and Node executor implementation changes MUST preserve the same logical protocol schema.

## 11. Initial Package Layout Recommendation

The package MAY organize source files internally as:

- `session-model/`
- `solve-handle/`
- `work-units/`
- `worker-protocol/`
- `checkpoint-api/`
- `failure-model/`
- `diagnostics-stream/`

This internal layout is recommended, not yet mandatory, but the export-family split above is normative.

## 12. Compliance Checklist

Before `lapic runtime` may be treated as a stable dependency for other lapic packages, it MUST demonstrate:

- a stable public solve handle contract,
- protocol-validated worker message families,
- checkpoint export and import contracts independent of backend-native handles,
- deterministic final result invariance under worker-count variation on validation suites,
- no public dependency on provider-specific or backend-native implementation objects.
