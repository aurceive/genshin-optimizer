import {
  type LapicCandidateDescriptor,
  type LapicCanonicalProblem,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import {
  createLapicArtifactWriteRequest,
  createLapicMemoryArtifactStore,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import {
  createLapicInMemorySessionController,
  createLapicSessionIdentity,
  createLapicSolveRequest,
  executeLapicBoundedExactSolve,
} from '@genshin-optimizer/lapic/runtime'
import { runLapicDivergenceHarness } from './harness'

// ---------------------------------------------------------------------------
// Test infrastructure (mirrors integration.test.ts patterns)
// ---------------------------------------------------------------------------

function candidate(
  candidateId: string,
  domainId: string,
  slotId: string
): LapicCandidateDescriptor {
  return {
    candidateId,
    sourceRecordDigest: candidateId,
    domainId,
    slotId,
    additiveFeatureDigest: `feature:${candidateId}`,
    discreteCounters: [],
    categoricalSignatureDigest: `category:${candidateId}`,
    provenance: {
      slotId,
      sourceEntityId: 'inventory',
      sourceRecordDigests: [candidateId],
      exclusiveResourceClaims: [],
      concreteInventoryBacked: true,
      featureExtractionDigest: `feature:${candidateId}`,
    },
  }
}

function createProblem(config: {
  slotIds: string[]
  domains: Array<{
    domainId: string
    slotId: string
    candidates: LapicCandidateDescriptor[]
  }>
  topN?: number
}): LapicCanonicalProblem {
  return {
    problemId: 'divergence-test',
    problemDigest: 'divergence-digest',
    engineVersion: 'engine-version',
    arithmeticPolicyId: 'arith-policy',
    teamLayout: {
      teamKind: 'gi-single',
      slotCount: config.slotIds.length,
      slotIds: config.slotIds,
      slotRoleTaxonomy: config.slotIds.map(() => 'artifact'),
      slotRequirements: Object.fromEntries(
        config.slotIds.map((s) => [s, 'required'])
      ),
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: config.slotIds.map((slotId) => ({
      slotId,
      slotRole: `artifact-${slotId}`,
      participationMode: 'optimizedBuild',
      occupantDomainId: config.domains.find((d) => d.slotId === slotId)!
        .domainId,
      equipmentOwnershipModel: 'hard-reserved-inventory',
      contributesToObjective: true,
      contributesToConstraints: true,
      mayRemainEmpty: false,
    })),
    sharedTeamContext: {
      adapterSemanticMode: 'gi-legacy-validated',
      aggregateFacts: {},
      metadata: {},
    },
    frameAxis: [],
    itemDomains: config.domains,
    compatibilityRules: [],
    objective: {
      objectiveId: 'objective-id',
      objectiveKind: 'single-slot',
      expressionDigest: 'objective-digest',
      targetSlotIds: config.slotIds,
      frameIds: [],
    },
    constraints: [],
    topN: config.topN ?? 1,
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

function createSessionInfra() {
  const store = createLapicMemoryArtifactStore({
    entries: [
      createLapicArtifactWriteRequest(
        createLapicStorageEnvelope({
          artifactKind: 'canonical-problem',
          schemaVersion: '0.1.0-draft',
          payloadEncoding: 'json',
          payloadLength: 64,
          contentHash: 'divergence-digest',
          checksum: { algorithm: 'sha256', checksum: 'divergence-digest' },
          compressionCodec: 'none',
          creationEngineVersion: 'engine-version',
          arithmeticPolicyId: 'arith-policy',
          dependencyDigestSet: [],
        }),
        'divergence-digest'
      ),
    ],
  })
  const controller = createLapicInMemorySessionController({
    identity: createLapicSessionIdentity({
      sessionId: `div-session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      problemDigest: 'divergence-digest',
      engineVersion: 'engine-version',
      arithmeticPolicyId: 'arith-policy',
      runtimeProtocolVersion: '0.1.0-draft',
      createdAtLogicalTimestamp: 'ts-1',
    }),
    solveRequest: createLapicSolveRequest('divergence-digest'),
    artifactStore: store,
  })
  return { controller, store }
}

/**
 * Simple additive evaluator: sum of numeric values derived from candidate IDs.
 * candidateId format: `{prefix}-{number}` → the number is the score.
 */
function createAdditiveEvaluator() {
  const scoreMap = new Map<string, number>([
    ['flower-a', 10],
    ['flower-b', 100],
    ['flower-c', 50],
    ['flower-d', 75],
    ['flower-e', 30],
    ['plume-a', 5],
    ['plume-b', 20],
    ['plume-c', 8],
    ['plume-d', 15],
    ['plume-e', 12],
    ['sands-a', 3],
    ['sands-b', 7],
    ['sands-c', 11],
  ])

  return (combination: { candidates: readonly LapicCandidateDescriptor[] }) => {
    let total = 0
    for (const cand of combination.candidates) {
      total += scoreMap.get(cand.candidateId) ?? 0
    }
    const formatted = total.toFixed(4).padStart(12, '0')
    return createLapicSuccessResult({
      objectiveValue: formatted,
      evidenceDigest: `eval:${formatted}`,
      orderingKey: [formatted],
    })
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkpoint resume divergence harness', () => {
  it('no divergence for simple 2-domain problem', async () => {
    const flowerCandidates = [
      candidate('flower-a', 'gi:flower', 'flower'),
      candidate('flower-b', 'gi:flower', 'flower'),
      candidate('flower-c', 'gi:flower', 'flower'),
    ]
    const plumeCandidates = [
      candidate('plume-a', 'gi:plume', 'plume'),
      candidate('plume-b', 'gi:plume', 'plume'),
      candidate('plume-c', 'gi:plume', 'plume'),
    ]

    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [
        { domainId: 'gi:flower', slotId: 'flower', candidates: flowerCandidates },
        { domainId: 'gi:plume', slotId: 'plume', candidates: plumeCandidates },
      ],
      topN: 1,
    })

    const result = await runLapicDivergenceHarness({
      problem,
      evaluateCombination: createAdditiveEvaluator(),
      createSessionInfra,
      executeSolve: executeLapicBoundedExactSolve,
      pauseAfterCombinations: 3,
    })

    expect(result.diverged).toBe(false)
    expect(result.topNMatch).toBe(true)
    expect(result.finalOptimalityMatch).toBe(true)
    expect(result.pauseResumeRounds).toBeGreaterThanOrEqual(1)
    expect(result.diagnostics).toHaveLength(0)
  })

  it('no divergence for 3-domain problem with more candidates', async () => {
    const problem = createProblem({
      slotIds: ['flower', 'plume', 'sands'],
      domains: [
        {
          domainId: 'gi:flower',
          slotId: 'flower',
          candidates: [
            candidate('flower-a', 'gi:flower', 'flower'),
            candidate('flower-b', 'gi:flower', 'flower'),
            candidate('flower-c', 'gi:flower', 'flower'),
            candidate('flower-d', 'gi:flower', 'flower'),
          ],
        },
        {
          domainId: 'gi:plume',
          slotId: 'plume',
          candidates: [
            candidate('plume-a', 'gi:plume', 'plume'),
            candidate('plume-b', 'gi:plume', 'plume'),
            candidate('plume-c', 'gi:plume', 'plume'),
          ],
        },
        {
          domainId: 'gi:sands',
          slotId: 'sands',
          candidates: [
            candidate('sands-a', 'gi:sands', 'sands'),
            candidate('sands-b', 'gi:sands', 'sands'),
            candidate('sands-c', 'gi:sands', 'sands'),
          ],
        },
      ],
      topN: 1,
    })

    const result = await runLapicDivergenceHarness({
      problem,
      evaluateCombination: createAdditiveEvaluator(),
      createSessionInfra,
      executeSolve: executeLapicBoundedExactSolve,
      pauseAfterCombinations: 5,
    })

    expect(result.diverged).toBe(false)
    expect(result.topNMatch).toBe(true)
    expect(result.finalOptimalityMatch).toBe(true)
    expect(result.pauseResumeRounds).toBeGreaterThanOrEqual(1)
  })

  it('no divergence with very frequent pauses (pause every 1 combination)', async () => {
    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [
        {
          domainId: 'gi:flower',
          slotId: 'flower',
          candidates: [
            candidate('flower-a', 'gi:flower', 'flower'),
            candidate('flower-b', 'gi:flower', 'flower'),
          ],
        },
        {
          domainId: 'gi:plume',
          slotId: 'plume',
          candidates: [
            candidate('plume-a', 'gi:plume', 'plume'),
            candidate('plume-b', 'gi:plume', 'plume'),
          ],
        },
      ],
      topN: 1,
    })

    const result = await runLapicDivergenceHarness({
      problem,
      evaluateCombination: createAdditiveEvaluator(),
      createSessionInfra,
      executeSolve: executeLapicBoundedExactSolve,
      pauseAfterCombinations: 1,
    })

    expect(result.diverged).toBe(false)
    expect(result.topNMatch).toBe(true)
    // With 4 combinations and pause every 1, should get multiple rounds
    expect(result.pauseResumeRounds).toBeGreaterThanOrEqual(2)
  })

  it('reports correct certificate counts', async () => {
    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [
        {
          domainId: 'gi:flower',
          slotId: 'flower',
          candidates: [
            candidate('flower-a', 'gi:flower', 'flower'),
            candidate('flower-b', 'gi:flower', 'flower'),
          ],
        },
        {
          domainId: 'gi:plume',
          slotId: 'plume',
          candidates: [
            candidate('plume-a', 'gi:plume', 'plume'),
            candidate('plume-b', 'gi:plume', 'plume'),
          ],
        },
      ],
      topN: 1,
    })

    const result = await runLapicDivergenceHarness({
      problem,
      evaluateCombination: createAdditiveEvaluator(),
      createSessionInfra,
      executeSolve: executeLapicBoundedExactSolve,
      pauseAfterCombinations: 2,
    })

    // Both runs should emit at least a FinalOptimalityCert
    expect(result.continuousCertificateCount).toBeGreaterThanOrEqual(1)
    expect(result.resumedCertificateCount).toBeGreaterThanOrEqual(1)
  })

  it('comparison result contains proper structure', async () => {
    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [
        {
          domainId: 'gi:flower',
          slotId: 'flower',
          candidates: [
            candidate('flower-a', 'gi:flower', 'flower'),
            candidate('flower-b', 'gi:flower', 'flower'),
          ],
        },
        {
          domainId: 'gi:plume',
          slotId: 'plume',
          candidates: [
            candidate('plume-a', 'gi:plume', 'plume'),
            candidate('plume-b', 'gi:plume', 'plume'),
          ],
        },
      ],
      topN: 1,
    })

    const result = await runLapicDivergenceHarness({
      problem,
      evaluateCombination: createAdditiveEvaluator(),
      createSessionInfra,
      executeSolve: executeLapicBoundedExactSolve,
    })

    expect(typeof result.diverged).toBe('boolean')
    expect(typeof result.topNMatch).toBe('boolean')
    expect(typeof result.finalOptimalityMatch).toBe('boolean')
    expect(typeof result.pauseResumeRounds).toBe('number')
    expect(Array.isArray(result.continuousTopN)).toBe(true)
    expect(Array.isArray(result.resumedTopN)).toBe(true)
    expect(Array.isArray(result.diagnostics)).toBe(true)
  })
})
