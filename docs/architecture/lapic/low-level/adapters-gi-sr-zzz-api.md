# GI, SR, and ZZZ Adapter Package API Specification

## Status

- Draft
- Depends on: [Adapter Specification for GI, SR, and ZZZ](../adapters-gi-sr-zzz.md)
- Depends on: [Canonical Optimizer IR Specification](../canonical-ir.md)
- Depends on: [lapic-core-ir-api.md](./lapic-core-ir-api.md)
- Depends on: [Implementation Roadmap](../implementation-roadmap.md)
- Scope: public package surfaces for libs/gi/lapic-adapter, libs/sr/lapic-adapter, and libs/zzz/lapic-adapter, including request models, canonical problem export, snapshot metadata, capability reporting, and validation hooks
- Audience: adapter, lapic core, frontend, validation, and migration maintainers

## 1. Purpose

This document freezes the low-level public API surfaces for the lapic game adapter packages.

It refines the high-level adapter architecture into package-level contracts that frontend entrypoints, migration tooling, validation, and lapic core can depend on.

The goal is to define:

- the stable public surface shared by GI, SR, and ZZZ adapters,
- the game-specific extension surfaces allowed for each package,
- capability and unsupported-feature reporting,
- canonical problem export contracts,
- validation and replay reconstruction interfaces.

## 2. Package Responsibility Boundary

Each adapter package owns:

- game-specific request normalization,
- candidate extraction from game-local records,
- formula detachment or direct canonical construction,
- canonical problem export,
- source snapshot digest production,
- capability declaration and unsupported-feature reporting,
- adapter-local validation fixtures and golden-case helpers.

Adapter packages MUST NOT own:

- lapic core IR internals,
- runtime session orchestration,
- certificate replay execution,
- storage envelope or checkpoint codec implementation,
- cross-game shared canonical semantics outside the canonical problem API.

## 3. Package Set

This specification applies to:

- `libs/gi/lapic-adapter`
- `libs/sr/lapic-adapter`
- `libs/zzz/lapic-adapter`

All three packages MUST implement a common adapter surface shape, even where game-specific extension payloads differ.

## 4. Public Surface Model

The public API of each adapter package MUST be organized into stable export families.

The initial export families are:

- `request-model`
- `capabilities`
- `canonical-export`
- `snapshot-model`
- `validation-hooks`
- `game-extensions`

## 5. Required Export Families

### 5.1 request-model

The `request-model` surface MUST export:

- typed optimize request model,
- typed target-entity descriptor model,
- typed objective and ordering request model,
- typed hard-filter and exclusion model,
- typed auxiliary output request model,
- request normalization entrypoint.

#### 5.1.1 Common Request Fields

Every adapter request type MUST provide logical fields covering at least:

- optimize target entity descriptor,
- game-specific formula context,
- candidate domains by slot,
- hard filters and exclusions,
- objective definition,
- top-N and ordering policy,
- optional auxiliary outputs,
- runtime preference hints that do not affect correctness.

The normalized request MUST be deterministic under identical input payload.

### 5.2 capabilities

The `capabilities` surface MUST export:

- adapter capability descriptor type,
- unsupported feature descriptor type,
- explicit feature-flag classification enum,
- legacy-compatibility mode descriptor where relevant.

#### 5.2.1 Capability Contract

Every adapter package MUST provide a typed capabilities query that can answer at least:

- supported formula compilation modes,
- supported auxiliary output modes,
- supported candidate domain classes,
- supported legacy compatibility paths,
- explicitly unsupported semantics.

### 5.3 canonical-export

The `canonical-export` surface MUST export:

- canonical problem export result type,
- adapter metadata type,
- candidate export type,
- canonical export entrypoint,
- explicit unsupported-feature failure result type.

#### 5.3.1 Canonical Export Result

The export result type MUST include typed fields for at least:

- `canonicalProblem`
- `canonicalProblemDigest`
- `adapterKind`
- `adapterVersion`
- `sourceSnapshotDigestSet`
- `formulaCompilationMode`
- `featureSchemaVersion`
- `filterTransformationLog`
- `unsupportedFeatureList`
- `replayReconstructionHints`

The export result MUST NOT depend on lapic runtime or lapic storage objects.

#### 5.3.2 Candidate Export Contract

Every adapter package MUST export a candidate representation containing at least:

- `candidateId`
- `sourceRecordDigest`
- `slotOrDomainAssignment`
- `additiveFeatureVector`
- `discreteCounters`
- `categoricalSignature`
- `provenancePayload`

### 5.4 snapshot-model

The `snapshot-model` surface MUST export:

- source snapshot digest set type,
- replay reconstruction hint type,
- snapshot export descriptor type,
- snapshot packaging policy descriptor type.

#### 5.4.1 Required Snapshot Digests

Every adapter package MUST expose snapshot digest fields covering at least:

- item inventory snapshot,
- entity or team state snapshot,
- formula data snapshot,
- stat table snapshot,
- adapter version.

### 5.5 validation-hooks

The `validation-hooks` surface MUST export:

- golden-case registry entry type,
- bounded differential-test request type,
- adapter validation summary type,
- candidate reconstruction check helper,
- canonical export parity helper.

These hooks may be test-facing, but their data shapes are part of the stable adapter contract.

### 5.6 game-extensions

The `game-extensions` surface MAY export game-specific typed request fragments and metadata types, but only when they terminate at adapter boundary and do not leak into lapic core.

Game-extension exports MUST be explicitly namespaced by game package.

## 6. Cross-Package Dependency Rules

### 6.1 Adapters to lapic core

Adapter packages MAY depend on:

- canonical problem model types,
- F-IR-facing canonical operator definitions where direct canonical construction is used,
- schema and validation entrypoints,
- deterministic identity helpers.

Adapter packages MUST NOT depend on lapic core package-private analysis or search internals.

### 6.2 Adapters to runtime, storage, and certification

Adapter packages MUST NOT depend directly on:

- runtime solve session objects,
- storage envelope or backend abstractions,
- certificate replay internals.

They MAY depend on shared validation data shapes only where explicitly surfaced through stable package contracts.

## 7. Common Error Model

Every adapter package MUST use a structured error model with at least:

- `RequestNormalizationFailure`
- `UnsupportedFeatureFailure`
- `SnapshotDigestFailure`
- `FormulaDetachmentFailure`
- `CandidateExtractionFailure`
- `SemanticParityFailure`
- `InternalBugDetected`

Silent downgrades or heuristic coercions are forbidden.

## 8. Determinism Rules

All public adapter entrypoints that affect canonical export MUST be deterministic with respect to:

- normalized request payload,
- source snapshot payload,
- adapter version,
- feature schema version,
- explicit formula compilation mode.

They MUST NOT depend on:

- runtime scheduling,
- object insertion order from unordered collections,
- local wall-clock time,
- frontend-only mutable UI state not present in the request contract.

## 9. GI Adapter Surface

### 9.1 Additional Export Requirements

`libs/gi/lapic-adapter` MUST additionally export:

- GI optimization frame descriptor types,
- GI set-rule and rainbow-exclusion request fragments,
- GI legacy compatibility mode descriptor,
- GI canonical Pando mode descriptor,
- GI TC sub-family request and export types if exposed through the same package.

### 9.2 GI Dual-Path Contract

The GI adapter public surface MUST make the mode explicit:

- `legacyWaveriderCompatibility`
- `canonicalPando`

No implicit mode switching is allowed.

### 9.3 GI TC Boundary

If GI TC support is surfaced through the same package, its API MUST be explicitly partitioned as a separate sub-family with its own request and canonical-export types.

## 10. SR Adapter Surface

### 10.1 Additional Export Requirements

`libs/sr/lapic-adapter` MUST additionally export:

- relic and light-cone request fragments,
- cavern and planar set-filter request fragments,
- SR frame composition metadata types,
- Pando-detachment mode descriptor.

### 10.2 SR Simplification Rule

The SR adapter surface SHOULD remain single-path unless a second formula family is introduced. No legacy compatibility multiplexing should be invented without explicit need.

## 11. ZZZ Adapter Surface

### 11.1 Additional Export Requirements

`libs/zzz/lapic-adapter` MUST additionally export:

- disc and wengine request fragments,
- slot taxonomy descriptor types,
- ZZZ frame composition metadata types,
- Pando-detachment mode descriptor.

### 11.2 ZZZ Extension Rule

ZZZ-specific request fragments MAY evolve, but all ranking semantics and hard-filter semantics must still collapse into the shared canonical export contract.

## 12. Forbidden Public API Shapes

The following are forbidden in adapter package public surfaces:

- exporting game-local formula graph internals as part of canonical export contract,
- returning lapic runtime session handles from canonical export entrypoints,
- implicit feature omission on unsupported semantics,
- request shapes whose correctness depends on frontend component state not serialized into the request,
- cross-game shared enums that silently encode game-specific meaning differently per package.

## 13. Versioning Policy

- Breaking semantic changes to normalized request meaning or canonical export metadata require explicit package-major or schema version transition.
- Additive request fields are allowed only when omission preserves exact previous behavior.
- Changing snapshot digest composition requires adapter version transition and must change canonical problem digest.

## 14. Initial Package Layout Recommendation

Each adapter package MAY organize source files internally as:

- `request-model/`
- `capabilities/`
- `canonical-export/`
- `snapshot-model/`
- `validation-hooks/`
- `game-extensions/`

This internal layout is recommended, not yet mandatory, but the export-family split above is normative.

## 15. Compliance Checklist

Before an adapter package may be treated as a stable dependency for lapic integration, it MUST demonstrate:

- deterministic request normalization,
- canonical export with explicit source snapshot digests,
- explicit unsupported-feature failure paths,
- no leakage of game-specific semantics beyond the adapter boundary,
- validation-hook coverage sufficient for parity and reconstruction testing.
