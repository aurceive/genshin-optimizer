# Runtime Protocol and Checkpoint Specification

## Status

- Draft
- Depends on: [lapic Architecture](./overview.md)
- Depends on: [Canonical Optimizer IR Specification](./canonical-ir.md)
- Depends on: [Relaxation and Certificate System Specification](./relaxation-and-certificates.md)
- Depends on: [Frontier Storage and Codec Specification](./frontier-storage-and-codec.md)
- Scope: execution runtime, inter-component protocol, worker orchestration, solve lifecycle, pause and resume, and checkpoint semantics
- Audience: runtime, solver, storage, certification, and tooling maintainers

## 1. Purpose

This document specifies the runtime contract for executing a lapic solve.

The runtime is responsible for:

- instantiating and driving a solve from canonical inputs,
- coordinating search, storage, and certification subsystems,
- preserving deterministic correctness semantics across browser and Node environments,
- supporting pause, resume, cancellation, checkpoint export and import,
- surfacing progress and diagnostics without affecting correctness.

The runtime is not allowed to weaken proof guarantees for responsiveness or convenience.

## 2. Runtime Principles

### 2.1 Deterministic Correctness

Correctness-critical runtime behavior must be deterministic under fixed:

- engine version,
- arithmetic policy,
- problem digest,
- checkpoint state.

### 2.2 Scheduling Must Not Affect Legality

Different worker counts or execution interleavings may affect performance but must not affect:

- admissibility of pruning,
- final result set,
- final optimality certificate outcome,
- replay validity.

### 2.3 Pause and Resume Are First-Class

Pause, resume, and checkpoint are core runtime behaviors, not optional extensions.

### 2.4 Explicit State Machine

The solve runtime must be modeled as an explicit state machine. Implicit lifecycle transitions are forbidden.

## 3. Runtime Roles

The runtime architecture defines the following logical roles.

### 3.1 Session Controller

Owns the solve lifecycle and public solve handle.

### 3.2 Planner

Consumes analyzed problem data and initializes frontier build and search phases.

### 3.3 Scheduler

Owns global work ordering, queue discipline, worker assignment, and spill coordination.

### 3.4 Worker Executor

Performs bounded units of analysis, frontier construction, join search, and exact residual resolution.

### 3.5 Storage Coordinator

Owns block persistence, reload, manifest closure, and checkpoint transactions.

### 3.6 Certificate Coordinator

Owns threshold snapshots, certificate emission, replay escalation, and validation hooks.

Certificate emission scope is configurable per-solve. The minimum guaranteed output is the FinalOptimalityCertificate on solve completion. Callers that require the full per-decision certificate chain — for audit, replay, or post-hoc verification — enable intermediate certificate emission at solve configuration time. The runtime behaviour is identical in both modes; only the set of emitted artifacts differs.

### 3.7 Diagnostics Streamer

Publishes progress, counters, and traces in a way that is observational only.

One process may implement multiple roles, but the protocol contracts must still be explicit.

## 4. Solve State Machine

The runtime must implement the following solve states.

1. Created
2. Initializing
3. FrontierBuilding
4. SearchRunning
5. Pausing
6. Paused
7. Checkpointing
8. Resuming
9. Finalizing
10. Completed
11. Cancelled
12. Failed

### 4.1 State Transition Rules

Allowed transitions:

- Created -> Initializing
- Initializing -> FrontierBuilding
- FrontierBuilding -> SearchRunning
- SearchRunning -> Pausing
- Pausing -> Paused
- Paused -> Checkpointing
- Paused -> Resuming
- Checkpointing -> Paused
- Resuming -> SearchRunning
- SearchRunning -> Finalizing
- Finalizing -> Completed
- any active state -> Cancelled
- any active state -> Failed

Skipping required states is forbidden unless the phase is vacuous and explicitly recorded as such.

### 4.2 State Persistence Rule

Every transition that changes the set of correctness-relevant in-memory artifacts must either:

- be fully reconstructible from already persisted state, or
- be checkpointed before the previous stable state is discarded.

### 4.3 Public Lifecycle Contract

The full solve state machine is an internal authoritative machine. The public solve session state is a stable projection of that machine.

The public state projection is:

- `created`: internal `Created`,
- `active`: internal `Initializing`, `FrontierBuilding`, or `SearchRunning`,
- `pausing`: internal `Pausing`,
- `paused`: internal `Paused`,
- `checkpointing`: internal `Checkpointing`,
- `resuming`: internal `Resuming`,
- `finalizing`: internal `Finalizing`,
- `completed`: internal `Completed`,
- `cancelled`: internal `Cancelled`,
- `failed`: internal `Failed`.

The public solve handle MUST expose the projected public state and MAY expose a finer-grained active phase as observational metadata.

The internal machine remains authoritative for replay and checkpoint legality. The projected public state exists so application code does not need to track internal stage names that are not themselves correctness boundaries.

### 4.4 Replay-Relevant and Checkpoint-Relevant States

The following internal states are replay-relevant and MUST be reconstructible from authoritative persisted state:

- `FrontierBuilding`,
- `SearchRunning`,
- `Checkpointing`,
- `Resuming`,
- `Finalizing`.

The following public states are checkpoint-relevant:

- `paused`, because normal checkpoint creation begins only from a quiescent paused authority boundary,
- `checkpointing`, because closure export is in progress and not yet authoritative,
- `completed`, because terminal checkpoint export may materialize a final proof closure,
- `failed`, only for explicitly non-resumable debugging closures.

## 5. Solve Session Model

### 5.1 Session Identity

Every solve session must have:

- sessionId
- problemDigest
- engineVersion
- arithmeticPolicyId
- runtimeProtocolVersion
- createdAt logical timestamp

### 5.2 Session Invariants

The session must maintain:

- exactly one authoritative incumbent store,
- exactly one authoritative threshold snapshot lineage,
- exactly one authoritative active queue view,
- explicit references to frontier and certificate closures.

### 5.3 Solve Handle API

The public solve handle must support:

- subscribeProgress
- subscribeDiagnostics
- requestPause
- requestCheckpoint
- requestCancel
- exportCheckpoint
- awaitCompletion
- inspectSessionState

These APIs must not expose mutable runtime internals that can bypass protocol guarantees.

The solve handle MUST report the projected public lifecycle state, not raw internal machine state names, unless an inspection API explicitly requests internal diagnostic detail.

## 6. Work Unit Model

### 6.1 Work Unit Types

The runtime must support at least these work unit kinds.

- AnalyzeRegion
- BuildFrontierBlock
- CompactFrontierBlock
- JoinFrontierBlocks
- ResolveResidualExact
- ValidateCertificate
- PersistArtifact
- ReloadArtifact

### 6.2 Work Unit Envelope

Every work unit must contain:

- workId
- workKind
- sessionId
- phaseId
- dependencySet
- referencedArtifactIds
- priorityDescriptor
- retryPolicy
- determinismClass

### 6.3 Determinism Classes

Each work unit must be classified as one of:

- correctnessCriticalDeterministic
- correctnessAdjacentDeterministic
- observationalOnly

Only observationalOnly work is allowed to vary without affecting replay.

## 7. Scheduler Model

### 7.1 Global Queue Ownership

The scheduler owns the authoritative global queue for correctness-critical work ordering.

### 7.2 Queue Ordering

For search work, the scheduler must order queue entries using the ordering defined by the architecture document:

1. highest admissible upper bound,
2. lowest uncertainty gap,
3. lowest estimated residual cost,
4. deterministic tie-break key.

The exact key material used for this ordering must be part of replay state.

### 7.2.1 Ordering Key Schema

Every correctness-critical search queue entry MUST carry a persisted ordering key with at least:

- `upperBoundOrderingKey`, representing the queue-entry admissible upper-bound tuple under result-order semantics,
- `uncertaintyGapKey`, representing deterministic threshold proximity under the same ordering basis,
- `residualCostKey`, representing deterministic residual-work estimate produced by a versioned cost model,
- `deterministicTieBreakKey`, representing a stable total-order fallback,
- `costModelVersion`, identifying the exact residual-cost model semantics.

### 7.2.2 Uncertainty Gap Definition

`uncertaintyGapKey` is not an informal heuristic.

It is the deterministic persisted key derived from:

- the queue-entry admissible upper-bound tuple,
- the authoritative threshold tuple current at queue-publication time,
- the solve ordering policy.

If the ordering basis is lexicographic and no single scalar subtraction is semantically valid, the uncertainty-gap key MUST encode the first comparison-relevant differing component together with enough exact payload to reproduce the same comparison ordering.

### 7.2.3 Residual Cost Definition

`residualCostKey` is a deterministic scheduling estimate only.

It MUST satisfy all of the following:

- it is computed only from persisted queue-entry metadata,
- it depends only on versioned cost-model semantics and replay-visible inputs,
- it MUST NOT depend on live worker count, memory pressure, wall-clock timing, or backend-specific incidental state,
- it MAY change exploration order but MUST NOT affect legality, certificate validity, or final result semantics.

If a residual-cost model changes semantically, `costModelVersion` MUST change as well.

### 7.3 Scheduler Freedom

The scheduler may assign work to workers in any way that preserves:

- the same legal decision set,
- deterministic threshold lineage,
- deterministic final proof state.

Scheduler freedom does not permit recomputing ordering keys from ambient runtime conditions that are absent from replay state.

### 7.4 Preemption Rules

Preemption is allowed only at safe points where:

- the current work unit has not partially mutated correctness-relevant shared state without journaling, or
- the mutation can be rolled back deterministically.

## 8. Worker Protocol

### 8.1 Worker Backends

The runtime must support:

- browser Web Worker execution,
- Node Worker execution,
- in-process deterministic executor.

### 8.2 Worker Contract

Workers must be protocol-driven and stateless between declared retained state checkpoints. Hidden mutable state that affects correctness decisions is forbidden.

### 8.3 Core Worker Messages

The runtime protocol must support the following logical messages.

- InitSession
- LoadArtifacts
- StartWorkUnit
- ReportProgress
- EmitArtifacts
- EmitCertificates
- RequestArtifacts
- PauseAtSafePoint
- AckPaused
- CancelWork
- AckCancelled
- FailWork
- Heartbeat

Implementations may encode these differently, but the logical semantics are mandatory.

### 8.4 Safe Point Contract

Workers must define safe points where pause and checkpoint requests can be honored without violating deterministic replay.

Safe points are required:

- between work units,
- after artifact emission and before release of authoritative references,
- after threshold snapshot publication,
- before any non-atomic compaction rewrite becomes visible.

## 9. Artifact Visibility Protocol

### 9.1 Authoritative Publication

Artifacts become authoritative only after:

- integrity validation,
- manifest publication,
- index visibility transaction,
- dependency closure registration.

### 9.2 Provisional Artifacts

Workers may emit provisional artifacts, but the scheduler must not schedule correctness-critical work against them until they become authoritative.

### 9.3 Supersession

When an artifact is superseded, the runtime must update references through an atomic visibility transition. Mixed old and new authoritative states are forbidden.

## 10. Threshold Snapshot Protocol

### 10.1 Snapshot Authority

The certificate coordinator owns authoritative threshold snapshots.

### 10.2 Snapshot Creation Triggers

New threshold snapshots are created when:

- incumbent top-N set changes,
- tie-break frontier changes materially,
- resumed session reconstructs a stronger threshold lineage.

### 10.3 Snapshot Publication

Snapshot publication must be ordered before any threshold-sensitive certificates that reference it become authoritative.

### 10.4 Snapshot Replay Requirement

Snapshot lineage must be persistable and replayable as part of checkpoint state.

## 11. Pause Protocol

### 11.1 Pause Request Semantics

Pause is a cooperative runtime request. It must not interrupt a worker in a way that leaves correctness-relevant state partially committed.

### 11.2 Pause Completion Condition

The session enters Paused only when:

- all active correctness-critical work units have either completed or reached safe point,
- all authoritative artifact transitions are fully committed,
- the scheduler queue is frozen,
- threshold snapshot lineage is stable.

### 11.3 Pause Visibility

The solve handle must report Paused only after these conditions are satisfied.

## 12. Checkpoint Protocol

### 12.1 Checkpoint Types

The runtime must support:

- paused-session checkpoint export,
- terminal checkpoint at Completed,
- failure checkpoint when enough closure exists for debugging.

### 12.2 Checkpoint Preconditions

A normal checkpoint requires the session to be in Paused or Finalizing unless a specialized crash-safe incremental checkpoint protocol is defined. No such protocol is frozen at this time.

Normal checkpoint creation begins from the quiescent internal `Paused` authority boundary. The public `checkpointing` state denotes that closure materialization or export packaging is in progress and MUST NOT yet be treated as an authoritative reusable checkpoint.

### 12.3 Checkpoint Manifest Contents

The checkpoint manifest must contain:

- session identity,
- solve state,
- problem digest,
- engine and protocol versions,
- frontier closure references,
- active queue snapshot,
- incumbent store digest,
- threshold snapshot lineage root,
- referenced certificates and relaxations,
- runtime metrics summary,
- integrity report.

### 12.4 Checkpoint Closure

The checkpoint must include the complete artifact closure necessary to:

- resume solve,
- replay correctness-critical decisions,
- validate final proof status if already completed.

### 12.5 Checkpoint Export Contract

Checkpoint export must be deterministic. Export packaging order must not depend on filesystem or IndexedDB iteration order.

Checkpoint export becomes authoritative only after all of the following are complete:

- checkpoint manifest publication,
- closure inventory publication,
- integrity verification of the exported closure,
- stable binding of the export descriptor to the published manifest digest.

Before that point, the runtime may expose only a provisional in-progress checkpoint identity.

## 13. Resume Protocol

### 13.1 Resume Preconditions

Resume requires:

- checkpoint integrity success,
- schema compatibility,
- artifact closure completeness,
- arithmetic policy compatibility,
- protocol version compatibility or approved migration path.

### 13.2 Resume Reconstruction

Resume must reconstruct:

- authoritative queue state,
- authoritative threshold lineage,
- incumbent set,
- block residency and manifests,
- certificate and relaxation references,
- pending work units in canonical order.

### 13.3 Resume Determinism

A resumed session must produce the same final result and proof state as a non-interrupted session under the same deterministic configuration.

## 14. Cancellation Protocol

### 14.1 Cancellation Semantics

Cancellation stops future progress but must not corrupt already authoritative artifacts.

### 14.2 Post-Cancel State

After cancellation, the session may optionally export a diagnostic checkpoint if and only if closure integrity can be guaranteed for the exported state.

## 15. Failure Protocol

### 15.1 Failure Classes

Failures must be classified explicitly.

- protocolFailure
- storageIntegrityFailure
- arithmeticVerificationFailure
- providerFailure
- workerFailure
- schemaCompatibilityFailure
- checkpointClosureFailure

### 15.2 Failure Handling

On failure, the runtime must:

- freeze new correctness-critical scheduling,
- preserve authoritative artifacts already committed,
- emit structured failure record,
- mark the session Failed,
- expose whether any diagnostic checkpoint is valid.

### 15.3 Forbidden Failure Handling

The runtime must not silently downgrade to weaker correctness behavior after failure.

## 16. Observability Protocol

### 16.1 Progress Events

Progress events may include:

- current solve state,
- completed work counts,
- queue depth summary,
- current threshold summary,
- frontier block counts,
- spill volume,
- validation counters.

Progress events are observational and must not be used as the sole source of truth for correctness-critical resume.

### 16.2 Trace Events

Trace events may record:

- phase transitions,
- work unit start and finish,
- artifact publication,
- certificate escalation,
- pause and resume events,
- checkpoint commits.

Trace emission must not mutate correctness-critical state.

## 17. Browser and Node Runtime Constraints

### 17.1 Browser Runtime

The browser runtime must tolerate:

- worker termination or tab suspension,
- cooperative checkpointing before long inactivity where possible,
- limited memory requiring aggressive spill.

The browser runtime must still uphold the same checkpoint and proof contracts.

### 17.2 Node Runtime

The Node runtime must support:

- longer-running solves,
- filesystem-backed checkpoints,
- offline replay and audit modes,
- deterministic benchmark mode.

### 17.3 Shared Contract

Browser and Node backends must share identical logical runtime semantics even if transport or storage implementation differs.

## 18. Security and Integrity Considerations

### 18.1 Trusted Artifact Boundary

Imported checkpoints and artifacts must be treated as untrusted until integrity and schema validation pass.

### 18.2 Protocol Validation

All inter-component messages must be schema-validated before affecting correctness-critical state.

### 18.3 Replay Safety

Replay tooling must not execute arbitrary code embedded in artifacts. All replay behavior must be driven by declarative schema and provider interfaces.

## 19. Schema Evolution and Protocol Versioning

### 19.1 Protocol Versioning

The runtime protocol must have an explicit version independent from storage and IR schema versions.

### 19.2 Compatibility Rules

Resume and imported checkpoints are allowed only when:

- runtime protocol version is compatible,
- all referenced schema versions are supported,
- any migration path preserves correctness-critical semantics.

### 19.3 Migration Rule

If migration cannot preserve full proof and replay guarantees, the checkpoint is not resumable and must be marked diagnostic-only.

## 20. Deferred Enhancements and Tuning Policies

### 20.1 Incremental Online Checkpointing Without Full Pause

This specification requires paused-state checkpointing only. Incremental fully online checkpointing is deferred until a separate crash-consistent correctness model is explicitly frozen. See [decision-log.md](./decision-log.md).

### 20.2 Optimal Worker Granularity for Large Join Blocks

The high-level protocol is fixed, and work-unit sizing is now treated as deterministic performance tuning rather than unresolved architecture. Final heuristics may evolve under benchmark governance as long as legality and final result sets remain unchanged. See [decision-log.md](./decision-log.md).

### 20.3 Deterministic Heartbeat and Progress Sampling Policy

Heartbeat and progress sampling are diagnostic-only. They must remain outside canonical state and replay legality, but exact sampling cadence is an observability policy choice rather than an architecture blocker. See [decision-log.md](./decision-log.md).

## 21. Compliance Checklist

The runtime subsystem is compliant only if all answers below are yes.

1. Does it preserve the same final result and proof state across worker counts and resumptions?
2. Can it pause only at protocol-safe points without corrupting authoritative state?
3. Can it export and import checkpoint closures sufficient for exact resume?
4. Does every authoritative artifact transition have explicit visibility semantics?
5. Does failure handling avoid silent correctness downgrades?

## 22. Required Follow-On Specifications

This document must be followed by:

1. [Validation and Benchmark Specification](./validation-and-benchmarks.md).
2. [Adapter Specification for GI, SR, and ZZZ](./adapters-gi-sr-zzz.md).

These are required before production runtime implementation is considered architecturally ready.
