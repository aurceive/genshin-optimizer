import {
  type LapicCanonicalProblem,
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import {
  createLapicArtifactWriteRequest,
  createLapicMemoryArtifactStore,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import {
  createLapicSessionIdentity,
  createLapicSolveRequest,
} from '../builders'
import { createLapicInMemorySessionController } from '../session'
import { executeLapicBoundedExactSolve } from './index'

function createProblem(overrides?: { topN?: number }): LapicCanonicalProblem {
  return {
    problemId: 'problem-id',
    problemDigest: 'problem-digest',
    engineVersion: 'engine-version',
    arithmeticPolicyId: 'arith-policy',
    teamLayout: {
      teamKind: 'gi-single',
      slotCount: 2,
      slotIds: ['flower', 'plume'],
      slotRoleTaxonomy: ['artifact', 'artifact'],
      slotRequirements: {
        flower: 'required',
        plume: 'required',
      },
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: [
      {
        slotId: 'flower',
        slotRole: 'artifact-flower',
        participationMode: 'optimizedBuild',
        occupantDomainId: 'gi:flower',
        equipmentOwnershipModel: 'hard-reserved-inventory',
        contributesToObjective: true,
        contributesToConstraints: true,
        mayRemainEmpty: false,
      },
      {
        slotId: 'plume',
        slotRole: 'artifact-plume',
        participationMode: 'optimizedBuild',
        occupantDomainId: 'gi:plume',
        equipmentOwnershipModel: 'hard-reserved-inventory',
        contributesToObjective: true,
        contributesToConstraints: true,
        mayRemainEmpty: false,
      },
    ],
    sharedTeamContext: {
      adapterSemanticMode: 'gi-legacy-validated',
      aggregateFacts: {},
      metadata: {},
    },
    frameAxis: [],
    itemDomains: [
      {
        domainId: 'gi:flower',
        slotId: 'flower',
        candidates: [
          {
            candidateId: 'flower-a',
            sourceRecordDigest: 'flower-a',
            domainId: 'gi:flower',
            slotId: 'flower',
            additiveFeatureDigest: 'feature:flower-a',
            discreteCounters: [],
            categoricalSignatureDigest: 'category:flower-a',
            provenance: {
              slotId: 'flower',
              sourceEntityId: 'inventory',
              sourceRecordDigests: ['flower-a'],
              exclusiveResourceClaims: [],
              concreteInventoryBacked: true,
              featureExtractionDigest: 'feature:flower-a',
            },
          },
          {
            candidateId: 'flower-b',
            sourceRecordDigest: 'flower-b',
            domainId: 'gi:flower',
            slotId: 'flower',
            additiveFeatureDigest: 'feature:flower-b',
            discreteCounters: [],
            categoricalSignatureDigest: 'category:flower-b',
            provenance: {
              slotId: 'flower',
              sourceEntityId: 'inventory',
              sourceRecordDigests: ['flower-b'],
              exclusiveResourceClaims: [],
              concreteInventoryBacked: true,
              featureExtractionDigest: 'feature:flower-b',
            },
          },
        ],
      },
      {
        domainId: 'gi:plume',
        slotId: 'plume',
        candidates: [
          {
            candidateId: 'plume-a',
            sourceRecordDigest: 'plume-a',
            domainId: 'gi:plume',
            slotId: 'plume',
            additiveFeatureDigest: 'feature:plume-a',
            discreteCounters: [],
            categoricalSignatureDigest: 'category:plume-a',
            provenance: {
              slotId: 'plume',
              sourceEntityId: 'inventory',
              sourceRecordDigests: ['plume-a'],
              exclusiveResourceClaims: [],
              concreteInventoryBacked: true,
              featureExtractionDigest: 'feature:plume-a',
            },
          },
          {
            candidateId: 'plume-b',
            sourceRecordDigest: 'plume-b',
            domainId: 'gi:plume',
            slotId: 'plume',
            additiveFeatureDigest: 'feature:plume-b',
            discreteCounters: [],
            categoricalSignatureDigest: 'category:plume-b',
            provenance: {
              slotId: 'plume',
              sourceEntityId: 'inventory',
              sourceRecordDigests: ['plume-b'],
              exclusiveResourceClaims: [],
              concreteInventoryBacked: true,
              featureExtractionDigest: 'feature:plume-b',
            },
          },
        ],
      },
    ],
    compatibilityRules: [],
    objective: {
      objectiveId: 'objective-id',
      objectiveKind: 'single-slot',
      expressionDigest: 'objective-digest',
      targetSlotIds: ['flower', 'plume'],
      frameIds: [],
    },
    constraints: [],
    topN: overrides?.topN ?? 1,
    orderingPolicy: {
      tieBreakDimensions: ['value'],
      canonicalCandidateOrdering: ['value'],
    },
    auxiliaryOutputs: [],
    adapterMetadata: {
      adapterKind: 'gi-wr',
      adapterVersion: '0.1.0-draft',
      sourceSnapshotDigests: ['snapshot-digest'],
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
  }
}

function createStore() {
  return createLapicMemoryArtifactStore({
    entries: [
      createLapicArtifactWriteRequest(
        createLapicStorageEnvelope({
          artifactKind: 'canonical-problem',
          schemaVersion: '0.1.0-draft',
          payloadEncoding: 'json',
          payloadLength: 64,
          contentHash: 'problem-digest',
          checksum: {
            algorithm: 'sha256',
            checksum: 'problem-digest',
          },
          compressionCodec: 'none',
          creationEngineVersion: 'engine-version',
          arithmeticPolicyId: 'arith-policy',
          dependencyDigestSet: [],
        }),
        'problem-digest'
      ),
    ],
  })
}

function createController() {
  const store = createStore()
  const controller = createLapicInMemorySessionController({
    identity: createLapicSessionIdentity({
      sessionId: 'session-id',
      problemDigest: 'problem-digest',
      engineVersion: 'engine-version',
      arithmeticPolicyId: 'arith-policy',
      runtimeProtocolVersion: '0.1.0-draft',
      createdAtLogicalTimestamp: 'ts-1',
    }),
    solveRequest: createLapicSolveRequest('problem-digest'),
    artifactStore: store,
  })

  return { store, controller }
}

describe('lapic bounded exact solve executor', () => {
  it('runs a bounded exact solve, publishes frontier artifacts, and emits final optimality', async () => {
    const { store, controller } = createController()
    const progressEvents: string[] = []
    const diagnosticTags: string[] = []
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    controller.subscribeProgress((event) => {
      progressEvents.push(`${event.phase}:${event.completedUnits}/${event.totalUnits ?? 0}`)
    })
    controller.subscribeDiagnostics((event) => {
      diagnosticTags.push('tag' in event ? event.tag : event.failureClass)
    })

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        const key = candidates.map((candidate) => candidate.candidateId).join('|')
        const score = scores[key]
        if (!score)
          return createLapicFailureResult([
            createLapicDiagnostic(
              'error',
              'NormalizationFailure',
              'Missing score for bounded solve test fixture.'
            ),
          ])

        return createLapicSuccessResult({
          objectiveValue: score,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [score],
        })
      },
      maxCombinationCount: 16,
    })

    expect(completion.summary.solveState).toBe('completed')
    expect(completion.finalOptimality?.winnerStateId).toBe(
      'state:problem-digest:flower:flower-b|plume:plume-a'
    )
    expect(completion.emittedCertificates).toHaveLength(1)
    expect(completion.emittedCertificates[0]?.certKind).toBe('FinalOptimalityCert')
    expect(store.snapshot()).toHaveLength(5)
    expect(
      store
        .snapshot()
        .filter((entry) => entry.artifactRef.artifactKind === 'frontier-block')
        .map((entry) => entry.payloadDigest)
    ).toEqual([
      'payload:frontier:problem-digest:flower',
      'payload:frontier:problem-digest:plume',
    ])
    expect(
      store.snapshot().find((entry) => entry.artifactRef.artifactKind === 'frontier-index')
        ?.payloadDigest
    ).toBe('payload:frontier-index:problem-digest')
    expect(
      store.snapshot().find((entry) => entry.artifactRef.artifactKind === 'frontier-index')
        ?.envelope.contentHash
    ).toBe('frontier-index:problem-digest')
    expect(
      store
        .snapshot()
        .filter((entry) => entry.artifactRef.artifactKind === 'frontier-block')
        .every((entry) => entry.envelope.contentHash.startsWith('frontier:problem-digest:'))
    ).toBe(true)
    expect(progressEvents).toContain('frontier-build:1/2')
    expect(progressEvents).toContain('frontier-build:2/2')
    expect(progressEvents).toContain('join:4/4')
    expect(progressEvents).toContain('resolve-residual:1/1')
    expect(diagnosticTags).toContain('InitSession')
    expect(diagnosticTags).toContain('StartWork')
    expect(diagnosticTags).toContain('EmitCertificate')
  })

  it('completes with an infeasibility certificate when no feasible combination remains', async () => {
    const { store, controller } = createController()

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination() {
        return createLapicSuccessResult({
          objectiveValue: '0000',
          evidenceDigest: 'unused-evidence',
          orderingKey: ['0000'],
        })
      },
      isCombinationFeasible() {
        return false
      },
      maxCombinationCount: 16,
    })

    expect(completion.summary.solveState).toBe('completed')
    expect(completion.finalOptimality).toBeUndefined()
    expect(completion.emittedCertificates).toHaveLength(1)
    expect(completion.emittedCertificates[0]?.certKind).toBe('InfeasibilityCert')
    expect(store.snapshot()).toHaveLength(5)
  })

  it('returns the top-3 results when topN = 3 with 4 combinations', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem({ topN: 3 }),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        const key = candidates.map((c) => c.candidateId).join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      maxCombinationCount: 16,
    })

    expect(completion.summary.solveState).toBe('completed')
    expect(completion.finalOptimality?.winnerStateId).toBe(
      'state:problem-digest:flower:flower-b|plume:plume-a'
    )
    expect(completion.emittedCertificates).toHaveLength(1)
    const cert = completion.emittedCertificates[0]!
    expect(cert.certKind).toBe('FinalOptimalityCert')
    expect(cert.referencedStateIds).toHaveLength(3)
    expect(cert.referencedStateIds[0]).toBe(
      'state:problem-digest:flower:flower-b|plume:plume-a'
    )
    expect(cert.referencedStateIds[1]).toBe(
      'state:problem-digest:flower:flower-a|plume:plume-b'
    )
    expect(cert.referencedStateIds[2]).toBe(
      'state:problem-digest:flower:flower-a|plume:plume-a'
    )
  })

  it('returns all feasible results when topN exceeds total combinations', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem({ topN: 10 }),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        const key = candidates.map((c) => c.candidateId).join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      maxCombinationCount: 16,
    })

    expect(completion.summary.solveState).toBe('completed')
    expect(completion.emittedCertificates).toHaveLength(1)
    const cert = completion.emittedCertificates[0]!
    expect(cert.referencedStateIds).toHaveLength(4)
    expect(cert.referencedStateIds[0]).toBe(
      'state:problem-digest:flower:flower-b|plume:plume-a'
    )
  })
})
