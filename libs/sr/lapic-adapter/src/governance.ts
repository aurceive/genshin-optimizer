import type {
  LapicDiagnostic,
  LapicDigest,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import { srLapicAdapterSchemaVersion } from './types'

// ---------------------------------------------------------------------------
// Migration State
// ---------------------------------------------------------------------------

/**
 * The four-state migration lifecycle for SR adapter paths.
 *
 * legacyValidated  → legacy compatibility path is validated and production-eligible
 * dualValidated    → both legacy and canonical paths are validated against the same corpus
 * canonicalDefault → canonical path is the production default; legacy remains as fallback
 * legacyRetired    → legacy path is no longer a production path
 */
export type SrLapicMigrationState =
  | 'legacyValidated'
  | 'dualValidated'
  | 'canonicalDefault'
  | 'legacyRetired'

const allowedTransitions: ReadonlyMap<
  SrLapicMigrationState,
  readonly SrLapicMigrationState[]
> = new Map([
  ['legacyValidated', ['dualValidated']],
  ['dualValidated', ['canonicalDefault']],
  ['canonicalDefault', ['legacyRetired']],
  ['legacyRetired', []],
])

export function isValidMigrationStateTransition(
  from: SrLapicMigrationState,
  to: SrLapicMigrationState
): boolean {
  return allowedTransitions.get(from)?.includes(to) ?? false
}

export const SR_LAPIC_MIGRATION_STATES: readonly SrLapicMigrationState[] = [
  'legacyValidated',
  'dualValidated',
  'canonicalDefault',
  'legacyRetired',
]

// ---------------------------------------------------------------------------
// Snapshot Policy
// ---------------------------------------------------------------------------

export interface SrLapicSnapshotPolicy {
  readonly immutable: true
  readonly digestDerivation: 'content-addressed'
  readonly versioningRule: 'corpus-scoped'
  readonly retirementPolicy: 'explicit-corpus-retirement'
}

export const srLapicSnapshotPolicy: SrLapicSnapshotPolicy = {
  immutable: true,
  digestDerivation: 'content-addressed',
  versioningRule: 'corpus-scoped',
  retirementPolicy: 'explicit-corpus-retirement',
}

// ---------------------------------------------------------------------------
// Validation Corpus
// ---------------------------------------------------------------------------

export interface SrLapicValidationCorpus {
  readonly corpusId: string
  readonly adapterVersion: string
  readonly migrationState: SrLapicMigrationState
  readonly snapshotPolicy: SrLapicSnapshotPolicy
  readonly frozenSnapshotDigests: readonly LapicDigest[]
  readonly testCaseDescriptors: readonly SrLapicCorpusTestCaseDescriptor[]
  readonly approvedSemanticDeltas: readonly SrLapicSemanticDelta[]
}

export interface SrLapicCorpusTestCaseDescriptor {
  readonly caseId: string
  readonly description: string
  readonly validationFamily: SrLapicValidationFamily
  readonly sourceSnapshotDigest: LapicDigest
  readonly problemDigest: LapicDigest
  readonly arithmeticPolicyId: string
  readonly expectedResultClass: SrLapicExpectedResultClass
}

export type SrLapicValidationFamily =
  | 'golden-enumeration'
  | 'differential-engine'
  | 'schema-validation'
  | 'property-based'
  | 'replay-reconstruction'

export type SrLapicExpectedResultClass =
  | 'exact-match'
  | 'bounded-parity'
  | 'structural-pass'

export interface SrLapicSemanticDelta {
  readonly deltaId: string
  readonly affectedSemantics: string
  readonly expectedBehaviorChange: string
  readonly comparableValidationSuites: readonly string[]
  readonly approvalRationale: string
}

// ---------------------------------------------------------------------------
// Milestone Gate
// ---------------------------------------------------------------------------

export interface SrLapicMilestoneGate {
  readonly milestoneId: string
  readonly migrationState: SrLapicMigrationState
  readonly adapterVersion: string
  readonly requiredCorpusId: string
  readonly gateCriteria: readonly SrLapicGateCriterion[]
  readonly approvedSemanticDeltas: readonly string[]
}

export interface SrLapicGateCriterion {
  readonly criterionId: string
  readonly description: string
  readonly validationFamily: SrLapicValidationFamily
  readonly required: boolean
}

export interface SrLapicMilestoneGateResult {
  readonly milestoneId: string
  readonly migrationState: SrLapicMigrationState
  readonly passed: boolean
  readonly satisfiedCriteria: readonly string[]
  readonly unsatisfiedCriteria: readonly string[]
}

export function validateMilestoneGate(
  gate: SrLapicMilestoneGate,
  satisfiedCriterionIds: ReadonlySet<string>
): SrLapicMilestoneGateResult {
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

export function validateSrLapicValidationCorpus(
  corpus: unknown
): LapicValidationResult<SrLapicValidationCorpus> {
  if (typeof corpus !== 'object' || corpus === null)
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'InvalidInput',
          message: 'Corpus must be an object',
        },
      ],
    }

  const c = corpus as Record<string, unknown>

  const diagnostics: LapicDiagnostic[] = []

  if (typeof c['corpusId'] !== 'string' || c['corpusId'].length === 0)
    diagnostics.push({
      severity: 'error',
      code: 'InvalidInput',
      message: 'corpusId must be a non-empty string',
      path: ['corpusId'],
    })

  if (typeof c['adapterVersion'] !== 'string')
    diagnostics.push({
      severity: 'error',
      code: 'InvalidInput',
      message: 'adapterVersion must be a string',
      path: ['adapterVersion'],
    })

  if (
    !SR_LAPIC_MIGRATION_STATES.includes(
      c['migrationState'] as SrLapicMigrationState
    )
  )
    diagnostics.push({
      severity: 'error',
      code: 'InvalidInput',
      message: `migrationState must be one of: ${SR_LAPIC_MIGRATION_STATES.join(', ')}`,
      path: ['migrationState'],
    })

  if (!Array.isArray(c['frozenSnapshotDigests']))
    diagnostics.push({
      severity: 'error',
      code: 'InvalidInput',
      message: 'frozenSnapshotDigests must be an array',
      path: ['frozenSnapshotDigests'],
    })

  if (!Array.isArray(c['testCaseDescriptors']))
    diagnostics.push({
      severity: 'error',
      code: 'InvalidInput',
      message: 'testCaseDescriptors must be an array',
      path: ['testCaseDescriptors'],
    })

  if (diagnostics.length > 0) return { ok: false, diagnostics }

  return {
    ok: true,
    value: c as unknown as SrLapicValidationCorpus,
    diagnostics: [],
  }
}

// ---------------------------------------------------------------------------
// legacyValidated Milestone Definition
// ---------------------------------------------------------------------------

export const srLapicLegacyValidatedGateCriteria: readonly SrLapicGateCriterion[] =
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
      criterionId: 'pando-detach-compilation-coverage',
      description:
        'Pando-detach compilation covers the supported formula node subset',
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
        'Interval bounds are admissible for all enumerated combinations',
      validationFamily: 'golden-enumeration',
      required: true,
    },
  ]

export const srLapicLegacyValidatedCorpus: SrLapicValidationCorpus = {
  corpusId: 'sr-legacy-validated-corpus-v1',
  adapterVersion: srLapicAdapterSchemaVersion,
  migrationState: 'legacyValidated',
  snapshotPolicy: srLapicSnapshotPolicy,
  frozenSnapshotDigests: [
    'relic-snapshot-digest',
    'character-snapshot-digest',
    'light-cone-snapshot-digest',
    'formula-snapshot-digest',
  ],
  testCaseDescriptors: [
    {
      caseId: 'additive-formula-golden',
      description: 'Additive formula (x + y) with 3×2 candidate space',
      validationFamily: 'golden-enumeration',
      sourceSnapshotDigest: 'relic-snapshot-digest',
      problemDigest: 'golden-additive-problem-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'exact-match',
    },
    {
      caseId: 'multiplicative-formula-golden',
      description: 'Multiplicative formula (x * y) with 2×3 candidate space',
      validationFamily: 'golden-enumeration',
      sourceSnapshotDigest: 'relic-snapshot-digest',
      problemDigest: 'golden-multiplicative-problem-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'exact-match',
    },
    {
      caseId: 'sr-damage-formula-golden',
      description: 'SR-like damage formula with 2×3 candidate space',
      validationFamily: 'golden-enumeration',
      sourceSnapshotDigest: 'relic-snapshot-digest',
      problemDigest: 'golden-sr-damage-problem-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'exact-match',
    },
    {
      caseId: 'digest-determinism-property',
      description:
        'Relic and light-cone digests are stable across identical inputs',
      validationFamily: 'property-based',
      sourceSnapshotDigest: 'relic-snapshot-digest',
      problemDigest: 'digest-determinism-property-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'structural-pass',
    },
    {
      caseId: 'canonical-export-idempotency',
      description: 'Identical requests produce identical canonical exports',
      validationFamily: 'property-based',
      sourceSnapshotDigest: 'relic-snapshot-digest',
      problemDigest: 'canonical-export-idempotency-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'structural-pass',
    },
    {
      caseId: 'certificate-completeness-schema',
      description:
        'All emitted certificates have complete structural fields and replay recipes',
      validationFamily: 'schema-validation',
      sourceSnapshotDigest: 'relic-snapshot-digest',
      problemDigest: 'certificate-completeness-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'structural-pass',
    },
  ],
  approvedSemanticDeltas: [],
}

export const srLapicLegacyValidatedMilestoneGate: SrLapicMilestoneGate = {
  milestoneId: 'sr-legacy-validated-v1',
  migrationState: 'legacyValidated',
  adapterVersion: srLapicAdapterSchemaVersion,
  requiredCorpusId: srLapicLegacyValidatedCorpus.corpusId,
  gateCriteria: srLapicLegacyValidatedGateCriteria,
  approvedSemanticDeltas: [],
}
