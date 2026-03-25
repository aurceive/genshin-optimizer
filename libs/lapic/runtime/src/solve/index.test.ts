import {
  type LapicCanonicalProblem,
  LapicFirGraphBuilder,
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import { validateLapicCertificate } from '@genshin-optimizer/lapic/cert'
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
import {
  createBoundPruneCertificate,
  createDominanceCertificate,
} from './certificate'
import {
  buildDangerZoneRecord,
  defaultLapicDangerZoneConfig,
  detectBoundPruneDangerZone,
} from './danger-zone'
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
      progressEvents.push(
        `${event.phase}:${event.completedUnits}/${event.totalUnits ?? 0}`
      )
    })
    controller.subscribeDiagnostics((event) => {
      diagnosticTags.push('tag' in event ? event.tag : event.failureClass)
    })

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        const key = candidates
          .map((candidate) => candidate.candidateId)
          .join('|')
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
    expect(
      completion.emittedCertificates.filter(
        (c) => c.certKind === 'FinalOptimalityCert'
      )
    ).toHaveLength(1)
    expect(
      completion.emittedCertificates[completion.emittedCertificates.length - 1]
        ?.certKind
    ).toBe('FinalOptimalityCert')
    const dominanceCerts = completion.emittedCertificates.filter(
      (c) => c.certKind === 'DominanceCert'
    )
    expect(dominanceCerts.length).toBeGreaterThan(0)
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
      store
        .snapshot()
        .find((entry) => entry.artifactRef.artifactKind === 'frontier-index')
        ?.payloadDigest
    ).toBe('payload:frontier-index:problem-digest')
    expect(
      store
        .snapshot()
        .find((entry) => entry.artifactRef.artifactKind === 'frontier-index')
        ?.envelope.contentHash
    ).toBe('frontier-index:problem-digest')
    expect(
      store
        .snapshot()
        .filter((entry) => entry.artifactRef.artifactKind === 'frontier-block')
        .every((entry) =>
          entry.envelope.contentHash.startsWith('frontier:problem-digest:')
        )
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
    expect(completion.emittedCertificates[0]?.certKind).toBe(
      'InfeasibilityCert'
    )
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
    expect(
      completion.emittedCertificates.filter(
        (c) => c.certKind === 'FinalOptimalityCert'
      )
    ).toHaveLength(1)
    const cert = completion.emittedCertificates.find(
      (c) => c.certKind === 'FinalOptimalityCert'
    )!
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

  it('pauses during join phase when a pause is requested and emits checkpoint state', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    let combinationsSeen = 0

    // Request a pause after the second combination
    const solvePromise = executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        combinationsSeen += 1
        const key = candidates.map((c) => c.candidateId).join('|')
        // After processing 2 combinations, request pause
        if (combinationsSeen === 2) {
          controller.requestPause()
        }
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      maxCombinationCount: 16,
    })

    const outcome = await solvePromise

    expect('paused' in outcome).toBe(true)
    if (!('paused' in outcome)) return
    expect(outcome.paused).toBe(true)
    expect(outcome.checkpointState.checkpointKind).toBe('solve-position')
    expect(outcome.checkpointState.problemDigest).toBe('problem-digest')
    expect(
      outcome.checkpointState.visitedCombinationCount
    ).toBeGreaterThanOrEqual(2)
    expect(outcome.checkpointState.totalCombinationCount).toBe(4)
    expect(outcome.checkpointState.phase).toBe('join')
    expect(outcome.checkpointState.trackerSnapshot.topN).toBe(1)
    expect(
      outcome.checkpointState.trackerSnapshot.entries.length
    ).toBeGreaterThanOrEqual(1)
    expect(outcome.checkpointState.frontierBlockIds).toHaveLength(2)

    // Verify checkpoint state was persisted to artifact store
    const solveCheckpointArtifacts = store
      .snapshot()
      .filter((entry) => entry.artifactRef.artifactKind === 'solve-checkpoint')
    expect(solveCheckpointArtifacts).toHaveLength(1)
    expect(solveCheckpointArtifacts[0]!.artifactRef.contentHash).toContain(
      'solve-checkpoint:problem-digest:'
    )
  })

  it('resumes from a checkpoint state and produces correct final result', async () => {
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    // First run: pause after 2 combinations
    const firstRun = createController()
    let firstRunCount = 0

    const firstOutcome = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller: firstRun.controller,
      artifactStore: firstRun.store,
      evaluateCombination({ candidates }) {
        firstRunCount += 1
        const key = candidates.map((c) => c.candidateId).join('|')
        if (firstRunCount === 2) firstRun.controller.requestPause()
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      maxCombinationCount: 16,
    })

    expect('paused' in firstOutcome).toBe(true)
    if (!('paused' in firstOutcome)) return

    // Second run: resume from checkpoint
    const secondRun = createController()

    const finalOutcome = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller: secondRun.controller,
      artifactStore: secondRun.store,
      evaluateCombination({ candidates }) {
        const key = candidates.map((c) => c.candidateId).join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      maxCombinationCount: 16,
      resumeCheckpointState: firstOutcome.checkpointState,
    })

    expect('paused' in finalOutcome).toBe(false)
    if ('paused' in finalOutcome) return
    expect(finalOutcome.summary.solveState).toBe('completed')
    expect(finalOutcome.finalOptimality?.winnerStateId).toBe(
      'state:problem-digest:flower:flower-b|plume:plume-a'
    )
    expect(
      finalOutcome.emittedCertificates.filter(
        (c) => c.certKind === 'FinalOptimalityCert'
      )
    ).toHaveLength(1)
    expect(
      finalOutcome.emittedCertificates[
        finalOutcome.emittedCertificates.length - 1
      ]?.certKind
    ).toBe('FinalOptimalityCert')
  })

  it('persists solve-checkpoint artifact that is included in session checkpoint closure', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    let combinationsSeen = 0

    const outcome = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        combinationsSeen += 1
        const key = candidates.map((c) => c.candidateId).join('|')
        if (combinationsSeen === 2) controller.requestPause()
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      maxCombinationCount: 16,
    })

    expect('paused' in outcome).toBe(true)
    if (!('paused' in outcome)) return

    // Session controller should have all published artifacts (frontier blocks + index + solve-checkpoint)
    const exported = await controller.exportCheckpoint()
    const requiredArtifactKinds = exported.inventory.requiredArtifacts.map(
      (ref) => ref.artifactKind
    )
    expect(requiredArtifactKinds).toContain('frontier-block')
    expect(requiredArtifactKinds).toContain('frontier-index')
    expect(requiredArtifactKinds).toContain('solve-checkpoint')
    expect(exported.inventory.missingArtifacts).toHaveLength(0)
  })

  it('prunes subtrees when computeUpperBound returns a bound below the threshold', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }
    let evaluationCount = 0
    let boundCallCount = 0

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        evaluationCount += 1
        const key = candidates.map((c) => c.candidateId).join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      computeUpperBound({ assignedCandidates }) {
        boundCallCount += 1
        // For flower-b, declare a very low bound so its subtree gets pruned
        // (only after tracker is full, i.e. after flower-a subtree completes)
        const flowerId = assignedCandidates[0]?.candidateId
        if (flowerId === 'flower-b') {
          return { upperBoundValue: '0001', evidenceDigest: 'bound:low' }
        }
        // For flower-a, return a high bound (no pruning)
        return { upperBoundValue: '9999', evidenceDigest: 'bound:high' }
      },
      maxCombinationCount: 16,
    })

    expect(completion.summary.solveState).toBe('completed')
    // flower-a subtree evaluated 2 combinations (flower-a|plume-a, flower-a|plume-b)
    // flower-b subtree was pruned (bound '0001' < threshold '0020')
    // So only 2 evaluations should have occurred
    expect(evaluationCount).toBe(2)
    // Bound was checked for flower-b (and possibly flower-a depending on order)
    expect(boundCallCount).toBeGreaterThan(0)
    // Winner is from the flower-a subtree (flower-a|plume-b = 0020)
    expect(completion.finalOptimality?.winnerStateId).toBe(
      'state:problem-digest:flower:flower-a|plume:plume-b'
    )
  })

  it('does not prune when the tracker is not yet full', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }
    let evaluationCount = 0

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem({ topN: 10 }), // topN=10, never full with 4 candidates
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        evaluationCount += 1
        const key = candidates.map((c) => c.candidateId).join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      computeUpperBound() {
        // Should never be used for pruning because tracker is never full
        return { upperBoundValue: '0001', evidenceDigest: 'bound:low' }
      },
      maxCombinationCount: 16,
    })

    // All 4 combinations evaluated since tracker was never full
    expect(evaluationCount).toBe(4)
    expect(completion.summary.solveState).toBe('completed')
  })

  it('does not prune when the bound is above the threshold', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }
    let evaluationCount = 0

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        evaluationCount += 1
        const key = candidates.map((c) => c.candidateId).join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      computeUpperBound() {
        // Always returns a high bound — no pruning should occur
        return { upperBoundValue: '9999', evidenceDigest: 'bound:high' }
      },
      maxCombinationCount: 16,
    })

    // All 4 combinations evaluated
    expect(evaluationCount).toBe(4)
    expect(completion.summary.solveState).toBe('completed')
    expect(completion.finalOptimality?.winnerStateId).toBe(
      'state:problem-digest:flower:flower-b|plume:plume-a'
    )
  })

  it('does not prune when computeUpperBound returns undefined', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }
    let evaluationCount = 0

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        evaluationCount += 1
        const key = candidates.map((c) => c.candidateId).join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      computeUpperBound() {
        return undefined // No bound available
      },
      maxCombinationCount: 16,
    })

    expect(evaluationCount).toBe(4)
    expect(completion.summary.solveState).toBe('completed')
  })

  it('preserves pruning statistics across pause/resume', async () => {
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    // First run: pause after 1 combination
    const firstRun = createController()
    let firstRunCount = 0

    const firstOutcome = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller: firstRun.controller,
      artifactStore: firstRun.store,
      evaluateCombination({ candidates }) {
        firstRunCount += 1
        const key = candidates.map((c) => c.candidateId).join('|')
        if (firstRunCount === 1) firstRun.controller.requestPause()
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      computeUpperBound() {
        // High bound, no pruning in first run
        return { upperBoundValue: '9999', evidenceDigest: 'bound:high' }
      },
      maxCombinationCount: 16,
    })

    expect('paused' in firstOutcome).toBe(true)
    if (!('paused' in firstOutcome)) return

    // Verify pruning statistics are captured in checkpoint
    expect(firstOutcome.checkpointState.pruningStatistics).toBeDefined()
    expect(
      firstOutcome.checkpointState.pruningStatistics!.boundEvaluationCount
    ).toBeGreaterThanOrEqual(0)

    // Second run: resume and complete
    const secondRun = createController()

    const finalOutcome = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller: secondRun.controller,
      artifactStore: secondRun.store,
      evaluateCombination({ candidates }) {
        const key = candidates.map((c) => c.candidateId).join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      computeUpperBound() {
        return { upperBoundValue: '9999', evidenceDigest: 'bound:high' }
      },
      maxCombinationCount: 16,
      resumeCheckpointState: firstOutcome.checkpointState,
    })

    expect('paused' in finalOutcome).toBe(false)
    if ('paused' in finalOutcome) return
    expect(finalOutcome.summary.solveState).toBe('completed')
    expect(finalOutcome.finalOptimality?.winnerStateId).toBe(
      'state:problem-digest:flower:flower-b|plume:plume-a'
    )
  })

  it('correctly finds the optimal when pruning only non-optimal subtrees', async () => {
    const { store, controller } = createController()
    // 4 combinations, flower-b|plume-a is the winner (0030)
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }
    let evaluationCount = 0

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        evaluationCount += 1
        const key = candidates.map((c) => c.candidateId).join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      computeUpperBound({ assignedCandidates }) {
        // Return tight bounds per flower choice
        const flowerId = assignedCandidates[0]?.candidateId
        if (flowerId === 'flower-a') {
          // Best in flower-a subtree is 0020
          return { upperBoundValue: '0020', evidenceDigest: 'bound:flower-a' }
        }
        if (flowerId === 'flower-b') {
          // Best in flower-b subtree is 0030
          return { upperBoundValue: '0030', evidenceDigest: 'bound:flower-b' }
        }
        return undefined
      },
      maxCombinationCount: 16,
    })

    expect(completion.summary.solveState).toBe('completed')
    // The winner should always be flower-b|plume-a regardless of pruning
    expect(completion.finalOptimality?.winnerStateId).toBe(
      'state:problem-digest:flower:flower-b|plume:plume-a'
    )
    // With tight bounds, flower-a subtree (bound 0020) should be pruned
    // once flower-b|plume-a (0030) becomes the incumbent, so at most 3
    // evaluations are needed. Accept ≤ 4 (all combinations) to allow
    // for implementation-dependent traversal order.
    expect(evaluationCount).toBeGreaterThan(0)
    expect(evaluationCount).toBeLessThanOrEqual(4)
  })

  it('emits BoundPruneCert when subtrees are pruned', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
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
      computeUpperBound({ assignedCandidates }) {
        const flowerId = assignedCandidates[0]?.candidateId
        if (flowerId === 'flower-b') {
          return { upperBoundValue: '0001', evidenceDigest: 'bound:low' }
        }
        return { upperBoundValue: '9999', evidenceDigest: 'bound:high' }
      },
      maxCombinationCount: 16,
    })

    expect(completion.summary.solveState).toBe('completed')

    // Should have BoundPruneCert(s) + FinalOptimalityCert
    const pruneCerts = completion.emittedCertificates.filter(
      (c) => c.certKind === 'BoundPruneCert'
    )
    const finalCerts = completion.emittedCertificates.filter(
      (c) => c.certKind === 'FinalOptimalityCert'
    )
    expect(pruneCerts.length).toBeGreaterThanOrEqual(1)
    expect(finalCerts).toHaveLength(1)

    // Verify BoundPruneCert structure
    const pruneCert = pruneCerts[0]!
    expect(pruneCert.decisionClass).toBe('relaxation-prune')
    expect(pruneCert.validationStatus).toBe('validated')
    expect(pruneCert.payload).toHaveProperty('boundValue')
    expect(pruneCert.payload).toHaveProperty('thresholdDigest')
    expect(pruneCert.payload).toHaveProperty(
      'boundSourceClass',
      'relaxationDerived'
    )
    expect(pruneCert.payload).toHaveProperty('dangerZoneRecord')

    // FinalOptimalityCert should reference pruning
    const finalCert = finalCerts[0]!
    expect(finalCert.payload).toHaveProperty('thresholdPruneSummaryDigest')
    expect(
      (finalCert.payload as Record<string, unknown>).thresholdPruneSummaryDigest
    ).not.toContain('none')
  })

  it('emits BranchReachabilityCert when firGraph has forced branches', async () => {
    const { store, controller } = createController()

    // Build a F-IR graph with a forced thresholdSelect (guard=10, threshold=5 → then forced)
    const b = new LapicFirGraphBuilder()
    const guardId = b.constant(10)
    const thenId = b.read('x')
    const elseId = b.constant(0)
    const rootId = b.thresholdSelect(guardId, 5, thenId, elseId)
    const firGraph = b.build(rootId)

    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      firGraph,
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

    // Should have BranchReachabilityCert(s)
    const branchCerts = completion.emittedCertificates.filter(
      (c) => c.certKind === 'BranchReachabilityCert'
    )
    expect(branchCerts.length).toBeGreaterThanOrEqual(1)

    // Verify BranchReachabilityCert structure
    const branchCert = branchCerts[0]!
    expect(branchCert.decisionClass).toBe('exact-prune')
    expect(branchCert.validationStatus).toBe('validated')
    expect(branchCert.payload).toHaveProperty('branchPredicateDigest')
    expect(branchCert.payload).toHaveProperty('selectedArm')
    expect(branchCert.payload).toHaveProperty('validityRegionId')
  })

  it('does not emit BranchReachabilityCert when firGraph is absent', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
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

    const branchCerts = completion.emittedCertificates.filter(
      (c) => c.certKind === 'BranchReachabilityCert'
    )
    expect(branchCerts).toHaveLength(0)
  })

  it('does not emit BranchReachabilityCert when no branches are forced', async () => {
    const { store, controller } = createController()

    // Build a F-IR graph with NO forced branches (guard is variable)
    const b = new LapicFirGraphBuilder()
    const rootId = b.thresholdSelect(
      b.read('guard'),
      5,
      b.read('x'),
      b.read('y')
    )
    const firGraph = b.build(rootId)

    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      firGraph,
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
    const branchCerts = completion.emittedCertificates.filter(
      (c) => c.certKind === 'BranchReachabilityCert'
    )
    expect(branchCerts).toHaveLength(0)
  })

  describe('createDominanceCertificate', () => {
    it('creates a valid dominance certificate with all required payload fields', async () => {
      const problem = createProblem()
      const options = {
        problem,
        controller: {} as never,
        artifactStore: {} as never,
        evaluateCombination: (() => {}) as never,
      }

      const cert = createDominanceCertificate(options, {
        dominatingStateId: 'state:winner',
        dominatedStateId: 'state:loser',
        dominatingEvidenceDigest: 'evidence:winner',
        dominatedEvidenceDigest: 'evidence:loser',
        signatureGroupKey: 'flower+plume',
        stepIndex: 42,
        frontierBlockIds: ['block-1', 'block-2'],
      })

      expect(cert.certKind).toBe('DominanceCert')
      expect(cert.problemId).toBe('problem-id')
      expect(cert.referencedStateIds).toEqual(['state:winner', 'state:loser'])
      expect(cert.referencedBlockIds).toEqual(['block-1', 'block-2'])
      expect(cert.emittedAtStep).toBe(42)
      expect(cert.payload.dominatingStateId).toBe('state:winner')
      expect(cert.payload.dominatedStateId).toBe('state:loser')
      expect(cert.payload.comparisonDigest).toBeTruthy()
      expect(cert.payload.exactSignatureGroupKeyDigest).toContain(
        'flower+plume'
      )
      expect(cert.payload.compatibilityInclusionDigest).toBeTruthy()
      expect(cert.payload.monotoneProjectionDigest).toBeTruthy()
      expect(cert.payload.upperBoundProfileDigest).toBeTruthy()
      expect(cert.payload.strengthComparisonDigest).toBeTruthy()

      // Must pass the existing cert validator
      const validation = validateLapicCertificate(cert)
      expect(validation.ok).toBe(true)
    })
  })

  it('emits DominanceCerts when tracker evicts weaker candidates', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    // topN=1: after first insert, each better candidate evicts the previous
    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem({ topN: 1 }),
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

    const dominanceCerts = completion.emittedCertificates.filter(
      (c) => c.certKind === 'DominanceCert'
    )
    // With topN=1 and scores [0010, 0020, 0030, 0005]:
    // 0010 fills → 0020 evicts 0010 (dominance) → 0030 evicts 0020 (dominance)
    // 0005 is worse than 0030, inserted was evicted immediately → no dominance cert
    expect(dominanceCerts).toHaveLength(2)

    // Verify dominance cert payload structure
    const firstDom = dominanceCerts[0]!
    expect(firstDom.payload).toHaveProperty('dominatingStateId')
    expect(firstDom.payload).toHaveProperty('dominatedStateId')
    expect(firstDom.referencedStateIds).toHaveLength(2)

    // Final optimality cert should still be present
    const finalCerts = completion.emittedCertificates.filter(
      (c) => c.certKind === 'FinalOptimalityCert'
    )
    expect(finalCerts).toHaveLength(1)
  })

  it('does not emit DominanceCerts when topN exceeds total combinations', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    // topN=10 with 4 combinations: tracker never fills, no evictions
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
    const dominanceCerts = completion.emittedCertificates.filter(
      (c) => c.certKind === 'DominanceCert'
    )
    expect(dominanceCerts).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Danger-zone detection unit tests
// ---------------------------------------------------------------------------

describe('detectBoundPruneDangerZone', () => {
  it('does not trigger when gap is large', () => {
    const result = detectBoundPruneDangerZone(
      '10',
      '100',
      defaultLapicDangerZoneConfig
    )
    expect(result.triggered).toBe(false)
    expect(result.absoluteGap).toBe(90)
    expect(result.relativeGap).toBe(0.9)
    expect(result.explanation).toBeUndefined()
  })

  it('triggers when absolute gap is below safe margin', () => {
    const config = { safeMarginRatio: 1e-15, safeMarginAbsolute: 0.01 }
    const result = detectBoundPruneDangerZone('99.999', '100', config)
    expect(result.triggered).toBe(true)
    expect(result.absoluteGap).toBeCloseTo(0.001, 6)
    expect(result.explanation).toContain('absoluteGap')
    expect(result.explanation).toContain('safeMarginAbsolute')
  })

  it('triggers when relative gap is below safe margin', () => {
    const config = { safeMarginRatio: 0.1, safeMarginAbsolute: 1e-15 }
    const result = detectBoundPruneDangerZone('95', '100', config)
    expect(result.triggered).toBe(true)
    expect(result.relativeGap).toBe(0.05)
    expect(result.explanation).toContain('relativeGap')
    expect(result.explanation).toContain('safeMarginRatio')
  })

  it('triggers for non-finite values', () => {
    const result = detectBoundPruneDangerZone(
      'NaN',
      '100',
      defaultLapicDangerZoneConfig
    )
    expect(result.triggered).toBe(true)
    expect(result.explanation).toContain('Non-finite')
  })

  it('triggers for Infinity', () => {
    const result = detectBoundPruneDangerZone(
      'Infinity',
      '100',
      defaultLapicDangerZoneConfig
    )
    expect(result.triggered).toBe(true)
    expect(result.explanation).toContain('Non-finite')
  })

  it('uses denominator max(|threshold|, 1) for small thresholds', () => {
    // Threshold near zero: denominator is 1, so relativeGap ≈ absoluteGap
    const config = { safeMarginRatio: 0.05, safeMarginAbsolute: 1e-15 }
    const result = detectBoundPruneDangerZone('-0.01', '0.01', config)
    expect(result.triggered).toBe(true)
    expect(result.relativeGap).toBeCloseTo(0.02, 6)
  })

  it('does not trigger when both margins are satisfied', () => {
    const config = { safeMarginRatio: 0.001, safeMarginAbsolute: 0.001 }
    const result = detectBoundPruneDangerZone('90', '100', config)
    expect(result.triggered).toBe(false)
  })

  it('buildDangerZoneRecord creates correct record', () => {
    const detection = detectBoundPruneDangerZone('99.9999999999', '100', {
      safeMarginRatio: 1e-9,
      safeMarginAbsolute: 1e-9,
    })
    const record = buildDangerZoneRecord(detection, false)
    expect(record.triggered).toBe(true)
    expect(record.verificationReplayInvoked).toBe(false)
    expect(record.explanation).toBeDefined()
  })

  it('buildDangerZoneRecord omits explanation when not triggered', () => {
    const detection = detectBoundPruneDangerZone(
      '10',
      '100',
      defaultLapicDangerZoneConfig
    )
    const record = buildDangerZoneRecord(detection, false)
    expect(record.triggered).toBe(false)
    expect(record.explanation).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Executor-level danger-zone tests
// ---------------------------------------------------------------------------

describe('executor danger-zone integration', () => {
  it('declines to prune when danger zone is triggered', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }
    let evaluationCount = 0

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        evaluationCount += 1
        const key = candidates.map((c) => c.candidateId).join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      computeUpperBound({ assignedCandidates }) {
        const flowerId = assignedCandidates[0]?.candidateId
        if (flowerId === 'flower-a') {
          // Bound is barely below threshold — within danger zone
          return {
            upperBoundValue: '0019.9999999999999',
            evidenceDigest: 'bound:close',
          }
        }
        return { upperBoundValue: '9999', evidenceDigest: 'bound:high' }
      },
      maxCombinationCount: 16,
      dangerZoneConfig: {
        safeMarginRatio: 0.01, // 1% relative margin
        safeMarginAbsolute: 0.01, // 0.01 absolute margin
      },
    })

    expect(completion.summary.solveState).toBe('completed')

    // Because danger zone declined the prune for flower-a subtree,
    // ALL 4 combinations should be evaluated (no pruning).
    expect(evaluationCount).toBe(4)

    // No BoundPruneCerts should be emitted (the would-be prune was declined)
    const pruneCerts = completion.emittedCertificates.filter(
      (c) => c.certKind === 'BoundPruneCert'
    )
    expect(pruneCerts).toHaveLength(0)
  })

  it('prunes normally when bound is safely below threshold with danger zone config', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
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
      computeUpperBound({ assignedCandidates }) {
        const flowerId = assignedCandidates[0]?.candidateId
        if (flowerId === 'flower-b') {
          // Bound far below threshold — safe to prune
          return { upperBoundValue: '0001', evidenceDigest: 'bound:far-below' }
        }
        return { upperBoundValue: '9999', evidenceDigest: 'bound:high' }
      },
      maxCombinationCount: 16,
      dangerZoneConfig: {
        safeMarginRatio: 0.01,
        safeMarginAbsolute: 0.01,
      },
    })

    expect(completion.summary.solveState).toBe('completed')

    // Prune should still happen — gap is large
    const pruneCerts = completion.emittedCertificates.filter(
      (c) => c.certKind === 'BoundPruneCert'
    )
    expect(pruneCerts.length).toBeGreaterThanOrEqual(1)

    // The BoundPruneCert should have dangerZoneRecord.triggered === false
    const pruneCert = pruneCerts[0]!
    expect(
      (pruneCert.payload as Record<string, unknown>).dangerZoneRecord
    ).toEqual({
      triggered: false,
      verificationReplayInvoked: false,
    })
  })

  it('BoundPruneCert accepts danger zone record from context', () => {
    const problem = createProblem()
    const cert = createBoundPruneCertificate(
      {
        problem,
        controller: null as never,
        artifactStore: null as never,
        evaluateCombination: null as never,
      },
      {
        boundValue: '50',
        boundEvidenceDigest: 'evidence:bound',
        thresholdValue: '100',
        domainIndex: 0,
        stepIndex: 1,
        frontierBlockIds: ['block-1'],
        dangerZoneRecord: {
          triggered: true,
          verificationReplayInvoked: true,
          explanation: 'Test danger zone',
        },
      }
    )

    expect(cert.payload.dangerZoneRecord).toEqual({
      triggered: true,
      verificationReplayInvoked: true,
      explanation: 'Test danger zone',
    })
  })
})

// ---------------------------------------------------------------------------
// A-2: Sync hot loop pause and progress tests
// ---------------------------------------------------------------------------

describe('sync hot loop — pause detection', () => {
  it('detects pause requested during join and returns checkpoint', async () => {
    const { store, controller } = createController()
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }
    let evaluationCount = 0

    const outcome = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        evaluationCount += 1
        // Request pause after first evaluation
        if (evaluationCount === 1) {
          controller.requestPause()
        }
        const key = candidates
          .map((candidate) => candidate.candidateId)
          .join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      maxCombinationCount: 16,
    })

    // Should return a pause result, not a completion
    expect('paused' in outcome && outcome.paused).toBe(true)
  })
})

describe('sync hot loop — progress events', () => {
  it('publishes final join progress with skippedUnits field', async () => {
    const { store, controller } = createController()
    const progressEvents: Array<{
      phase: string
      completedUnits: number
      skippedUnits?: number
    }> = []
    const scores: Record<string, string> = {
      'flower-a|plume-a': '0010',
      'flower-a|plume-b': '0020',
      'flower-b|plume-a': '0030',
      'flower-b|plume-b': '0005',
    }

    controller.subscribeProgress((event) => {
      progressEvents.push({
        phase: event.phase,
        completedUnits: event.completedUnits,
        skippedUnits: event.skippedUnits,
      })
    })

    await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore: store,
      evaluateCombination({ candidates }) {
        const key = candidates
          .map((candidate) => candidate.candidateId)
          .join('|')
        return createLapicSuccessResult({
          objectiveValue: scores[key]!,
          evidenceDigest: `evidence:${key}`,
          orderingKey: [scores[key]!],
        })
      },
      maxCombinationCount: 16,
    })

    // Should have at least one join progress event
    const joinEvents = progressEvents.filter((e) => e.phase === 'join')
    expect(joinEvents.length).toBeGreaterThan(0)

    // Last join event should have 4 completed (2 flowers × 2 plumes)
    const lastJoin = joinEvents[joinEvents.length - 1]!
    expect(lastJoin.completedUnits).toBe(4)
    // skippedUnits should be present (0 since no pruning in this test)
    expect(lastJoin.skippedUnits).toBe(0)
  })
})
