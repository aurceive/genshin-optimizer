import type { ZzzLapicAdapterRequest } from './types'
import {
  ZZZ_LAPIC_MIGRATION_STATES,
  isValidMigrationStateTransition,
  validateMilestoneGate,
  validateZzzLapicValidationCorpus,
  zzzLapicLegacyValidatedCorpus,
  zzzLapicLegacyValidatedMilestoneGate,
  zzzLapicSnapshotPolicy,
} from './governance'
import {
  createZzzLapicAdapterMetadata,
  createZzzLapicSourceSnapshotDigests,
  getZzzLapicAdapterCapabilities,
} from './metadata'
import {
  zzzLapicAdapterCapabilities,
  zzzLapicAdapterPackageName,
  zzzLapicAdapterSchemaVersion,
  zzzLapicAdapterSkeleton,
} from './types'
import {
  validateZzzLapicAdapterCapabilities,
  validateZzzLapicAdapterRequest,
  validateZzzLapicSourceSnapshotDescriptor,
} from './validation'

describe('ZZZ Lapic Adapter', () => {
  describe('types and capabilities', () => {
    test('adapter skeleton has correct package name and version', () => {
      expect(zzzLapicAdapterSkeleton.packageName).toBe('zzz-lapic-adapter')
      expect(zzzLapicAdapterSkeleton.schemaVersion).toBe('0.1.0-draft')
    })

    test('adapter package name matches constant', () => {
      expect(zzzLapicAdapterPackageName).toBe('zzz-lapic-adapter')
    })

    test('adapter schema version matches constant', () => {
      expect(zzzLapicAdapterSchemaVersion).toBe('0.1.0-draft')
    })

    test('adapter capabilities report correct adapter kind', () => {
      expect(zzzLapicAdapterCapabilities.adapterKind).toBe('zzz')
    })

    test('adapter capabilities include expected candidate domain classes', () => {
      expect(
        zzzLapicAdapterCapabilities.supportedCandidateDomainClasses
      ).toContain('disc-main')
      expect(
        zzzLapicAdapterCapabilities.supportedCandidateDomainClasses
      ).toContain('disc-sub')
      expect(
        zzzLapicAdapterCapabilities.supportedCandidateDomainClasses
      ).toContain('wengine')
    })

    test('adapter capabilities include expected unsupported semantics', () => {
      expect(
        zzzLapicAdapterCapabilities.explicitlyUnsupportedSemantics
      ).toContain('multi-path-sub-stat-optimization')
      expect(
        zzzLapicAdapterCapabilities.explicitlyUnsupportedSemantics
      ).toContain('conditional-passive-enumeration')
      expect(
        zzzLapicAdapterCapabilities.explicitlyUnsupportedSemantics
      ).toContain('dynamic-team-rotation-modeling')
      expect(
        zzzLapicAdapterCapabilities.explicitlyUnsupportedSemantics
      ).toContain('cross-frame-conditional-propagation')
      expect(
        zzzLapicAdapterCapabilities.explicitlyUnsupportedSemantics
      ).toContain('decimal-precision-above-base-times-upgrades')
    })

    test('adapter capabilities include pando-detach compilation mode', () => {
      expect(
        zzzLapicAdapterCapabilities.supportedFormulaCompilationModes
      ).toContain('pando-detach')
    })

    test('adapter capabilities include current-only solve mode', () => {
      expect(
        zzzLapicAdapterCapabilities.supportedPotentialSolveModes
      ).toContain('current-only')
    })

    test('getZzzLapicAdapterCapabilities returns capabilities', () => {
      const caps = getZzzLapicAdapterCapabilities()
      expect(caps).toBe(zzzLapicAdapterCapabilities)
    })
  })

  describe('governance', () => {
    test('migration states include all four states', () => {
      expect(ZZZ_LAPIC_MIGRATION_STATES).toEqual([
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
      expect(zzzLapicSnapshotPolicy.immutable).toBe(true)
      expect(zzzLapicSnapshotPolicy.digestDerivation).toBe('content-addressed')
      expect(zzzLapicSnapshotPolicy.versioningRule).toBe('corpus-scoped')
      expect(zzzLapicSnapshotPolicy.retirementPolicy).toBe(
        'explicit-corpus-retirement'
      )
    })

    test('validate corpus accepts valid corpus', () => {
      const result = validateZzzLapicValidationCorpus(
        zzzLapicLegacyValidatedCorpus
      )
      expect(result.ok).toBe(true)
    })

    test('validate corpus rejects non-object', () => {
      const result = validateZzzLapicValidationCorpus(null)
      expect(result.ok).toBe(false)
    })

    test('validate corpus rejects missing corpusId', () => {
      const result = validateZzzLapicValidationCorpus({
        adapterVersion: '0.1.0-draft',
        migrationState: 'legacyValidated',
        frozenSnapshotDigests: [],
        testCaseDescriptors: [],
      })
      expect(result.ok).toBe(false)
    })

    test('milestone gate passes when all required criteria satisfied', () => {
      const allCriterionIds = new Set(
        zzzLapicLegacyValidatedMilestoneGate.gateCriteria.map(
          (c) => c.criterionId
        )
      )
      const result = validateMilestoneGate(
        zzzLapicLegacyValidatedMilestoneGate,
        allCriterionIds
      )
      expect(result.passed).toBe(true)
      expect(result.unsatisfiedCriteria).toHaveLength(0)
    })

    test('milestone gate fails when required criteria unsatisfied', () => {
      const result = validateMilestoneGate(
        zzzLapicLegacyValidatedMilestoneGate,
        new Set()
      )
      expect(result.passed).toBe(false)
      expect(result.unsatisfiedCriteria.length).toBeGreaterThan(0)
    })

    test('legacy validated corpus has correct corpus id', () => {
      expect(zzzLapicLegacyValidatedCorpus.corpusId).toBe(
        'zzz-legacy-validated-corpus-v1'
      )
    })

    test('legacy validated milestone gate has correct milestone id', () => {
      expect(zzzLapicLegacyValidatedMilestoneGate.milestoneId).toBe(
        'zzz-legacy-validated-v1'
      )
    })
  })

  describe('metadata', () => {
    function createMinimalRequest(): ZzzLapicAdapterRequest {
      return {
        adapterKind: 'zzz',
        normalizationInput: {
          teamLayout: {
            teamKind: 'zzz-single',
            slotCount: 6,
            slotIds: [
              'disc-1',
              'disc-2',
              'disc-3',
              'disc-4',
              'disc-5',
              'disc-6',
            ],
            slotRoleTaxonomy: ['disc'],
            slotRequirements: {
              'disc-1': 'required',
              'disc-2': 'required',
              'disc-3': 'required',
              'disc-4': 'required',
              'disc-5': 'required',
              'disc-6': 'required',
            },
            slotOrderSemantics: 'semantic',
            frameAxisKind: 'none',
          },
          slotDescriptors: [],
          sharedTeamContext: {
            adapterSemanticMode: 'zzz-legacy-validated',
            aggregateFacts: {},
            metadata: {},
          },
          itemDomains: [],
          compatibilityRules: [],
          objective: {
            objectiveId: 'objective',
            objectiveKind: 'single-slot',
            expressionDigest: 'objective-digest',
            targetSlotIds: ['disc-1'],
            frameIds: [],
          },
          constraints: [],
          topN: 1,
          orderingPolicy: {
            tieBreakDimensions: ['value'],
            canonicalCandidateOrdering: ['value'],
          },
          adapterMetadata: {
            adapterKind: 'zzz-adapter',
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
        } as ZzzLapicAdapterRequest['normalizationInput'],
      }
    }

    test('creates adapter metadata from request', () => {
      const request = createMinimalRequest()
      const metadata = createZzzLapicAdapterMetadata(request)
      expect(metadata.supportedPotentialSolveModes).toEqual(['current-only'])
      expect(metadata.metadata['formulaCompilationMode']).toBe('pando-detach')
      expect(metadata.metadata['featureSchemaVersion']).toBe('0.1.0-draft')
      expect(metadata.metadata['migrationState']).toBe('legacyValidated')
    })

    test('metadata includes declared unsupported features', () => {
      const request = createMinimalRequest()
      const metadata = createZzzLapicAdapterMetadata(request)
      expect(metadata.declaredUnsupportedFeatures).toContain(
        'multi-path-sub-stat-optimization'
      )
      expect(metadata.declaredUnsupportedFeatures).toContain(
        'decimal-precision-above-base-times-upgrades'
      )
    })

    test('metadata includes candidate domain classes', () => {
      const request = createMinimalRequest()
      const metadata = createZzzLapicAdapterMetadata(request)
      expect(metadata.metadata['supportedCandidateDomainClasses']).toBe(
        'disc-main,disc-sub,wengine'
      )
    })
  })

  describe('validation', () => {
    test('validates valid source snapshot descriptor', () => {
      const result = validateZzzLapicSourceSnapshotDescriptor({
        discSnapshotDigest: 'disc-digest',
        characterSnapshotDigest: 'char-digest',
        wengineSnapshotDigest: 'wengine-digest',
        formulaSnapshotDigest: 'formula-digest',
      })
      expect(result.ok).toBe(true)
    })

    test('validates source snapshot descriptor with optional optConfig', () => {
      const result = validateZzzLapicSourceSnapshotDescriptor({
        discSnapshotDigest: 'disc-digest',
        characterSnapshotDigest: 'char-digest',
        wengineSnapshotDigest: 'wengine-digest',
        formulaSnapshotDigest: 'formula-digest',
        optConfigSnapshotDigest: 'opt-config-digest',
      })
      expect(result.ok).toBe(true)
    })

    test('rejects source snapshot descriptor with empty digest', () => {
      const result = validateZzzLapicSourceSnapshotDescriptor({
        discSnapshotDigest: '',
        characterSnapshotDigest: 'char-digest',
        wengineSnapshotDigest: 'wengine-digest',
        formulaSnapshotDigest: 'formula-digest',
      })
      expect(result.ok).toBe(false)
    })

    test('rejects source snapshot descriptor with empty optConfig digest', () => {
      const result = validateZzzLapicSourceSnapshotDescriptor({
        discSnapshotDigest: 'disc-digest',
        characterSnapshotDigest: 'char-digest',
        wengineSnapshotDigest: 'wengine-digest',
        formulaSnapshotDigest: 'formula-digest',
        optConfigSnapshotDigest: '',
      })
      expect(result.ok).toBe(false)
    })

    test('validates valid adapter capabilities', () => {
      const result = validateZzzLapicAdapterCapabilities(
        zzzLapicAdapterCapabilities
      )
      expect(result.ok).toBe(true)
    })

    test('rejects capabilities with wrong adapter kind', () => {
      const result = validateZzzLapicAdapterCapabilities({
        ...zzzLapicAdapterCapabilities,
        adapterKind: 'gi' as 'zzz',
      })
      expect(result.ok).toBe(false)
    })

    test('validates valid adapter request', () => {
      const request = {
        adapterKind: 'zzz' as const,
        normalizationInput: {
          adapterMetadata: {
            declaredUnsupportedFeatures: [],
            metadata: {},
          },
        },
      }
      const result = validateZzzLapicAdapterRequest(
        request as unknown as ZzzLapicAdapterRequest
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
      const result = validateZzzLapicAdapterRequest(
        request as unknown as ZzzLapicAdapterRequest
      )
      expect(result.ok).toBe(false)
    })

    test('rejects adapter request with unsupported solve mode', () => {
      const request = {
        adapterKind: 'zzz' as const,
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
      const result = validateZzzLapicAdapterRequest(
        request as unknown as ZzzLapicAdapterRequest
      )
      expect(result.ok).toBe(false)
    })

    test('createZzzLapicSourceSnapshotDigests returns all digests', () => {
      const digests = createZzzLapicSourceSnapshotDigests({
        discSnapshotDigest: 'a',
        characterSnapshotDigest: 'b',
        wengineSnapshotDigest: 'c',
        formulaSnapshotDigest: 'd',
      })
      expect(digests).toEqual(['a', 'b', 'c', 'd'])
    })

    test('createZzzLapicSourceSnapshotDigests includes optConfig when present', () => {
      const digests = createZzzLapicSourceSnapshotDigests({
        discSnapshotDigest: 'a',
        characterSnapshotDigest: 'b',
        wengineSnapshotDigest: 'c',
        formulaSnapshotDigest: 'd',
        optConfigSnapshotDigest: 'e',
      })
      expect(digests).toEqual(['a', 'b', 'c', 'd', 'e'])
    })
  })
})
