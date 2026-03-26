/**
 * Validation corpus runner (§5.2 — Golden Enumeration Tests).
 *
 * Orchestrates both an exhaustive oracle (`runLapicGoldenHarness`) and the
 * bounded-exact solver for a given corpus fixture, then compares the
 * solver's top-N output against the oracle's ground truth.
 */

import {
  type LapicCandidateDescriptor,
  type LapicCanonicalProblem,
  type LapicFirGraph,
  type LapicFirVariableId,
  LapicFirGraphBuilder,
  createLapicSuccessResult,
  evaluateLapicFirScalar,
  runLapicGoldenHarness,
  type LapicGoldenDomain,
} from '@genshin-optimizer/lapic/core'
import {
  createLapicArtifactWriteRequest,
  createLapicMemoryArtifactStore,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import {
  createLapicSessionIdentity,
  createLapicSolveRequest,
  createLapicInMemorySessionController,
  executeLapicBoundedExactSolve,
  createLapicFirBoundProvider,
  type LapicFirDomainVariableMap,
} from '@genshin-optimizer/lapic/runtime'
import type {
  LapicCorpusFixture,
  LapicCorpusDomainSpec,
  LapicCorpusRunResult,
  LapicCorpusViolation,
} from './types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function candidateDescriptor(
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

function buildProblem(fixture: LapicCorpusFixture): LapicCanonicalProblem {
  const slotIds = fixture.domains.map((d) => d.slotId)
  return {
    problemId: `corpus:${fixture.fixtureId}`,
    problemDigest: `corpus-digest:${fixture.fixtureId}`,
    engineVersion: 'corpus-engine',
    arithmeticPolicyId: 'corpus-arith',
    teamLayout: {
      teamKind: 'gi-single',
      slotCount: slotIds.length,
      slotIds,
      slotRoleTaxonomy: slotIds.map(() => 'artifact'),
      slotRequirements: Object.fromEntries(slotIds.map((s) => [s, 'required'])),
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: fixture.domains.map((d) => ({
      slotId: d.slotId,
      slotRole: `artifact-${d.slotId}`,
      participationMode: 'optimizedBuild',
      occupantDomainId: d.domainId,
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
    itemDomains: fixture.domains.map((d) => ({
      domainId: d.domainId,
      slotId: d.slotId,
      candidates: d.candidates.map((c) =>
        candidateDescriptor(c.candidateId, d.domainId, d.slotId)
      ),
    })),
    compatibilityRules: [],
    objective: {
      objectiveId: 'corpus-objective',
      objectiveKind: 'single-slot',
      expressionDigest: `corpus-expr:${fixture.fixtureId}`,
      targetSlotIds: slotIds,
      frameIds: [],
    },
    constraints: [],
    topN: fixture.topN,
    orderingPolicy: {
      tieBreakDimensions: ['value'],
      canonicalCandidateOrdering: ['value'],
    },
    auxiliaryOutputs: [],
    adapterMetadata: {
      adapterKind: 'corpus-adapter',
      adapterVersion: '0.1.0-corpus',
      sourceSnapshotDigests: ['corpus-snapshot'],
      declaredUnsupportedFeatures: [],
      metadata: {},
    },
    provenance: {
      teamLayoutDigest: `corpus-layout:${fixture.fixtureId}`,
      sharedTeamContextDigest: 'corpus-shared',
      crossSlotRuleDescriptorVersion: '0.1.0-draft',
      compatibilitySignatureSchemaVersion: '0.1.0-draft',
      slotProvenance: [],
    },
  }
}

function buildDomainVariableMaps(
  domains: readonly LapicCorpusDomainSpec[]
): LapicFirDomainVariableMap[] {
  return domains.map((d) => ({
    domainId: d.domainId,
    candidateVariables: new Map(
      d.candidates.map((c) => [
        c.candidateId,
        new Map(Object.entries(c.variables)),
      ])
    ),
  }))
}

function buildGoldenDomains(
  domains: readonly LapicCorpusDomainSpec[]
): LapicGoldenDomain[] {
  return domains.map((d) => ({
    domainId: d.domainId,
    candidates: d.candidates.map((c) => ({
      candidateId: c.candidateId,
      variables: new Map(Object.entries(c.variables)),
    })),
  }))
}

function createCorpusController(fixtureId: string) {
  const digest = `corpus-digest:${fixtureId}`
  const store = createLapicMemoryArtifactStore({
    entries: [
      createLapicArtifactWriteRequest(
        createLapicStorageEnvelope({
          artifactKind: 'canonical-problem',
          schemaVersion: '0.1.0-draft',
          payloadEncoding: 'json',
          payloadLength: 64,
          contentHash: digest,
          checksum: { algorithm: 'sha256', checksum: digest },
          compressionCodec: 'none',
          creationEngineVersion: 'corpus-engine',
          arithmeticPolicyId: 'corpus-arith',
          dependencyDigestSet: [],
        }),
        digest
      ),
    ],
  })
  const controller = createLapicInMemorySessionController({
    identity: createLapicSessionIdentity({
      sessionId: `corpus-session:${fixtureId}`,
      problemDigest: digest,
      engineVersion: 'corpus-engine',
      arithmeticPolicyId: 'corpus-arith',
      runtimeProtocolVersion: '0.1.0-draft',
      createdAtLogicalTimestamp: 'ts-corpus',
    }),
    solveRequest: createLapicSolveRequest(digest),
    artifactStore: store,
  })
  return { store, controller }
}

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
    const formatted = score.toFixed(4).padStart(12, '0')
    return createLapicSuccessResult({
      objectiveValue: formatted,
      evidenceDigest: `fir-eval:${formatted}`,
      orderingKey: [formatted],
    })
  }

  return { evaluator, getCallCount: () => callCount }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a single corpus fixture through the validation pipeline.
 *
 * Steps:
 * 1. Build F-IR graph from fixture spec
 * 2. Run exhaustive golden oracle
 * 3. Run bounded-exact solver (with pruning)
 * 4. Compare solver output against golden truth and fixture expectations
 */
export async function runCorpusFixture(
  fixture: LapicCorpusFixture
): Promise<LapicCorpusRunResult> {
  const violations: LapicCorpusViolation[] = []

  // 1. Build graph
  const builder = new LapicFirGraphBuilder()
  const root = fixture.buildGraph(builder)
  const graph = builder.build(root)

  const domainMaps = buildDomainVariableMaps(fixture.domains)
  const goldenDomains = buildGoldenDomains(fixture.domains)
  const globalConstants = fixture.globalConstants
    ? new Map(Object.entries(fixture.globalConstants))
    : undefined

  // 2. Golden oracle — exhaustive enumeration
  const goldenResult = runLapicGoldenHarness({
    graph,
    domains: goldenDomains,
    ...(globalConstants ? { globalConstants } : {}),
  })

  if (!goldenResult.ok) {
    violations.push({
      kind: 'oracle-failure',
      message: `Golden harness reported ${goldenResult.violations.length} bound-admissibility violation(s)`,
    })
  }

  // Verify golden max matches fixture expectation
  if (
    Math.abs(goldenResult.maxScalarValue - fixture.golden.bestObjectiveValue) >
    1e-9
  ) {
    violations.push({
      kind: 'objective-mismatch',
      message:
        `Golden oracle max ${goldenResult.maxScalarValue} ≠ ` +
        `fixture expected ${fixture.golden.bestObjectiveValue}`,
    })
  }

  // 3. Run bounded-exact solver
  const problem = buildProblem(fixture)
  const { store, controller } = createCorpusController(fixture.fixtureId)
  const { evaluator, getCallCount } = createFirEvaluator(
    graph,
    domainMaps,
    globalConstants
  )
  const boundProvider = createLapicFirBoundProvider({
    graph,
    domainVariableMaps: domainMaps,
    ...(globalConstants ? { globalConstants } : {}),
    formatUpperBound: (v) => v.toFixed(4).padStart(12, '0'),
  })

  let solverTopValue = ''
  let solverTopCandidateIds: readonly string[] = []

  try {
    const outcome = await executeLapicBoundedExactSolve({
      problem,
      controller,
      artifactStore: store,
      evaluateCombination: evaluator,
      computeUpperBound: boundProvider,
    })

    if ('paused' in outcome) {
      violations.push({
        kind: 'solver-failure',
        message: 'Solver paused unexpectedly',
      })
    } else {
      const completion = outcome
      if (completion.summary.solveState !== 'completed') {
        violations.push({
          kind: 'solver-failure',
          message: `Solver state: ${completion.summary.solveState}`,
        })
      }

      // 4a. Verify solver top result matches golden max
      if (completion.topNCandidates && completion.topNCandidates.length > 0) {
        const topEntry = completion.topNCandidates[0]!
        solverTopValue = topEntry.evaluation.objectiveValue
        solverTopCandidateIds = topEntry.candidates
          .map((c) => c.candidateId)
          .sort()

        const solverNumericValue = parseFloat(solverTopValue)
        if (
          Math.abs(solverNumericValue - fixture.golden.bestObjectiveValue) >
          1e-6
        ) {
          violations.push({
            kind: 'objective-mismatch',
            message:
              `Solver top value ${solverNumericValue} ≠ ` +
              `expected ${fixture.golden.bestObjectiveValue}`,
          })
        }
      } else {
        violations.push({
          kind: 'solver-failure',
          message: 'Solver returned no top-N candidates',
        })
      }

      // 4b. Verify top-N ordering matches golden expectations
      const solverTopN = completion.topNCandidates ?? []
      const expectedTopN = fixture.golden.rankedCombinations

      for (let rank = 0; rank < expectedTopN.length; rank++) {
        if (rank >= solverTopN.length) {
          violations.push({
            kind: 'missing-combination',
            message: `Expected rank ${rank + 1} combination missing from solver output`,
          })
          continue
        }

        const solverCids = solverTopN[rank]!.candidates.map(
          (c) => c.candidateId
        ).sort()
        const expectedCids = [...expectedTopN[rank]!].sort()

        const match =
          solverCids.length === expectedCids.length &&
          solverCids.every((id, i) => id === expectedCids[i])

        if (!match) {
          violations.push({
            kind: 'top-n-order-mismatch',
            message:
              `Rank ${rank + 1}: solver [${solverCids.join(',')}] ≠ ` +
              `expected [${expectedCids.join(',')}]`,
          })
        }
      }
    }
  } catch (e) {
    violations.push({
      kind: 'solver-failure',
      message: `Solver threw: ${e instanceof Error ? e.message : String(e)}`,
    })
  }

  return {
    fixtureId: fixture.fixtureId,
    passed: violations.length === 0,
    oracleMaxValue: goldenResult.maxScalarValue,
    solverTopValue,
    solverTopCandidateIds,
    evaluationCount: getCallCount(),
    totalCombinations: goldenResult.totalCombinations,
    violations,
  }
}
