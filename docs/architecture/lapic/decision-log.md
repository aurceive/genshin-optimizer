# lapic Decision Log

## Status

- Draft
- Scope: accepted architecture decisions that close previously open questions
- Audience: all maintainers working on lapic

## D-001 Canonical Scalar Strategy

- Status: accepted
- Scope: canonical persistence, deterministic ordering, replay payloads, frontier storage, and certificate storage

### D-001 Decision

The canonical correctness-critical scalar representation is exact-decimal.

The architecture will use a decimal-first model:

- persisted correctness-critical values use normalized exact-decimal representation,
- deterministic ordering and canonical hashing are defined over that representation,
- runtime may use verified floating arithmetic for performance,
- exact rational arithmetic remains available as a verification escape hatch where a local replay path requires it.

### D-001 Rationale

- The domain data is naturally decimal-heavy.
- Canonical persistence and stable ordering become simpler and smaller than with general rational-first storage.
- This is an implementation adaptation to the problem domain, not a claim that decimal form is the foundational mathematical truth of the engine.

### D-001 Constraint

This decision may remain the primary implementation strategy only while it remains effective and semantics-preserving for the supported operator set.

## D-002 Production LP Provider Strategy

- Status: accepted
- Scope: production upper-bound construction, threshold-sensitive pruning, replay and validation

### D-002 Decision

The production LP strategy is HiGHS-first with mandatory verification on danger-zone decisions.

The architecture will use:

- deterministic HiGHS configuration as the primary LP provider,
- structured provider evidence and diagnostics captured in certificates,
- stronger conservative recomputation or exact replay for danger-zone threshold-sensitive decisions,
- no raw trust in floating LP output for correctness-critical prune legality.

### D-002 Rationale

- It provides a strong practical backend without making correctness depend on unaudited floating behavior.
- It preserves exactness by coupling LP-derived bounds to certificate validation policy.

## D-003 GI Migration Strategy

- Status: accepted
- Scope: GI adapter architecture and production cutover policy

### D-003 Decision

GI uses a dual-path adapter architecture.

- Legacy Waverider compatibility mode remains a supported production path for the new engine.
- Canonical Pando-backed GI mode remains the long-term target path.
- Production-default cutover to the canonical GI path is deferred until parity or approved semantic delta is validated.

### D-003 Rationale

- GI is the highest-risk migration case in the repository.
- The dual-path adapter keeps the optimizer core clean while isolating legacy semantics inside the adapter boundary.
- This avoids forcing a premature product decision while keeping the architecture internally coherent.

## D-004 Convex Mixed-Integer Scope Boundary

- Status: accepted
- Scope: future stronger relaxation layers beyond LP for hard formula families

### D-004 Decision

The convex mixed-integer relaxation layer remains a reserved extension point and is explicitly outside the current production-required scope for lapic.

The current architecture freezes the following:

- Interval, affine, McCormick, piecewise-linear, and LP relaxations are the required correctness-critical bound stack,
- no current package, validation gate, or production-readiness claim may require a convex mixed-integer backend,
- adding a convex mixed-integer layer later requires a new architecture decision covering provider choice, admissibility contract, evidence payload, and replay legality.

### D-004 Rationale

- Current supported game families do not need convex mixed-integer relaxation to keep the architecture exact and production-credible.
- Treating this as a reserved extension point preserves future headroom without allowing it to block the current engine architecture.

## D-005 Deterministic Tuning Boundary

- Status: accepted
- Scope: partition cost models, worker granularity, sparse block layout tuning, and progress sampling policy

### D-005 Decision

Performance-tuning choices are not top-level architecture blockers as long as they obey fixed determinism and correctness boundaries.

The current architecture freezes the following:

- partition scoring must be deterministic for a fixed engine version and input state,
- worker granularity may affect performance only and must never affect legality or final result sets,
- sparse storage layout details may evolve behind stable artifact contracts,
- heartbeat and progress sampling are diagnostic-only and must not influence canonical state, replay legality, or artifact identity,
- tuning changes must be benchmark-qualified and versioned where they affect retained benchmark comparisons.

### D-005 Rationale

- These topics are real engineering work, but they are implementation-tuned policy choices rather than unresolved correctness architecture.
- Freezing invariants while leaving room for measured tuning is stricter and more useful than pretending to know final constants now.

## D-006 Checkpoint Scope Boundary

- Status: accepted
- Scope: resumable checkpoint modes and storage-pack optimization features

### D-006 Decision

Paused-state checkpointing is the only required resumable checkpoint mode for current lapic production scope.

The current architecture freezes the following:

- paused checkpoint export and import are correctness-critical and required,
- incremental online checkpointing without full pause is deferred,
- cross-checkpoint deduplicated artifact packs are deferred,
- deferred checkpoint optimizations must not be prerequisites for single-entity production readiness.

### D-006 Rationale

- This keeps the crash-consistency and replay model small and auditable.
- It avoids making advanced storage optimizations look like unresolved architectural correctness gaps.
