import {
  GI_LAPIC_MIGRATION_STATES,
  giLapicLegacyValidatedCorpus,
  giLapicLegacyValidatedGateCriteria,
  giLapicLegacyValidatedMilestoneGate,
  giLapicSnapshotPolicy,
  isValidMigrationStateTransition,
  validateGiLapicValidationCorpus,
  validateMilestoneGate,
} from './governance'
import type { GiLapicMigrationState } from './governance'

// =========================================================================
// Migration State Transitions
// =========================================================================

describe('GI lapic governance', () => {
  describe('migration state transitions', () => {
    it('allows the four defined migration states', () => {
      expect(GI_LAPIC_MIGRATION_STATES).toEqual([
        'legacyValidated',
        'dualValidated',
        'canonicalDefault',
        'legacyRetired',
      ])
    })

    it('allows legacyValidated → dualValidated', () => {
      expect(
        isValidMigrationStateTransition('legacyValidated', 'dualValidated')
      ).toBe(true)
    })

    it('allows dualValidated → canonicalDefault', () => {
      expect(
        isValidMigrationStateTransition('dualValidated', 'canonicalDefault')
      ).toBe(true)
    })

    it('allows canonicalDefault → legacyRetired', () => {
      expect(
        isValidMigrationStateTransition('canonicalDefault', 'legacyRetired')
      ).toBe(true)
    })

    it('rejects skipping states', () => {
      expect(
        isValidMigrationStateTransition('legacyValidated', 'canonicalDefault')
      ).toBe(false)
      expect(
        isValidMigrationStateTransition('legacyValidated', 'legacyRetired')
      ).toBe(false)
      expect(
        isValidMigrationStateTransition('dualValidated', 'legacyRetired')
      ).toBe(false)
    })

    it('rejects backward transitions', () => {
      expect(
        isValidMigrationStateTransition('dualValidated', 'legacyValidated')
      ).toBe(false)
      expect(
        isValidMigrationStateTransition('canonicalDefault', 'dualValidated')
      ).toBe(false)
      expect(
        isValidMigrationStateTransition('legacyRetired', 'canonicalDefault')
      ).toBe(false)
    })

    it('rejects self-transitions', () => {
      for (const state of GI_LAPIC_MIGRATION_STATES) {
        expect(isValidMigrationStateTransition(state, state)).toBe(false)
      }
    })

    it('rejects transitions from terminal state', () => {
      for (const state of GI_LAPIC_MIGRATION_STATES) {
        expect(isValidMigrationStateTransition('legacyRetired', state)).toBe(
          false
        )
      }
    })
  })

  // =========================================================================
  // Snapshot Policy
  // =========================================================================

  describe('snapshot policy', () => {
    it('enforces immutability', () => {
      expect(giLapicSnapshotPolicy.immutable).toBe(true)
    })

    it('uses content-addressed digest derivation', () => {
      expect(giLapicSnapshotPolicy.digestDerivation).toBe('content-addressed')
    })

    it('versions snapshots at corpus scope', () => {
      expect(giLapicSnapshotPolicy.versioningRule).toBe('corpus-scoped')
    })

    it('retires snapshots only with explicit corpus retirement', () => {
      expect(giLapicSnapshotPolicy.retirementPolicy).toBe(
        'explicit-corpus-retirement'
      )
    })
  })

  // =========================================================================
  // Validation Corpus
  // =========================================================================

  describe('validation corpus', () => {
    it('validates the legacyValidated corpus definition', () => {
      const result = validateGiLapicValidationCorpus(
        giLapicLegacyValidatedCorpus
      )
      expect(result.ok).toBe(true)
    })

    it('legacyValidated corpus has all required fields', () => {
      const corpus = giLapicLegacyValidatedCorpus
      expect(corpus.corpusId).toBe('gi-legacy-validated-corpus-v1')
      expect(corpus.migrationState).toBe('legacyValidated')
      expect(corpus.frozenSnapshotDigests.length).toBeGreaterThan(0)
      expect(corpus.testCaseDescriptors.length).toBeGreaterThan(0)
      expect(corpus.snapshotPolicy).toBe(giLapicSnapshotPolicy)
    })

    it('corpus contains test cases for each required validation family', () => {
      const families = new Set(
        giLapicLegacyValidatedCorpus.testCaseDescriptors.map(
          (tc) => tc.validationFamily
        )
      )
      expect(families.has('golden-enumeration')).toBe(true)
      expect(families.has('property-based')).toBe(true)
      expect(families.has('schema-validation')).toBe(true)
    })

    it('every test case has frozen snapshot and problem digests', () => {
      for (const tc of giLapicLegacyValidatedCorpus.testCaseDescriptors) {
        expect(tc.caseId).toBeTruthy()
        expect(tc.sourceSnapshotDigest).toBeTruthy()
        expect(tc.problemDigest).toBeTruthy()
        expect(tc.arithmeticPolicyId).toBeTruthy()
      }
    })

    it('legacyValidated corpus has no approved semantic deltas', () => {
      expect(giLapicLegacyValidatedCorpus.approvedSemanticDeltas).toEqual([])
    })

    it('rejects invalid corpus shapes', () => {
      expect(validateGiLapicValidationCorpus(null).ok).toBe(false)
      expect(validateGiLapicValidationCorpus({}).ok).toBe(false)
      expect(
        validateGiLapicValidationCorpus({
          corpusId: '',
          adapterVersion: '0.1.0',
          migrationState: 'invalid-state',
          frozenSnapshotDigests: [],
          testCaseDescriptors: [],
        }).ok
      ).toBe(false)
    })
  })

  // =========================================================================
  // Milestone Gate
  // =========================================================================

  describe('milestone gate', () => {
    it('legacyValidated gate has all required criteria', () => {
      expect(giLapicLegacyValidatedGateCriteria.length).toBe(7)
      for (const criterion of giLapicLegacyValidatedGateCriteria) {
        expect(criterion.criterionId).toBeTruthy()
        expect(criterion.description).toBeTruthy()
        expect(criterion.required).toBe(true)
      }
    })

    it('legacyValidated milestone gate references the correct corpus', () => {
      expect(giLapicLegacyValidatedMilestoneGate.requiredCorpusId).toBe(
        giLapicLegacyValidatedCorpus.corpusId
      )
      expect(giLapicLegacyValidatedMilestoneGate.migrationState).toBe(
        'legacyValidated'
      )
    })

    it('passes when all criteria are satisfied', () => {
      const satisfiedIds = new Set(
        giLapicLegacyValidatedGateCriteria.map((c) => c.criterionId)
      )
      const result = validateMilestoneGate(
        giLapicLegacyValidatedMilestoneGate,
        satisfiedIds
      )

      expect(result.passed).toBe(true)
      expect(result.satisfiedCriteria).toHaveLength(7)
      expect(result.unsatisfiedCriteria).toHaveLength(0)
    })

    it('fails when a required criterion is missing', () => {
      const satisfiedIds = new Set(
        giLapicLegacyValidatedGateCriteria
          .slice(1) // drop first criterion
          .map((c) => c.criterionId)
      )
      const result = validateMilestoneGate(
        giLapicLegacyValidatedMilestoneGate,
        satisfiedIds
      )

      expect(result.passed).toBe(false)
      expect(result.unsatisfiedCriteria).toContain('snapshot-digest-stability')
    })

    it('fails when no criteria are satisfied', () => {
      const result = validateMilestoneGate(
        giLapicLegacyValidatedMilestoneGate,
        new Set()
      )

      expect(result.passed).toBe(false)
      expect(result.unsatisfiedCriteria).toHaveLength(7)
      expect(result.satisfiedCriteria).toHaveLength(0)
    })

    it('reports the correct milestone metadata in results', () => {
      const result = validateMilestoneGate(
        giLapicLegacyValidatedMilestoneGate,
        new Set()
      )
      expect(result.milestoneId).toBe('gi-legacy-validated-v1')
      expect(result.migrationState).toBe('legacyValidated')
    })
  })

  // =========================================================================
  // Gate Criteria Coverage
  // =========================================================================

  describe('gate criteria coverage', () => {
    const criteriaIds = new Set(
      giLapicLegacyValidatedGateCriteria.map((c) => c.criterionId)
    )

    it('requires snapshot digest stability', () => {
      expect(criteriaIds.has('snapshot-digest-stability')).toBe(true)
    })

    it('requires candidate extraction losslessness', () => {
      expect(criteriaIds.has('candidate-extraction-lossless')).toBe(true)
    })

    it('requires filter transformation logging', () => {
      expect(criteriaIds.has('filter-transformation-logged')).toBe(true)
    })

    it('requires canonical export idempotency', () => {
      expect(criteriaIds.has('canonical-export-idempotent')).toBe(true)
    })

    it('requires F-IR compilation coverage', () => {
      expect(criteriaIds.has('fir-compilation-coverage')).toBe(true)
    })

    it('requires certificate structural completeness', () => {
      expect(criteriaIds.has('certificate-structural-completeness')).toBe(true)
    })

    it('requires golden enumeration admissibility', () => {
      expect(criteriaIds.has('golden-enumeration-admissibility')).toBe(true)
    })
  })
})
