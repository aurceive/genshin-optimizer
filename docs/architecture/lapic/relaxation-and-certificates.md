# Relaxation and Certificate System Specification

## Status

- Draft
- Depends on: [lapic Architecture](./overview.md)
- Depends on: [Canonical Optimizer IR Specification](./canonical-ir.md)
- Scope: admissible relaxations, numeric verification, and replayable certificate contracts
- Audience: solver, certification, numeric runtime, and storage maintainers

## 1. Purpose

This document specifies the correctness-critical system responsible for:

- grounding the reported optimum or global `topN` result in verifiable correctness machinery,
- constructing admissible upper bounds and infeasibility proofs,
- certifying prune, dominance, and reachability decisions,
- handling numeric uncertainty without weakening exactness,
- supporting deterministic replay of all correctness-critical decisions.

This system is the legal foundation of pruning. If it is unsound, the entire optimizer is unsound.

## 2. Normative Principles

The following principles are mandatory.

### 2.1 No Unsafe Prune

The system MUST NOT prune a state, block, or candidate unless a valid certificate exists or the decision is derivable from exact symbolic logic.

### 2.2 Admissibility Over Tightness

When tightness and soundness conflict, soundness wins unconditionally.

### 2.3 Numeric Uncertainty Must Escalate, Never Hide

If a numeric computation is not trustworthy enough for a correctness-critical decision, the system MUST escalate to a stronger verification mode or decline to prune.

### 2.4 Certificates Are First-Class Outputs

Certificates are not debug artifacts. The certificate infrastructure is a first-class component of the correctness system. All certificate kinds must be schema-governed, storable, replayable, and inspectable.

A completed solve outcome MUST remain grounded in governed proof material appropriate to that outcome class. Intermediate per-decision certificates provide the audit trail for individual pruning, dominance, and reachability decisions; whether the ordinary solve surface emits that full trail is a runtime configuration concern specified at the API level.

## 3. System Responsibilities

The relaxation and certificate system is responsible for all of the following.

- exact symbolic proof of trivial branch reachability and infeasibility,
- admissible upper bound construction on unresolved regions,
- lower bound tracking where useful for queue ordering and diagnostics,
- dominance proof generation for skyline compression,
- numeric danger-zone detection,
- exact replay or stronger revalidation when numeric risk is present,
- final optimality certification.

The system is not responsible for user-facing progress UI, storage transport, or work scheduling policy except where those affect certificate integrity.

## 4. Decision Classes

Every correctness-critical decision belongs to one and only one class.

### 4.1 Branch Reachability Decision

Determines that a branch arm is forced or unreachable under a region's exact guards.

### 4.2 Infeasibility Decision

Determines that no concrete completion in the current state or block can satisfy all constraints.

### 4.3 Bound Prune Decision

Determines that the admissible upper bound of the region is strictly below the current incumbent threshold under the stable comparison policy.

### 4.4 Dominance Decision

Determines that one partial state safely dominates another within the same exact signature group.

### 4.5 Final Optimality Decision

Determines that the solve is complete because every unresolved block has been exhausted or certified unable to beat the final incumbent set.

Each decision class must have a dedicated certificate form.

Potential-aware optimization does not introduce a separate top-level decision class, but it does strengthen the legality requirements of existing decision classes.

If ranking semantics depend on upgrade potential, then:

- bound prune decisions MUST compare against the declared potential-aware ordering basis rather than current value alone,
- dominance decisions MUST preserve any legality-relevant upgrade-frontier context,
- final optimality decisions MUST certify completeness against the declared potential-aware ordering policy.

## 5. Relaxation Taxonomy

The architecture defines a layered relaxation taxonomy.

### 5.1 Exact Symbolic Reductions

These are not approximations. They are exact logical consequences.

- exact interval collapse when lower equals upper,
- exact threshold forcing,
- exact branch contradiction,
- exact domain emptiness,
- exact categorical incompatibility.

These may generate certificates without numeric optimization.

### 5.2 Interval Relaxations

Interval relaxations provide coarse admissible bounds using exact region bounds on variables and kernels.

Required properties:

- cheap construction,
- exact containment of all feasible values,
- deterministic arithmetic behavior.

### 5.3 Affine Relaxations

Affine relaxations propagate variable correlations better than intervals and serve as the first serious upper-bound layer for additive and nearly affine regions.

### 5.4 McCormick Relaxations

McCormick relaxations are required for bilinear and multilinear kernels extracted from A-IR or represented in R-IR.

The implementation MUST support:

- lower and upper convex envelopes,
- lifted variables where needed,
- validity domains tied to region bounds.

### 5.5 Piecewise-Linear Relaxations

Piecewise-linear relaxations are required for:

- threshold transitions,
- min and max face selection,
- resistance transforms,
- bounded ratio kernels,
- saturating kernels.

Every piecewise-linear relaxation must declare:

- partitioned region guards,
- envelope faces,
- continuity behavior,
- exact validity domain.

### 5.6 Linear Program Relaxations

LP relaxations are required for expensive but strong admissible bounds.

The LP layer must support:

- primal solution extraction,
- dual solution extraction,
- basis or equivalent stability metadata if provider supports it,
- infeasibility certificates where available,
- deterministic provider configuration.

### 5.7 Convex Mixed-Integer Relaxations

The architecture reserves this layer for future formula families where LP is insufficiently tight but exact branching remains too expensive. It is outside this specification's required scope and does not block compliance of the bound stack. See [decision-log.md](./decision-log.md).

## 6. Relaxation Construction Pipeline

Relaxation construction proceeds as a cascade.

1. Receive a state or block region.
2. Apply exact symbolic reductions.
3. Construct interval and affine relaxations.
4. Add extracted kernel relaxations.
5. Assemble region-scoped LP relaxation if needed.
6. Evaluate result quality against decision needs.
7. If numeric confidence is insufficient, escalate verification.

The pipeline MUST be monotone in safety. Later stages may tighten bounds but may not invalidate earlier admissibility.

## 7. Relaxation Context

Every relaxation is built in a context object.

### 7.1 Required Context Fields

- problemId
- arithmeticPolicyId
- partitionId
- state or block identifier
- active region predicate set
- exact variable bounds
- compatibility signature
- incumbent threshold snapshot if decision-related
- requested decision class

### 7.2 Context Immutability

Relaxation context is immutable. If any field changes, a new context and new relaxation artifact are required.

## 8. Admissibility Rules

### 8.1 Upper Bounds

An upper bound is admissible if it is guaranteed to be greater than or equal to the true objective value of every feasible completion in the validity domain.

### 8.2 Lower Bounds

A lower bound is admissible if it is guaranteed to be less than or equal to the true objective value of at least one feasible completion represented by the state or block.

### 8.3 Infeasibility Proofs

An infeasibility proof is admissible if it rules out every feasible completion in the referenced validity domain.

### 8.4 Dominance Proofs

A dominance proof is admissible only if it proves all of the following simultaneously:

- completion compatibility inclusion,
- no worse feasible objective contribution under every completion,
- no weaker future upper bound under every completion,
- no loss of certificate information needed by downstream replay.

## 9. Bound Comparison Policy

### 9.1 Stable Ordering Basis

All bound-vs-incumbent comparisons must use the same total ordering basis as the solve result ordering, restricted to currently available information.

### 9.2 Bound Prune Rule

A bound prune is legal only if:

- upperBound is strictly below the incumbent threshold under the correctness comparison policy, and
- the upperBound certificate is validated or not in numeric danger zone.

Equality is not sufficient for prune unless the tie-break policy is also certified unable to improve the incumbent set.

### 9.3 Top-N Specific Rule

For top-N solves, the prune threshold is the current Nth incumbent under stable ordering.

The certificate must prove the current region cannot produce:

- a strictly better result, or
- an equal primary objective value with a better tie-break tuple.

## 10. Numeric Policy for Relaxations

### 10.1 Arithmetic Modes

The system uses three arithmetic modes.

#### Fast Verified Float

Native or WASM floating arithmetic with deterministic configuration and mandatory metadata capture.

#### Strong Verified Float

Higher-precision or more conservative floating arithmetic for danger-zone escalation.

#### Exact Replay Arithmetic

Exact rational or exact-decimal arithmetic used only when necessary for correctness-critical replay or revalidation.

### 10.2 Danger Zone Detection

A decision enters the numeric danger zone if any of the following hold.

- The gap between admissible upper bound and incumbent threshold is smaller than configured safe margin.
- Provider reports poor conditioning, unstable pivoting, or weak dual quality.
- Region bounds are near-degenerate in a way known to amplify numeric error.
- Repeated recomputation under deterministic float mode shows unstable comparison outcome.

### 10.3 Danger Zone Handling

When a decision is in danger zone, the system MUST do one of the following.

- Recompute using stronger verified float mode.
- Reconstruct a stronger conservative relaxation.
- Replay the local decision in exact arithmetic.
- Decline to prune.

Silent acceptance is forbidden.

## 11. LP Provider Contract

### 11.1 Provider Interface

Every LP provider must implement:

- solve(relaxationContext, linearModel)
- exportPrimalCertificate
- exportDualCertificate when meaningful
- reportNumericDiagnostics
- deterministicMode descriptor
- serializeProviderEvidence

### 11.2 Required Provider Guarantees

The provider MUST:

- run deterministically under configured mode,
- expose enough evidence for replay or conservative validation,
- separate infeasible, unbounded, and solved outcomes,
- report diagnostics needed for danger-zone policy.

### 11.3 Forbidden Provider Behavior

- hidden randomization,
- undisclosed presolve transformations that cannot be replayed or evidenced,
- adaptive tolerances that change correctness decisions without surfacing metadata,
- nondeterministic tie-breaking when certificate outcome depends on it.

## 12. Certificate Model

### 12.1 Required Certificate Fields

Every certificate MUST contain:

- certId
- certKind
- schemaVersion
- problemId
- arithmeticPolicyId
- decisionClass
- referencedStateIds or blockIds
- referencedRegionIds
- referencedRelaxIds if any
- incumbentDigest when threshold-sensitive
- evidenceDigest
- replayRecipe
- emittedAtStep
- validationStatus

### 12.2 Evidence Digests

The evidenceDigest is a content hash of all decision-relevant evidence payloads. Any change to evidence must produce a new certificate identity.

### 12.3 Replay Recipe

The replayRecipe MUST specify:

- required IR objects,
- required region predicates,
- arithmetic mode,
- provider replay path or exact replay path,
- exact comparison rule,
- expected verdict.

## 13. Certificate Kinds

### 13.1 BranchReachabilityCert

Proves that a branch arm is forced or unreachable.

Required evidence:

- branch predicate,
- exact variable bounds or exact symbolic contradiction,
- selected or rejected branch arm,
- validity region.

### 13.2 InfeasibilityCert

Proves that a state or block contains no feasible completions.

Allowed evidence sources:

- exact symbolic contradiction,
- exact categorical contradiction,
- admissible relaxation proving infeasibility,
- provider-issued infeasibility witness with replay path.

### 13.3 BoundPruneCert

Proves that the admissible upper bound of the region cannot beat the incumbent threshold.

Required evidence:

- upper bound value,
- threshold snapshot,
- tie-break exclusion proof where relevant,
- relaxation validity domain,
- numeric diagnostics,
- danger-zone handling record.

### 13.4 DominanceCert

Proves that one state dominates another within the same exact signature group.

Required evidence:

- dominating and dominated state IDs,
- signature group key,
- compatibility inclusion proof,
- monotone projection comparison,
- upper-bound profile comparison,
- certificate-context strength comparison.

### 13.5 FinalOptimalityCert

Proves that the final result set is globally optimal and complete.

Required evidence summary:

- final incumbent set digest,
- unresolved queue exhaustion or prune summary,
- count and digest of all threshold-sensitive bound prunes,
- replay status of any escalated decisions,
- stable-order completeness proof for top-N.

## 14. Certificate Replay

### 14.1 Replay Modes

The system must support:

- single-certificate replay,
- block-level replay,
- full solve replay summary.

### 14.2 Replay Output

Replay must return:

- reproduced verdict,
- validation outcome,
- arithmetic mode used,
- mismatch explanation if replay fails,
- referenced evidence digests.

### 14.3 Replay Failure Semantics

If replay cannot validate a certificate, the certificate status becomes invalid.

Invalid certificate consequences:

- it cannot be used for future pruning,
- any dependent final proof is incomplete,
- the solve must be considered uncertified until repaired or recomputed.

## 15. Dominance Certification Rules

### 15.1 Exact Signature Group Requirement

Dominance is defined only inside the same exact signature group.

### 15.2 Required Comparison Components

The dominance system must compare:

- categorical signature,
- compatibility signature,
- forced branch signature,
- monotone comparable projection,
- unresolved-region profile,
- admissible upper-bound profile,
- certificate strength metadata.

### 15.3 Forbidden Shortcuts

The following dominance shortcuts are forbidden unless separately certified.

- raw stat-wise dominance without compatibility proof,
- dominance across different unresolved branch frontiers,
- dominance that ignores tie-break relevant secondary outputs,
- dominance justified only by empirical performance.

## 16. Threshold Snapshot Semantics

Every threshold-sensitive certificate must reference a threshold snapshot.

The threshold snapshot MUST include:

- incumbent set digest,
- Nth incumbent value under stable ordering,
- tie-break frontier digest when required,
- solve step identifier.

A certificate is valid only with respect to its threshold snapshot unless replay proves equivalence under a later stronger threshold.

## 17. Relaxation Artifact Lifetime

### 17.1 Reuse Rules

A relaxation artifact may be reused only if all of the following are unchanged.

- validity domain,
- arithmetic policy,
- basis definition,
- region predicates,
- variable bounds,
- compatibility assumptions.

### 17.2 Invalidation Rules

Any change in those inputs invalidates reuse. Cached relaxations must be content-addressed by the complete normalized context.

## 18. Persistence Requirements

### 18.1 What Must Be Persistable

The following must be persistable in deterministic form.

- relaxation descriptors,
- provider evidence digests,
- numeric diagnostics relevant to danger-zone policy,
- certificates,
- threshold snapshots,
- replay recipes.

### 18.2 What Need Not Be Persisted

The following may remain transient if reconstructible from persisted evidence.

- provider internal workspace memory,
- temporary presolve scratch state,
- runtime scheduling metadata not referenced by replay.

## 19. Validation Pipeline

### 19.1 Online Validation

During solve, the system validates:

- schema correctness of new certificates,
- internal consistency of relaxation domains,
- threshold snapshot compatibility,
- danger-zone compliance.

### 19.2 Offline Validation

Offline tools must support:

- certificate replay sampling,
- full replay of escalated decisions,
- final optimality verification,
- evidence integrity scans.

### 19.3 Mandatory Validation Triggers

Validation is mandatory on:

- every exact replay escalation,
- every final optimality certificate,
- every imported checkpoint before continued solve,
- every schema version migration involving certificates.

## 20. Audit and Telemetry

The system must emit structured counters for:

- number of relaxations built per kind,
- average and worst bound gap by kind,
- number of danger-zone decisions,
- number of escalations by target arithmetic mode,
- count of prunes by certificate kind,
- replay failure count,
- invalidated cache reuse attempts.

Telemetry may use float arithmetic but must not affect correctness decisions.

## 21. Reserved Extension Points

### 21.1 Convex Mixed-Integer Layer

The extension point exists, but its final admissibility and evidence contract will be specified only if the layer is brought into scope by a later architecture decision. It is not part of this specification's required compliance set. See [decision-log.md](./decision-log.md).

## 22. Accepted Decisions

- Production LP relaxations are HiGHS-first with mandatory danger-zone verification or exact replay before correctness-critical prune decisions are accepted. See [decision-log.md](./decision-log.md).
- Exact-decimal is the canonical persisted scalar representation for correctness-critical storage and ordering. Rational arithmetic remains available as a verification escape hatch where local replay requires it. See [decision-log.md](./decision-log.md).

## 23. Compliance Checklist

The relaxation and certificate system is compliant only if all answers below are yes.

1. Can every correctness-critical prune be tied to a concrete certificate or exact symbolic proof?
2. Does every threshold-sensitive decision handle danger-zone numeric cases explicitly?
3. Can every certificate be replayed deterministically from persisted evidence?
4. Are dominance proofs restricted to exact signature groups and full compatibility semantics?
5. Can final optimality be certified without reference to transient runtime state?

## 24. Required Follow-On Specifications

This document must be followed by:

1. [Frontier Storage and Codec Specification](./frontier-storage-and-codec.md).
2. [Runtime and Checkpoint Specification](./runtime-and-checkpoints.md).
3. [Validation and Benchmark Specification](./validation-and-benchmarks.md).

These are required before correctness-critical implementation is considered architecturally ready.
