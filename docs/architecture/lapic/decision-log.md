# lapic Decision Log

## Status

- Draft
- Scope: accepted architecture decisions that close previously open questions
- Audience: all maintainers working on lapic

## D-001 Canonical Scalar Strategy

- Status: accepted
- Scope: canonical persistence, deterministic ordering, replay payloads, frontier storage, and certificate storage

### Decision

The canonical correctness-critical scalar representation is exact-decimal.

The architecture will use a decimal-first model:

- persisted correctness-critical values use normalized exact-decimal representation,
- deterministic ordering and canonical hashing are defined over that representation,
- runtime may use verified floating arithmetic for performance,
- exact rational arithmetic remains available as a verification escape hatch where a local replay path requires it.

### Rationale

- The domain data is naturally decimal-heavy.
- Canonical persistence and stable ordering become simpler and smaller than with general rational-first storage.
- This is an implementation adaptation to the problem domain, not a claim that decimal form is the foundational mathematical truth of the engine.

### Constraint

This decision may remain the primary implementation strategy only while it remains effective and semantics-preserving for the supported operator set.

## D-002 Production LP Provider Strategy

- Status: accepted
- Scope: production upper-bound construction, threshold-sensitive pruning, replay and validation

### Decision

The production LP strategy is HiGHS-first with mandatory verification on danger-zone decisions.

The architecture will use:

- deterministic HiGHS configuration as the primary LP provider,
- structured provider evidence and diagnostics captured in certificates,
- stronger conservative recomputation or exact replay for danger-zone threshold-sensitive decisions,
- no raw trust in floating LP output for correctness-critical prune legality.

### Rationale

- It provides a strong practical backend without making correctness depend on unaudited floating behavior.
- It preserves exactness by coupling LP-derived bounds to certificate validation policy.

## D-003 GI Migration Strategy

- Status: accepted
- Scope: GI adapter architecture and production cutover policy

### Decision

GI uses a dual-path adapter architecture.

- Legacy Waverider compatibility mode remains a supported production path for the new engine.
- Canonical Pando-backed GI mode remains the long-term target path.
- Production-default cutover to the canonical GI path is deferred until parity or approved semantic delta is validated.

### Rationale

- GI is the highest-risk migration case in the repository.
- The dual-path adapter keeps the optimizer core clean while isolating legacy semantics inside the adapter boundary.
- This avoids forcing a premature product decision while keeping the architecture internally coherent.
