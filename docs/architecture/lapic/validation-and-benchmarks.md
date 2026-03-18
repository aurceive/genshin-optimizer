# Validation and Benchmark Specification

## Status

- Draft
- Depends on: [lapic Architecture](./overview.md)
- Depends on: [Canonical Optimizer IR Specification](./canonical-ir.md)
- Depends on: [Relaxation and Certificate System Specification](./relaxation-and-certificates.md)
- Depends on: [Frontier Storage and Codec Specification](./frontier-storage-and-codec.md)
- Depends on: [Runtime and Checkpoint Specification](./runtime-and-checkpoints.md)
- Scope: correctness validation, replay validation, differential testing, performance benchmarking, regression gating, and reporting rules
- Audience: solver, runtime, storage, certification, CI, and performance maintainers

## 1. Purpose

This document specifies how lapic is validated and benchmarked.

The validation system must answer two independent questions:

- Is the engine correct under its declared semantics?
- Is the engine materially better than the current engines on the target problem classes?

The benchmark system must not be allowed to hide correctness regressions, and the validation system must not be allowed to claim success without reproducible evidence.

## 2. Principles

### 2.1 Correctness Dominates Performance

No performance result is valid if the tested build lacks full correctness evidence for the tested scenario.

### 2.2 Reproducibility Is Mandatory

Validation and benchmark outcomes must be reproducible from persisted inputs, engine version, runtime configuration, and environment descriptor.

### 2.3 Small Exact Oracles Are Required

The architecture must always maintain benchmarkable and fully enumerable problem families that serve as exact ground truth oracles.

### 2.4 Adversarial Testing Is Mandatory

Random and realistic workloads are insufficient. The suite must include adversarial cases explicitly designed to break pruning, replay, persistence, and numeric assumptions.

### 2.5 Metrics Must Be Semantically Defined

All published metrics must have formal definitions. Ambiguous or implementation-specific metrics are forbidden in gating.

## 3. Validation Scope

Validation covers all correctness-critical layers:

- canonical problem normalization,
- F-IR and A-IR construction,
- S-IR state equivalence and provenance,
- relaxation admissibility,
- certificate validity and replay,
- frontier storage round-trip fidelity,
- runtime pause and resume behavior,
- final result optimality and stable ordering.

## 4. Benchmark Scope

Benchmarking covers:

- symbolic compilation cost,
- analysis cost,
- frontier construction cost,
- search cost,
- certificate cost,
- spill and reload cost,
- pause and checkpoint cost,
- resume cost,
- total wall-clock solve time,
- peak memory and storage footprint.

## 5. Validation Test Families

### 5.1 Schema Validation Tests

These tests validate that artifacts and messages satisfy schema contracts.

Required targets:

- canonical problem schema,
- IR schemas,
- certificate schemas,
- storage envelopes and manifests,
- runtime protocol messages,
- checkpoint manifests.

### 5.2 Golden Enumeration Tests

These tests compare engine output against exhaustive enumeration on small spaces.

Required coverage:

- objective correctness,
- feasibility correctness,
- top-N correctness,
- tie-break correctness,
- plot or auxiliary output correctness when applicable.

### 5.3 Differential Engine Tests

These tests compare the new engine against:

- existing exact or exhaustive baselines where feasible,
- known trusted solver implementations for restricted subproblems,
- replayed checkpoints from previous engine versions when compatibility is claimed.

### 5.4 Property-Based Tests

Property tests must generate structured random problems subject to exact oracle checks or logical invariants.

Required properties:

- every returned result is feasible,
- every omitted result is either below threshold or dominated under certified rules,
- no pruned region contains a solution above the certified threshold,
- serialization and deserialization preserve exact state,
- replayed certificate verdict equals original verdict.

### 5.5 Adversarial Formula Tests

These tests stress:

- threshold-rich formulas,
- min and max face switching,
- resistance or ratio nonlinearities,
- near-degenerate numeric domains,
- competing tie-break frontiers,
- sparse and dense feature mixtures.

### 5.6 Adversarial Runtime Tests

These tests stress:

- pause at high queue churn,
- spill during certificate-heavy phases,
- checkpoint immediately after threshold updates,
- worker failure during provisional artifact emission,
- resume after large frontier spill,
- import of corrupted or partial checkpoint closures.

### 5.7 Migration and Compatibility Tests

When schema or protocol compatibility is claimed, tests must validate:

- successful import of legacy checkpoints where supported,
- correct rejection of unsupported checkpoints,
- replay equivalence after migration.

## 6. Oracle Strategy

### 6.1 Exact Enumeration Oracles

The validation suite must maintain small problem families that are fully enumerable and cover all key operator classes.

### 6.2 Restricted Trusted Solvers

For subproblems with suitable structure, the suite may use trusted external solvers as restricted oracles.

Examples:

- LP solver validation for linear relaxations,
- mixed-integer baseline for simplified bounded formulations,
- exact symbolic evaluator for branch-region checks.

### 6.3 Certificate Replay Oracles

Certificate replay is itself an oracle for correctness-critical decisions and must be treated as first-class validation.

## 7. Benchmark Corpus Design

The benchmark corpus must be partitioned into named suites.

### 7.1 Micro Benchmarks

Measure isolated components:

- F-IR canonicalization,
- region analysis,
- state encoding and decoding,
- relaxation construction,
- certificate replay,
- block serialization,
- checkpoint import and export.

### 7.2 Synthetic Scale Benchmarks

Construct parameterized families with controlled:

- branching complexity,
- nonlinear density,
- skyline density,
- signature-group count,
- frontier compression ratio,
- raw combinatorial size.

### 7.3 Realistic Gameplay Benchmarks

Use representative real-world optimization workloads from GI, SR, and ZZZ with fixed snapshots and declared data provenance.

### 7.4 Worst-Case Stress Benchmarks

Designed to minimize pruning quality, maximize ambiguity in tie-breaks, or induce heavy spill and replay load.

## 8. Benchmark Input Freezing

### 8.1 Input Snapshot Requirements

Every benchmark case must store:

- problem digest,
- adapter version,
- source data snapshot digest,
- runtime configuration,
- arithmetic policy,
- expected validation class.

### 8.2 Forbidden Benchmark Drift

Benchmark results must not be compared across silently changed datasets or adapter logic.

## 9. Metric Definitions

The benchmark system must use the following formally defined metrics.

### 9.1 RawSpaceSize

The exact count of concrete combinations before any pruning or compression.

### 9.2 FrontierCompressionRatio

The ratio of retained exact S-IR states to raw partial-state enumerations for a named phase and partition.

### 9.3 BoundPruneRate

The ratio of regions legally pruned by certified upper bounds to total explored regions of the same class.

### 9.4 DominancePruneRate

The ratio of states removed by certified dominance to total states considered inside the same signature-group family.

### 9.5 ExactLeafResolutionCount

The number of times the runtime had to fall back to residual exact resolution after higher-level compression and pruning.

### 9.6 ReplayEscalationRate

The fraction of threshold-sensitive decisions that entered numeric danger zone and required stronger verification.

### 9.7 CertificateCostShare

The fraction of total solve time attributable to certificate generation, validation, and replay escalation.

### 9.8 PeakResidentMemory

Maximum live in-memory footprint attributable to the solve session, excluding unrelated process usage where measurement tooling allows separation.

### 9.9 SpillVolume

Total bytes of frontier and related artifacts written to warm storage during the solve.

### 9.10 TimeToCertifiedOptimality

Elapsed time from solve start to issuance of FinalOptimalityCert.

## 10. Measurement Protocol

### 10.1 Environment Descriptor

Every benchmark run must record:

- machine class,
- OS,
- runtime backend,
- CPU descriptor,
- memory size,
- storage backend class,
- worker count,
- exact engine commit or version.

### 10.2 Warmup Policy

Benchmark suites must specify whether warmup is:

- prohibited,
- required and fixed,
- or measured separately.

Warmup policy must be identical across compared runs within a benchmark report.

### 10.3 Repetition Policy

Each benchmark family must define:

- number of repetitions,
- outlier handling rule,
- publication statistic,
- whether checkpoint cache is cold or warm.

### 10.4 Deterministic Mode for Benchmarks

All benchmark runs intended for regression gating must use deterministic runtime and arithmetic configuration.

## 11. Validation Gates

### 11.1 Mandatory Correctness Gates

A build fails validation if any of the following occur.

- golden enumeration mismatch,
- certificate replay mismatch,
- invalid persisted artifact closure,
- checkpoint resume divergence,
- non-deterministic final result under deterministic configuration,
- invalid final optimality certificate.

### 11.2 Numeric Safety Gates

A build fails validation if:

- danger-zone decisions are not escalated according to policy,
- replay cannot confirm escalated decisions,
- numeric diagnostics required by schema are missing.

### 11.3 Storage Gates

A build fails validation if:

- frontier block round-trip is lossy,
- manifest lineage is broken,
- checkpoint import lacks closure completeness,
- artifact hash or checksum mismatches are not detected.

## 12. Performance Gates

### 12.1 Gate Philosophy

Performance gates must be conservative and scenario-specific. They must not reward architectures that trade away proof quality.

### 12.2 Required Performance Comparisons

Named benchmark suites must compare against:

- previous accepted engine baseline,
- current production engine where applicable,
- exhaustive oracle for small spaces.

### 12.3 Gate Examples

Typical gates may include:

- no regression above allowed margin on named realistic suites,
- minimum required compression or prune ratios on synthetic suites,
- bounded checkpoint overhead on long-running suites,
- bounded replay escalation rate on stable numeric suites.

Specific numeric thresholds must live in versioned benchmark policy files, not hardcoded into this document.

## 13. Replay Validation Program

### 13.1 Replay Classes

The validation system must support:

- sampled certificate replay,
- full replay of all escalated decisions,
- full replay of final optimality summary,
- replay from imported checkpoint.

### 13.2 Mandatory Replay Scope

The following must always be replayed in validation mode:

- all danger-zone escalations,
- all final optimality certificates,
- all checkpoint resumes used in benchmark reports.

### 13.3 Replay Output Requirements

Replay reports must contain:

- validated certificate counts by kind,
- mismatch counts,
- invalid artifact references if any,
- arithmetic mode distribution,
- replay time cost.

## 14. Regression Management

### 14.1 Regression Categories

Every detected regression must be classified as:

- correctness regression,
- replay regression,
- storage regression,
- runtime determinism regression,
- performance regression,
- benchmark infrastructure regression.

### 14.2 Correctness Regression Policy

Correctness regressions block acceptance immediately.

### 14.3 Performance Regression Policy

Performance regressions require triage against:

- benchmark noise model,
- intentional architecture changes,
- improved proof strength or stronger validation costs.

Performance regression may be accepted only with explicit documentation and without violating correctness gates.

## 15. Reporting Requirements

### 15.1 Validation Report

Each validation run must emit a report containing:

- suite version,
- engine version,
- passed and failed test counts by family,
- replay validation summary,
- checkpoint validation summary,
- artifact integrity summary.

### 15.2 Benchmark Report

Each benchmark report must contain:

- benchmark corpus version,
- environment descriptor,
- raw metrics,
- derived metrics,
- baseline comparisons,
- correctness qualification status.

### 15.3 Publication Rule

A benchmark report must not be published as evidence of improvement unless the same run or referenced paired validation run passed all correctness gates.

## 16. CI and Offline Modes

### 16.1 CI Mode

CI mode must run:

- schema validation,
- targeted golden enumeration tests,
- sampled property tests,
- mandatory replay validation,
- storage round-trip tests,
- a reduced but representative benchmark smoke suite.

### 16.2 Offline Audit Mode

Offline audit mode must support:

- full certificate replay,
- checkpoint closure verification,
- full benchmark reproduction,
- deterministic report generation.

## 17. Data Retention and Artifact Retention

### 17.1 Retention Requirements

Validation and benchmark pipelines must retain enough artifacts to reproduce failures and published benchmark claims.

### 17.2 Minimum Retained Items

For retained runs, the system must preserve:

- problem digests,
- benchmark configuration,
- validation and benchmark reports,
- checkpoint or replay closure sufficient for reproduction,
- engine version identifiers.

## 18. Open Design Questions

The remaining high-level validation architecture is materially complete.

The following low-level governance policy is now frozen in [low-level/benchmark-governance-and-browser-noise.md](./low-level/benchmark-governance-and-browser-noise.md):

- long-horizon benchmark corpus governance,
- browser benchmark noise model and gating policy,
- public versus internal benchmark profile policy.

## 19. Compliance Checklist

The validation and benchmark system is compliant only if all answers below are yes.

1. Can it prove correctness against exact or certified oracles on representative suites?
2. Can it replay every escalated numeric decision and final optimality certificate?
3. Can it detect checkpoint and storage integrity regressions?
4. Are benchmark results reproducible and coupled to correctness qualification?
5. Are performance regressions separated cleanly from correctness regressions?

## 20. Required Follow-On Specifications

This document leaves one major remaining architecture family to be written:

1. Adapter Specification for GI, SR, and ZZZ.

That document is required before production implementation planning is considered architecturally complete.
