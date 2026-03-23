import type { SrLapicAdapterRequest } from './types'
import {
  SR_LAPIC_MIGRATION_STATES,
  isValidMigrationStateTransition,
  srLapicLegacyValidatedCorpus,
  srLapicLegacyValidatedMilestoneGate,
  srLapicSnapshotPolicy,
  validateMilestoneGate,
  validateSrLapicValidationCorpus,
} from './governance'
import {
  createSrLapicAdapterMetadata,
  createSrLapicSourceSnapshotDigests,
  getSrLapicAdapterCapabilities,
} from './metadata'
import {
  srLapicAdapterCapabilities,
  srLapicAdapterPackageName,
  srLapicAdapterSchemaVersion,
  srLapicAdapterSkeleton,
} from './types'
import {
  validateSrLapicAdapterCapabilities,
  validateSrLapicAdapterRequest,
  validateSrLapicSourceSnapshotDescriptor,
} from './validation'

describe('SR Lapic Adapter', () => {
  describe('types and capabilities', () => {
    test('adapter skeleton has correct package name and version', () => {
      expect(srLapicAdapterSkeleton.packageName).toBe('sr-lapic-adapter')
      expect(srLapicAdapterSkeleton.schemaVersion).toBe('0.1.0-draft')
    })

    test('adapter package name matches constant', () => {
      expect(srLapicAdapterPackageName).toBe('sr-lapic-adapter')
    })

    test('adapter schema version matches constant', () => {
      expect(srLapicAdapterSchemaVersion).toBe('0.1.0-draft')
    })

    test('adapter capabilities report correct adapter kind', () => {
      expect(srLapicAdapterCapabilities.adapterKind).toBe('sr')
    })

    test('adapter capabilities include expected candidate domain classes', () => {
      expect(
        srLapicAdapterCapabilities.supportedCandidateDomainClasses
      ).toContain('relic-main')
      expect(
        srLapicAdapterCapabilities.supportedCandidateDomainClasses
      ).toContain('relic-sub')
      expect(
        srLapicAdapterCapabilities.supportedCandidateDomainClasses
      ).toContain('light-cone')
    })

    test('adapter capabilities include expected unsupported semantics', () => {
      expect(
        srLapicAdapterCapabilities.explicitlyUnsupportedSemantics
      ).toContain('multi-path-sub-stat-optimization')
      expect(
        srLapicAdapterCapabilities.explicitlyUnsupportedSemantics
      ).toContain('conditional-passive-enumeration')
      expect(
        srLapicAdapterCapabilities.explicitlyUnsupportedSemantics
      ).toContain('dynamic-team-rotation-modeling')
      expect(
        srLapicAdapterCapabilities.explicitlyUnsupportedSemantics
      ).toContain('cross-frame-conditional-propagation')
    })

    test('adapter capabilities include pando-detach compilation mode', () => {
      expect(
        srLapicAdapterCapabilities.supportedFormulaCompilationModes
      ).toContain('pando-detach')
    })

    test('adapter capabilities include current-only solve mode', () => {
      expect(srLapicAdapterCapabilities.supportedPotentialSolveModes).toContain(
        'current-only'
      )
    })

    test('getSrLapicAdapterCapabilities returns capabilities', () => {
      const caps = getSrLapicAdapterCapabilities()
      expect(caps).toBe(srLapicAdapterCapabilities)
    })
  })

  describe('governance', () => {
    test('migration states include all four states', () => {
      expect(SR_LAPIC_MIGRATION_STATES).toEqual([
        'legacyValidated',
        'dualValidated',
        'canonicalDefault',
        'legacyRetired',
      ])
    })

    test('valid migration state transitions are accepted', () => {
      expect(
        isValidMigrationStateTransition('legacyValidated', 'dualValidated')
      ).toBe(true)
      expect(
        isValidMigrationStateTransition('dualValidated', 'canonicalDefault')
      ).toBe(true)
      expect(
        isValidMigrationStateTransition('canonicalDefault', 'legacyRetired')
      ).toBe(true)
    })

    test('invalid migration state transitions are rejected', () => {
      expect(
        isValidMigrationStateTransition('legacyValidated', 'canonicalDefault')
      ).toBe(false)
      expect(
        isValidMigrationStateTransition('legacyValidated', 'legacyRetired')
      ).toBe(false)
      expect(
        isValidMigrationStateTransition('dualValidated', 'legacyValidated')
      ).toBe(false)
      expect(
        isValidMigrationStateTransition('legacyRetired', 'legacyValidated')
      ).toBe(false)
    })

    test('snapshot policy has correct properties', () => {
      expect(srLapicSnapshotPolicy.immutable).toBe(true)
      expect(srLapicSnapshotPolicy.digestDerivation).toBe('content-addressed')
      expect(srLapicSnapshotPolicy.versioningRule).toBe('corpus-scoped')
      expect(srLapicSnapshotPolicy.retirementPolicy).toBe(
        'explicit-corpus-retirement'
      )
    })

    test('validate corpus accepts valid corpus', () => {
      const result = validateSrLapicValidationCorpus(
        srLapicLegacyValidatedCorpus
      )
      expect(result.ok).toBe(true)
    })

    test('validate corpus rejects non-object', () => {
      const result = validateSrLapicValidationCorpus(null)
      expect(result.ok).toBe(false)
    })

    test('validate corpus rejects missing corpusId', () => {
      const result = validateSrLapicValidationCorpus({
        adapterVersion: '0.1.0-draft',
        migrationState: 'legacyValidated',
        frozenSnapshotDigests: [],
        testCaseDescriptors: [],
      })
      expect(result.ok).toBe(false)
    })

    test('milestone gate passes when all required criteria satisfied', () => {
      const allCriterionIds = new Set(
        srLapicLegacyValidatedMilestoneGate.gateCriteria.map(
          (c) => c.criterionId
        )
      )
      const result = validateMilestoneGate(
        srLapicLegacyValidatedMilestoneGate,
        allCriterionIds
      )
      expect(result.passed).toBe(true)
      expect(result.unsatisfiedCriteria).toHaveLength(0)
    })

    test('milestone gate fails when required criteria unsatisfied', () => {
      const result = validateMilestoneGate(
        srLapicLegacyValidatedMilestoneGate,
        new Set()
      )
      expect(result.passed).toBe(false)
      expect(result.unsatisfiedCriteria.length).toBeGreaterThan(0)
    })

    test('legacy validated corpus has correct corpus id', () => {
      expect(srLapicLegacyValidatedCorpus.corpusId).toBe(
        'sr-legacy-validated-corpus-v1'
      )
    })

    test('legacy validated milestone gate has correct milestone id', () => {
      expect(srLapicLegacyValidatedMilestoneGate.milestoneId).toBe(
        'sr-legacy-validated-v1'
      )
    })
  })

  describe('metadata', () => {
    function createMinimalRequest(): SrLapicAdapterRequest {
      return {
        adapterKind: 'sr',
        normalizationInput: {
          teamLayout: {
            teamKind: 'sr-single',
            slotCount: 6,
            slotIds: ['head', 'hand', 'body', 'feet', 'sphere', 'rope'],
            slotRoleTaxonomy: ['relic'],
            slotRequirements: {
              head: 'required',
              hand: 'required',
              body: 'required',
              feet: 'required',
              sphere: 'required',
              rope: 'required',
            },
            slotOrderSemantics: 'semantic',
            frameAxisKind: 'none',
          },
          slotDescriptors: [],
          sharedTeamContext: {
            adapterSemanticMode: 'sr-legacy-validated',
            aggregateFacts: {},
            metadata: {},
          },
          itemDomains: [],
          compatibilityRules: [],
          objective: {
            objectiveId: 'objective',
            objectiveKind: 'single-slot',
            expressionDigest: 'objective-digest',
            targetSlotIds: ['head'],
            frameIds: [],
          },
          constraints: [],
          topN: 1,
          orderingPolicy: {
            tieBreakDimensions: ['value'],
            canonicalCandidateOrdering: ['value'],
          },
          adapterMetadata: {
            adapterKind: 'sr-adapter',
            adapterVersion: '0.1.0-draft',
            sourceSnapshotDigests: ['test-digest'],
            declaredUnsupportedFeatures: [],
            metadata: {},
          },
          provenance: {
            teamLayoutDigest: 'team-layout-digest',
            sharedTeamContextDigest: 'shared-context-digest',
            crossSlotRuleDescriptorVersion: '0.1.0-draft',
            compatibilitySignatureSchemaVersion: '0.1.0-draft',
            slotProvenance: [],
          },
        } as SrLapicAdapterRequest['normalizationInput'],
      }
    }

    test('creates adapter metadata from request', () => {
      const request = createMinimalRequest()
      const metadata = createSrLapicAdapterMetadata(request)
      expect(metadata.supportedPotentialSolveModes).toEqual(['current-only'])
      expect(metadata.metadata['formulaCompilationMode']).toBe('pando-detach')
      expect(metadata.metadata['featureSchemaVersion']).toBe('0.1.0-draft')
      expect(metadata.metadata['migrationState']).toBe('legacyValidated')
    })

    test('metadata includes declared unsupported features', () => {
      const request = createMinimalRequest()
      const metadata = createSrLapicAdapterMetadata(request)
      expect(metadata.declaredUnsupportedFeatures).toContain(
        'multi-path-sub-stat-optimization'
      )
    })

    test('metadata includes candidate domain classes', () => {
      const request = createMinimalRequest()
      const metadata = createSrLapicAdapterMetadata(request)
      expect(metadata.metadata['supportedCandidateDomainClasses']).toBe(
        'relic-main,relic-sub,light-cone'
      )
    })
  })

  describe('validation', () => {
    test('validates valid source snapshot descriptor', () => {
      const result = validateSrLapicSourceSnapshotDescriptor({
        relicSnapshotDigest: 'relic-digest',
        characterSnapshotDigest: 'char-digest',
        lightConeSnapshotDigest: 'lc-digest',
        formulaSnapshotDigest: 'formula-digest',
      })
      expect(result.ok).toBe(true)
    })

    test('validates source snapshot descriptor with optional optConfig', () => {
      const result = validateSrLapicSourceSnapshotDescriptor({
        relicSnapshotDigest: 'relic-digest',
        characterSnapshotDigest: 'char-digest',
        lightConeSnapshotDigest: 'lc-digest',
        formulaSnapshotDigest: 'formula-digest',
        optConfigSnapshotDigest: 'opt-config-digest',
      })
      expect(result.ok).toBe(true)
    })

    test('rejects source snapshot descriptor with empty digest', () => {
      const result = validateSrLapicSourceSnapshotDescriptor({
        relicSnapshotDigest: '',
        characterSnapshotDigest: 'char-digest',
        lightConeSnapshotDigest: 'lc-digest',
        formulaSnapshotDigest: 'formula-digest',
      })
      expect(result.ok).toBe(false)
    })

    test('rejects source snapshot descriptor with empty optConfig digest', () => {
      const result = validateSrLapicSourceSnapshotDescriptor({
        relicSnapshotDigest: 'relic-digest',
        characterSnapshotDigest: 'char-digest',
        lightConeSnapshotDigest: 'lc-digest',
        formulaSnapshotDigest: 'formula-digest',
        optConfigSnapshotDigest: '',
      })
      expect(result.ok).toBe(false)
    })

    test('validates valid adapter capabilities', () => {
      const result = validateSrLapicAdapterCapabilities(
        srLapicAdapterCapabilities
      )
      expect(result.ok).toBe(true)
    })

    test('rejects capabilities with wrong adapter kind', () => {
      const result = validateSrLapicAdapterCapabilities({
        ...srLapicAdapterCapabilities,
        adapterKind: 'gi' as 'sr',
      })
      expect(result.ok).toBe(false)
    })

    test('validates valid adapter request', () => {
      const request = {
        adapterKind: 'sr' as const,
        normalizationInput: {
          adapterMetadata: {
            declaredUnsupportedFeatures: [],
            metadata: {},
          },
        },
      }
      const result = validateSrLapicAdapterRequest(
        request as unknown as SrLapicAdapterRequest
      )
      expect(result.ok).toBe(true)
    })

    test('rejects adapter request with wrong kind', () => {
      const request = {
        adapterKind: 'gi' as const,
        normalizationInput: {
          adapterMetadata: {
            declaredUnsupportedFeatures: [],
            metadata: {},
          },
        },
      }
      const result = validateSrLapicAdapterRequest(
        request as unknown as SrLapicAdapterRequest
      )
      expect(result.ok).toBe(false)
    })

    test('rejects adapter request with unsupported solve mode', () => {
      const request = {
        adapterKind: 'sr' as const,
        normalizationInput: {
          adapterMetadata: {
            declaredUnsupportedFeatures: [],
            metadata: {},
          },
          potentialConfiguration: {
            solveMode: 'full-potential-aware-exact',
          },
        },
      }
      const result = validateSrLapicAdapterRequest(
        request as unknown as SrLapicAdapterRequest
      )
      expect(result.ok).toBe(false)
    })

    test('createSrLapicSourceSnapshotDigests returns all digests', () => {
      const digests = createSrLapicSourceSnapshotDigests({
        relicSnapshotDigest: 'a',
        characterSnapshotDigest: 'b',
        lightConeSnapshotDigest: 'c',
        formulaSnapshotDigest: 'd',
      })
      expect(digests).toEqual(['a', 'b', 'c', 'd'])
    })

    test('createSrLapicSourceSnapshotDigests includes optConfig when present', () => {
      const digests = createSrLapicSourceSnapshotDigests({
        relicSnapshotDigest: 'a',
        characterSnapshotDigest: 'b',
        lightConeSnapshotDigest: 'c',
        formulaSnapshotDigest: 'd',
        optConfigSnapshotDigest: 'e',
      })
      expect(digests).toEqual(['a', 'b', 'c', 'd', 'e'])
    })
  })
})
