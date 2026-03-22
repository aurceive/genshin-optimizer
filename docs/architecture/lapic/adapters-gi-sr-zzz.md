# Adapter Specification for GI, SR, and ZZZ

## Status

- Draft
- Depends on: [lapic Architecture](./overview.md)
- Depends on: [Canonical Optimizer IR Specification](./canonical-ir.md)
- Depends on: [Relaxation and Certificate System Specification](./relaxation-and-certificates.md)
- Depends on: [Frontier Storage and Codec Specification](./frontier-storage-and-codec.md)
- Depends on: [Runtime and Checkpoint Specification](./runtime-and-checkpoints.md)
- Depends on: [Validation and Benchmark Specification](./validation-and-benchmarks.md)
- Scope: adapter contracts for Genshin Impact, Star Rail, and Zenless Zone Zero
- Audience: formula, data, optimizer, and frontend maintainers

## 1. Purpose

This document specifies how game-specific data, formulas, filters, and optimization requests are translated into the lapic canonical optimizer problem model.

The adapter layer is the only layer allowed to know game-specific semantics such as:

- stat names,
- set rules,
- equipment slot taxonomies,
- formula tag conventions,
- source database shapes,
- game-specific conditional semantics.

The adapter layer must bridge existing repository packages into the new optimizer architecture without leaking game-specific logic into the optimizer core.

## 2. Adapter Principles

### 2.1 Canonical Boundary

All game-specific logic must terminate at the adapter boundary. Core optimizer layers must receive only canonical problem representations.

### 2.2 Semantics Preservation

Adapters must preserve existing game semantics exactly unless a deliberate semantic change is separately specified and approved. Silent behavioral drift is forbidden.

### 2.3 Snapshot Explicitness

Every adapter-produced optimization problem must reference explicit source data snapshots and adapter versioning so that replay and benchmarking remain meaningful.

### 2.4 No Hidden Derived State

If an adapter derives features or counters that affect correctness, those derivations must be explicit, deterministic, and reproducible from source records.

### 2.5 Legacy Compatibility Is Contractual

The adapter layer must explicitly describe how current engine entrypoints map into the canonical model. Legacy compatibility is not allowed to remain implicit.

## 3. Adapter Responsibilities

Every game adapter must perform all of the following.

- validate and normalize source optimization requests,
- extract candidate domains from game-specific item records,
- compile or detach game-specific formulas into canonical expressions,
- map filters and constraints into canonical feasibility constraints,
- map objective frames and tie-break rules into canonical solve targets,
- expose exact source snapshot digests,
- expose adapter metadata for validation and benchmark reporting,
- declare unsupported semantics explicitly.

## 4. Common Adapter Contract

### 4.1 Input Contract

Every adapter must accept a typed request with the following logical fields.

- optimize target entity descriptor,
- team layout descriptor when more than one slot participates,
- game-specific formula context,
- candidate domains by slot,
- shared team context,
- hard filters and exclusions,
- objective definition,
- top-N and ordering policy,
- optional auxiliary outputs,
- potential-aware solve request fields where the game exposes upgrade-capable semantics,
- runtime preference hints that do not affect correctness.

### 4.2 Output Contract

Every adapter must produce a canonical problem model containing:

- canonical problem digest,
- adapter kind and version,
- source snapshot digests,
- canonical team layout and slot descriptors when applicable,
- canonical objective expression set,
- canonical feasibility constraint set,
- canonical candidate domains,
- canonical frame axis when applicable,
- partitioning hints if derivable,
- explicit potential-aware capability and export metadata where supported,
- declared unsupported features if any.

### 4.3 Canonical Candidate Contract

Each candidate must be represented canonically with:

- candidateId,
- sourceRecordDigest,
- slot or domain assignment,
- additive feature vector,
- discrete counters,
- categorical signature,
- provenance payload sufficient for reconstruction.

If a candidate is upgrade-capable under the request semantics, the canonical payload MUST additionally expose:

- current realized state identity,
- remaining upgrade frontier or equivalent descriptor,
- legality-relevant hidden-versus-revealed upgrade state where applicable,
- enough provenance to reconstruct both current state and reachable frontier under the declared adapter semantics.

### 4.4 Canonical Solve Target Contract

The adapter must convert game-specific optimization UI concepts into:

- one primary objective,
- zero or more hard feasibility constraints,
- stable tie-break tuple,
- optional auxiliary outputs such as plot axis or diagnostic probes.

If potential-aware optimization is requested, the canonical solve target MUST also make explicit:

- whether potential participates in ranking or is auxiliary only,
- which potential-aware solve mode is requested,
- whether the potential basis is exact or certified-envelope based,
- which graph-capable auxiliary outputs are canonical outputs rather than presentation-only projections.

## 5. Source Snapshot Model

### 5.1 Snapshot Inputs

Every adapter-produced problem must carry digests for:

- item inventory snapshot,
- character or team state snapshot,
- formula data snapshot,
- stat table snapshot,
- adapter version.

### 5.2 Snapshot Stability

If any of these change, the canonical problem digest must change.

### 5.3 Replay Requirement

The adapter must provide enough metadata for offline replay to reconstruct the exact canonical problem from persisted source snapshots or a canonical adapter export.

## 6. Formula Compilation Contract

### 6.1 Supported Formula Backends

The repository exposes two formula families.

- GI legacy Waverider formula graph and solver path.
- Pando-based calculators for GI, SR, and ZZZ.

The adapter system must support both, but the canonical optimizer target is the Pando-aligned canonical representation. Legacy Waverider support is treated as compatibility infrastructure.

### 6.2 Compilation Modes

Adapters may produce canonical formulas using either:

- direct canonical construction from source formula definitions,
- or lossless detachment from an existing calculator graph.

The chosen mode must be explicit in adapter metadata.

### 6.3 Game-Local Custom Operations

Any custom operation introduced by a game formula package must be mapped to canonical operators or explicitly registered through the custom operator policy defined in the IR specification.

## 7. Filter and Constraint Mapping Contract

### 7.1 Hard Filters

All UI-level or API-level filters that exclude invalid builds must become canonical hard constraints or compatibility predicates.

### 7.2 Soft Preferences

Soft preferences are not supported unless they are encoded explicitly as objectives or tie-break dimensions. Silent heuristic preference channels are forbidden.

### 7.3 Max-Style Filters

Current solver code often inverts max-filters into min-style constraints. The adapter layer may continue to do so only if the transformation is explicit and preserved in metadata.

## 8. GI Adapter Specification

### 8.1 Scope

The GI adapter must support:

- artifact optimization,
- set exclusions and rainbow exclusions,
- plot-capable objective requests,
- legacy Waverider-backed optimization compatibility,
- Pando-backed formula integration where available,
- TC-related subproblem integration through separate explicit adapter paths.

### 8.2 Repository Integration Points

The repository exposes:

- Waverider optimization nodes and preprocessing in libs/gi/wr,
- legacy exact artifact solver API in libs/gi/solver,
- Pando-based GI calculator construction in libs/gi/formula.

The adapter architecture must acknowledge that GI straddles both legacy and newer formula systems.

### 8.3 GI Canonical Entity Model

The GI adapter must define canonical entities for:

- character state,
- weapon state,
- artifact inventory items,
- artifact set counters,
- optional team contribution context,
- optimization frame definitions.

### 8.4 GI Candidate Extraction

Artifact candidates must extract exactly:

- main stat contribution,
- substat contributions,
- set identity,
- slot identity,
- provenance to original artifact record,
- any discrete metadata needed for exact exclusion semantics.

### 8.5 GI Set Logic Mapping

The adapter must encode:

- 2-piece and 4-piece set requirements,
- rainbow restrictions,
- exclusion rules from current GI optimization APIs,
- exact compatibility semantics for set-constrained completions.

### 8.6 GI Formula Mapping

The adapter must support two modes.

#### GI Legacy Compatibility Mode

Consumes Waverider-derived OptNode problem structures and maps them into canonical problem form while preserving plot and constraint semantics.

#### GI Canonical Pando Mode

Consumes GI pando calculator state and detaches relevant optimization subgraphs into canonical formulas.

### 8.7 GI Legacy Boundary Rule

Legacy compatibility mode must not leak Waverider-specific node semantics into the core optimizer. All such semantics must be made explicit by the adapter.

### 8.8 GI TC Subproblem

The GI TC solver is structurally distinct because it optimizes roll distributions rather than inventory combinations. It must be specified as a separate adapter sub-family with:

- its own canonical candidate domain model,
- explicit materializability assumptions,
- separate validation corpus.

### 8.9 GI Migration Governance

GI dual-path support is a governed migration policy, not an indefinite semantic fork.

Any GI path status claim MUST be one of:

- `legacyValidated`,
- `dualValidated`,
- `canonicalDefault`,
- `legacyRetired`.

For GI, parity means parity against a named bounded validation corpus with fixed source snapshots, adapter version, and benchmark policy.

If full parity is not claimed, the adapter MUST publish an approved semantic-delta record describing:

- the exact affected semantics,
- the expected user-visible behavior change,
- the validation suites that remain comparable,
- the migration state being advanced.

Legacy Waverider mode and canonical Pando mode MUST share the same certificate, replay, source-snapshot, and benchmark-governance rules. They may differ only in adapter-local translation path and in approved semantic deltas that are explicitly documented.

## 9. SR Adapter Specification

### 9.1 Scope

The SR adapter must support:

- relic optimization,
- light cone optimization,
- cavern and planar set filters,
- frame-based objective composition,
- pando-based calculator detachment.

### 9.2 Current Repository Integration Points

The current repository exposes:

- SR pando calculators in libs/sr/formula,
- SR optimization entrypoint in libs/sr/solver,
- generic search backend in libs/game-opt/solver.

### 9.3 SR Canonical Entity Model

The adapter must define canonical entities for:

- character state,
- light cone state,
- relic state,
- team frame context,
- set counters for cavern and planar sets.

### 9.4 SR Candidate Extraction

Light cone candidates must encode:

- level,
- ascension,
- superimpose,
- key identity,
- provenance digest.

Relic candidates must encode:

- main stat contribution,
- substat contributions,
- set identity,
- slot identity,
- provenance digest.

### 9.5 SR Formula Detachment Contract

The adapter must detach optimization-relevant self-applied relic and light cone contributions while preserving all non-optimized team context exactly.

### 9.6 SR Set Filter Mapping

The adapter must encode:

- at-least-one matching 2-piece cavern filter,
- at-least-one matching 4-piece cavern filter,
- at-least-one matching 2-piece planar filter,
- exact compatibility semantics under partial completion.

## 10. ZZZ Adapter Specification

### 10.1 Scope

The ZZZ adapter must support:

- disc optimization,
- wengine optimization,
- 2-piece and 4-piece disc set filters,
- frame-based objective composition,
- decimal-sensitive stat filter conversion.

### 10.2 Current Repository Integration Points

The current repository exposes:

- ZZZ pando calculators in libs/zzz/formula,
- ZZZ solver configuration builder in libs/zzz/solver,
- generic search backend in libs/game-opt/solver.

### 10.3 ZZZ Canonical Entity Model

The adapter must define canonical entities for:

- character state,
- wengine state,
- disc inventory items,
- disc set counters,
- optimization frames.

### 10.4 ZZZ Candidate Extraction

Wengine candidates must encode:

- level,
- phase,
- modification,
- key identity,
- provenance digest.

Disc candidates must encode:

- main stat contribution,
- substat contribution as exact base-times-upgrades semantics,
- set identity,
- slot identity,
- provenance digest.

### 10.5 Decimal Normalization Rule

The ZZZ adapter must preserve any decimal normalization required by existing stat filter semantics. If source APIs expose display-decimal values, the adapter must convert them into canonical exact numeric form before problem digesting.

## 11. Cross-Game Canonical Feature Taxonomy

### 11.1 Shared Feature Classes

All adapters must map their source data into canonical feature classes.

- additive scalar features,
- discrete counters,
- categorical membership features,
- equipment identity features,
- branch-control features,
- provenance-only fields.

### 11.2 Feature Naming Rule

Canonical feature naming must be stable and collision-free. Game-local names may be retained only inside adapter-local namespaces.

### 11.3 Counter Semantics

Set counters and similar features must be explicit counters, not implicit encoded categories.

## 12. Tie-Break and Ordering Contract

Adapters must define the stable result ordering policy used for top-N semantics.

The ordering policy must specify:

- primary objective,
- secondary objective or tuple elements,
- canonical build identity tie-break,
- any plot-related or auxiliary ordering exclusions.

If current UI behavior has implicit ordering conventions, those conventions must be documented and encoded explicitly.

## 13. Unsupported or Deferred Semantics

If an adapter cannot yet support a source feature under the exact optimizer architecture, it must not silently approximate it.

Allowed handling:

- explicit unsupported feature error,
- explicit capability flag exclusion,
- место требует дополнительного анализа in the architecture document if the semantics are not yet frozen.

Forbidden handling:

- silent downgrade to heuristic behavior,
- silent omission of source constraints,
- silent coercion that changes ranking semantics.

## 14. Adapter Metadata Contract

Every canonical problem produced by an adapter must include metadata with:

- adapterKind,
- adapterVersion,
- sourceSnapshotDigestSet,
- formulaCompilationMode,
- featureSchemaVersion,
- filterTransformationLog,
- unsupportedFeatureList,
- replayReconstructionHints.

## 15. Adapter Validation Requirements

### 15.1 Required Validation Families

Every adapter must ship validation coverage for:

- candidate extraction correctness,
- source snapshot digest stability,
- formula detachment correctness,
- filter-to-constraint correctness,
- top-N ordering correctness,
- replay reconstruction correctness.

### 15.2 Golden Cases

Each adapter must maintain named golden cases from real repository data snapshots.

### 15.3 Legacy Compatibility Tests

Where legacy solver parity is claimed, the adapter must maintain differential tests against the current repository behavior on bounded exact workloads.

## 16. Adapter Benchmark Requirements

Each adapter must maintain benchmark suites covering:

- canonical problem construction time,
- candidate extraction throughput,
- formula detachment cost,
- source snapshot digesting cost,
- end-to-end solve performance on realistic workload families.

Adapter benchmark reports must identify whether cost increases come from adapter work or core solve work.

## 17. Repository Placement and Module Boundaries

The intended repository module layout is:

- libs/gi/lapic-adapter
- libs/sr/lapic-adapter
- libs/zzz/lapic-adapter

These adapter packages must depend on existing game-local formula and data packages but must expose only canonical problem APIs to lapic core.

The lapic core package must not depend on current gi, sr, or zzz formula packages directly.

## 18. Migration Strategy

### 18.1 Parallel Operation

The repository may run legacy and new optimizer paths in parallel during migration, but the adapter contract must already match the final architecture.

### 18.2 Legacy GI Migration

GI migration is expected to require the most care because of the coexistence of Waverider and Pando-related semantics. The adapter layer is where this coexistence must be isolated.

### 18.3 Cutover Rule

No game may cut over to the new optimizer as its primary path until:

- adapter validation passes,
- benchmark qualification passes,
- replay and checkpoint flows are validated,
- parity or intentional semantic change is documented.

## 19. Open Design Questions

### 19.1 Team-Level Optimization Adapters

Team-level and multi-entity semantics are now frozen in [team-level-adapter-boundary.md](./team-level-adapter-boundary.md).

Single-entity, fixed-support, and full multi-slot optimization are different operating modes of the same canonical team model rather than separate architectural families.

The low-level source snapshot packaging policy is now frozen in [low-level/source-snapshot-packaging.md](./low-level/source-snapshot-packaging.md).

### 19.2 Potential-Aware Optimization Adapters

lapic-side architecture for potential-aware optimization is now frozen in [potential-aware-optimization.md](./potential-aware-optimization.md).

Adapter packages remain responsible for mapping game-local upgrade semantics into canonical upgrade-capable candidate descriptors without leaking UI-specific graph behavior into lapic core.

## 20. Accepted Decisions

- GI uses a dual-path adapter architecture: legacy Waverider compatibility remains a supported production path, while canonical Pando-backed GI mode remains the long-term target and may become default only after validated parity or approved semantic delta. See [decision-log.md](./decision-log.md).

## 21. Compliance Checklist

An adapter implementation is compliant only if all answers below are yes.

1. Does it produce a canonical problem model with explicit source snapshot digests?
2. Does it preserve source semantics exactly or fail explicitly when it cannot?
3. Are all filter transformations and objective mappings explicit and replayable?
4. Can it reconstruct canonical candidates and formulas from retained snapshots?
5. Is game-specific logic fully isolated from lapic core?

## 22. Architectural Completion

With this document in place, the high-level architecture set for lapic is structurally complete.

Remaining work after this point belongs to:

- lower-level implementation specs where needed,
- migration plans,
- module-level design details,
- implementation sequencing.
