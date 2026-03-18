# lapic Architecture

## Status

- Draft
- Audience: solver, formula, runtime, storage, and frontend maintainers
- Intent: target architecture for a full production implementation
- Policy: no MVP architecture, no knowingly incomplete core design, no deliberately weak substitutes in correctness-critical paths
- Rule for unresolved topics: if a section cannot yet be specified to production depth, it must be marked as `место требует дополнительного анализа`

## 1. Purpose

This document defines the target architecture of lapic, a new optimization engine that must outperform the current engines on search spaces larger than 10^10 candidate builds while preserving exactness.

Exactness means all of the following are mandatory:

- No false pruning of the global optimum.
- Final result is the true global maximum under the stated model.
- Top-N mode returns the true global top N under a stable ordering policy.
- Every pruning decision is explainable by a verifiable bound or dominance certificate.
- Any fallback path must preserve the same guarantees.

The design targets full implementation. Deliberately weaker architectures are out of scope.

## 2. Problem Statement

We optimize over a discrete combinatorial space induced by equipment slots, set constraints, main-stat choices, substat realizations, and game-specific conditional formula logic.

The engine must support:

- Genshin Impact artifact optimization.
- Star Rail relic and light cone optimization.
- Zenless disc and wengine optimization.
- Future team and combo optimization where build state participates in larger multi-entity search.

The objective function is a symbolic formula graph with:

- affine terms,
- piecewise branches,
- monotone and non-monotone operators,
- bounded multiplicative nonlinearities,
- discrete activation thresholds,
- set counters and categorical state,
- optional secondary outputs for plots and diagnostics.

## 3. Hard Requirements

### 3.1 Correctness

- Global optimum guarantee is mandatory.
- Exact top-N guarantee is mandatory.
- Constraint satisfaction must be exact, not probabilistic.
- Numerical decisions that affect pruning must be certified.

### 3.2 Performance

- The engine must scale materially better than exhaustive cartesian search once the raw space exceeds 10^10.
- The engine must remain interactive for ordinary end-user workloads.
- The engine must support batch mode for heavy workloads with deterministic replay.

### 3.3 Operational Requirements

- Browser runtime is required.
- Node runtime is required.
- WASM acceleration is required where it improves asymptotic or practical performance without weakening guarantees.
- The engine must expose structured traces, metrics, and proof artifacts for post-hoc validation.

### 3.4 Extensibility

- Formula semantics must remain decoupled from search strategy.
- Relaxation and certification layers must be pluggable.
- State indexing must be game-agnostic above game-specific feature extraction.

## 4. Non-Goals

- Approximate solvers without certificates.
- Heuristic-only search without admissible bounds.
- Engine behavior that depends on lucky ordering or randomization for correctness.
- Architecture that assumes only one game or only one formula family.

Randomization may be used only for performance tie-breaking where correctness is unchanged.

## 5. Design Principles

### 5.1 Separate Semantics from Search

Formula definition, symbolic simplification, relaxation, state compression, search, and certification are separate layers with explicit contracts.

### 5.2 State Compression Before Search

The engine must avoid thinking in raw builds whenever equivalent or dominated partial states can be collapsed safely.

### 5.3 Bounds Must Tighten Structurally

The main performance lever is not faster brute force. The main lever is stronger exact pruning by better state representations and tighter admissible upper bounds.

### 5.4 Every Prune Must Carry Evidence

Pruning is not a side effect. It is a proof step. All correctness-critical pruning steps must produce enough structured data to be revalidated.

### 5.5 Runtime Agnostic Core

The optimization kernel must compile to both browser and Node execution backends. The architecture must not depend on browser-specific storage or message semantics.

## 6. Target High-Level Architecture

The engine is composed of nine layers.

1. Problem API Layer
2. Canonical Formula Layer
3. Structural Analysis Layer
4. State Feature Compiler
5. Indexed Partial-State Store
6. Exact Search Layer
7. Relaxation and Certification Layer
8. Runtime and Scheduling Layer
9. Validation and Telemetry Layer

### 6.1 Layer Overview

#### Problem API Layer

Receives a fully typed optimization problem:

- candidate domains by slot,
- categorical exclusions and requirements,
- formula graph,
- objective and constraints,
- top-N and tie-break policy,
- requested auxiliary outputs.

#### Canonical Formula Layer

Compiles game-specific formulas into a canonical optimizer IR with explicit semantics for:

- affine reads,
- bounded nonlinear kernels,
- threshold branches,
- categorical guards,
- set counters,
- optional secondary outputs.

#### Structural Analysis Layer

Performs symbolic analysis to derive:

- sufficient statistics,
- monotonicity domains,
- convexity and concavity regions,
- branch conditions and activation lattices,
- variable interaction graph,
- decomposable and non-decomposable subgraphs.

#### State Feature Compiler

Transforms each candidate item and each partial build into a canonical state vector partitioned into:

- additive continuous features,
- bounded discrete counters,
- categorical activation signatures,
- nonlinear kernel inputs,
- certificate metadata.

#### Indexed Partial-State Store

Stores compressed left and right partial-state frontiers with skyline and dominance filtering under exact equivalence classes.

#### Exact Search Layer

Runs a hybrid exact algorithm:

- meet-in-the-middle over partitioned slots,
- skyline-preserving partial-state compression,
- best-first branch-and-bound over state blocks,
- exact join search with certified admissible upper bounds,
- exact top-N incumbent maintenance.

#### Relaxation and Certification Layer

Provides certified upper bounds, dominance certificates, and replayable pruning witnesses.

#### Runtime and Scheduling Layer

Handles workers, storage, memory pressure, chunk scheduling, resumability, cancellation, and deterministic replay.

#### Validation and Telemetry Layer

Collects traces, validates certificates, and exposes internal counters and bottlenecks.

## 7. Canonical Optimizer IR

The new engine introduces a dedicated IR stack.

### 7.1 IR Levels

#### F-IR: Formula IR

Semantics-preserving canonical expression DAG.

Required properties:

- hash-consed nodes,
- explicit operator metadata,
- exact branch semantics,
- exact type and domain metadata,
- explicit dependency graph.

#### A-IR: Analyzed IR

F-IR annotated with:

- local and global bounds,
- monotonicity regions,
- factorization information,
- branch activation conditions,
- nonlinear kernel decomposition.

#### S-IR: State IR

Defines the exact state representation used by the search engine.

State fields are partitioned into:

- additive vector,
- discrete counter vector,
- categorical signature,
- kernel input vector,
- residual formula selector,
- provenance digest.

#### R-IR: Relaxation IR

Represents certified relaxations of nonlinear or branching structure, including:

- interval relaxations,
- affine relaxations,
- McCormick envelopes,
- piecewise-linear envelopes,
- LP-ready block formulations.

#### C-IR: Certificate IR

Represents proof artifacts for pruning and dominance decisions.

### 7.2 IR Invariants

- Every S-IR state must map to a non-empty set of concrete builds.
- Every concrete build must map to exactly one terminal S-IR state per partitioning policy.
- Every pruning step must cite the R-IR artifact and incumbent threshold used.
- Every certificate must be replayable under deterministic arithmetic policy.

## 8. Structural Analysis Layer

This layer determines what can be compressed, bounded, or decomposed exactly.

### 8.1 Required Analyses

- Constant folding and common subexpression elimination.
- Exact branch reachability analysis.
- Monotonicity analysis by region.
- Variable interaction graph extraction.
- Detection of additive separability.
- Detection of bounded bilinear and multilinear kernels.
- Detection of threshold-controlled affine regions.
- Identification of sufficient statistics for partial-state equivalence.

### 8.2 Sufficient Statistics Extraction

The layer must compute the minimal exact summary of a partial build needed to evaluate:

- all downstream constraints,
- all branch activation outcomes that the partial build can already force,
- all admissible upper bounds for unresolved variables,
- all dominance relations within the same discrete signature.

If the exact sufficient statistics cannot be minimized safely, the result must be conservative. A smaller but unsafe state key is forbidden.

### 8.3 Branch Region Partitioning

Branching operators must be rewritten into region-aware evaluation blocks.

Examples:

- threshold nodes become activation halfspaces,
- min and max nodes become active-face partitions,
- resistance and ratio nodes become bounded nonlinear kernel regions.

This is required so that relaxation quality improves when the search region shrinks.

## 9. State Representation and Compression

### 9.1 Partitioning Strategy

The search space is partitioned into partial builds. The initial target partitioning is by slot groups, but the architecture does not hardcode a specific partition. Partitioning is decided by the structural analysis layer and cost model.

The default intended family is:

- two-way partition for ordinary build search,
- recursive multi-way partition for very large spaces,
- mixed categorical partitioning when set logic dominates.

### 9.2 State Key

Each partial state is keyed by:

- additive feature vector,
- discrete counters,
- set and category signature,
- forced branch outcomes,
- unresolved branch frontier metadata,
- partition identifier.

Floating values used in keys must be represented in deterministic rational or exact-decimal form where necessary for correctness. Binary floating point may be used only in non-correctness-critical telemetry.

### 9.3 Skyline Compression

Within each exact discrete signature, partial states are skyline-compressed.

A state A dominates state B only if all of the following hold:

- A is compatible with every completion that B is compatible with.
- A is no worse than B on every monotone sufficient statistic.
- A yields an upper bound at least as high as B for every unresolved completion.
- A carries no weaker certificate metadata than B.

The last condition is important. A state with better raw stats but less informative branch-region information may not dominate another state safely.

### 9.4 Frontier Storage

Frontiers are stored in indexed blocks grouped by exact discrete signature and bound profile.

The storage layer must support:

- in-memory hot blocks,
- spillable cold blocks,
- deterministic iteration order,
- merge and compaction,
- block-level certificate metadata.

## 10. Exact Search Layer

### 10.1 Core Search Strategy

The target strategy is a hybrid of:

- exact meet-in-the-middle,
- skyline-compressed frontier join,
- best-first branch-and-bound over frontier blocks,
- exact residual enumeration only when certificates can no longer prune.

This is the primary architectural decision of the new engine.

### 10.2 Search Phases

#### Phase 1: Compile and Analyze

Compile the formula, derive sufficient statistics, and select partition strategy.

#### Phase 2: Build Partial-State Frontiers

Enumerate partition-local states, compress them exactly, and persist them in the indexed partial-state store.

#### Phase 3: Global Join Search

Join frontier blocks using best-first expansion ordered by certified upper bound.

#### Phase 4: Residual Exact Resolution

When a block cannot be pruned and cannot be compressed further, perform exact join or exact leaf enumeration.

#### Phase 5: Certification and Finalization

Validate final top-N, emit proof summary, and store replayable trace.

### 10.3 Best-First Queue Semantics

Every queue entry represents a block of unresolved join work with:

- exact compatibility predicate,
- certified upper bound,
- lower bound if available,
- completion count,
- partition coverage,
- certificate references.

Queue priority is lexicographic:

1. highest upper bound,
2. lowest uncertainty gap,
3. smallest estimated residual work,
4. deterministic tie-break key.

The queue policy must be deterministic.

### 10.4 Exact Top-N Maintenance

The incumbent store maintains the global top N with stable ordering by:

1. objective value,
2. configured secondary tie-break metrics,
3. canonical build identifier order.

Pruning uses the current Nth incumbent as threshold only when the certificate proves the queue entry cannot beat it.

## 11. Relaxation and Bounding Engine

### 11.1 Bound Stack

The engine uses a cascade of admissible bounds. Each stage may terminate the cascade if it proves a prune.

1. Exact interval propagation.
2. Affine arithmetic propagation.
3. McCormick relaxations for bilinear and multilinear kernels.
4. Piecewise-linear envelopes for threshold, ratio, resistance, and min or max regions.
5. LP relaxation over the active region.
6. `место требует дополнительного анализа`: convex mixed-integer relaxation backend selection for future hard formula families.

The cascade is ordered by cost and expected tightness. Every layer must be correctness-preserving.

### 11.2 LP Backend

The LP backend is correctness-critical and must not rely on an ad hoc simplex implementation.

Required capabilities:

- deterministic operation mode,
- primal and dual certificates,
- infeasibility and unboundedness certificates,
- WASM-compatible deployment,
- stable numeric policy with configurable exact-rational verification for pruning-critical cases.

The intended architecture is provider-based:

- HighsWasmProvider for browser and Node,
- NativeHighsProvider for server-side benchmarking,
- ExactVerificationProvider for replay and certification.

### 11.3 Bound Verification Policy

Any LP-derived pruning bound that falls within the numeric danger zone of the incumbent threshold must be revalidated before prune.

Danger zone definition:

- absolute margin below configured epsilon,
- or dual certificate quality below configured threshold,
- or region contains near-degenerate active constraints.

Revalidation options:

- exact rational replay of the local relaxation,
- stronger conservative bound,
- or no prune.

Unsafe numeric prune is forbidden.

## 12. Certificate System

### 12.1 Certificate Types

- Dominance certificate.
- Infeasibility certificate.
- Upper-bound prune certificate.
- Branch-reachability certificate.
- Final optimality certificate.

### 12.2 Certificate Contents

Each certificate stores:

- certificate kind,
- referenced state or block IDs,
- formula region identifier,
- incumbent threshold at decision time,
- relaxation artifact reference,
- exact predicate data needed for replay,
- arithmetic policy used,
- validation status.

### 12.3 Final Optimality Certificate

The final solve result must emit an optimality certificate summary stating:

- final incumbent set,
- proof that the global queue is exhausted or every remaining block is upper-bounded below threshold,
- proof that top-N order is complete,
- counts of each prune category,
- validation outcome.

## 13. Runtime and Scheduling Architecture

### 13.1 Execution Backends

The runtime must support:

- browser Web Worker backend,
- Node Worker backend,
- synchronous single-thread backend for tests and deterministic replay.

All backends implement the same runtime contract.

### 13.2 Scheduler Model

The scheduler operates on work blocks, not raw build ranges.

Scheduling features:

- best-first global queue,
- block stealing between workers,
- hot-block splitting,
- memory-pressure-aware spilling,
- deterministic replay mode,
- cooperative cancellation,
- resumable checkpoints.

### 13.3 Work Unit Format

Each work unit contains:

- state block descriptor,
- bound metadata,
- frontier references,
- exact compatibility predicate,
- residual completion estimate,
- certificate dependencies.

### 13.4 Checkpointing

Long-running solves must be checkpointable.

Checkpoint contents:

- analyzed problem digest,
- frontier block inventory,
- queue state,
- incumbent store,
- certificate log,
- runtime metrics snapshot.

Checkpoint replay must be deterministic under the same engine version and arithmetic policy.

## 14. Storage Architecture

### 14.1 Storage Roles

The storage subsystem serves three roles:

- candidate and frontier indexing,
- solve checkpoint persistence,
- trace and certificate persistence.

### 14.2 Storage Tiers

- Hot memory store for active frontiers and queue heads.
- Warm local persistent store for spill blocks and checkpoints.
- Optional cold export format for offline verification.

### 14.3 Browser Storage

The browser backend uses IndexedDB through a strict block store abstraction. The optimization core must not depend on IndexedDB-specific behavior.

### 14.4 Data Formats

Frontier and certificate records must be versioned and content-addressed.

Mandatory properties:

- forward-compatible schema envelopes,
- block checksums,
- deterministic serialization,
- compact binary representation for frontier vectors.

## 15. API Surface

### 15.1 Public Solve API

The public API returns a solve handle with:

- progress stream,
- final result promise,
- certificate summary,
- trace export,
- checkpoint export and import,
- cancellation and pause controls.

### 15.2 Diagnostic API

Diagnostics must expose:

- frontier sizes by signature,
- bound hit rates by layer,
- queue depth distribution,
- prune counts by certificate kind,
- numeric revalidation counts,
- exact leaf enumeration counts,
- storage spill volume.

### 15.3 Developer Introspection API

For debugging and research, the engine must support:

- state block inspection,
- certificate replay,
- frontier skyline visualization export,
- formula region decomposition export.

## 16. Numeric Policy

### 16.1 Arithmetic Classes

- Telemetry arithmetic may use native float.
- Non-pruning internal heuristics may use native float.
- Pruning-critical arithmetic must use verified floating plus exact replay when necessary.
- Final ordering comparisons must use deterministic policy.

### 16.2 Comparison Policy

Every comparison affecting correctness must specify:

- value representation,
- tolerance policy,
- replay policy,
- tie-break behavior.

Implicit tolerance is forbidden.

## 17. Full Solve Lifecycle

1. Receive typed optimization problem.
2. Compile formula to F-IR.
3. Run structural analysis and derive A-IR.
4. Choose partitioning and sufficient statistics.
5. Build compressed partial-state frontiers.
6. Persist frontier blocks.
7. Start best-first exact join search.
8. Tighten incumbents and emit progress.
9. Validate certificates near threshold.
10. Exhaust queue or certify all remaining blocks pruned.
11. Emit final result, certificate summary, and trace.

## 18. Compatibility with Existing Repository Structure

The intended codebase shape is:

- libs/game-opt/optimizer-core
- libs/game-opt/optimizer-runtime
- libs/game-opt/optimizer-cert
- libs/game-opt/optimizer-storage
- libs/game-opt/optimizer-debug
- libs/gi/optimizer-adapter
- libs/sr/optimizer-adapter
- libs/zzz/optimizer-adapter

Responsibilities:

- optimizer-core owns IR, analysis, compression, search, and bounds.
- optimizer-runtime owns workers, scheduling, checkpointing, and backend selection.
- optimizer-cert owns certificate data model and replay validation.
- optimizer-storage owns block store abstractions and persistence codecs.
- adapters convert game-specific formulas and items into the canonical problem API.

The existing pando and wr code should not be coupled directly into search internals. They should feed the canonical problem API through adapters.

## 19. Temporary Elements Allowed by This Architecture

Temporary elements are allowed only if they are fully compatible with the target architecture.

Currently acceptable temporary elements:

- a reduced set of relaxation providers, if the provider interface already supports the full target stack,
- a simplified block store implementation, if it already uses the final block and schema contracts,
- a subset of diagnostic views, if trace data is already captured in final form.

Currently unacceptable temporary elements:

- brute-force fallback paths that bypass certificates,
- heuristic pruning without replayable proof,
- alternate state keys that are known not to be final-safe,
- runtime-only data formats that cannot carry final frontier metadata.

## 20. Open Design Questions

The following items are intentionally not frozen and require deeper analysis before implementation decisions are final.

### 20.1 Mixed-Integer Relaxation Backend

`место требует дополнительного анализа`

The architecture reserves a provider slot for a stronger mixed-integer relaxation backend. Final choice depends on:

- browser deployability,
- certificate quality,
- deterministic replay support,
- acceptable memory footprint.

### 20.2 Global Partitioning Cost Model

`место требует дополнительного анализа`

Partition choice should be data-driven. The final cost model must estimate:

- frontier explosion risk,
- skyline density,
- bound quality after partition,
- expected join complexity.

### 20.3 Exact Representation of Build Values in Persistent Certificates

Resolved by decision: canonical correctness-critical persistence is exact-decimal-first, with rational arithmetic retained only as a verification escape hatch where local replay requires it. See [decision-log.md](./decision-log.md).

## 21. Accepted Decisions

- Canonical correctness-critical persistence is exact-decimal-first rather than general-rational-first. This is an implementation adaptation to the problem domain, not a foundational mathematical preference. See [decision-log.md](./decision-log.md).
- Production LP relaxations are HiGHS-first and must still pass danger-zone verification before correctness-critical prune decisions become legal. See [decision-log.md](./decision-log.md).
- GI migration uses a dual-path adapter strategy with legacy compatibility as a supported production path and canonical Pando mode as the long-term target. See [decision-log.md](./decision-log.md).

## 22. Verification Strategy

### 21.1 Correctness Test Families

- Golden comparison against exhaustive enumeration on small spaces.
- Adversarial formulas for branch, ratio, and nonlinear kernels.
- Certificate replay tests.
- Numeric danger-zone regression tests.
- Cross-backend determinism tests.
- Frontier dominance soundness tests.
- Top-N stability tests.

### 21.2 Property Tests

- No pruned block can contain a build above the certified threshold.
- Every returned build is feasible.
- Every omitted build is dominated by returned top-N or lies below certified threshold.
- Replay of certificate log reaches the same decision frontier.

### 21.3 Performance Benchmarks

Benchmark suites must separate:

- symbolic compilation cost,
- frontier build cost,
- search cost,
- certificate validation cost,
- storage spill cost.

Performance wins without preserved proof quality do not count.

## 23. Success Criteria

The engine is considered architecturally successful only if all of the following hold:

- It solves materially larger spaces than the current engines under exact guarantees.
- Proof-carrying pruning is implemented end-to-end.
- Browser and Node runtimes share the same correctness model.
- The engine can explain where time went and why every prune was legal.
- Future game adapters do not require search-layer rewrites.

## 24. Next Documents Derived from This One

This document is the top-level architecture. It must be followed by:

1. [Canonical IR specification](./canonical-ir.md).
2. [Relaxation and certificate specification](./relaxation-and-certificates.md).
3. [Frontier storage and codec specification](./frontier-storage-and-codec.md).
4. [Runtime and checkpoint specification](./runtime-and-checkpoints.md).
5. [Game adapter specification for GI, SR, and ZZZ](./adapters-gi-sr-zzz.md).
6. [Validation and benchmark specification](./validation-and-benchmarks.md).

These documents are required before implementation of correctness-critical modules begins.

## 25. Companion Planning Document

Implementation sequencing is tracked separately in [lapic Implementation Roadmap](./implementation-roadmap.md).
