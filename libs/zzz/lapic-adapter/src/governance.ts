import type {
  LapicDiagnostic,
  LapicDigest,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import { zzzLapicAdapterSchemaVersion } from './types'

// ---------------------------------------------------------------------------
// Migration State
// ---------------------------------------------------------------------------

/**
 * The four-state migration lifecycle for ZZZ adapter paths.
 *
 * legacyValidated  → legacy compatibility path is validated and production-eligible
 * dualValidated    → both legacy and canonical paths are validated against the same corpus
 * canonicalDefault → canonical path is the production default; legacy remains as fallback
 * legacyRetired    → legacy path is no longer a production path
 */
export type ZzzLapicMigrationState =
  | 'legacyValidated'
  | 'dualValidated'
  | 'canonicalDefault'
  | 'legacyRetired'

const allowedTransitions: ReadonlyMap<
  ZzzLapicMigrationState,
  readonly ZzzLapicMigrationState[]
> = new Map([
  ['legacyValidated', ['dualValidated']],
  ['dualValidated', ['canonicalDefault']],
  ['canonicalDefault', ['legacyRetired']],
  ['legacyRetired', []],
])

export function isValidMigrationStateTransition(
  from: ZzzLapicMigrationState,
  to: ZzzLapicMigrationState
): boolean {
  return allowedTransitions.get(from)?.includes(to) ?? false
}

export const ZZZ_LAPIC_MIGRATION_STATES: readonly ZzzLapicMigrationState[] = [
  'legacyValidated',
  'dualValidated',
  'canonicalDefault',
  'legacyRetired',
]

// ---------------------------------------------------------------------------
// Snapshot Policy
// ---------------------------------------------------------------------------

export interface ZzzLapicSnapshotPolicy {
  readonly immutable: true
  readonly digestDerivation: 'content-addressed'
  readonly versioningRule: 'corpus-scoped'
  readonly retirementPolicy: 'explicit-corpus-retirement'
}

export const zzzLapicSnapshotPolicy: ZzzLapicSnapshotPolicy = {
  immutable: true,
  digestDerivation: 'content-addressed',
  versioningRule: 'corpus-scoped',
  retirementPolicy: 'explicit-corpus-retirement',
}

// ---------------------------------------------------------------------------
// Validation Corpus
// ---------------------------------------------------------------------------

export interface ZzzLapicValidationCorpus {
  readonly corpusId: string
  readonly adapterVersion: string
  readonly migrationState: ZzzLapicMigrationState
  readonly snapshotPolicy: ZzzLapicSnapshotPolicy
  readonly frozenSnapshotDigests: readonly LapicDigest[]
  readonly testCaseDescriptors: readonly ZzzLapicCorpusTestCaseDescriptor[]
  readonly approvedSemanticDeltas: readonly ZzzLapicSemanticDelta[]
}

export interface ZzzLapicCorpusTestCaseDescriptor {
  readonly caseId: string
  readonly description: string
  readonly validationFamily: ZzzLapicValidationFamily
  readonly sourceSnapshotDigest: LapicDigest
  readonly problemDigest: LapicDigest
  readonly arithmeticPolicyId: string
  readonly expectedResultClass: ZzzLapicExpectedResultClass
}

export type ZzzLapicValidationFamily =
  | 'golden-enumeration'
  | 'differential-engine'
  | 'schema-validation'
  | 'property-based'
  | 'replay-reconstruction'

export type ZzzLapicExpectedResultClass =
  | 'exact-match'
  | 'bounded-parity'
  | 'structural-pass'

export interface ZzzLapicSemanticDelta {
  readonly deltaId: string
  readonly affectedSemantics: string
  readonly expectedBehaviorChange: string
  readonly comparableValidationSuites: readonly string[]
  readonly approvalRationale: string
}

// ---------------------------------------------------------------------------
// Milestone Gate
// ---------------------------------------------------------------------------

export interface ZzzLapicMilestoneGate {
  readonly milestoneId: string
  readonly migrationState: ZzzLapicMigrationState
  readonly adapterVersion: string
  readonly requiredCorpusId: string
  readonly gateCriteria: readonly ZzzLapicGateCriterion[]
  readonly approvedSemanticDeltas: readonly string[]
}

export interface ZzzLapicGateCriterion {
  readonly criterionId: string
  readonly description: string
  readonly validationFamily: ZzzLapicValidationFamily
  readonly required: boolean
}

export interface ZzzLapicMilestoneGateResult {
  readonly milestoneId: string
  readonly migrationState: ZzzLapicMigrationState
  readonly passed: boolean
  readonly satisfiedCriteria: readonly string[]
  readonly unsatisfiedCriteria: readonly string[]
}

export function validateMilestoneGate(
  gate: ZzzLapicMilestoneGate,
  satisfiedCriterionIds: ReadonlySet<string>
): ZzzLapicMilestoneGateResult {
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

export function validateZzzLapicValidationCorpus(
  corpus: unknown
): LapicValidationResult<ZzzLapicValidationCorpus> {
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
    !ZZZ_LAPIC_MIGRATION_STATES.includes(
      c['migrationState'] as ZzzLapicMigrationState
    )
  )
    diagnostics.push({
      severity: 'error',
      code: 'InvalidInput',
      message: `migrationState must be one of: ${ZZZ_LAPIC_MIGRATION_STATES.join(', ')}`,
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
    value: c as unknown as ZzzLapicValidationCorpus,
    diagnostics: [],
  }
}

// ---------------------------------------------------------------------------
// legacyValidated Milestone Definition
// ---------------------------------------------------------------------------

export const zzzLapicLegacyValidatedGateCriteria: readonly ZzzLapicGateCriterion[] =
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

export const zzzLapicLegacyValidatedCorpus: ZzzLapicValidationCorpus = {
  corpusId: 'zzz-legacy-validated-corpus-v1',
  adapterVersion: zzzLapicAdapterSchemaVersion,
  migrationState: 'legacyValidated',
  snapshotPolicy: zzzLapicSnapshotPolicy,
  frozenSnapshotDigests: [
    'disc-snapshot-digest',
    'character-snapshot-digest',
    'wengine-snapshot-digest',
    'formula-snapshot-digest',
  ],
  testCaseDescriptors: [
    {
      caseId: 'additive-formula-golden',
      description: 'Additive formula (x + y) with 3×2 candidate space',
      validationFamily: 'golden-enumeration',
      sourceSnapshotDigest: 'disc-snapshot-digest',
      problemDigest: 'golden-additive-problem-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'exact-match',
    },
    {
      caseId: 'multiplicative-formula-golden',
      description: 'Multiplicative formula (x * y) with 2×3 candidate space',
      validationFamily: 'golden-enumeration',
      sourceSnapshotDigest: 'disc-snapshot-digest',
      problemDigest: 'golden-multiplicative-problem-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'exact-match',
    },
    {
      caseId: 'zzz-damage-formula-golden',
      description: 'ZZZ-like damage formula with 2×3 candidate space',
      validationFamily: 'golden-enumeration',
      sourceSnapshotDigest: 'disc-snapshot-digest',
      problemDigest: 'golden-zzz-damage-problem-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'exact-match',
    },
    {
      caseId: 'digest-determinism-property',
      description:
        'Disc and wengine digests are stable across identical inputs',
      validationFamily: 'property-based',
      sourceSnapshotDigest: 'disc-snapshot-digest',
      problemDigest: 'digest-determinism-property-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'structural-pass',
    },
    {
      caseId: 'canonical-export-idempotency',
      description: 'Identical requests produce identical canonical exports',
      validationFamily: 'property-based',
      sourceSnapshotDigest: 'disc-snapshot-digest',
      problemDigest: 'canonical-export-idempotency-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'structural-pass',
    },
    {
      caseId: 'certificate-completeness-schema',
      description:
        'All emitted certificates have complete structural fields and replay recipes',
      validationFamily: 'schema-validation',
      sourceSnapshotDigest: 'disc-snapshot-digest',
      problemDigest: 'certificate-completeness-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'structural-pass',
    },
  ],
  approvedSemanticDeltas: [],
}

export const zzzLapicLegacyValidatedMilestoneGate: ZzzLapicMilestoneGate = {
  milestoneId: 'zzz-legacy-validated-v1',
  migrationState: 'legacyValidated',
  adapterVersion: zzzLapicAdapterSchemaVersion,
  requiredCorpusId: zzzLapicLegacyValidatedCorpus.corpusId,
  gateCriteria: zzzLapicLegacyValidatedGateCriteria,
  approvedSemanticDeltas: [],
}
