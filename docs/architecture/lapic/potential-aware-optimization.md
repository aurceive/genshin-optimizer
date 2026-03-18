# Potential-Aware Optimization Architecture

## Status

- Draft
- Depends on: [lapic Architecture](./overview.md)
- Depends on: [Canonical Optimizer IR Specification](./canonical-ir.md)
- Depends on: [Relaxation and Certificate System Specification](./relaxation-and-certificates.md)
- Depends on: [Adapter Specification for GI, SR, and ZZZ](./adapters-gi-sr-zzz.md)
- Depends on: [Validation and Benchmark Specification](./validation-and-benchmarks.md)
- Depends on: [Implementation Roadmap](./implementation-roadmap.md)
- Scope: lapic-side architecture for upgrade-capable candidates, potential-aware ranking semantics, and graph-capable auxiliary outputs
- Audience: lapic core, adapter, certification, validation, and application-integration maintainers

## 1. Purpose

This document freezes the lapic-side architecture for potential-aware optimization.

Potential-aware optimization covers solve modes where a build is evaluated not only by its current realized value, but also by the exact or certified value range reachable through future deterministic upgrade actions that are still available to that build.

This document is intentionally limited to lapic-side semantics. It defines canonical problem, search, certificate, and auxiliary-output behavior required for integration. It does not define user-interface presentation, interaction flow, or product-level screen design.

## 2. Design Goals

Potential-aware optimization exists to support all of the following without weakening exactness.

- rank current builds while accounting for governed future upgrade potential,
- report per-build potential summaries and graph-capable auxiliary outputs,
- preserve replayability and certified pruning legality,
- avoid uncontrolled search-space explosion when exact potential can be collapsed into a smaller certified representation,
- remain compatible with team-level optimization rather than becoming a separate architecture family.

## 3. Canonical Problem Family

### 3.1 Upgrade-Capable Candidate

An upgrade-capable candidate is a canonical candidate whose future state space is not exhausted under the requested semantics.

The candidate must expose all correctness-relevant upgrade information explicitly, including at least:

- current realized state,
- remaining upgrade actions or equivalent reachable frontier descriptor,
- upgrade legality constraints,
- any hidden-versus-revealed state that affects future reachable values,
- provenance sufficient to reconstruct both current state and reachable upgrade frontier.

### 3.2 Current Value Versus Potential Value

Potential-aware optimization distinguishes three semantic quantities.

- `currentValue`: exact value of the current realized build under the canonical objective,
- `reachablePotentialEnvelope`: exact or certified upper envelope over values reachable by allowed future upgrades,
- `potentialSummary`: governed derived quantity used for reporting or optional ranking modes.

No solve mode may silently conflate these quantities.

### 3.3 Upgrade Frontier

The upgrade frontier is the canonical description of future reachable states for a candidate.

It may be represented as:

- explicit discrete reachable states,
- a compact exact combinatorial descriptor,
- a certified upper-envelope descriptor,
- or a bounded hybrid descriptor whose semantics are explicitly frozen.

The chosen representation must be deterministic, replayable, and sufficient for the claimed solve mode.

## 4. Supported Solve Modes

lapic supports the following potential-aware solve families.

### 4.1 Current-Only Solve

Ranking semantics depend only on `currentValue`.

Potential may still be emitted as auxiliary output, but it MUST NOT influence ranking, pruning, or top-N legality.

### 4.2 Current Plus Governed Potential Bonus

Ranking semantics use `currentValue` plus a separately defined governed bonus derived from potential.

This mode is allowed only when the bonus function is explicitly frozen, replayable, and compatible with certificate legality.

### 4.3 Potential-Aware Rerank

Primary solve legality is still driven by current-value ranking, but final or intermediate reranking uses a separately frozen potential summary.

This mode is allowed only if the rerank rule is explicit and its top-N semantics are documented.

### 4.4 Full Potential-Aware Exact Solve

Ranking semantics are defined directly over the exact or certified potential-aware objective.

This is the strongest mode and requires full certificate legality for all potential-sensitive prune decisions.

## 5. Objective and Ordering Semantics

### 5.1 Objective Contract

Every potential-aware request must explicitly declare:

- which solve mode is requested,
- whether potential participates in primary ranking or only in auxiliary outputs,
- whether potential semantics are exact or certified-upper-envelope based,
- which result fields are used for tie-break ordering.

### 5.2 Top-N Contract

If potential participates in ranking, then top-N semantics and prune legality MUST be defined against the full declared ordering basis, not against current value alone.

If potential is auxiliary only, then top-N legality remains current-value based and auxiliary outputs MUST NOT change result membership.

### 5.3 Ordering Exclusions

Graph-capable auxiliary outputs, per-build explanatory traces, and diagnostic-only potential summaries MUST NOT silently alter ranking order.

Any exclusion between ranking semantics and auxiliary output semantics must be explicit in the canonical ordering policy.

## 6. Search and Compression Rules

### 6.1 Potential Must Not Force Naive Blow-Up

Potential-aware optimization is not allowed to devolve automatically into exhaustive enumeration of every future upgraded build if a smaller exact or certified representation exists.

lapic may compress the upgrade frontier only when the compressed representation preserves:

- ranking semantics for the requested solve mode,
- feasibility semantics,
- admissible upper bounds,
- replayability of prune and result decisions.

### 6.2 Admissible Potential Collapse

A candidate's upgrade frontier may be collapsed into a compact descriptor if and only if the descriptor is sufficient for:

- exact current value,
- declared potential-aware ranking semantics,
- certified upper-bound construction,
- auxiliary graph reconstruction where that graph is claimed as canonical output.

### 6.3 Team-Level Compatibility

Potential-aware optimization and team-level optimization are not separate architecture families.

If a solve request is both team-level and potential-aware, the canonical team model remains authoritative and upgrade-aware candidate semantics must compose through the same slot, compatibility, reservation, and frame-axis contracts.

## 7. Bounding and Certification Rules

### 7.1 Potential-Sensitive Pruning

If potential participates in ranking, every prune decision MUST be legal under the declared potential-aware objective, not merely under current-value objective.

### 7.2 Envelope Legality

If lapic uses a certified upper envelope instead of exact future enumeration, then:

- the envelope must be explicitly represented in canonical state or certificate context,
- the envelope must be admissible for every reachable upgraded state represented by the candidate,
- any potential-sensitive threshold comparison must be replayable from persisted artifacts.

### 7.3 Auxiliary-Only Potential

If potential is auxiliary only, then certificates may ignore it for prune legality, but reported potential outputs must still be reproducible from persisted inputs and declared semantics.

## 8. Auxiliary Output Contract

### 8.1 Graph-Capable Outputs

lapic may emit graph-capable auxiliary outputs for upgrade-capable candidates.

Such outputs are canonical lapic-side result artifacts when they are explicitly requested and supported by the adapter capability surface.

They must define at least:

- output kind,
- per-result binding semantics,
- x-axis and y-axis semantic meaning,
- whether the graph is exact, upper-envelope, lower-envelope, or mixed,
- replay reconstruction requirements.

### 8.2 Non-UI Boundary

lapic defines the semantic content of graph-capable outputs, not their presentation.

UI layers may render the same canonical output in different ways without changing lapic semantics.

## 9. Game Mapping Boundary

### 9.1 GI

GI potential-aware support must be able to represent artifact future upgrade space, including remaining upgrade rolls, hidden-versus-revealed state where relevant, and any governed potential summaries already supported by repository semantics.

### 9.2 SR

SR potential-aware support may include relic or light-cone future upgrade semantics only when the adapter can export them as explicit canonical upgrade frontiers.

### 9.3 ZZZ

ZZZ potential-aware support may include disc or wengine future upgrade semantics only when the adapter can export them as explicit canonical upgrade frontiers.

### 9.4 Unsupported Cases

If a game's potential semantics cannot be represented exactly or under an approved certified envelope, the adapter must fail explicitly rather than silently degrading to heuristic behavior.

## 10. Validation and Benchmark Requirements

### 10.1 Required Validation Families

Potential-aware validation must include at least:

- exact oracle cases for small upgrade frontiers,
- parity or approved semantic-delta validation against existing repository behavior where such behavior is claimed,
- replay validation for potential-sensitive prune decisions,
- auxiliary output reconstruction checks for graph-capable outputs,
- top-N membership and ordering checks under potential-aware modes.

### 10.2 Required Benchmark Families

Potential-aware benchmark suites must include at least:

- current-only baseline solve,
- potential-summary solve,
- potential-aware rerank,
- exact or certified-envelope potential-aware solve,
- adversarial upgrade-frontier cases where naive expansion would explode.

## 11. Architectural Completion Rule

lapic is not ready to claim strong backend support for potential-aware integration merely because ordinary optimize and team-level contracts are frozen.

Readiness for potential-aware integration requires all of the following:

- this high-level spec is frozen enough to govern implementation,
- adapters can export upgrade-capable candidates under explicit capability flags,
- canonical IR and certificate contracts are extended to cover potential-aware legality,
- validation and benchmark suites contain potential-aware families,
- roadmap gates explicitly name potential-aware readiness.
