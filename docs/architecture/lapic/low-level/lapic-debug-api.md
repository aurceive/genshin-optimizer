# lapic debug Inspection and Audit API Specification

## Status

- Draft
- Depends on: [lapic-storage-api.md](./lapic-storage-api.md)
- Depends on: [lapic-runtime-api.md](./lapic-runtime-api.md)
- Depends on: [lapic-cert-api.md](./lapic-cert-api.md)
- Depends on: [Validation and Benchmark Specification](../validation-and-benchmarks.md)
- Scope: public package surface for libs/lapic/debug, including artifact inspection, trace views, replay-oriented audit reports, validation harness facades, and benchmark reporting helpers
- Audience: lapic debug, validation, audit, CI, frontend migration, and developer-tooling maintainers

## 1. Purpose

This document freezes the low-level public API surface for `libs/lapic/debug`.

It defines the diagnostic and audit-facing contracts that sit above storage, runtime, and certification surfaces without becoming correctness-critical persistence themselves.

The goal is to define:

- stable inspection and debug-view contracts,
- trace and audit report contracts,
- replay-oriented diagnostic facades,
- validation and benchmark harness helper surfaces,
- clear separation between canonical artifacts and debug representations.

## 2. Package Responsibility Boundary

`lapic debug` owns:

- artifact inspection helpers,
- deterministic diagnostic text and structured debug views,
- runtime trace summarization helpers,
- audit report generation helpers,
- validation harness facades,
- benchmark report shaping helpers,
- offline developer introspection utilities.

`lapic debug` MUST NOT own:

- canonical artifact identity,
- storage envelopes or checkpoint closure truth,
- runtime state machine legality,
- certificate legality,
- adapter semantic normalization.

## 3. Public Surface Model

The public API MUST be organized into stable export families.

The initial export families are:

- `artifact-inspection`
- `trace-view`
- `audit-report`
- `replay-tools`
- `validation-harness`
- `benchmark-reporting`

## 4. Required Export Families

### 4.1 artifact-inspection

The `artifact-inspection` surface MUST export:

- inspection request type,
- artifact summary type,
- state block inspection view type,
- certificate inspection view type,
- frontier skyline visualization export descriptor type,
- formula region decomposition export descriptor type.

Inspection outputs MUST be deterministic for the same referenced canonical artifacts.

### 4.2 trace-view

The `trace-view` surface MUST export:

- trace query type,
- trace event projection types,
- phase summary type,
- threshold lineage view type,
- failure timeline view type.

Trace views are observational only and MUST NOT act as authoritative checkpoint or replay state.

### 4.3 audit-report

The `audit-report` surface MUST export:

- audit report request type,
- final optimality audit summary type,
- certificate replay coverage summary type,
- integrity scan summary type,
- checkpoint closure audit summary type.

### 4.4 replay-tools

The `replay-tools` surface MUST export:

- replay inspection request type,
- replay mismatch formatting helper,
- replay closure summary type,
- offline replay bundle descriptor type.

These helpers MAY depend on `lapic cert` replay contracts but MUST NOT invent new replay legality semantics.

### 4.5 validation-harness

The `validation-harness` surface MUST export:

- golden enumeration harness configuration types,
- storage integrity harness entrypoint types,
- checkpoint divergence harness types,
- adapter parity validation summary types,
- harness report manifest types.

The harness surface may orchestrate existing package APIs, but it MUST NOT redefine correctness criteria that belong to parent specs.

### 4.6 benchmark-reporting

The `benchmark-reporting` surface MUST export:

- benchmark report shaping types,
- regression classification summary types,
- environment descriptor formatting helpers,
- profile-class labeling helpers,
- publication-ready report manifest types.

## 5. Cross-Package Dependency Rules

### 5.1 lapic debug to other lapic packages

lapic debug MAY depend on stable public surfaces from:

- lapic storage,
- lapic runtime,
- lapic cert,
- lapic core,
- adapter packages for validation hooks only.

All such dependencies MUST be read-only or report-oriented from the perspective of correctness.

### 5.2 Reverse Dependencies

Other lapic packages MUST NOT require lapic debug for correctness-critical execution.

lapic debug is allowed to be absent from a minimal production execution path as long as canonical audit and replay artifacts remain valid.

## 6. Mutability and Ownership Rules

- All public debug views MUST be snapshots or derived reports, not mutable live references.
- Inspection helpers MUST not mutate canonical artifacts.
- Benchmark report helpers MUST not modify retained governed artifacts implicitly.

## 7. Error Model

The lapic debug public surface MUST use a structured error model with at least:

- `InspectionInputFailure`
- `TraceProjectionFailure`
- `AuditAssemblyFailure`
- `ReplayBundleResolutionFailure`
- `HarnessConfigurationFailure`
- `InternalBugDetected`

## 8. Determinism Rules

All public lapic debug entrypoints that operate on canonical artifacts MUST be deterministic with respect to:

- referenced artifact digests,
- schema versions,
- requested view configuration,
- validation or benchmark policy version where applicable.

They MUST NOT depend on:

- local wall-clock time unless explicitly classified as observational metadata,
- nondeterministic iteration order,
- process-local mutable caches that affect visible output.

## 9. Forbidden Public API Shapes

The following are forbidden in the lapic debug public surface:

- debug views used as primary correctness-critical persistence,
- APIs that mutate runtime legality state through inspection actions,
- hidden coupling to frontend-only component state,
- report helpers that silently drop failed replay or integrity findings,
- benchmark publication helpers that omit correctness qualification metadata.

## 10. Versioning Policy

- Breaking semantic changes to debug view meaning or audit report content require package-major or explicit report-schema version increments.
- Additive observational fields are allowed only when omission remains unambiguous for consumers.
- lapic debug version changes MUST NOT imply changes to canonical artifact identity.

## 11. Initial Package Layout Recommendation

The package MAY organize source files internally as:

- `artifact-inspection/`
- `trace-view/`
- `audit-report/`
- `replay-tools/`
- `validation-harness/`
- `benchmark-reporting/`

This internal layout is recommended, not yet mandatory, but the export-family split above is normative.

## 12. Compliance Checklist

Before `lapic debug` may be treated as a stable lapic package surface, it MUST demonstrate:

- deterministic inspection output for canonical artifacts,
- trace summaries that remain observational only,
- audit report generation that preserves failure and replay findings,
- harness facades that match parent validation policy,
- no role in correctness-critical execution legality.
