# lapic Implementation Roadmap

## Status

- Draft
- Depends on: [lapic Architecture](./overview.md)
- Depends on: [Canonical Optimizer IR Specification](./canonical-ir.md)
- Depends on: [Relaxation and Certificate System Specification](./relaxation-and-certificates.md)
- Depends on: [Frontier Storage and Codec Specification](./frontier-storage-and-codec.md)
- Depends on: [Runtime and Checkpoint Specification](./runtime-and-checkpoints.md)
- Depends on: [Validation and Benchmark Specification](./validation-and-benchmarks.md)
- Depends on: [Adapter Specification for GI, SR, and ZZZ](./adapters-gi-sr-zzz.md)
- Supports low-level freeze documents in: [low-level/README.md](./low-level/README.md)
- Scope: sequencing of full implementation across repository packages, workstreams, readiness gates, and cutover criteria
- Audience: maintainers responsible for planning and executing the implementation

## 1. Purpose

This document defines the implementation roadmap for lapic.

The roadmap is not an MVP plan. It is a full implementation sequencing plan constrained by the architecture documents already defined.

The roadmap exists to answer four questions.

- In what order must packages be built?
- Which workstreams can run in parallel?
- Which unresolved architecture questions block which implementation steps?
- What constitutes readiness for repository integration and production cutover?

## 2. Roadmap Rules

### 2.1 No Architectural Downgrade for Sequencing

Sequencing convenience must not justify weaker interfaces, weaker proofs, or throwaway subsystems.

### 2.2 Full-Fidelity Interfaces First

If a package starts implementation before all downstream capabilities are used, its public interfaces must still reflect the final architecture, not an intentionally reduced subset.

### 2.3 Blocked Means Blocked

If a task depends on an unresolved architectural choice marked as место требует дополнительного анализа, the roadmap must state that the task is blocked rather than inventing a fake intermediate design.

### 2.4 Readiness Is Gated, Not Implied

No package, workstream, or migration step is considered ready until its gate criteria are met explicitly.

## 3. Intended Repository Module Set

The roadmap assumes the following module family will be introduced.

- libs/lapic/core
- libs/lapic/runtime
- libs/lapic/cert
- libs/lapic/storage
- libs/lapic/debug
- libs/gi/lapic-adapter
- libs/sr/lapic-adapter
- libs/zzz/lapic-adapter

Additional support modules may be introduced if they do not fracture ownership or blur package boundaries.

## 4. Workstream Model

Implementation is organized into eight workstreams.

1. Core IR and analysis
2. Relaxation and certification
3. Frontier storage and persistence
4. Runtime and scheduling
5. Game adapters
6. Validation and benchmark infrastructure
7. UI and application integration
8. Migration and cutover

Each workstream contains phases with entry and exit gates.

## 5. Dependency Graph

### 5.1 Hard Dependencies

- lapic core depends on the IR specification and the resolved parts of the scalar representation policy.
- lapic cert depends on lapic core and the relaxation specification.
- lapic storage depends on lapic core, lapic cert, and the resolved parts of the canonical wire format.
- lapic runtime depends on lapic core, lapic cert, and lapic storage.
- game adapters depend on lapic core contracts and current game-local formula and data packages.
- validation infrastructure depends on all correctness-critical package surfaces.
- app integration depends on runtime plus at least one validated adapter.

### 5.2 Open-Question Blockers

The following unresolved architecture items block specific work.

- Team-level optimization adapters block any general team-level production cutover beyond single-entity build optimization.

## 6. Phase Structure

The roadmap is split into seven implementation phases.

1. Foundations
2. Correctness kernel
3. Persistence kernel
4. Runtime kernel
5. Adapter realization
6. Application integration
7. Production cutover

These phases overlap, but their gate ordering is strict.

## 7. Phase 1: Foundations

### 7.1 Objectives

- create package scaffolding,
- freeze shared package boundaries,
- establish canonical schema registries,
- establish repository-wide coding, serialization, and validation conventions for the new engine.

### 7.2 Deliverables

- package manifests and build configs for lapic core, lapic cert, lapic storage, lapic runtime, and lapic debug,
- shared schema registry and artifact kind registry,
- deterministic hashing utilities,
- exact-encoding abstraction interfaces,
- repository-level test fixtures folder layout for new engine validation.

### 7.3 Entry Gate

- architecture documents in this directory exist and are internally consistent.

### 7.4 Exit Gate

- package boundaries are committed and referenced by follow-on implementation plans,
- no correctness-critical package depends directly on GI, SR, or ZZZ packages,
- all new package surfaces compile with placeholder but final-shape interfaces.

## 8. Phase 2: Correctness Kernel

### 8.1 Objectives

- implement F-IR, A-IR, S-IR, R-IR, and C-IR models,
- implement canonical hashing and validation,
- implement structural analysis foundation,
- implement certificate model and replay scaffolding,
- implement first admissible bound layers.

### 8.2 Target Packages

- libs/lapic/core
- libs/lapic/cert

### 8.3 Required Subsystems

- canonical problem model types,
- F-IR builder and validator,
- A-IR annotation and region decomposition scaffolding,
- S-IR state model and exact signature-group keys,
- certificate schema, identity, and replay recipe model,
- interval and affine relaxation implementations,
- exact symbolic proof machinery for trivial branch and infeasibility cases.

### 8.4 Strictly Deferred Within This Phase

- production LP provider integration may start here but cannot be marked complete until evidence schema and deterministic mode are frozen,
- convex mixed-integer relaxation support remains blocked.

### 8.5 Exit Gate

- IR validators pass on synthetic and golden fixtures,
- certificate replay scaffolding works on exact symbolic decisions,
- S-IR provenance is lossless on test fixtures,
- no unresolved temporary interface remains in public package surfaces.

## 9. Phase 3: Persistence Kernel

### 9.1 Objectives

- implement storage envelope, block manifests, frontier block codec, and index model,
- implement warm-tier backends for browser and Node,
- implement artifact integrity verification.

### 9.2 Target Packages

- libs/lapic/storage
- libs/lapic/debug

### 9.3 Required Subsystems

- canonical artifact envelope encoder and decoder,
- frontier block row and columnar logical layout implementation,
- manifest and lineage model,
- checkpoint closure inventory model,
- IndexedDB backend,
- filesystem backend,
- audit export and integrity scan tools.

### 9.4 Blockers

- final canonical scalar wire format is blocked until exact scalar representation is frozen.

### 9.5 Allowed Parallel Work

- backend abstractions,
- manifest model,
- integrity tooling,
- non-finalized codec implementation behind the final interface with an explicit unresolved scalar payload section.

### 9.6 Exit Gate

- frontier block round-trip is lossless on validation corpus,
- manifest lineage and supersession rules are implemented,
- integrity failures are detected deterministically,
- checkpoint closure can be materialized without runtime-only references.

## 10. Phase 4: Runtime Kernel

### 10.1 Objectives

- implement solve state machine,
- implement work unit scheduler,
- implement artifact publication protocol,
- implement pause, resume, cancellation, and failure semantics,
- implement checkpoint import and export.

### 10.2 Target Packages

- libs/lapic/runtime
- libs/lapic/debug

### 10.3 Required Subsystems

- session controller,
- scheduler and queue ordering engine,
- worker protocol implementation for browser, Node, and in-process executor,
- threshold snapshot lineage manager,
- checkpoint exporter and importer,
- failure record and diagnostics stream.

### 10.4 Critical Integration Dependencies

- lapic storage must already provide authoritative artifact visibility and integrity checks,
- lapic cert must already provide threshold-sensitive certificate shapes and replay hooks.

### 10.5 Exit Gate

- deterministic final result is invariant under worker-count variation on validation suites,
- pause and resume preserve proof state on replay-tested cases,
- checkpoint export and import reconstruct full correctness-critical closure,
- failure paths never silently downgrade correctness behavior.

## 11. Phase 5: Adapter Realization

### 11.1 Objectives

- implement GI, SR, and ZZZ adapters on top of current repository packages,
- establish canonical source snapshot digests,
- preserve parity with current semantics on bounded exact workloads.

### 11.2 Target Packages

- libs/gi/lapic-adapter
- libs/sr/lapic-adapter
- libs/zzz/lapic-adapter

### 11.3 GI Work Items

- implement legacy Waverider compatibility adapter,
- implement canonical GI candidate extraction for artifacts and set logic,
- define explicit GI plot objective mapping,
- define separate TC adapter sub-family,
- begin GI canonical pando mode only where semantics are fully specified.

### 11.4 SR Work Items

- implement calculator detachment adapter,
- implement relic and light cone candidate extraction,
- implement cavern and planar set filter mapping,
- implement frame-based objective mapping.

### 11.5 ZZZ Work Items

- implement calculator detachment adapter,
- implement disc and wengine candidate extraction,
- implement decimal normalization policy,
- implement 2-piece and 4-piece disc set filter mapping.

### 11.6 Blockers

- GI full canonical pando cutover remains blocked where the architecture still marks it unresolved.

### 11.7 Exit Gate

- each adapter can emit canonical problems with explicit source snapshot digests,
- differential validation passes on bounded exact cases against current repository behavior where parity is claimed,
- unsupported semantics fail explicitly.

## 12. Phase 6: Validation and Benchmark Infrastructure

### 12.1 Objectives

- implement the validation families and benchmark corpus defined in the validation specification,
- integrate correctness and performance gating into CI and offline audit flows.

### 12.2 Target Packages

- libs/lapic/debug
- dedicated benchmark and validation workspace tooling under tools or dedicated support packages as needed

### 12.3 Required Subsystems

- golden enumeration harness,
- certificate replay harness,
- storage integrity harness,
- checkpoint resume divergence harness,
- benchmark corpus registry,
- report generation tooling,
- regression classifier tooling.

### 12.4 Exit Gate

- correctness gates are automated in CI for the reduced mandatory suite,
- offline audit mode can reproduce published benchmark claims,
- replay reports and benchmark reports are deterministic under frozen inputs.

## 13. Phase 7: Application Integration

### 13.1 Objectives

- expose the new runtime through app-facing APIs,
- integrate into frontend and future application surfaces without changing correctness semantics,
- support controlled side-by-side execution with legacy solvers where required for migration.

### 13.2 Integration Surfaces

- apps/frontend
- apps/sr-frontend
- apps/zzz-frontend
- any backend or tooling surfaces that trigger optimization tasks

### 13.3 Required Integration Rules

- applications interact with lapic runtime through stable solve-handle APIs,
- no application code consumes internal block or certificate formats directly,
- side-by-side comparison mode must preserve explicit labeling of legacy versus new engine results.

### 13.4 Exit Gate

- at least one game path is integrated end-to-end behind explicit engine selection,
- diagnostics and failure surfacing are visible enough for migration triage,
- checkpoint export and import can be invoked from supported tooling surfaces.

## 14. Phase 8: Production Cutover

### 14.1 Objectives

- designate new engine paths as production-default where ready,
- retire or narrow legacy paths where no longer needed,
- preserve replayability and benchmark continuity across the cutover.

### 14.2 Cutover Preconditions Per Game

For each game, cutover requires:

- adapter validation pass,
- benchmark qualification against current engine,
- checkpoint and replay qualification,
- documented parity or intentional semantic delta,
- failure rollback policy.

### 14.3 GI-Specific Cutover Rule

GI must not fully cut over until the repository chooses and validates its final relationship between legacy compatibility mode and canonical pando-backed mode.

### 14.4 Post-Cutover Requirements

- legacy paths remain available only where still required for comparison, migration, or unsupported semantics,
- benchmark baselines are re-established under explicit versioning,
- no silent engine switching occurs.

## 15. Cross-Phase Deliverables Matrix

### 15.1 lapic core

- phase 1: package skeleton and shared type boundaries
- phase 2: IR, analysis, state model, initial search primitives
- phase 3 onward: stable dependency for all other packages

### 15.2 lapic cert

- phase 1: package skeleton
- phase 2: certificate model and replay framework
- phase 4: threshold lineage and runtime integration
- phase 6: replay validation tooling

### 15.3 lapic storage

- phase 1: package skeleton and storage contracts
- phase 3: artifact envelope, manifests, codecs, backends
- phase 4: checkpoint integration
- phase 6: integrity and audit tooling

### 15.4 lapic runtime

- phase 1: package skeleton and protocol stubs
- phase 4: full runtime implementation
- phase 7: application-facing solve-handle integration

### 15.5 lapic debug

- phase 1: package skeleton
- phase 3: artifact inspection helpers
- phase 4: runtime trace helpers
- phase 6: validation and benchmark harness ownership

### 15.6 Game Adapters

- phase 5: full realization
- phase 7: app integration
- phase 8: cutover qualification

## 16. Parallelization Guidance

The following work can proceed in parallel once phase 1 is complete.

- lapic core IR and validator work,
- lapic cert schema and replay framework,
- lapic storage manifest and backend abstraction work,
- validation harness scaffolding,
- adapter prototype planning against final package contracts.

The following work should not proceed before dependencies are materially in place.

- production checkpointing before storage envelope and closure rules are implemented,
- production app integration before runtime state machine and adapters pass validation,
- production GI cutover before GI legacy versus canonical mode is frozen enough for parity claims.

## 17. Readiness Gates by Package

### 17.1 Architecture-Ready

Package boundary, interfaces, schemas, and dependencies are defined and committed.

### 17.2 Implementation-Ready

All blocking architectural questions relevant to that package are resolved or isolated behind final-shape interfaces with explicit blocked sections.

### 17.3 Validation-Ready

Package passes required schema, round-trip, replay, and deterministic behavior tests.

### 17.4 Integration-Ready

Package integrates with all direct dependencies without temporary compatibility shims that would violate the final architecture.

### 17.5 Production-Ready

Package has passed correctness gates, performance qualification where relevant, and failure-mode validation.

## 18. Explicit Blocked Areas

The following areas are currently blocked from final implementation closure.

### 18.1 Team-Level Adapter Generalization

Blocked until canonical multi-entity team-level adapter semantics are frozen. See [team-level-adapter-boundary.md](./team-level-adapter-boundary.md).

Affected areas:

- generalized team-level production cutover beyond single-entity optimization,
- final team-aware compatibility signatures in adapters,
- team-level benchmark corpus interpretation.

### 18.2 Remaining Low-Level Freeze Points

The high-level architecture is decided, but final implementation closure still depends on low-level freezes for:

- exact-decimal wire layout details, now specified in [low-level/exact-decimal-wire-format.md](./low-level/exact-decimal-wire-format.md),
- HiGHS evidence payload schema and deterministic configuration freeze, now specified in [low-level/highs-evidence-and-deterministic-config.md](./low-level/highs-evidence-and-deterministic-config.md),
- benchmark corpus governance and browser noise policy, now specified in [low-level/benchmark-governance-and-browser-noise.md](./low-level/benchmark-governance-and-browser-noise.md).

These are no longer top-level architectural blockers, but they remain implementation freeze points.

These freezes should be specified in the dedicated [low-level/README.md](./low-level/README.md) document set rather than as additional flat top-level architecture documents.

## 19. Success Conditions for the Roadmap

The roadmap is considered successfully executed only if:

- all core packages exist with final-shape interfaces,
- correctness-critical validation gates are automated,
- at least one game path can run fully through the new engine with certified optimality,
- benchmark reports show qualified improvement on target large-space workloads,
- checkpoint and replay workflows are operational end-to-end,
- production cutover criteria are explicit per game.

## 20. Recommended Immediate Next Tasks

Given the current document set, the immediate next implementation-planning tasks are:

1. Create package skeletons for lapic core, lapic cert, lapic storage, lapic runtime, and lapic debug.
2. Choose whether to scaffold the benchmark repository layout immediately or defer physical directory creation until package skeleton creation.
3. Decide whether the first scaffolding batch should include lapic debug or keep it in a second wave after runtime and storage.
4. Decide whether to keep team-level scope explicitly deferred during initial package creation or open a separate architecture track for it now.
5. Prepare the first package-by-package scaffolding order and dependency cut list.
