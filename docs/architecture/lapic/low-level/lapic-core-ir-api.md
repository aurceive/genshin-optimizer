# lapic core IR API Specification

## Status

- Draft
- Depends on: [lapic Architecture](../overview.md)
- Depends on: [Canonical Optimizer IR Specification](../canonical-ir.md)
- Depends on: [Implementation Roadmap](../implementation-roadmap.md)
- Depends on: [exact-decimal-wire-format.md](./exact-decimal-wire-format.md)
- Scope: public package surface for libs/lapic/core, including canonical problem types, IR builders, validators, deterministic identity utilities, and state-model interfaces
- Audience: lapic core, adapter, runtime, storage, certification, and validation maintainers

## 1. Purpose

This document freezes the low-level public API surface for `libs/lapic/core`.

It refines the canonical IR architecture into package-level contracts that other packages may depend on.

The goal is to define:

- which exports are public and stable,
- which concerns belong inside lapic core,
- which object identities and registries must be shared across packages,
- which interfaces adapters, runtime, storage, and certification are allowed to consume.

## 2. Package Responsibility Boundary

`lapic core` owns:

- canonical problem model types,
- F-IR and A-IR construction,
- S-IR state model definitions,
- deterministic hashing and content identity utilities,
- exact-encoding abstraction interfaces used by core IR types,
- region decomposition scaffolding,
- non-provider-specific bound scaffolding and search primitives.

`lapic core` MUST NOT own:

- persistence codecs and storage envelopes,
- certificate persistence or replay execution,
- runtime worker orchestration,
- game-specific adapter semantics,
- provider-specific LP evidence payloads.

## 3. Public Surface Model

The public API MUST be organized into stable export families.

The initial export families are:

- `problem`
- `fir`
- `air`
- `sir`
- `identity`
- `schema`
- `validate`
- `analysis`
- `search-primitives`

No public export may leak package-private mutable caches or backend-specific objects.

## 4. Required Export Families

### 4.1 problem

The `problem` surface MUST export:

- canonical problem model types,
- canonical problem builder input types,
- problem normalization result type,
- problem digest function,
- problem validation function.

Where potential-aware optimization is supported, this surface MUST also export the canonical types needed to describe upgrade-capable candidates, potential-aware solve mode, and canonical graph-capable auxiliary output descriptors.

#### 4.1.1 Canonical Problem Type

The canonical problem type MUST include typed fields for at least:

- `problemId`
- `engineVersion`
- `arithmeticPolicyId`
- `itemDomains`
- `compatibilityRules`
- `objective`
- `constraints`
- `topN`
- `orderingPolicy`
- `auxiliaryOutputs`
- `adapterMetadata`

The public type MAY use readonly collections or immutable wrappers, but logical mutability after normalization is forbidden.

#### 4.1.2 Problem Builder Contract

The builder surface MUST separate:

- raw adapter input assembly,
- normalization,
- validation,
- digest computation.

`normalizeCanonicalProblem(input)` MUST NOT depend on runtime scheduling, ambient locale, or insertion order.

### 4.2 fir

The `fir` surface MUST export:

- F-IR node types,
- operator kind enums or tagged unions,
- domain descriptor types,
- F-IR graph type,
- canonical F-IR builder,
- F-IR validator,
- semantic hash function.

#### 4.2.1 F-IR Builder Contract

The F-IR builder MUST:

- accept a validated canonical problem,
- emit deterministic node identities,
- reject forbidden F-IR forms,
- use schema-versioned hashing,
- expose validation errors as structured diagnostics.

### 4.3 air

The `air` surface MUST export:

- annotation family types,
- region descriptor types,
- dependency slice types,
- analyzed graph type,
- A-IR analysis entrypoint,
- A-IR validator.

The A-IR API MUST make analysis facts explicit data, not implicit properties hidden behind mutable analysis caches.

### 4.4 sir

The `sir` surface MUST export:

- S-IR state type,
- state layout descriptor,
- exact signature group key type,
- compatibility signature type,
- dominance projection types,
- potential frontier descriptor types,
- potential summary descriptor types,
- provenance handle types,
- state validator,
- exact comparison helpers required by state identity.

#### 4.4.1 S-IR Construction Contract

The S-IR surface MUST provide typed construction entrypoints that derive states from:

- canonical item-domain partitions,
- analyzed dependency slices,
- explicit state layout definitions.

Construction entrypoints MUST NOT require direct access to storage, runtime workers, or certificate objects.

#### 4.4.2 Compatibility Signature Contract

The compatibility signature type MUST be expressive enough for team-level joins.

It MUST expose typed fields covering at least:

- occupied slot mask,
- logical actor uniqueness claims,
- exclusive resource claims,
- reservation class for each exclusive resource claim,
- categorical aggregate counts,
- remaining categorical obligations,
- provided capability facts,
- remaining required capability facts,
- frame-axis identity,
- adapter semantic mode.

The exact signature group key type MUST be derivable from a compatibility signature plus other state-local exact discrete data without consulting adapter-private code.

Potential-aware state payloads MUST distinguish between:

- current realized value inputs,
- upgrade-frontier descriptors used only for auxiliary outputs,
- upgrade-frontier or potential-envelope descriptors that participate in legality or ordering.

No core API may silently treat a diagnostic-only potential descriptor as ranking-relevant state.

### 4.5 identity

The `identity` surface MUST export:

- deterministic content hash interfaces,
- canonical byte digest helpers,
- schema-tagged identity constructors,
- comparable key derivation helpers where exact ordering requires them.

All identity helpers used across packages MUST be imported from this surface rather than reimplemented independently.

### 4.6 schema

The `schema` surface MUST export:

- artifact kind registry for core-owned artifacts,
- schema version constants,
- schema compatibility descriptors,
- field classification enums needed by core types.

The schema registry is normative for other packages that consume lapic core artifacts.

### 4.7 validate

The `validate` surface MUST export structured validators for:

- canonical problem,
- F-IR,
- A-IR,
- S-IR,
- state layout descriptors,
- core-owned hashes and IDs where structural validation applies.

Where potential-aware optimization is supported, validators MUST also cover upgrade-frontier descriptor legality, potential-aware ordering participation, and graph-capable auxiliary-output request legality.

Validation MUST return machine-readable diagnostics, not only thrown exceptions.

### 4.8 analysis

The `analysis` surface MUST export:

- monotonicity queries,
- curvature queries,
- dependency slice queries,
- region decomposition queries,
- exact bound query interfaces where derived from core analysis.

These queries MAY be backed by precomputed A-IR annotations, but the exported interface must remain deterministic and side-effect free.

### 4.9 search-primitives

The `search-primitives` surface MUST export only provider-agnostic search building blocks needed by runtime and certification coordination, such as:

- partition descriptors,
- frontier ordering key types,
- threshold snapshot types,
- state expansion request and response types,
- non-provider-specific bound result shapes.

Full scheduler orchestration or worker protocol objects are forbidden here.

## 5. Mutability and Ownership Rules

- Public IR objects MUST be logically immutable after successful construction.
- Builder-internal mutation is allowed only before publication of the resulting object.
- Public APIs MUST distinguish owned objects from borrowed views if zero-copy optimization is introduced later.
- Public APIs MUST NOT expose mutable arrays whose modification would invalidate canonical identity.

## 6. Error Model

The lapic core public surface MUST use a structured error model with at least:

- `SchemaViolation`
- `NormalizationFailure`
- `UnsupportedOperator`
- `InvariantViolation`
- `DeterminismViolation`
- `InternalBugDetected`

Validation-oriented entrypoints SHOULD return diagnostics collections.

Construction-oriented entrypoints MAY throw only typed errors or return typed failure results.

## 7. Determinism Rules

Every public construction entrypoint in lapic core MUST be deterministic with respect to:

- canonical input payload,
- schema version,
- arithmetic policy,
- explicit builder configuration.

It MUST NOT depend on:

- object insertion order from unordered maps,
- runtime clock,
- random seed unless explicitly provided and included in the input contract,
- browser-specific behavior.

## 8. Exact-Encoding Abstraction Boundary

lapic core MUST depend only on abstract scalar encoding interfaces, not on storage envelopes.

The minimum required scalar abstraction exports are:

- `CanonicalScalarKind`
- `CanonicalDecimalValue`
- `VerificationRationalValue`
- exact comparison interfaces,
- normalization interfaces,
- canonical payload derivation interfaces for core-owned identities.

The concrete byte-level format is frozen by [exact-decimal-wire-format.md](./exact-decimal-wire-format.md), but storage framing remains outside lapic core.

## 9. Cross-Package Dependency Rules

### 9.1 Adapters to lapic core

Adapter packages MAY depend on:

- `problem`
- `fir`
- `schema`
- `validate`

Adapter packages MUST NOT depend on package-private analysis or search internals.

### 9.2 lapic cert to lapic core

lapic cert MAY depend on:

- canonical IDs,
- S-IR state references,
- region descriptors,
- core schema registry values,
- threshold snapshot and bound result shapes shared for certificate assembly.

lapic core MUST NOT depend back on lapic cert.

### 9.3 lapic storage to lapic core

lapic storage MAY depend on:

- state layout descriptors,
- canonical identity helpers,
- schema version constants,
- scalar abstraction interfaces.

lapic core MUST NOT depend on storage envelope types.

### 9.4 lapic runtime to lapic core

lapic runtime MAY depend on all stable public export families, but runtime-specific worker messages remain outside lapic core.

## 10. Forbidden Public API Shapes

The following are forbidden in the lapic core public surface:

- callbacks that expose mutable internal IR graphs,
- public methods returning provider-specific LP objects,
- public methods requiring IndexedDB, Node filesystem, or worker handles,
- implicit global registries whose contents change by import side effect,
- APIs whose correctness depends on debug-only assertions being enabled.

## 11. Versioning Policy

- Breaking semantic changes to public core types require an explicit schema or package-major version increment.
- Additive optional fields are allowed only when validators and digest rules remain unambiguous.
- Deprecated public exports MUST remain supported for at least one documented migration window once implementation begins.

## 12. Initial Package Layout Recommendation

The package MAY organize source files internally as:

- `problem/`
- `fir/`
- `air/`
- `sir/`
- `identity/`
- `schema/`
- `validate/`
- `analysis/`
- `search-primitives/`

This internal layout is recommended, not yet mandatory, but the export-family split above is normative.

## 13. Compliance Checklist

Before `lapic core` may be treated as a stable dependency for other lapic packages, it MUST demonstrate:

- deterministic canonical problem normalization,
- deterministic F-IR construction from identical canonical problems,
- machine-readable validators for canonical problem, F-IR, A-IR, and S-IR,
- stable cross-package identity helpers,
- no public dependency on storage, runtime, adapter, or provider-specific implementation objects.
