# Benchmark Governance and Browser Noise Policy

## Status

- Draft
- Depends on: [Validation and Benchmark Specification](../validation-and-benchmarks.md)
- Depends on: [Runtime and Checkpoint Specification](../runtime-and-checkpoints.md)
- Depends on: [Implementation Roadmap](../implementation-roadmap.md)
- Scope: benchmark corpus governance, benchmark profile classes, browser noise model, and regression gating policy for lapic benchmark reporting
- Audience: validation, CI, performance, runtime, and release maintainers

## 1. Purpose

This document freezes the low-level governance rules for lapic benchmarks.

It resolves the remaining low-level freeze point around benchmark corpus governance and browser benchmark noise policy without changing the parent validation architecture.

The goal is to define:

- how the benchmark corpus evolves over time,
- how benchmark ownership and fixture layout are governed,
- how browser noise is modeled for regression gating,
- how public and internal benchmark profiles relate to each other.

## 2. Non-Negotiable Rules

- Correctness qualification remains a prerequisite for any published performance claim.
- Benchmark corpus evolution MUST preserve historical comparability through explicit corpus versioning.
- Browser benchmark regressions MUST be interpreted through an explicit noise model, not ad hoc judgment.
- Public benchmark reports MUST be reproducible from retained artifacts.
- Internal benchmark suites MAY be broader or more adversarial, but they MUST NOT weaken the public correctness or reproducibility bar.

## 3. Benchmark Governance Model

### 3.1 Ownership

The lapic benchmark system MUST define the following ownership roles:

- `benchmarkGovernanceOwner`: approves corpus membership and version transitions,
- `fixtureMaintainer`: owns specific benchmark snapshots and fixture integrity,
- `reportPublisher`: owns published benchmark reports and metadata completeness,
- `regressionTriageOwner`: classifies detected regressions and approves exceptions.

One person may fill multiple roles, but the roles themselves are mandatory.

### 3.2 Repository Layout Policy

Benchmark assets MUST be partitioned logically into:

- corpus registry metadata,
- immutable input fixtures,
- retained result artifacts,
- report definitions,
- local-only scratch outputs excluded from canonical reporting.

The concrete repository-level path contract is frozen in [benchmark-fixture-layout.md](./benchmark-fixture-layout.md).

### 3.3 Corpus Registry Record

Every benchmark case included in a governed corpus MUST have a registry record with at least:

- `caseId`
- `suiteId`
- `corpusVersion`
- `ownerRole`
- `gameScope`
- `fixtureDigestSet`
- `problemDigest`
- `adapterVersion`
- `runtimeProfileClass`
- `arithmeticPolicyId`
- `validationClass`
- `caseStatus`
- `introducedInVersion`
- `deprecatedInVersion` if applicable
- `provenanceNote`

## 4. Corpus Versioning Policy

### 4.1 Version Identity

The benchmark corpus MUST have a semantic version distinct from engine version.

The corpus version changes when any governed benchmark case is:

- added,
- removed,
- materially redefined,
- reclassified for gating,
- or has its retained fixture set changed.

### 4.2 Allowed Change Classes

Corpus changes MUST be classified as one of:

- `appendOnlyMinor`: add new cases without changing existing historical cases,
- `governancePatch`: metadata or ownership correction with identical fixture digests,
- `breakingMajor`: removal, replacement, or semantic redefinition of existing governed cases.

### 4.3 Historical Comparability Rule

Historical reports are comparable only when they name the same corpus version or an explicitly declared comparable subset mapping.

If a breaking corpus change occurs, the project MUST either:

- retain a stable legacy subset for cross-version comparisons, or
- publish an explicit compatibility note that historical comparisons are intentionally broken for the affected suites.

Silent drift is forbidden.

## 5. Benchmark Profile Classes

lapic freezes three benchmark profile classes.

### 5.1 Public Profile

The public profile is the reproducible benchmark set suitable for publication in repository docs, release notes, or user-facing comparisons.

It MUST contain:

- reproducible fixtures,
- published environment descriptors,
- deterministic runtime configuration,
- correctness-qualified results only.

### 5.2 Internal Gating Profile

The internal gating profile is the CI and release qualification profile.

It MAY contain:

- broader adversarial cases,
- heavier stress cases,
- cases with restricted fixture distribution inside the repository or CI infrastructure.

It MUST still satisfy reproducibility inside the project environment.

### 5.3 Exploratory Profile

The exploratory profile is for local or research-oriented investigation.

It MAY be used for tuning and diagnosis, but it MUST NOT be used as sole evidence for performance claims or regression acceptance.

## 6. Fixture Integrity Rules

- Governed fixtures MUST be immutable once published under a corpus version.
- Fixture replacement requires a corpus version transition.
- Every governed fixture MUST be addressable by digest.
- Benchmark reports MUST record the exact fixture digests used.
- Generated benchmark inputs are allowed only if the generator seed and generator version are retained as part of the fixture identity.

The repository-level placement and ownership rules for these fixtures are frozen in [benchmark-fixture-layout.md](./benchmark-fixture-layout.md).

## 7. Browser Noise Model

### 7.1 Purpose

Browser execution environments exhibit materially higher jitter than Node and server environments because of scheduling, tab throttling, background contention, storage variance, and JIT behavior.

lapic therefore freezes a browser-specific noise interpretation model.

### 7.2 Environment Classes

Browser benchmark runs MUST be classified as one of:

- `browserControlledLab`
- `browserCI`
- `browserUncontrolledLocal`

Only `browserControlledLab` and `browserCI` runs are eligible for governed regression gating.

### 7.3 Required Run Metadata

Every governed browser benchmark run MUST record at least:

- browser name and version,
- JS engine identifier if known,
- tab visibility state,
- worker count,
- storage backend class,
- power mode if observable,
- thermal or throttling signal if observable,
- cache state classification,
- repetition count,
- warmup policy.

### 7.4 Publication Statistic

For governed browser performance reporting, the normative publication statistic is:

- median wall-clock time over valid repetitions,

with the following mandatory companions:

- sample count,
- median absolute deviation or interquartile spread,
- minimum and maximum observed value.

Mean-only publication is forbidden for browser governed reports.

### 7.5 Outlier Rule

Outlier exclusion is permitted only when the suite declares a fixed rule in advance.

The default governed browser outlier rule is:

- keep all repetitions unless a run is invalidated by explicit environmental failure markers such as background throttling, crash, or incomplete artifact closure.

Purely deleting slow runs because they look noisy is forbidden.

### 7.6 Regression Gating Rule for Browser

A browser performance regression is considered gating only when all of the following hold:

- correctness gates pass,
- environment class is governed,
- the candidate median exceeds the baseline median by more than the declared noise margin,
- the spread metrics do not indicate that the apparent regression is fully explainable by the known noise band.

### 7.7 Initial Noise Margin Policy

Until a more granular suite-specific calibration is introduced, the default browser governed noise margin is:

- `max(5%, 2 * baselineMADRatio)` relative slowdown threshold,

where `baselineMADRatio` is the baseline median absolute deviation divided by the baseline median.

If MAD is unavailable, the fallback margin is 7%.

This is an implementation freeze for initial governance policy, not a permanent mathematical claim about browser variance.

## 8. Node and Server Comparison Policy

Node or native server benchmarks remain the preferred environment for low-noise primary performance qualification.

Browser governed benchmarks are still mandatory because browser runtime is a first-class deployment target, but they are interpreted through the noise model above rather than through direct equality with server measurements.

## 9. Report Requirements

Every published governed benchmark report MUST contain:

- engine version,
- corpus version,
- profile class,
- environment descriptor,
- fixture digests or retained registry references,
- validation qualification status,
- publication statistic definitions,
- explicit statement of whether browser noise policy was applied,
- regression classification if a comparison is being made.

## 10. Regression Triage Policy

Every detected benchmark regression MUST be classified as one of:

- `truePerformanceRegression`
- `environmentalNoise`
- `benchmarkInfrastructureIssue`
- `fixtureDriftViolation`
- `correctnessBlockedComparison`

Performance regressions MAY be accepted temporarily only with an explicit triage record that includes:

- affected profile class,
- affected corpus version,
- justification,
- owner,
- planned follow-up or explicit acceptance rationale.

## 11. Public Versus Internal Policy

The project MAY maintain separate public and internal benchmark profiles.

The following rules are mandatory:

- public profiles MUST be a governed subset of the benchmark system,
- internal profiles MAY add heavier or more adversarial cases,
- internal-only results MUST be labeled as such,
- public claims MUST NOT depend on cases unavailable to repository maintainers for reproduction,
- internal profile failures MAY block release readiness even if the public profile passes.

## 12. Compliance Checklist

Before the validation and benchmarking subsystem may claim compliance with this policy, it MUST demonstrate:

- corpus versioning with explicit append-only and breaking transitions,
- retained fixture digests for governed reports,
- browser benchmark reports using median-plus-spread publication,
- browser regression triage using the declared noise policy,
- separation of public, internal, and exploratory benchmark profiles.
