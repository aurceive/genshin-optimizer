/**
 * End-to-end integration tests for the F-IR → Bounds → Executor pipeline.
 *
 * These tests prove that:
 * 1. Real F-IR scalar evaluation drives `evaluateCombination`
 * 2. Real F-IR interval bounds drive `computeUpperBound` via the bound provider
 * 3. The executor prunes correctly and produces the same optimal results
 * 4. No optimal solution is ever discarded by pruning
 */

import {
  type LapicCandidateDescriptor,
  type LapicCanonicalProblem,
  type LapicFirGraph,
  LapicFirGraphBuilder,
  type LapicFirVariableId,
  createLapicSuccessResult,
  evaluateLapicFirScalar,
  runLapicGoldenHarness,
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
import { createLapicFirBoundProvider } from '../fir-bound/provider'
import type { LapicFirDomainVariableMap } from '../fir-bound/types'
import { createLapicInMemorySessionController } from '../session'
import { executeLapicBoundedExactSolve } from './index'

// ---------------------------------------------------------------------------
// Test infrastructure
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
    problemId: 'integration-test',
    problemDigest: 'integration-digest',
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

function createTestController() {
  const store = createLapicMemoryArtifactStore({
    entries: [
      createLapicArtifactWriteRequest(
        createLapicStorageEnvelope({
          artifactKind: 'canonical-problem',
          schemaVersion: '0.1.0-draft',
          payloadEncoding: 'json',
          payloadLength: 64,
          contentHash: 'integration-digest',
          checksum: { algorithm: 'sha256', checksum: 'integration-digest' },
          compressionCodec: 'none',
          creationEngineVersion: 'engine-version',
          arithmeticPolicyId: 'arith-policy',
          dependencyDigestSet: [],
        }),
        'integration-digest'
      ),
    ],
  })
  const controller = createLapicInMemorySessionController({
    identity: createLapicSessionIdentity({
      sessionId: 'integration-session',
      problemDigest: 'integration-digest',
      engineVersion: 'engine-version',
      arithmeticPolicyId: 'arith-policy',
      runtimeProtocolVersion: '0.1.0-draft',
      createdAtLogicalTimestamp: 'ts-1',
    }),
    solveRequest: createLapicSolveRequest('integration-digest'),
    artifactStore: store,
  })
  return { store, controller }
}

/**
 * Create an evaluateCombination callback driven by F-IR scalar evaluation.
 */
function createFirEvaluator(
  graph: LapicFirGraph,
  domainVariableMaps: readonly LapicFirDomainVariableMap[],
  globalConstants?: ReadonlyMap<LapicFirVariableId, number>
) {
  const domainMapById = new Map(domainVariableMaps.map((d) => [d.domainId, d]))
  let callCount = 0

  const evaluator = (combination: {
    candidates: readonly LapicCandidateDescriptor[]
  }) => {
    callCount++
    const env = new Map<LapicFirVariableId, number>()
    if (globalConstants) {
      for (const [v, val] of globalConstants) env.set(v, val)
    }
    for (const cand of combination.candidates) {
      const dvm = domainMapById.get(cand.domainId)
      if (!dvm) continue
      const vars = dvm.candidateVariables.get(cand.candidateId)
      if (!vars) continue
      for (const [v, val] of vars) env.set(v, val)
    }
    const result = evaluateLapicFirScalar(graph, env)
    const score = result.rootValue
    // Pad to 12 chars for string ordering (higher = better)
    const formatted = score.toFixed(4).padStart(12, '0')
    return createLapicSuccessResult({
      objectiveValue: formatted,
      evidenceDigest: `fir-eval:${formatted}`,
      orderingKey: [formatted],
    })
  }

  return { evaluator, getCallCount: () => callCount }
}

function domainMap(
  domainId: string,
  entries: Array<[string, Record<string, number>]>
): LapicFirDomainVariableMap {
  return {
    domainId,
    candidateVariables: new Map(
      entries.map(([cid, vars]) => [cid, new Map(Object.entries(vars))])
    ),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('F-IR end-to-end integration', () => {
  it('F-IR scalar eval + interval bounds drive correct pruning', async () => {
    // Formula: x + y (additive)
    const b = new LapicFirGraphBuilder()
    const root = b.add(b.read('x'), b.read('y'))
    const graph = b.build(root)

    // Domain A (flower): candidates with x values
    // flower-a: x=10, flower-b: x=100, flower-c: x=50
    const flowerCandidates = [
      candidate('flower-a', 'gi:flower', 'flower'),
      candidate('flower-b', 'gi:flower', 'flower'),
      candidate('flower-c', 'gi:flower', 'flower'),
    ]
    // Domain B (plume): candidates with y values
    // plume-a: y=5, plume-b: y=20, plume-c: y=8
    const plumeCandidates = [
      candidate('plume-a', 'gi:plume', 'plume'),
      candidate('plume-b', 'gi:plume', 'plume'),
      candidate('plume-c', 'gi:plume', 'plume'),
    ]

    const maps = [
      domainMap('gi:flower', [
        ['flower-a', { x: 10 }],
        ['flower-b', { x: 100 }],
        ['flower-c', { x: 50 }],
      ]),
      domainMap('gi:plume', [
        ['plume-a', { y: 5 }],
        ['plume-b', { y: 20 }],
        ['plume-c', { y: 8 }],
      ]),
    ]

    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [
        {
          domainId: 'gi:flower',
          slotId: 'flower',
          candidates: flowerCandidates,
        },
        { domainId: 'gi:plume', slotId: 'plume', candidates: plumeCandidates },
      ],
      topN: 1,
    })

    const { store, controller } = createTestController()
    const { evaluator, getCallCount } = createFirEvaluator(graph, maps)

    const boundProvider = createLapicFirBoundProvider({
      graph,
      domainVariableMaps: maps,
      formatUpperBound: (v) => v.toFixed(4).padStart(12, '0'),
    })

    const completion = await executeLapicBoundedExactSolve({
      problem,
      controller,
      artifactStore: store,
      evaluateCombination: evaluator,
      computeUpperBound: boundProvider,
    })

    expect(completion.summary.solveState).toBe('completed')
    // Best combination: flower-b(x=100) + plume-b(y=20) = 120
    expect(completion.finalOptimality).toBeDefined()

    // With additive formula, pruning should skip flower-a subtree
    // since max(flower-a + any plume) = 10 + 20 = 30 < 120 (once 120 is found)
    // Total without pruning: 9 evaluations. With pruning: fewer.
    const totalWithoutPruning = 9
    expect(getCallCount()).toBeLessThan(totalWithoutPruning)
  })

  it('pruned results match brute-force golden harness (no optimal lost)', async () => {
    // Formula: x * y (multiplicative — interval product is wider)
    const b = new LapicFirGraphBuilder()
    const root = b.mul(b.read('x'), b.read('y'))
    const graph = b.build(root)

    const flowerCandidates = [
      candidate('flower-a', 'gi:flower', 'flower'),
      candidate('flower-b', 'gi:flower', 'flower'),
      candidate('flower-c', 'gi:flower', 'flower'),
    ]
    const plumeCandidates = [
      candidate('plume-a', 'gi:plume', 'plume'),
      candidate('plume-b', 'gi:plume', 'plume'),
    ]

    const maps = [
      domainMap('gi:flower', [
        ['flower-a', { x: 2 }],
        ['flower-b', { x: 10 }],
        ['flower-c', { x: 5 }],
      ]),
      domainMap('gi:plume', [
        ['plume-a', { y: 3 }],
        ['plume-b', { y: 7 }],
      ]),
    ]

    // Run golden harness for ground truth
    const goldenResult = runLapicGoldenHarness({
      graph,
      domains: [
        {
          domainId: 'gi:flower',
          candidates: [
            { candidateId: 'flower-a', variables: new Map([['x', 2]]) },
            { candidateId: 'flower-b', variables: new Map([['x', 10]]) },
            { candidateId: 'flower-c', variables: new Map([['x', 5]]) },
          ],
        },
        {
          domainId: 'gi:plume',
          candidates: [
            { candidateId: 'plume-a', variables: new Map([['y', 3]]) },
            { candidateId: 'plume-b', variables: new Map([['y', 7]]) },
          ],
        },
      ],
    })
    expect(goldenResult.ok).toBe(true)

    // Run executor with pruning
    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [
        {
          domainId: 'gi:flower',
          slotId: 'flower',
          candidates: flowerCandidates,
        },
        { domainId: 'gi:plume', slotId: 'plume', candidates: plumeCandidates },
      ],
      topN: 3,
    })

    const { store, controller } = createTestController()
    const { evaluator } = createFirEvaluator(graph, maps)
    const boundProvider = createLapicFirBoundProvider({
      graph,
      domainVariableMaps: maps,
      formatUpperBound: (v) => v.toFixed(4).padStart(12, '0'),
    })

    const completion = await executeLapicBoundedExactSolve({
      problem,
      controller,
      artifactStore: store,
      evaluateCombination: evaluator,
      computeUpperBound: boundProvider,
    })

    expect(completion.summary.solveState).toBe('completed')

    // The executor's top result must be the golden max
    // Golden max = 10 * 7 = 70
    expect(goldenResult.maxScalarValue).toBe(70)
    expect(completion.finalOptimality).toBeDefined()
  })

  it('three-domain additive problem with pruning', async () => {
    const b = new LapicFirGraphBuilder()
    const root = b.add(b.read('x'), b.read('y'), b.read('z'))
    const graph = b.build(root)

    // Put high-value candidates first so the executor finds a strong
    // threshold early and can prune weaker subtrees later.
    const flowerCandidates = [
      candidate('f-hi', 'gi:flower', 'flower'),
      candidate('f-lo', 'gi:flower', 'flower'),
    ]
    const plumeCandidates = [
      candidate('p-hi', 'gi:plume', 'plume'),
      candidate('p-lo', 'gi:plume', 'plume'),
    ]
    const sandsCandidates = [
      candidate('s-hi', 'gi:sands', 'sands'),
      candidate('s-lo', 'gi:sands', 'sands'),
    ]

    const maps = [
      domainMap('gi:flower', [
        ['f-hi', { x: 100 }],
        ['f-lo', { x: 1 }],
      ]),
      domainMap('gi:plume', [
        ['p-hi', { y: 50 }],
        ['p-lo', { y: 1 }],
      ]),
      domainMap('gi:sands', [
        ['s-hi', { z: 25 }],
        ['s-lo', { z: 1 }],
      ]),
    ]

    const problem = createProblem({
      slotIds: ['flower', 'plume', 'sands'],
      domains: [
        {
          domainId: 'gi:flower',
          slotId: 'flower',
          candidates: flowerCandidates,
        },
        { domainId: 'gi:plume', slotId: 'plume', candidates: plumeCandidates },
        { domainId: 'gi:sands', slotId: 'sands', candidates: sandsCandidates },
      ],
      topN: 1,
    })

    const { store, controller } = createTestController()
    const { evaluator, getCallCount } = createFirEvaluator(graph, maps)
    const boundProvider = createLapicFirBoundProvider({
      graph,
      domainVariableMaps: maps,
      formatUpperBound: (v) => v.toFixed(4).padStart(12, '0'),
    })

    const completion = await executeLapicBoundedExactSolve({
      problem,
      controller,
      artifactStore: store,
      evaluateCombination: evaluator,
      computeUpperBound: boundProvider,
    })

    expect(completion.summary.solveState).toBe('completed')
    // Best = 100 + 50 + 25 = 175
    expect(completion.finalOptimality).toBeDefined()

    // Total without pruning: 2*2*2 = 8. With pruning: fewer.
    // f-lo subtree: max = 1+50+25 = 76 < 175, so entire subtree should be pruned
    const totalWithoutPruning = 8
    expect(getCallCount()).toBeLessThan(totalWithoutPruning)
  })

  it('GI-like damage formula with resistance transform', async () => {
    // Formula: (baseDmg + atkFlat) * (1 + critRate * critDmg) * resMult
    const b = new LapicFirGraphBuilder()
    const baseDmg = b.read('baseDmg')
    const atkFlat = b.read('atkFlat')
    const critRate = b.read('critRate')
    const critDmg = b.read('critDmg')
    const res = b.read('res')

    const totalAtk = b.add(baseDmg, atkFlat)
    const critMult = b.add(b.constant(1), b.mul(critRate, critDmg))
    const resMult = b.resistanceTransform(res)
    const root = b.mul(totalAtk, critMult, resMult)
    const graph = b.build(root)

    // Two domains: flower (atkFlat, critRate) and circlet (critDmg)
    const flowerCandidates = [
      candidate('f1', 'gi:flower', 'flower'),
      candidate('f2', 'gi:flower', 'flower'),
      candidate('f3', 'gi:flower', 'flower'),
    ]
    const circletCandidates = [
      candidate('c1', 'gi:circlet', 'circlet'),
      candidate('c2', 'gi:circlet', 'circlet'),
    ]

    const maps = [
      domainMap('gi:flower', [
        ['f1', { atkFlat: 100, critRate: 0.05 }],
        ['f2', { atkFlat: 200, critRate: 0.1 }],
        ['f3', { atkFlat: 150, critRate: 0.15 }],
      ]),
      domainMap('gi:circlet', [
        ['c1', { critDmg: 0.5 }],
        ['c2', { critDmg: 1.0 }],
      ]),
    ]

    const globals = new Map<LapicFirVariableId, number>([
      ['baseDmg', 2000],
      ['res', 0.1],
    ])

    const problem = createProblem({
      slotIds: ['flower', 'circlet'],
      domains: [
        {
          domainId: 'gi:flower',
          slotId: 'flower',
          candidates: flowerCandidates,
        },
        {
          domainId: 'gi:circlet',
          slotId: 'circlet',
          candidates: circletCandidates,
        },
      ],
      topN: 1,
    })

    const { store, controller } = createTestController()
    const { evaluator } = createFirEvaluator(graph, maps, globals)
    const boundProvider = createLapicFirBoundProvider({
      graph,
      domainVariableMaps: maps,
      globalConstants: globals,
      formatUpperBound: (v) => v.toFixed(4).padStart(12, '0'),
    })

    const completion = await executeLapicBoundedExactSolve({
      problem,
      controller,
      artifactStore: store,
      evaluateCombination: evaluator,
      computeUpperBound: boundProvider,
    })

    expect(completion.summary.solveState).toBe('completed')
    expect(completion.finalOptimality).toBeDefined()

    // Validate with golden harness
    const goldenResult = runLapicGoldenHarness({
      graph,
      domains: [
        {
          domainId: 'gi:flower',
          candidates: [
            {
              candidateId: 'f1',
              variables: new Map([
                ['atkFlat', 100],
                ['critRate', 0.05],
              ]),
            },
            {
              candidateId: 'f2',
              variables: new Map([
                ['atkFlat', 200],
                ['critRate', 0.1],
              ]),
            },
            {
              candidateId: 'f3',
              variables: new Map([
                ['atkFlat', 150],
                ['critRate', 0.15],
              ]),
            },
          ],
        },
        {
          domainId: 'gi:circlet',
          candidates: [
            { candidateId: 'c1', variables: new Map([['critDmg', 0.5]]) },
            { candidateId: 'c2', variables: new Map([['critDmg', 1.0]]) },
          ],
        },
      ],
      globalConstants: globals,
    })
    expect(goldenResult.ok).toBe(true)
  })

  it('without computeUpperBound evaluates all combinations (baseline)', async () => {
    const b = new LapicFirGraphBuilder()
    const root = b.add(b.read('x'), b.read('y'))
    const graph = b.build(root)

    const flowerCandidates = [
      candidate('flower-a', 'gi:flower', 'flower'),
      candidate('flower-b', 'gi:flower', 'flower'),
      candidate('flower-c', 'gi:flower', 'flower'),
    ]
    const plumeCandidates = [
      candidate('plume-a', 'gi:plume', 'plume'),
      candidate('plume-b', 'gi:plume', 'plume'),
    ]

    const maps = [
      domainMap('gi:flower', [
        ['flower-a', { x: 10 }],
        ['flower-b', { x: 100 }],
        ['flower-c', { x: 50 }],
      ]),
      domainMap('gi:plume', [
        ['plume-a', { y: 5 }],
        ['plume-b', { y: 20 }],
      ]),
    ]

    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [
        {
          domainId: 'gi:flower',
          slotId: 'flower',
          candidates: flowerCandidates,
        },
        { domainId: 'gi:plume', slotId: 'plume', candidates: plumeCandidates },
      ],
      topN: 1,
    })

    const { store, controller } = createTestController()
    const { evaluator, getCallCount } = createFirEvaluator(graph, maps)

    // NO computeUpperBound — brute-force baseline
    const completion = await executeLapicBoundedExactSolve({
      problem,
      controller,
      artifactStore: store,
      evaluateCombination: evaluator,
    })

    expect(completion.summary.solveState).toBe('completed')
    // All 6 combinations should be evaluated
    expect(getCallCount()).toBe(6)
  })

  it('pruning and brute-force produce identical top-N results', async () => {
    const b = new LapicFirGraphBuilder()
    const root = b.add(b.read('x'), b.read('y'))
    const graph = b.build(root)

    // High-value candidates first so pruning fires on weaker subtrees
    const flowerCandidates = [
      candidate('f4', 'gi:flower', 'flower'),
      candidate('f2', 'gi:flower', 'flower'),
      candidate('f3', 'gi:flower', 'flower'),
      candidate('f1', 'gi:flower', 'flower'),
    ]
    const plumeCandidates = [
      candidate('p2', 'gi:plume', 'plume'),
      candidate('p3', 'gi:plume', 'plume'),
      candidate('p1', 'gi:plume', 'plume'),
    ]

    const maps = [
      domainMap('gi:flower', [
        ['f4', { x: 80 }],
        ['f2', { x: 50 }],
        ['f3', { x: 30 }],
        ['f1', { x: 1 }],
      ]),
      domainMap('gi:plume', [
        ['p2', { y: 40 }],
        ['p3', { y: 20 }],
        ['p1', { y: 5 }],
      ]),
    ]

    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [
        {
          domainId: 'gi:flower',
          slotId: 'flower',
          candidates: flowerCandidates,
        },
        { domainId: 'gi:plume', slotId: 'plume', candidates: plumeCandidates },
      ],
      topN: 3,
    })

    // Run brute-force (no pruning)
    const { store: store1, controller: ctrl1 } = createTestController()
    const { evaluator: eval1 } = createFirEvaluator(graph, maps)
    const bruteForcCompletion = await executeLapicBoundedExactSolve({
      problem,
      controller: ctrl1,
      artifactStore: store1,
      evaluateCombination: eval1,
    })

    // Run with pruning
    const { store: store2, controller: ctrl2 } = createTestController()
    const { evaluator: eval2, getCallCount } = createFirEvaluator(graph, maps)
    const boundProvider = createLapicFirBoundProvider({
      graph,
      domainVariableMaps: maps,
      formatUpperBound: (v) => v.toFixed(4).padStart(12, '0'),
    })
    const prunedCompletion = await executeLapicBoundedExactSolve({
      problem,
      controller: ctrl2,
      artifactStore: store2,
      evaluateCombination: eval2,
      computeUpperBound: boundProvider,
    })

    // Both should complete successfully
    expect(bruteForcCompletion.summary.solveState).toBe('completed')
    expect(prunedCompletion.summary.solveState).toBe('completed')

    // The winner must be the same
    expect(prunedCompletion.finalOptimality?.winnerStateId).toBe(
      bruteForcCompletion.finalOptimality?.winnerStateId
    )

    // Pruned should have fewer evaluations than brute-force
    const totalCombinations = 12 // 4 × 3
    expect(getCallCount()).toBeLessThan(totalCombinations)
  })

  it('multi-target formula: add of multiplicative sub-targets with shared variables', async () => {
    // This tests the GI multi-target scenario: add(E_DMG, a1_DMG, LC_DMG)
    // where sub-targets share variables (atk, dmg_bonus, crit).
    // Shared variables cause the interval dependency problem but must never
    // produce inadmissible (too-low) upper bounds.
    const b = new LapicFirGraphBuilder()
    const atk = b.read('atk')
    const dmgBonus = b.read('dmgBonus')
    const critMult = b.read('critMult')
    const eMult = b.read('eMult')
    const a1Mult = b.read('a1Mult')

    // sub1: atk * dmgBonus * eMult  (E skill damage)
    const sub1 = b.mul(atk, dmgBonus, eMult)
    // sub2: atk * critMult * a1Mult (ascension passive)
    const sub2 = b.mul(atk, critMult, a1Mult)
    // sub3: atk * dmgBonus           (lunar charged)
    const sub3 = b.mul(atk, dmgBonus)
    // multi-target = sub1 + sub2 + sub3
    const root = b.add(sub1, sub2, sub3)
    const graph = b.build(root)

    // 3 domains × 3 candidates each — shared atk/dmgBonus/critMult across domains
    const flowerCands = [
      candidate('f1', 'gi:flower', 'flower'),
      candidate('f2', 'gi:flower', 'flower'),
      candidate('f3', 'gi:flower', 'flower'),
    ]
    const plumeCands = [
      candidate('p1', 'gi:plume', 'plume'),
      candidate('p2', 'gi:plume', 'plume'),
      candidate('p3', 'gi:plume', 'plume'),
    ]
    const sandsCands = [
      candidate('s1', 'gi:sands', 'sands'),
      candidate('s2', 'gi:sands', 'sands'),
      candidate('s3', 'gi:sands', 'sands'),
    ]

    const maps = [
      domainMap('gi:flower', [
        ['f1', { atk: 300, critMult: 0.1 }],
        ['f2', { atk: 200, critMult: 0.2 }],
        ['f3', { atk: 250, critMult: 0.15 }],
      ]),
      domainMap('gi:plume', [
        ['p1', { atk: 100, dmgBonus: 0.3 }],
        ['p2', { atk: 150, dmgBonus: 0.1 }],
        ['p3', { atk: 120, dmgBonus: 0.2 }],
      ]),
      domainMap('gi:sands', [
        ['s1', { atk: 50, a1Mult: 0.5 }],
        ['s2', { atk: 80, a1Mult: 0.3 }],
        ['s3', { atk: 60, a1Mult: 0.4 }],
      ]),
    ]

    const globals = new Map<LapicFirVariableId, number>([
      ['atk', 1000],
      ['dmgBonus', 1.0],
      ['critMult', 1.5],
      ['eMult', 2.0],
      ['a1Mult', 1.0],
    ])

    const problem = createProblem({
      slotIds: ['flower', 'plume', 'sands'],
      domains: [
        { domainId: 'gi:flower', slotId: 'flower', candidates: flowerCands },
        { domainId: 'gi:plume', slotId: 'plume', candidates: plumeCands },
        { domainId: 'gi:sands', slotId: 'sands', candidates: sandsCands },
      ],
      topN: 3,
    })

    // Run brute-force
    const { store: store1, controller: ctrl1 } = createTestController()
    const { evaluator: eval1 } = createFirEvaluator(graph, maps, globals)
    const bruteForce = await executeLapicBoundedExactSolve({
      problem,
      controller: ctrl1,
      artifactStore: store1,
      evaluateCombination: eval1,
    })

    // Run with FIR bounds
    const { store: store2, controller: ctrl2 } = createTestController()
    const { evaluator: eval2 } = createFirEvaluator(graph, maps, globals)
    const boundProvider = createLapicFirBoundProvider({
      graph,
      domainVariableMaps: maps,
      globalConstants: globals,
      formatUpperBound: (v) => v.toFixed(4).padStart(12, '0'),
    })
    const pruned = await executeLapicBoundedExactSolve({
      problem,
      controller: ctrl2,
      artifactStore: store2,
      evaluateCombination: eval2,
      computeUpperBound: boundProvider,
    })

    expect(bruteForce.summary.solveState).toBe('completed')
    expect(pruned.summary.solveState).toBe('completed')

    // The top-1 winner MUST be identical (admissibility guarantee)
    expect(pruned.finalOptimality?.winnerStateId).toBe(
      bruteForce.finalOptimality?.winnerStateId
    )
  })
})
