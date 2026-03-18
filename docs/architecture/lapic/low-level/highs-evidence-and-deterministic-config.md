# HiGHS Evidence Payload and Deterministic Configuration

## Status

- Draft
- Depends on: [lapic Decision Log](../decision-log.md)
- Depends on: [Relaxation and Certificate System Specification](../relaxation-and-certificates.md)
- Depends on: [Runtime and Checkpoint Specification](../runtime-and-checkpoints.md)
- Depends on: [Validation and Benchmark Specification](../validation-and-benchmarks.md)
- Scope: deterministic HiGHS operating profile, evidence serialization, danger-zone metadata, and replay contract for correctness-critical LP use
- Audience: optimizer-cert, optimizer-runtime, optimizer-storage, validation, and provider maintainers

## 1. Purpose

This document freezes the low-level contract for using HiGHS as the primary LP provider in lapic.

It refines decision D-002 without changing it.

The goal is to define:

- the deterministic provider profile lapic treats as correctness-eligible,
- the evidence payload that must be captured for every correctness-critical LP decision,
- the diagnostics required by danger-zone escalation policy,
- the replay contract for provider-based and exact verification paths.

## 2. Non-Negotiable Rules

- HiGHS output alone is never sufficient to legalize a correctness-critical prune without satisfying the danger-zone policy.
- Every correctness-critical LP solve MUST emit structured evidence with stable schema and explicit provider configuration.
- Deterministic mode is a correctness prerequisite, not a performance option.
- Hidden presolve, hidden scaling, hidden randomization, and hidden tolerance drift are forbidden.
- Evidence sufficient for validation and replay MUST be persisted or content-addressably referenced before a certificate becomes final.

## 3. Provider Profile Model

lapic freezes one normative deterministic provider profile for initial production use:

- `providerFamily = highs`
- `providerProfileId = lapic-highs-deterministic-v1`

The profile ID is semantic and remains normative even if upstream option names change.

## 4. Deterministic Configuration Profile

### 4.1 Required Semantic Settings

The deterministic profile MUST enforce all of the following semantics:

- single-thread execution,
- fixed algorithm family selection for the relevant model class,
- deterministic presolve behavior,
- deterministic scaling behavior,
- deterministic tie-breaking where solver exposes such control,
- fixed feasibility and optimality tolerances,
- fixed iteration and time-limit policy for correctness-critical runs,
- deterministic handling of infeasible and unbounded reporting,
- stable logging disabled or redirected so it does not affect control flow.

### 4.2 Required Concrete Configuration Record

Every correctness-critical LP solve MUST capture the effective configuration record with at least:

- `providerFamily`
- `providerProfileId`
- `providerVersion`
- `buildFingerprint`
- `platformFingerprint`
- `threadCount`
- `algorithmSelection`
- `presolveMode`
- `scalingMode`
- `crossoverMode` if relevant
- `primalFeasibilityTolerance`
- `dualFeasibilityTolerance`
- `optimalityTolerance` if exposed
- `iterationLimit`
- `timeLimitPolicy`
- `randomSeedPolicy`
- `parallelPolicy`

### 4.3 Option Name Binding

Each provider implementation MUST maintain an internal mapping from the semantic configuration record above to the actual HiGHS option names used by the concrete runtime.

If upstream HiGHS renames an option, the semantic record remains normative and the binding layer must be updated without changing the evidence schema version unless semantics change.

## 5. Evidence Emission Scope

Structured HiGHS evidence is required for:

- LP-derived infeasibility certificates,
- LP-derived upper-bound prune certificates,
- threshold-sensitive incumbent comparison decisions,
- any certificate whose replay recipe names a HiGHS provider path.

It is not required for non-correctness-critical telemetry solves.

## 6. Evidence Payload Schema

Every correctness-critical LP solve MUST emit one `HighsEvidenceV1` payload with the following fields.

- `schemaKind = HighsEvidenceV1`
- `schemaVersion`
- `providerFamily`
- `providerProfileId`
- `providerVersion`
- `buildFingerprint`
- `platformFingerprint`
- `linearModelDigest`
- `relaxationDigest`
- `solveInvocationId`
- `objectiveSense`
- `solveOutcome`
- `primalStatus`
- `dualStatus`
- `objectiveValueEncodingKind`
- `objectiveValuePayload`
- `boundDirection`
- `iterationCount`
- `presolveApplied`
- `scalingApplied`
- `basisAvailability`
- `primalSolutionDigest` if solution available
- `dualSolutionDigest` if solution available
- `rowStatusDigest` if available
- `colStatusDigest` if available
- `diagnostics`
- `dangerZoneAssessment`
- `replayEligibility`
- `configRecordDigest`

All scalar payloads inside `HighsEvidenceV1` that are correctness-critical MUST use the canonical scalar classifications defined by [exact-decimal-wire-format.md](./exact-decimal-wire-format.md).

## 7. Diagnostics Subschema

The `diagnostics` section of `HighsEvidenceV1` MUST include at least:

- `maxPrimalResidual`
- `maxDualResidual`
- `maxConstraintViolation`
- `maxBoundViolation`
- `objectiveGapEstimate` if meaningful
- `conditionEstimate` if provider exposes it
- `presolveReductionCounts`
- `solverWarningFlags`
- `terminationReason`
- `numericallyQuestionable : bool`

If HiGHS does not expose a field directly, the provider MUST emit either:

- an equivalent derived metric with explicit provenance, or
- `fieldUnavailable` metadata for that field.

Silently omitting a required diagnostic is forbidden.

## 8. Danger-Zone Assessment Subschema

Every threshold-sensitive decision MUST emit `dangerZoneAssessment` with:

- `thresholdDigest`
- `comparisonDirection`
- `distanceToThresholdEncodingKind`
- `distanceToThresholdPayload`
- `dangerZoneTriggered : bool`
- `triggerReasons`
- `verificationAction`
- `verificationOutcome`
- `verificationEvidenceDigest` if additional verification ran

### 8.1 Mandatory Trigger Reasons

The provider layer MUST support at least the following trigger reasons:

- `objectiveNearThreshold`
- `poorConditioning`
- `highResidual`
- `unstableBasis`
- `providerWarning`
- `missingCriticalDiagnostic`

### 8.2 Allowed Verification Actions

- `none`
- `repeatWithConservativeNumericMode`
- `exactReplay`
- `rejectProviderDecision`

For correctness-critical prune legality, `none` is permitted only when `dangerZoneTriggered = false`.

## 9. Auxiliary Evidence Objects

The following auxiliary objects MAY be persisted separately and referenced by digest from `HighsEvidenceV1`:

- primal vector payload,
- dual vector payload,
- basis status payload,
- row and column status payload,
- model canonicalization map,
- provider stderr or diagnostic transcript classified as non-canonical telemetry.

If stored separately, their digests MUST be included in `HighsEvidenceV1`.

## 10. Replay Eligibility Classes

`replayEligibility` MUST be one of:

- `providerReplayEligible`
- `exactReplayRequired`
- `diagnosticOnly`

### 10.1 providerReplayEligible

Permitted only when:

- deterministic profile compliance is satisfied,
- all required diagnostics are present,
- no forbidden warning state is active,
- replaying the same model under the same profile is considered sufficient for validation policy.

### 10.2 exactReplayRequired

Required when:

- danger zone is triggered,
- diagnostics indicate unstable numeric behavior,
- provider evidence is incomplete for the decision class,
- validation policy escalates the solve class categorically.

### 10.3 diagnosticOnly

Allowed only for non-correctness-critical instrumentation artifacts.

## 11. Certificate Integration Rules

For every LP-backed correctness-critical certificate:

- the certificate `evidenceDigest` MUST cover `HighsEvidenceV1`,
- the certificate `replayRecipe` MUST name either provider replay or exact replay,
- certificate finalization MUST fail if the referenced evidence payload is missing,
- danger-zone compliance MUST be re-checkable without invoking hidden provider state.

## 12. Forbidden Evidence Practices

The following are forbidden:

- evidence that depends on process-local memory addresses,
- evidence that references mutable temp files without content digests,
- evidence that omits the effective deterministic profile,
- evidence that stores only human-readable logs but no structured diagnostics,
- evidence that stores rounded objective values when exact threshold comparison needs tighter values,
- evidence that requires a provider's opaque in-memory state to validate legality.

## 13. Compatibility and Versioning

- `HighsEvidenceV1` is the initial correctness-critical evidence schema for lapic.
- Any change to field meaning, mandatory diagnostics, or deterministic profile semantics requires a schema or profile version increment.
- Provider implementation upgrades MUST be validated against the same profile ID semantics before reuse in production.

## 14. Compliance Checklist

Before a provider implementation may claim compliance with this specification, it MUST demonstrate:

- deterministic repeatability tests on browser and Node targets,
- evidence emission tests for solved, infeasible, and numerically suspicious cases,
- danger-zone escalation tests with all mandatory trigger reasons,
- certificate integration tests proving `evidenceDigest` stability,
- replay tests for both `providerReplayEligible` and `exactReplayRequired` paths.
