# lapic cert Certificate API and Replay Payload Specification

## Status

- Draft
- Depends on: [Relaxation and Certificate System Specification](../relaxation-and-certificates.md)
- Depends on: [Canonical Optimizer IR Specification](../canonical-ir.md)
- Depends on: [Runtime and Checkpoint Specification](../runtime-and-checkpoints.md)
- Depends on: [highs-evidence-and-deterministic-config.md](./highs-evidence-and-deterministic-config.md)
- Depends on: [exact-decimal-wire-format.md](./exact-decimal-wire-format.md)
- Scope: public package surface for libs/lapic/cert, including certificate types, evidence references, replay requests, replay results, and validation APIs
- Audience: lapic cert, lapic core, lapic runtime, lapic storage, validation, and audit maintainers

## 1. Purpose

This document freezes the low-level public API surface for `libs/lapic/cert`.

It refines the certificate and replay architecture into package-level contracts that runtime, storage, and validation may depend on.

The goal is to define:

- stable public certificate data types,
- evidence and replay payload interfaces,
- replay execution request and result types,
- validator and auditor entrypoints,
- forbidden couplings between certification and runtime or storage internals.

## 2. Package Responsibility Boundary

`lapic cert` owns:

- certificate public data model,
- evidence reference model,
- replay recipe model,
- certificate validators,
- replay request and result types,
- replay orchestration interfaces,
- final optimality summary model,
- certificate audit helpers.

`lapic cert` MUST NOT own:

- canonical IR construction,
- provider-specific solver implementations,
- persistence envelopes and block codecs,
- runtime worker scheduling,
- adapter-layer game semantics.

## 3. Public Surface Model

The public API MUST be organized into stable export families.

The initial export families are:

- `certificate-model`
- `evidence-model`
- `replay-model`
- `validate`
- `audit`
- `provider-bridge`

## 4. Required Export Families

### 4.1 certificate-model

The `certificate-model` surface MUST export:

- base certificate type,
- certificate kind tags,
- per-kind typed payloads,
- validation status enum,
- final optimality summary type,
- threshold-sensitive decision metadata type.

#### 4.1.1 Base Certificate Type

The base certificate type MUST contain typed fields for at least:

- `certId`
- `certKind`
- `schemaVersion`
- `problemId`
- `arithmeticPolicyId`
- `decisionClass`
- `referencedStateIds`
- `referencedBlockIds`
- `referencedRegionIds`
- `referencedRelaxIds`
- `incumbentDigest`
- `evidenceDigest`
- `replayRecipe`
- `emittedAtStep`
- `validationStatus`

The public surface MAY express some fields as optional depending on certificate kind, but omission rules MUST be explicit in typed per-kind payloads.

#### 4.1.2 Required Certificate Kinds

The public package surface MUST include typed models for:

- `BranchReachabilityCert`
- `InfeasibilityCert`
- `BoundPruneCert`
- `DominanceCert`
- `FinalOptimalityCert`

### 4.2 evidence-model

The `evidence-model` surface MUST export:

- evidence digest reference type,
- evidence bundle manifest type,
- evidence source classification enum,
- threshold snapshot type,
- danger-zone handling record type,
- provider evidence reference types.

#### 4.2.1 Evidence Source Classes

The minimum required evidence source classes are:

- `exactSymbolic`
- `exactCategorical`
- `relaxationDerived`
- `providerDerived`
- `verificationReplay`

### 4.3 replay-model

The `replay-model` surface MUST export:

- replay recipe type,
- replay request type,
- replay mode enum,
- replay environment descriptor,
- replay result type,
- replay mismatch type,
- replay verdict enum.

#### 4.3.1 Replay Recipe Contract

The replay recipe type MUST contain typed fields for at least:

- `requiredIrObjects`
- `requiredRegionPredicates`
- `arithmeticMode`
- `replayPathKind`
- `exactComparisonRule`
- `expectedVerdict`

#### 4.3.2 Replay Request Contract

The replay request type MUST support:

- single-certificate replay,
- block-level replay,
- full solve replay summary.

It MUST NOT require direct access to runtime worker handles or process-local provider memory.

#### 4.3.3 Replay Result Contract

The replay result type MUST contain:

- `reproducedVerdict`
- `validationOutcome`
- `arithmeticModeUsed`
- `mismatchExplanation`
- `referencedEvidenceDigests`
- `providerPathUsed`
- `exactReplayInvoked`

### 4.4 validate

The `validate` surface MUST export structured validators for:

- base certificates,
- per-kind certificate payloads,
- replay recipes,
- evidence bundle manifests,
- final optimality summaries.

Validation MUST return machine-readable diagnostics, not only boolean success or thrown exceptions.

### 4.5 audit

The `audit` surface MUST export:

- certificate summary generation,
- final optimality roll-up helpers,
- threshold-sensitive decision counters,
- replay coverage summary helpers,
- diagnostic mismatch summarizers.

These helpers MUST be deterministic and side-effect free.

### 4.6 provider-bridge

The `provider-bridge` surface MUST export only provider-agnostic interfaces needed to incorporate provider evidence into certificates, such as:

- provider evidence descriptor type,
- deterministic profile descriptor type,
- evidence serialization contract,
- provider replay eligibility classification.

It MUST NOT expose concrete HiGHS runtime objects or solver invocation APIs.

## 5. Per-Kind Payload Requirements

### 5.1 BranchReachabilityCert

The typed payload MUST include:

- branch predicate reference,
- exact variable bounds or contradiction witness,
- selected or rejected branch arm,
- validity region reference.

### 5.2 InfeasibilityCert

The typed payload MUST include:

- infeasibility evidence source class,
- contradiction or witness reference,
- affected state or block scope,
- replay path requirement.

### 5.3 BoundPruneCert

The typed payload MUST include:

- upper bound payload,
- threshold snapshot reference,
- tie-break exclusion proof if relevant,
- relaxation validity domain,
- numeric diagnostics reference,
- danger-zone handling record.

### 5.4 DominanceCert

The typed payload MUST include:

- dominating state reference,
- dominated state reference,
- signature group key,
- compatibility inclusion proof,
- monotone projection comparison summary,
- upper-bound profile comparison summary,
- certificate-context strength comparison.

### 5.5 FinalOptimalityCert

The typed payload MUST include:

- final incumbent set digest,
- unresolved queue exhaustion or prune summary,
- threshold-sensitive prune count and digest summary,
- escalated replay status summary,
- stable-order completeness proof reference.

## 6. Evidence Digest Rules

- `evidenceDigest` MUST be a content hash over all decision-relevant evidence references named by the certificate.
- Changing any evidence reference that affects legality MUST change `evidenceDigest`.
- Human-readable logs MAY be attached as diagnostics, but they MUST NOT be the sole evidence payload for a certificate.

## 7. Mutability and Ownership Rules

- Public certificate objects MUST be logically immutable after publication.
- Replay results MUST be append-only summaries, not mutable live handles.
- Public APIs MUST distinguish between embedded evidence summaries and referenced evidence digests.
- A certificate object MUST NOT embed mutable provider workspace state.

## 8. Error Model

The lapic cert public surface MUST use a structured error model with at least:

- `CertificateSchemaViolation`
- `ReplayRecipeViolation`
- `EvidenceResolutionFailure`
- `ReplayMismatchDetected`
- `ArithmeticVerificationFailure`
- `DeterminismViolation`
- `InternalBugDetected`

## 9. Cross-Package Dependency Rules

### 9.1 lapic cert to lapic core

lapic cert MAY depend on:

- canonical IDs,
- S-IR and region references,
- threshold snapshot shapes,
- relaxation references,
- arithmetic policy descriptors.

lapic cert MUST NOT require direct mutation of lapic core IR objects.

### 9.2 lapic runtime to lapic cert

lapic runtime MAY depend on:

- replay request and result types,
- certificate validation entrypoints,
- certificate publication contracts,
- audit summaries for progress and completion reports.

lapic cert MUST NOT depend on runtime worker protocol messages.

### 9.3 lapic storage to lapic cert

lapic storage MAY depend on:

- certificate schema version constants,
- evidence manifest descriptors,
- replay payload framing interfaces.

lapic cert MUST NOT depend on storage envelope implementations.

## 10. Determinism Rules

All public certificate assembly and replay entrypoints MUST be deterministic with respect to:

- certificate payload,
- referenced evidence digests,
- schema versions,
- arithmetic mode,
- declared replay environment.

They MUST NOT depend on:

- scheduling order,
- runtime clock,
- hidden provider state,
- browser-only APIs.

## 11. Forbidden Public API Shapes

The following are forbidden in the lapic cert public surface:

- APIs that require a live provider object with opaque mutable state,
- certificate constructors that silently invent missing evidence,
- replay APIs that execute arbitrary embedded code,
- public methods returning runtime worker handles or storage transactions,
- certificate validators that require debug-only assertions for soundness.

## 12. Versioning Policy

- Breaking semantic changes to certificate payload meaning require an explicit schema or package-major version increment.
- Adding optional diagnostic fields is allowed only when omission remains unambiguous for replay legality.
- Replay result schema changes that affect audit comparability require explicit version transition.

## 13. Initial Package Layout Recommendation

The package MAY organize source files internally as:

- `certificate-model/`
- `evidence-model/`
- `replay-model/`
- `validate/`
- `audit/`
- `provider-bridge/`

This internal layout is recommended, not yet mandatory, but the export-family split above is normative.

## 14. Compliance Checklist

Before `lapic cert` may be treated as a stable dependency for other lapic packages, it MUST demonstrate:

- typed models for all required certificate kinds,
- stable replay request and result contracts,
- machine-readable validators for certificates and replay recipes,
- evidence-digest stability across identical payload sets,
- no public dependency on runtime worker internals, storage envelopes, or live provider objects.
