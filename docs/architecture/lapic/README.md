# lapic Documentation Structure

## Status

- Draft
- Scope: canonical documentation layout for lapic architecture, planning, and low-level freezes
- Audience: maintainers working on lapic design, implementation, validation, and migration

## 1. Purpose

This document defines the file structure for lapic documentation.

The goal is to keep high-level architectural decisions, implementation planning, and low-level freeze specifications separate, while still making navigation predictable.

## 2. Directory Layout

```text
docs/architecture/
  lapic/
    README.md
    overview.md
    decision-log.md
    canonical-ir.md
    relaxation-and-certificates.md
    frontier-storage-and-codec.md
    runtime-and-checkpoints.md
    validation-and-benchmarks.md
    adapters-gi-sr-zzz.md
    team-level-adapter-boundary.md
    potential-aware-optimization.md
    implementation-roadmap.md
    low-level/
      README.md
      lapic-core-ir-api.md
      lapic-cert-api.md
      lapic-storage-api.md
      lapic-runtime-api.md
      lapic-debug-api.md
      adapters-gi-sr-zzz-api.md
      exact-decimal-wire-format.md
      highs-evidence-and-deterministic-config.md
      benchmark-governance-and-browser-noise.md
      benchmark-fixture-layout.md
      source-snapshot-packaging.md
```

## 3. File Responsibilities

- [overview.md](./overview.md): top-level lapic architecture and global design rules.
- [decision-log.md](./decision-log.md): accepted architecture decisions that close prior open questions.
- [canonical-ir.md](./canonical-ir.md): canonical IR stack and invariants.
- [relaxation-and-certificates.md](./relaxation-and-certificates.md): admissible bounds, verification rules, and certificate contracts.
- [frontier-storage-and-codec.md](./frontier-storage-and-codec.md): frontier persistence, block layout, and storage contracts.
- [runtime-and-checkpoints.md](./runtime-and-checkpoints.md): runtime protocol, scheduling, pause/resume, and checkpoints.
- [validation-and-benchmarks.md](./validation-and-benchmarks.md): correctness validation, replay checks, and benchmark governance.
- [adapters-gi-sr-zzz.md](./adapters-gi-sr-zzz.md): game adapter contracts for GI, SR, and ZZZ.
- [team-level-adapter-boundary.md](./team-level-adapter-boundary.md): full multi-entity and team-level adapter architecture for lapic.
- [potential-aware-optimization.md](./potential-aware-optimization.md): lapic-side architecture for upgrade-capable candidates, potential-aware ranking semantics, and graph-capable auxiliary outputs.
- [implementation-roadmap.md](./implementation-roadmap.md): sequencing, gates, and cutover planning.
- [low-level/README.md](./low-level/README.md): index for low-level freeze documents.

## 4. Structure Rules

- High-level architectural decisions stay directly under [lapic](./README.md).
- Implementation-freeze details belong under [low-level/README.md](./low-level/README.md).
- A low-level document may refine a high-level spec, but it must not silently replace it.
- Cross-document dependencies should prefer relative links inside the lapic directory.

## 5. Naming Rules

- Repository paths for core lapic packages must use the top-level namespace under `libs/lapic/*`.
- Repository paths for game bridge packages must use `libs/<game>/lapic-adapter` rather than `libs/<game>/optimizer-adapter`.
- Prefer `lapic core`, `lapic runtime`, `lapic cert`, `lapic storage`, and `lapic debug` in prose when referring to concrete package families. Reserve `optimizer-*` wording for historical references or existing file names only.

## 6. Draft Exit Conditions

No top-level unresolved architecture blocker remains under the current lapic scope.

Draft status now remains only for editorial and governance reasons, not because a major architectural question is still open.

The following topics are no longer considered top-level architecture blockers:

- convex mixed-integer relaxations are a reserved future extension point outside current production-required scope, see [decision-log.md](./decision-log.md),
- partition heuristics, worker granularity, sparse frontier tuning, and heartbeat sampling are implementation-tuned policies with frozen invariants rather than unresolved architecture, see [decision-log.md](./decision-log.md),
- online checkpointing and cross-checkpoint deduplicated packs are deferred enhancements rather than required correctness scope, see [decision-log.md](./decision-log.md).
