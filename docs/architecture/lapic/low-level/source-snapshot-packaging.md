# Source Snapshot Packaging Policy

## Status

- Draft
- Depends on: [adapters-gi-sr-zzz-api.md](./adapters-gi-sr-zzz-api.md)
- Depends on: [benchmark-fixture-layout.md](./benchmark-fixture-layout.md)
- Depends on: [Validation and Benchmark Specification](../validation-and-benchmarks.md)
- Scope: canonical packaging policy for adapter source snapshots used in replay, benchmark retention, and canonical problem reconstruction
- Audience: adapter, validation, benchmark, audit, and repository maintainers

## 1. Purpose

This document freezes the packaging policy for source snapshots referenced by lapic adapter exports.

It resolves the previously open snapshot-packaging boundary by defining how source snapshots are grouped, referenced, retained, and reconstructed for replay and benchmarking.

## 2. Non-Negotiable Rules

- Every governed canonical problem export MUST reference a source snapshot package or an equivalent canonical adapter export.
- Snapshot packaging MUST be digest-addressable.
- Snapshot packaging MUST separate canonical reconstruction inputs from non-canonical diagnostics.
- Benchmark retention and offline replay MUST be able to locate the same snapshot package deterministically.

## 3. Snapshot Package Model

The normative packaging unit is `SourceSnapshotPackageV1`.

Each package MUST contain:

- `packageKind`
- `packageVersion`
- `adapterKind`
- `adapterVersion`
- `sourceSnapshotDigestSet`
- `manifestDigest`
- `payloadEntrySet`
- `reconstructionHints`
- `packagingPolicyId`

## 4. Payload Entry Classes

Each `payloadEntrySet` member MUST be classified as one of:

- `inventorySnapshot`
- `entityStateSnapshot`
- `formulaDataSnapshot`
- `statTableSnapshot`
- `auxiliaryAdapterMetadata`
- `nonCanonicalDiagnosticAttachment`

Only the first five classes may participate in canonical reconstruction.

## 5. Packaging Forms

The policy permits two forms:

- embedded package manifest with referenced external payload digests,
- self-contained package manifest with inline payload blobs.

For governed benchmark and replay retention, external-payload packages are preferred when payload size is large, but manifest identity remains canonical in either form.

## 6. Reconstruction Contract

The package MUST provide enough information to reconstruct:

- the canonical problem export inputs,
- candidate extraction context,
- formula detachment context,
- filter transformation context,
- snapshot digests named in the canonical problem metadata.

If a snapshot package cannot support exact reconstruction, it is invalid for governed replay and benchmark retention.

## 7. Repository Placement Contract

When snapshot packages are retained in-repository for governed benchmarks, their manifests MUST be addressable from the benchmark registry and fixture layout defined in [benchmark-fixture-layout.md](./benchmark-fixture-layout.md).

When stored externally, a repository manifest with stable digests and retrieval metadata is still mandatory.

## 8. Public Versus Internal Retention

- Public benchmark profiles MUST reference snapshot packages reproducible by repository maintainers.
- Internal profiles MAY reference restricted snapshot packages, but the package manifest contract remains the same.
- Snapshot package restrictions MUST be explicit in metadata and MUST NOT silently change benchmark comparability claims.

## 9. Forbidden Packaging Practices

The following are forbidden:

- ad hoc machine-local absolute paths as canonical snapshot references,
- snapshot bundles that omit formula or stat-table context while claiming full reconstruction,
- mixing canonical reconstruction payloads with mutable scratch output as if they were governed inputs,
- changing snapshot digest composition without adapter version transition.

## 10. Compliance Checklist

Before adapter snapshot retention may claim compliance with this policy, it MUST demonstrate:

- digest-addressable snapshot package manifests,
- exact reconstruction from retained package inputs or equivalent canonical export,
- clear separation between canonical and non-canonical attachments,
- compatibility with benchmark registry and replay retention flows.
