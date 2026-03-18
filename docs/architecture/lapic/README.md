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
    implementation-roadmap.md
    low-level/
      README.md
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
- [team-level-adapter-boundary.md](./team-level-adapter-boundary.md): explicit deferred-scope boundary for multi-entity and team-level adapter semantics.
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

This document set is not ready to leave Draft status yet.

The remaining blockers are:

- the deferred team-level boundary is still explicitly open in [team-level-adapter-boundary.md](./team-level-adapter-boundary.md), so the architecture is only frozen for single-entity optimization,
- the mixed-integer relaxation backend choice is still marked as `место требует дополнительного анализа` in [overview.md](./overview.md),
- the global partitioning cost model is still marked as `место требует дополнительного анализа` in [overview.md](./overview.md),
- Draft can only be removed after all repository path examples use lapic naming consistently and the remaining unresolved sections are either resolved or explicitly narrowed out of the claimed production scope.
