# Team-Level Adapter Architecture

## Status

- Draft
- Depends on: [lapic Architecture](./overview.md)
- Depends on: [Canonical Optimizer IR Specification](./canonical-ir.md)
- Depends on: [Adapter Specification for GI, SR, and ZZZ](./adapters-gi-sr-zzz.md)
- Depends on: [Validation and Benchmark Specification](./validation-and-benchmarks.md)
- Depends on: [Implementation Roadmap](./implementation-roadmap.md)
- Scope: canonical multi-entity and team-level adapter semantics in lapic
- Audience: adapter, lapic core, validation, and roadmap maintainers

## 1. Purpose

This document freezes the architecture for team-level and multi-entity optimization semantics in lapic.

It defines the canonical team problem model, team-aware compatibility semantics, provenance rules, validation requirements, and migration constraints needed for exact team optimization.

Single-entity optimization is a degenerate special case of the same model, not a separate architectural family.

## 2. Design Rules

### 2.1 Exactness First

Team-level semantics must remain exact. No team-aware adapter may use heuristic omission of cross-entity constraints or buffs.

### 2.2 Single-Entity Is a Team Problem of Arity One

Single-entity optimization is represented as a team problem with one optimization-participating slot and zero required partner slots.

### 2.3 Game-Local Semantics Stop at the Adapter Boundary

Game-local notions such as resonance, faction rules, role triggers, squad assists, rotation presets, or team buff tagging must be normalized by the adapter into canonical team semantics before entering lapic core.

### 2.4 Ordered Layout Is Explicit

If slot order matters for a game, it must be explicit in the canonical team layout. If order does not matter, the adapter must still provide a deterministic canonical slot ordering.

### 2.5 Shared State Must Be Serializable

Any team-wide or cross-entity state that can affect ranking, legality, or replay must be serialized as canonical team context or frame data. Hidden calculator closures are forbidden.

## 3. Canonical Team Problem Model

### 3.1 Top-Level Team Problem Envelope

Every team-level canonical problem must contain all of the following.

- team layout descriptor,
- slot descriptors in canonical order,
- shared team context payload,
- zero or more frame descriptors,
- per-slot candidate domains,
- cross-slot compatibility and uniqueness rules,
- canonical objective and tie-break contract,
- canonical replay and provenance payload,
- adapter metadata and source snapshot digests.

### 3.2 Team Layout Descriptor

The team layout descriptor must freeze:

- `teamKind`, identifying the game-local family after canonical normalization,
- `slotCount`,
- ordered `slotIds`,
- slot-role taxonomy,
- whether each slot is required, optional, or fixed-external,
- whether order is semantic or canonical-only,
- frame-axis presence and interpretation.

### 3.3 Slot Descriptor

Each slot descriptor must define at least:

- `slotId`,
- `slotRole`,
- participation mode,
- allowed occupant domain,
- allowed equipment-domain ownership model,
- whether the slot contributes to objective, constraints, or only support state,
- whether the slot may remain empty.

### 3.4 Participation Modes

The architecture supports the following canonical participation modes.

- `optimizedBuild`: occupant identity is fixed, build or equipment assignment is optimized.
- `optimizedOccupantAndBuild`: both occupant selection and build assignment are optimized.
- `fixedBuild`: occupant and build are fixed but still contribute team semantics.
- `externalSummary`: no concrete inventory ownership is optimized, but the slot contributes explicit summarized team context.

### 3.5 Shared Team Context

Shared team context must carry all correctness-relevant state not owned by a single slot, including at least:

- enemy or environment overrides,
- team-wide conditionals,
- resonance, faction, attribute, or path-style aggregate rules,
- adapter mode,
- game-level flags that affect activation or legality,
- any shared counters or shields whose state is not reducible to one slot only.

### 3.6 Frame Axis

If a game uses preset frames, rotations, stance windows, or weighted snapshots, the adapter must export an explicit ordered frame axis.

Each frame must define at least:

- `frameId`,
- deterministic order,
- semantic tag payload,
- optional weight or multiplier,
- frame-local conditionals,
- frame-local bonus or constraint bundles.

SR frame presets map directly to this axis. GI and ZZZ may use a single implicit default frame when no richer team-axis is needed.

## 4. Cross-Entity Semantics

### 4.1 Interaction Scopes

All cross-entity effects must normalize into one of the following canonical scopes.

- self-only,
- specific target slot,
- all occupied slots,
- all occupied slots except source,
- team aggregate,
- enemy or environment aggregate.

### 4.2 Activation Predicate Families

Every team-level activation condition must normalize into explicit predicates over canonical team state. Supported predicate families include:

- slot occupancy predicates,
- categorical count predicates,
- same-family or same-attribute predicates,
- not-self predicates,
- ordered-neighbor or previous-actor predicates,
- frame-local predicates,
- explicit event-capability predicates,
- shared-state threshold predicates.

### 4.3 Shared Resource Exclusivity

The adapter must explicitly classify all exclusive resources that cannot be duplicated across slots.

These may include:

- logical actor identity,
- concrete inventory item identity,
- weapon, light cone, wengine, or equivalent equipment identity,
- artifact, relic, or disc identity,
- adapter-declared unique semantic families.

If a resource is exclusive, the canonical problem must represent that exclusivity as a hard compatibility rule, not an informal adapter convention.

### 4.4 Team Aggregate Semantics

Aggregate semantics such as resonance, faction thresholds, set-team buffs, or squad-trigger conditions must be represented as explicit team facts rather than implicit re-reading behavior hidden in calculator code.

## 5. Canonical Compatibility Model

### 5.1 Exact Signature Group Key

Every team-capable S-IR state must expose an exact discrete signature group key that includes at least:

- occupied slot mask,
- chosen logical actor identities,
- exclusive resource claim summary,
- frame-axis identity,
- adapter semantic mode,
- any branch-local discrete team mode needed to prevent unsound dominance.

Dominance comparison is forbidden across different exact signature group keys.

### 5.2 Team Compatibility Signature

The compatibility signature must summarize all join-relevant future completion facts.

It must include at least:

- occupancy requirements for still-open slots,
- actor uniqueness and mutual-exclusion families,
- exclusive resource claims,
- categorical aggregate counts already achieved,
- categorical lower-bound obligations still unmet,
- provided capability facts,
- remaining required capability facts,
- branch-conditioned compatibility toggles,
- frame-sensitive shared-state summary.

### 5.3 Join Legality Rule

Two partial states are join-compatible only if all of the following hold.

- Their occupied slot sets do not conflict.
- Their exclusive resource claims do not conflict.
- Their actor uniqueness families do not conflict.
- Their semantic mode and frame-axis identities are join-compatible.
- Their combined aggregate counts and capability facts do not violate any hard team rule.

### 5.4 Conservative Indexing Rule

Storage-level compatibility indexes may over-approximate joinability, but they must never produce false negatives. Exact legality is decided only by the canonical compatibility signature and exact join checks.

## 6. Candidate Provenance and Replay

### 6.1 Slot-Level Provenance

Every candidate assigned to a team slot must retain provenance sufficient to reconstruct:

- source entity identity,
- source record digests,
- chosen build or equipment variant,
- exclusive resource claims,
- slot assignment,
- adapter-local derivations used for canonical feature extraction.

### 6.2 Team-Level Provenance

Every team-level canonical export must additionally retain:

- team layout digest,
- shared team context digest,
- frame-axis digest when applicable,
- cross-slot rule descriptor version,
- team-wide compatibility signature schema version,
- per-slot provenance handles.

### 6.3 Replay Requirement

Replay artifacts must be sufficient to reconstruct the exact canonical team problem and any accepted team-level prune or dominance decision.

Replay of team-level decisions must not depend on hidden UI state, mutable database ordering, or reconstructed defaults that were not serialized.

## 7. Objective and Constraint Semantics

### 7.1 Supported Objective Forms

The team architecture supports:

- single-slot objective with fixed support team context,
- weighted aggregate objective over multiple occupied slots,
- frame-weighted objective over one or more slots,
- lexicographic objective tuples involving team and slot metrics.

### 7.2 Hard Constraint Forms

Supported hard team constraints include:

- roster composition rules,
- uniqueness and exclusivity rules,
- per-slot stat constraints,
- team-aggregate stat constraints,
- frame-local constraints,
- compatibility predicates derived from game semantics.

### 7.3 Tie-Break Contract

Tie-break ordering for team-level results must be explicit and deterministic. It must specify:

- objective tuple order,
- per-slot identity tie-break,
- team identity tie-break,
- canonical candidate ordering under identical numeric scores.

## 8. Game Mapping Rules

### 8.1 GI Mapping

GI team-level mapping must support an ordered four-member roster, enemy override and resonance context, and team buff graph semantics including self, non-self, team-wide, and enemy-directed effects.

GI team optimization may optimize one slot with fixed support, multiple slots jointly, or full team build composition, but all modes must still normalize into the same canonical team model.

### 8.2 SR Mapping

SR team-level mapping must preserve ordered teammate metadata plus explicit frame presets.

Per-frame conditionals, bonus stats, and stat constraints are team-level semantics, not UI-only annotations, and must be represented through the canonical frame axis.

### 8.3 ZZZ Mapping

ZZZ team-level mapping must preserve the optimized active agent plus teammate roster semantics, including squad-member triggers, same-attribute or same-faction predicates, and shared-state effects such as squad-wide buffs or active-character-shared shield semantics.

### 8.4 Cross-Game Rule

No game may bypass the canonical team model by passing opaque calculator-team bundles directly into lapic core.

## 9. Validation and Benchmark Requirements

### 9.1 Validation Families

Team-level validation must cover at least:

- slot occupancy and uniqueness correctness,
- team capability activation correctness,
- frame-axis replay correctness,
- aggregate stat and count correctness,
- multi-slot ordering stability,
- parity against existing repository behavior where parity is claimed.

### 9.2 Benchmark Corpus Classes

Team-level benchmark corpus must include at least:

- fixed-roster build optimization,
- joint multi-slot optimization with exclusive inventory resources,
- frame-sensitive team optimization,
- capability-trigger-heavy teams,
- benchmark cases where composition legality, not just numeric objective, determines pruning behavior.

## 10. Migration and Cutover Rules

### 10.1 Production Cutover Rule

No game may claim team-level production cutover until all of the following are true.

- canonical team export is implemented,
- team-level replay is validated,
- team-level benchmark corpus is qualified,
- unsupported semantics are explicitly flagged,
- parity or approved semantic delta is documented.

### 10.2 Partial Support Rule

Games may ship fixed-support or subset team optimization before full team composition search, but any such partial support must be declared as a subset of the canonical team model rather than a separate architecture.

### 10.3 Architectural Completion Rule

With this document, team-level semantics are no longer architecturally deferred. Remaining work is implementation, validation, and game-by-game migration.
