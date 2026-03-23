/**
 * GI TC Subproblem — Governance
 *
 * Separate validation corpus and milestone gate for the TC sub-family,
 * per adapters-gi-sr-zzz.md §8.8. TC validation is distinct from
 * artifact optimization validation.
 */

import type { LapicDigest } from '@genshin-optimizer/lapic/core'
import type {
  GiLapicExpectedResultClass,
  GiLapicGateCriterion,
  GiLapicMilestoneGate,
  GiLapicSnapshotPolicy,
  GiLapicValidationFamily,
} from '../governance'
import { giLapicSnapshotPolicy } from '../governance'
import { giLapicTcAdapterSchemaVersion } from './types'

// ---------------------------------------------------------------------------
// TC-specific validation family extension
// ---------------------------------------------------------------------------

/**
 * TC validation families extend the base GI families with
 * roll-distribution-specific test classifications.
 */
export type GiLapicTcValidationFamily =
  | GiLapicValidationFamily
  | 'roll-distribution-enumeration'
  | 'materializability-verification'

// ---------------------------------------------------------------------------
// TC-specific corpus descriptor
// ---------------------------------------------------------------------------

export interface GiLapicTcCorpusTestCaseDescriptor {
  readonly caseId: string
  readonly description: string
  readonly validationFamily: GiLapicTcValidationFamily
  readonly sourceSnapshotDigest: LapicDigest
  readonly problemDigest: LapicDigest
  readonly arithmeticPolicyId: string
  readonly expectedResultClass: GiLapicExpectedResultClass
  readonly materializabilityCase:
    | 'fully-achievable'
    | 'partially-achievable'
    | 'theoretical'
}

// ---------------------------------------------------------------------------
// TC validation corpus
// ---------------------------------------------------------------------------

export interface GiLapicTcValidationCorpus {
  readonly corpusId: string
  readonly adapterVersion: string
  readonly migrationState: 'tcScaffoldValidated'
  readonly snapshotPolicy: GiLapicSnapshotPolicy
  readonly frozenSnapshotDigests: readonly LapicDigest[]
  readonly testCaseDescriptors: readonly GiLapicTcCorpusTestCaseDescriptor[]
}

export const giLapicTcScaffoldCorpus: GiLapicTcValidationCorpus = {
  corpusId: 'gi-tc-scaffold-corpus-v1',
  adapterVersion: giLapicTcAdapterSchemaVersion,
  migrationState: 'tcScaffoldValidated',
  snapshotPolicy: giLapicSnapshotPolicy,
  frozenSnapshotDigests: [],
  testCaseDescriptors: [
    {
      caseId: 'tc-type-partitioning',
      description: 'TC request types are disjoint from artifact request types',
      validationFamily: 'schema-validation',
      sourceSnapshotDigest: 'tc-scaffold-digest',
      problemDigest: 'tc-type-partitioning-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'structural-pass',
      materializabilityCase: 'fully-achievable',
    },
    {
      caseId: 'tc-adapter-kind-routing',
      description:
        'Requests with adapterKind gi-tc are correctly routed to TC path',
      validationFamily: 'schema-validation',
      sourceSnapshotDigest: 'tc-scaffold-digest',
      problemDigest: 'tc-routing-digest',
      arithmeticPolicyId: 'arithmetic-policy',
      expectedResultClass: 'structural-pass',
      materializabilityCase: 'fully-achievable',
    },
  ],
}

// ---------------------------------------------------------------------------
// TC milestone gate
// ---------------------------------------------------------------------------

export const giLapicTcScaffoldGateCriteria: readonly GiLapicGateCriterion[] = [
  {
    criterionId: 'tc-type-partitioning',
    description:
      'TC types are separate from artifact types; no implicit mode switching',
    validationFamily: 'schema-validation',
    required: true,
  },
  {
    criterionId: 'tc-request-routing',
    description:
      'adapterKind gi-tc routes to TC validation; gi routes to artifact validation',
    validationFamily: 'schema-validation',
    required: true,
  },
  {
    criterionId: 'tc-unsupported-semantics-declared',
    description:
      'Unimplemented TC features are listed in explicitlyUnsupportedSemantics',
    validationFamily: 'schema-validation',
    required: true,
  },
]

export const giLapicTcScaffoldMilestoneGate: GiLapicMilestoneGate = {
  milestoneId: 'gi-tc-scaffold-v1',
  migrationState: 'legacyValidated',
  adapterVersion: giLapicTcAdapterSchemaVersion,
  requiredCorpusId: giLapicTcScaffoldCorpus.corpusId,
  gateCriteria: giLapicTcScaffoldGateCriteria,
  approvedSemanticDeltas: [],
}
