# Benchmark Corpus Ownership and Fixture Storage Layout

## Status

- Draft
- Depends on: [benchmark-governance-and-browser-noise.md](./benchmark-governance-and-browser-noise.md)
- Depends on: [Validation and Benchmark Specification](../validation-and-benchmarks.md)
- Depends on: [Implementation Roadmap](../implementation-roadmap.md)
- Scope: repository-level directory layout, ownership mapping, fixture classes, retained artifact placement, and report storage rules for lapic benchmark infrastructure
- Audience: validation, CI, release, runtime, and repository maintainers

## 1. Purpose

This document freezes the repository-level storage layout for lapic benchmark assets.

It refines the governance policy into a concrete repository structure so that fixture ownership, corpus versioning, retained artifacts, and report publication are physically organized in a deterministic way.

This document does not require immediate directory creation, but once scaffolding begins, the created repository structure MUST follow this layout unless a later explicit architecture decision changes it.

## 2. Layout Principles

- Governed benchmark metadata MUST live in version-controlled repository paths.
- Immutable fixtures MUST be physically separated from generated reports and scratch outputs.
- Public and internal report definitions MUST be distinguishable at the filesystem level.
- Local scratch outputs MUST be excluded from canonical reporting paths.
- The layout MUST work for both local development and CI reproduction.

## 3. Repository Layout

The normative repository layout for lapic benchmark infrastructure is:

```text
tools/
  lapic-bench/
    README.md
    registry/
      corpus.json
      suites/
        public/
        internal/
        exploratory/
    fixtures/
      gi/
      sr/
      zzz/
      synthetic/
      adversarial/
      generators/
    reports/
      definitions/
        public/
        internal/
      baselines/
      published/
    retained/
      reports/
      replay-closures/
      checkpoints/
    local/
      scratch/
      imported/
```

## 4. Path Responsibilities

### 4.1 registry/

`tools/lapic-bench/registry/` stores governed corpus metadata.

Required contents:

- `corpus.json`: corpus version identity, compatibility notes, and top-level policy metadata.
- `suites/public/`: registry entries for publicly reportable suites.
- `suites/internal/`: registry entries for internal gating suites.
- `suites/exploratory/`: registry entries for non-governed exploratory suites when they are retained in-repo.

Registry files MUST be version-controlled.

### 4.2 fixtures/

`tools/lapic-bench/fixtures/` stores immutable benchmark inputs.

Required subdivisions:

- `gi/`: Genshin Impact governed fixtures.
- `sr/`: Star Rail governed fixtures. *(reserved; SR adapter is outside current lapic project scope)*
- `zzz/`: Zenless Zone Zero governed fixtures. *(reserved; ZZZ adapter is outside current lapic project scope)*
- `synthetic/`: parameterized synthetic fixtures frozen by generated payload and metadata.
- `adversarial/`: fixtures designed to stress correctness or performance assumptions.
- `generators/`: source-controlled generator definitions and seeds for generated fixture families.

Fixture payloads MUST be immutable once introduced for a published corpus version.

### 4.3 reports/

`tools/lapic-bench/reports/` stores benchmark report definitions and baseline metadata.

Required subdivisions:

- `definitions/public/`: report definitions eligible for public release and repository documentation.
- `definitions/internal/`: report definitions used for CI or release gating but not necessarily for publication.
- `baselines/`: approved baseline descriptors tied to corpus version and environment class.
- `published/`: retained rendered reports or report manifests for published governed results.

### 4.4 retained/

`tools/lapic-bench/retained/` stores retained artifacts sufficient for reproduction.

Required subdivisions:

- `reports/`: machine-readable retained benchmark result records.
- `replay-closures/`: retained replay closures referenced by governed validation or benchmark reports.
- `checkpoints/`: retained checkpoints when benchmark reproduction requires warm-start or resume evidence.

This tree MAY be partially materialized outside the repository in CI artifact storage, but the logical path contract and manifest naming MUST match this structure.

### 4.5 local/

`tools/lapic-bench/local/` is reserved for non-governed developer-local material.

Required subdivisions:

- `scratch/`: local benchmark output, throwaway measurements, and tuning experiments.
- `imported/`: temporary imported artifacts for manual comparison.

`local/` MUST NOT be used as the source of truth for any governed benchmark claim.

## 5. Ownership Mapping

The following ownership mapping is normative.

- `registry/`: owned by `benchmarkGovernanceOwner`.
- `fixtures/<game-or-family>/`: owned by the relevant `fixtureMaintainer`.
- `reports/definitions/public/`: jointly owned by `benchmarkGovernanceOwner` and `reportPublisher`.
- `reports/definitions/internal/`: owned by `regressionTriageOwner` with review from `benchmarkGovernanceOwner`.
- `reports/baselines/`: owned by `reportPublisher` and reviewed by `regressionTriageOwner`.
- `retained/`: owned operationally by `reportPublisher`; integrity policy reviewed by `benchmarkGovernanceOwner`.
- `local/`: unmanaged for governance purposes and excluded from canonical ownership obligations.

## 6. Fixture Naming Rules

Every governed fixture directory or file identity MUST include enough metadata to derive:

- game or family,
- suite class,
- stable case identifier,
- corpus version introduction point,
- digest or manifest linkage.

Human-readable names are allowed, but canonical identity MUST still be digest-backed in registry metadata.

## 7. Registry Entry to Filesystem Mapping

Each governed registry entry MUST resolve deterministically to:

- one suite registry record under `registry/suites/...`,
- one or more immutable inputs under `fixtures/...`,
- zero or more retained baselines under `reports/baselines/`,
- zero or more retained report artifacts under `retained/reports/`.

Registry entries MUST NOT depend on ad hoc absolute machine-local paths.

## 8. Generated Fixture Policy

Generated fixtures are allowed only when all of the following are version-controlled:

- generator source definition,
- generator version identifier,
- generator seed set,
- generated fixture manifest,
- resulting fixture digests.

Generated fixture output MAY live under `fixtures/synthetic/` or `fixtures/adversarial/`, but the source-of-truth generator metadata MUST be recorded under `fixtures/generators/`.

## 9. Retained Artifact Policy

Governed benchmark runs MUST retain enough artifacts to reproduce published claims.

The minimal retained set is:

- benchmark result manifest,
- environment descriptor,
- corpus version,
- fixture digests,
- engine version,
- validation qualification status,
- replay closure digest when replay evidence was required.

Large binary artifacts MAY be stored outside the repository if:

- their manifests remain in the repository,
- digests are stable,
- retrieval location is recorded in machine-readable metadata,
- retention policy is documented.

## 10. CI and Local Use Rules

### 10.1 CI

CI benchmark jobs MUST treat `registry/`, `fixtures/`, and `reports/definitions/` as authoritative inputs.

CI MAY populate `retained/` through artifact publishing steps that mirror the logical layout defined here.

### 10.2 Local Development

Local developers MAY run governed suites from the same registry and fixture layout.

They MAY write outputs under `local/scratch/`, but any result intended for governed comparison MUST be re-materialized through the governed report pipeline.

## 11. Forbidden Layout Practices

The following are forbidden:

- storing governed fixtures under `docs/`,
- storing governed fixture inputs only in CI with no repository manifest,
- mixing immutable fixtures with generated benchmark outputs in the same directory,
- publishing public benchmark reports from `local/`,
- registry entries that point to mutable filenames without digest control.

## 12. Initial Scaffolding Guidance

When repository scaffolding begins, the first concrete artifacts that SHOULD be created are:

- `tools/lapic-bench/README.md`
- `tools/lapic-bench/registry/corpus.json`
- empty suite directories under `registry/suites/`
- empty family directories under `fixtures/`
- `reports/definitions/public/`
- `reports/definitions/internal/`

This guidance is operational, not a replacement for the normative layout above.

## 13. Compliance Checklist

Before lapic benchmark infrastructure may claim compliance with this layout, it MUST demonstrate:

- deterministic registry-to-fixture mapping,
- governed fixtures separated from generated outputs,
- public and internal report definitions separated at filesystem level,
- retained artifact manifests sufficient for reproduction,
- no governed benchmark claim depending on `local/` paths.
