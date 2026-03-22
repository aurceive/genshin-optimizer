import type {
  LapicDigest,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import { giLapicAdapterSchemaVersion } from './types'

// ---------------------------------------------------------------------------
// Migration State
// ---------------------------------------------------------------------------

/**
 * The four-state migration lifecycle for GI adapter paths.
 *
 * legacyValidated  → legacy compatibility path is validated and production-eligible
 * dualValidated    → both legacy and canonical paths are validated against the same corpus
 * canonicalDefault → canonical path is the production default; legacy remains as fallback
 * legacyRetired    → legacy path is no longer a production path
 */
export type GiLapicMigrationState =
  | 'legacyValidated'
  | 'dualValidated'
  | 'canonicalDefault'
  | 'legacyRetired'

const allowedTransitions: ReadonlyMap<
  GiLapicMigrationState,
  readonly GiLapicMigrationState[]
> = new Map([
  ['legacyValidated', ['dualValidated']],
  ['dualValidated', ['canonicalDefault']],
  ['canonicalDefault', ['legacyRetired']],
  ['legacyRetired', []],
])

export function isValidMigrationStateTransition(
  from: GiLapicMigrationState,
  to: GiLapicMigrationState
): boolean {
  return allowedTransitions.get(from)?.includes(to) ?? false
}

export const GI_LAPIC_MIGRATION_STATES: readonly GiLapicMigrationState[] = [
  'legacyValidated',
  'dualValidated',
  'canonicalDefault',
  'legacyRetired',
]

// ---------------------------------------------------------------------------
// Snapshot Policy
// ---------------------------------------------------------------------------

/**
 * Snapshot policy governs how source-data snapshots are captured, versioned,
 * and retired within a validation corpus.
 */
export interface GiLapicSnapshotPolicy {
  /** Corpus snapshots are immutable once committed. */
  readonly immutable: true
  /** Snapshot digests use content-addressed hashing; same data → same digest. */
  readonly digestDerivation: 'content-addressed'
  /** Snapshots are versioned via the corpus that references them. */
  readonly versioningRule: 'corpus-scoped'
  /** Old snapshots remain available until their parent corpus is explicitly retired. */
  readonly retirementPolicy: 'explicit-corpus-retirement'
}

export const giLapicSnapshotPolicy: GiLapicSnapshotPolicy = {
  immutable: true,
  digestDerivation: 'content-addressed',
  versioningRule: 'corpus-scoped',
  retirementPolicy: 'explicit-corpus-retirement',
}

// ---------------------------------------------------------------------------
// Validation Corpus
// ---------------------------------------------------------------------------

/**
 * A frozen validation corpus that pins the inputs for a governed milestone.
 * Per validation-and-benchmarks.md §8, every corpus case must freeze:
 * problem digest, adapter version, source snapshot digests, runtime config,
 * and arithmetic policy.
 */
export interface GiLapicValidationCorpus {
  readonly corpusId: string
  readonly adapterVersion: string
  readonly migrationState: GiLapicMigrationState
  readonly snapshotPolicy: GiLapicSnapshotPolicy
  readonly frozenSnapshotDigests: readonly LapicDigest[]
  readonly testCaseDescriptors: readonly GiLapicCorpusTestCaseDescriptor[]
  readonly approvedSemanticDeltas: readonly GiLapicSemanticDelta[]
}

/**
 * Describes one test case within a validation corpus.
 * Actual test data lives in fixtures; this is the structural reference.
 */
export interface GiLapicCorpusTestCaseDescriptor {
  readonly caseId: string
  readonly description: string
  readonly validationFamily: GiLapicValidationFamily
  readonly sourceSnapshotDigest: LapicDigest
  readonly problemDigest: LapicDigest
  readonly arithmeticPolicyId: string
  readonly expectedResultClass: GiLapicExpectedResultClass
}

export type GiLapicValidationFamily =
  | 'golden-enumeration'
  | 'differential-engine'
  | 'schema-validation'
  | 'property-based'
  | 'replay-reconstruction'

export type GiLapicExpectedResultClass =
  | 'exact-match'
  | 'bounded-parity'
  | 'structural-pass'

/**
 * Records an approved semantic difference between legacy and canonical paths.
 * Required when full parity is not claimed.
 */
export interface GiLapicSemanticDelta {
  readonly deltaId: string
  readonly affectedSemantics: string
  readonly expectedBehaviorChange: string
  readonly comparableValidationSuites: readonly string[]
  readonly approvalRationale: string
}

// ---------------------------------------------------------------------------
// Milestone Gate
// ---------------------------------------------------------------------------

/**
 * Defines the gate criteria that must be satisfied for a governed milestone.
 */
export interface GiLapicMilestoneGate {
  readonly milestoneId: string
  readonly migrationState: GiLapicMigrationState
  readonly adapterVersion: string
  readonly requiredCorpusId: string
  readonly gateCriteria: readonly GiLapicGateCriterion[]
  readonly approvedSemanticDeltas: readonly string[]
}

export interface GiLapicGateCriterion {
  readonly criterionId: string
  readonly description: string
  readonly validationFamily: GiLapicValidationFamily
  readonly required: boolean
}

/**
 * Result of validating a milestone gate.
 */
export interface GiLapicMilestoneGateResult {
  readonly milestoneId: string
  readonly migrationState: GiLapicMigrationState
  readonly passed: boolean
  readonly satisfiedCriteria: readonly string[]
  readonly unsatisfiedCriteria: readonly string[]
}

export function validateMilestoneGate(
  gate: GiLapicMilestoneGate,
  satisfiedCriterionIds: ReadonlySet<string>
): GiLapicMilestoneGateResult {
  const satisfied: string[] = []
  const unsatisfied: string[] = []

  for (const criterion of gate.gateCriteria) {
    if (satisfiedCriterionIds.has(criterion.criterionId)) {
      satisfied.push(criterion.criterionId)
    } else if (criterion.required) {
      unsatisfied.push(criterion.criterionId)
    }
  }

  return {
    milestoneId: gate.milestoneId,
    migrationState: gate.migrationState,
    passed: unsatisfied.length === 0,
    satisfiedCriteria: satisfied,
    unsatisfiedCriteria: unsatisfied,
  }
}

// ---------------------------------------------------------------------------
// Corpus Validation
// ---------------------------------------------------------------------------

export function validateGiLapicValidationCorpus(
  corpus: unknown
): LapicValidationResult<GiLapicValidationCorpus> {
  if (typeof corpus !== 'object' || corpus === null)
    return {
      ok: false,
      errors: [{ path: [], message: 'Corpus must be an object' }],
    }

  const c = corpus as Record<string, unknown>

  const errors: { path: readonly string[]; message: string }[] = []

  if (typeof c.corpusId !== 'string' || c.corpusId.length === 0)
    errors.push({
      path: ['corpusId'],
      message: 'corpusId must be a non-empty string',
    })

  if (typeof c.adapterVersion !== 'string')
    errors.push({
      path: ['adapterVersion'],
      message: 'adapterVersion must be a string',
    })

  if (
    !GI_LAPIC_MIGRATION_STATES.includes(
      c.migrationState as GiLapicMigrationState
    )
  )
    errors.push({
      path: ['migrationState'],
      message: `migrationState must be one of: ${GI_LAPIC_MIGRATION_STATES.join(', ')}`,
    })

  if (!Array.isArray(c.frozenSnapshotDigests))
    errors.push({
      path: ['frozenSnapshotDigests'],
      message: 'frozenSnapshotDigests must be an array',
    })

  if (!Array.isArray(c.testCaseDescriptors))
    errors.push({
      path: ['testCaseDescriptors'],
      message: 'testCaseDescriptors must be an array',
    })

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: c as unknown as GiLapicValidationCorpus,
    diagnostics: [],
  }
}

// ---------------------------------------------------------------------------
// legacyValidated Milestone Definition
// ---------------------------------------------------------------------------

/**
 * Gate criteria for the first governed GI adapter milestone.
 *
 * A GI adapter path claims `legacyValidated` when:
 * 1. Source snapshot digests are stable and deterministic
 * 2. Candidate extraction is lossless (all inventory items mapped)
 * 3. Filter transformations are logged and correct
 * 4. Canonical export construction is idempotent
 * 5. F-IR compilation covers the supported OptNode subset
 * 6. Emitted certificates are structurally complete
 * 7. Golden enumeration passes for compiled formulas
 */
export const giLapicLegacyValidatedGateCriteria: readonly GiLapicGateCriterion[] =
  [
    {
      criterionId: 'snapshot-digest-stability',
      description:
        'Source snapshot digests are stable and deterministic across identical inputs',
      validationFamily: 'property-based',
      required: true,
    },
    {
      criterionId: 'candidate-extraction-lossless',
      description:
        'All inventory items map to candidate domains without data loss',
      validationFamily: 'schema-validation',
      required: true,
    },
    {
      criterionId: 'filter-transformation-logged',
      description:
        'Every non-identity transformation is recorded in the filter log',
      validationFamily: 'property-based',
      required: true,
    },
    {
      criterionId: 'canonical-export-idempotent',
      description:
        'Identical requests produce structurally identical canonical exports',
      validationFamily: 'property-based',
      required: true,
    },
    {
      criterionId: 'fir-compilation-coverage',
      description:
        'F-IR compilation covers add, mul, min, max, res, threshold(const) OptNode ops',
      validationFamily: 'schema-validation',
      required: true,
    },
    {
      criterionId: 'certificate-structural-completeness',
      description:
        'All emitted certificates have complete base fields, payloads, and replay recipes',
      validationFamily: 'schema-validation',
      required: true,
    },
    {
      criterionId: 'golden-enumeration-admissibility',
      description:
        'F-IR interval bounds are admissible for all enumerated combinations',
      validationFamily: 'golden-enumeration',
      required: true,
    },
  ]

export const giLapicLegacyValidatedCorpus: GiLapicValidationCorpus = {
  corpusId: 'gi-legacy-validated-corpus-v1',
  adapterVersion: giLapicAdapterSchemaVersion,
  migrationState: 'legacyValidated',
  snapshotPolicy: giLapicSnapshotPolicy,
  frozenSnapshotDigests: [
    'artifact-snapshot-digest',
    'character-snapshot-digest',
    'weapon-snapshot-digest',
    'formula-snapshot-digest',
  ],
  testCaseDescriptors: [
    {
      caseId: 'additive-formula-golden',
      description: 'Additive formula (x + y) with 3×2 candidate space',
      validationFamily: 'golden-enumeration',
      sourceSnapshotDigest: 'artifact-snapshot-digest',
      problemDigest: 'golden-additive-problem-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'exact-match',
    },
    {
      caseId: 'multiplicative-formula-golden',
      description: 'Multiplicative formula (x * y) with 2×3 candidate space',
      validationFamily: 'golden-enumeration',
      sourceSnapshotDigest: 'artifact-snapshot-digest',
      problemDigest: 'golden-multiplicative-problem-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'exact-match',
    },
    {
      caseId: 'gi-damage-formula-golden',
      description: 'GI-like damage formula with 2×3 candidate space',
      validationFamily: 'golden-enumeration',
      sourceSnapshotDigest: 'artifact-snapshot-digest',
      problemDigest: 'golden-gi-damage-problem-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'exact-match',
    },
    {
      caseId: 'digest-determinism-property',
      description:
        'OptNode and artifact digests are stable across identical inputs',
      validationFamily: 'property-based',
      sourceSnapshotDigest: 'artifact-snapshot-digest',
      problemDigest: 'digest-determinism-property-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'structural-pass',
    },
    {
      caseId: 'canonical-export-idempotency',
      description: 'Identical requests produce identical canonical exports',
      validationFamily: 'property-based',
      sourceSnapshotDigest: 'artifact-snapshot-digest',
      problemDigest: 'canonical-export-idempotency-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'structural-pass',
    },
    {
      caseId: 'certificate-completeness-schema',
      description:
        'All emitted certificates have complete structural fields and replay recipes',
      validationFamily: 'schema-validation',
      sourceSnapshotDigest: 'artifact-snapshot-digest',
      problemDigest: 'certificate-completeness-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'structural-pass',
    },
  ],
  approvedSemanticDeltas: [],
}

export const giLapicLegacyValidatedMilestoneGate: GiLapicMilestoneGate = {
  milestoneId: 'gi-legacy-validated-v1',
  migrationState: 'legacyValidated',
  adapterVersion: giLapicAdapterSchemaVersion,
  requiredCorpusId: giLapicLegacyValidatedCorpus.corpusId,
  gateCriteria: giLapicLegacyValidatedGateCriteria,
  approvedSemanticDeltas: [],
}
