import type { MainStatKey } from '@genshin-optimizer/gi/consts'
import type { ICachedArtifact, OptConfig } from '@genshin-optimizer/gi/db'
import type { OptNode } from '@genshin-optimizer/gi/wr'
import type {
  LapicGoldenDomain,
  LapicProblemNormalizationInput,
  LapicTeamProvenance,
} from '@genshin-optimizer/lapic/core'
import { runLapicGoldenHarness } from '@genshin-optimizer/lapic/core'
import {
  createLapicInMemorySessionController,
  createLapicSessionIdentity,
  createLapicSolveRequest,
} from '@genshin-optimizer/lapic/runtime'
import { createLapicMemoryArtifactStore } from '@genshin-optimizer/lapic/storage'
import {
  buildGiLapicCanonicalExportFromRequest,
  compileGiOptNodeToFir,
  createGiArtifactCategoricalSignatureDigest,
  createGiArtifactFeatureDigest,
  createGiLapicCanonicalIdentity,
  createGiOptNodeDigest,
  executeGiLapicBoundedCurrentOnlySolve,
} from './index'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function createArtifact(
  overrides: Partial<ICachedArtifact> = {}
): ICachedArtifact {
  return {
    id: 'artifact-id',
    setKey: 'GladiatorsFinale',
    rarity: 5,
    level: 20,
    slotKey: 'flower',
    mainStatKey: 'hp',
    mainStatVal: 4780,
    substats: [],
    unactivatedSubstats: undefined,
    location: '',
    lock: false,
    ...overrides,
  } as ICachedArtifact
}

function createNormalizationInput(): LapicProblemNormalizationInput {
  const provenance: LapicTeamProvenance = {
    teamLayoutDigest: 'team-layout-digest',
    sharedTeamContextDigest: 'shared-context-digest',
    crossSlotRuleDescriptorVersion: '0.1.0-draft',
    compatibilitySignatureSchemaVersion: '0.1.0-draft',
    slotProvenance: [],
  }

  return {
    teamLayout: {
      teamKind: 'gi-single',
      slotCount: 5,
      slotIds: ['flower', 'plume', 'sands', 'goblet', 'circlet'],
      slotRoleTaxonomy: ['artifact'],
      slotRequirements: {
        flower: 'required',
        plume: 'required',
        sands: 'required',
        goblet: 'required',
        circlet: 'required',
      },
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: [
      {
        slotId: 'flower',
        slotRole: 'artifact-flower',
        participationMode: 'optimizedBuild',
        occupantDomainId: 'artifact-domain',
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
    itemDomains: [
      {
        domainId: 'artifact-domain',
        slotId: 'flower',
        candidates: [],
      },
    ],
    compatibilityRules: [],
    objective: {
      objectiveId: 'objective',
      objectiveKind: 'single-slot',
      expressionDigest: 'objective-digest',
      targetSlotIds: ['flower'],
      frameIds: [],
    },
    constraints: [],
    topN: 5,
    orderingPolicy: {
      tieBreakDimensions: ['value'],
      canonicalCandidateOrdering: ['value'],
    },
    adapterMetadata: {
      adapterKind: 'gi-wr',
      adapterVersion: '0.1.0-draft',
      sourceSnapshotDigests: ['artifact-snapshot-digest'],
      declaredUnsupportedFeatures: [],
      metadata: {},
    },
    provenance,
  }
}

function createGiRequest() {
  const mainStatKeys: {
    sands: readonly MainStatKey[]
    goblet: readonly MainStatKey[]
    circlet: readonly MainStatKey[]
  } = {
    sands: ['atk_'],
    goblet: ['pyro_dmg_'],
    circlet: ['critRate_'],
  }

  return {
    adapterKind: 'gi' as const,
    normalizationInput: createNormalizationInput(),
    giContext: {
      sourceSnapshots: {
        artifactSnapshotDigest: 'artifact-snapshot-digest',
        characterSnapshotDigest: 'character-snapshot-digest',
        weaponSnapshotDigest: 'weapon-snapshot-digest',
        formulaSnapshotDigest: 'formula-snapshot-digest',
      },
      inventorySnapshot: {
        artifacts: [createArtifact()],
        excludedArtifactIds: [],
        excludedLocations: [],
      },
      optConfig: {} as OptConfig,
      optimizationRequest: {
        optimizationTarget: {} as OptNode,
        constraints: [],
        exclusion: {},
        topN: 5,
        statFilters: {},
        mainStatKeys,
        allowPartial: false,
        useExcludedArts: false,
        useTeammateBuild: false,
        levelLow: 0,
        levelHigh: 20,
        upOptLevelLow: 0,
        upOptLevelHigh: 19,
        mainStatAssumptionLevel: 0,
      },
    },
    requestedPotentialSolveModes: ['current-only'] as const,
  }
}

function createSolveController() {
  const artifactStore = createLapicMemoryArtifactStore()
  const controller = createLapicInMemorySessionController({
    identity: createLapicSessionIdentity({
      sessionId: 'validation-session',
      problemDigest: 'validation-problem-digest',
      engineVersion: 'engine-version',
      arithmeticPolicyId: 'arithmetic-policy',
      runtimeProtocolVersion: '0.1.0-draft',
      createdAtLogicalTimestamp: 'ts-1',
    }),
    solveRequest: createLapicSolveRequest('validation-problem-digest'),
    artifactStore,
  })
  return { artifactStore, controller }
}

function optConst(value: number): OptNode {
  return { operation: 'const', operands: [], value, info: {} } as OptNode
}

function optRead(...path: string[]): OptNode {
  return {
    operation: 'read',
    operands: [],
    path,
    info: {},
  } as unknown as OptNode
}

function optAdd(...operands: OptNode[]): OptNode {
  return { operation: 'add', operands, info: {} } as OptNode
}

function optMul(...operands: OptNode[]): OptNode {
  return { operation: 'mul', operands, info: {} } as OptNode
}

// =========================================================================
// 1. Digest Determinism
// =========================================================================

describe('gi lapic adapter validation harness', () => {
  describe('digest determinism', () => {
    it('produces identical digests for identical OptNode trees', () => {
      const node = optAdd(optRead('atk'), optConst(100))

      const digestA = createGiOptNodeDigest(node)
      const digestB = createGiOptNodeDigest(node)

      expect(digestA).toBe(digestB)
      expect(typeof digestA).toBe('string')
      expect(digestA.length).toBeGreaterThan(0)
    })

    it('produces different digests for structurally different OptNode trees', () => {
      const addNode = optAdd(optRead('atk'), optConst(100))
      const mulNode = optMul(optRead('atk'), optConst(100))
      const differentConstNode = optAdd(optRead('atk'), optConst(200))
      const differentReadNode = optAdd(optRead('def'), optConst(100))

      const addDigest = createGiOptNodeDigest(addNode)
      const mulDigest = createGiOptNodeDigest(mulNode)
      const differentConstDigest = createGiOptNodeDigest(differentConstNode)
      const differentReadDigest = createGiOptNodeDigest(differentReadNode)

      expect(addDigest).not.toBe(mulDigest)
      expect(addDigest).not.toBe(differentConstDigest)
      expect(addDigest).not.toBe(differentReadDigest)
    })

    it('produces identical digests for independently constructed equivalent trees', () => {
      const treeA = optMul(
        optAdd(optRead('baseAtk'), optRead('flatAtk')),
        optAdd(optConst(1), optMul(optRead('critRate'), optRead('critDmg')))
      )
      const treeB = optMul(
        optAdd(optRead('baseAtk'), optRead('flatAtk')),
        optAdd(optConst(1), optMul(optRead('critRate'), optRead('critDmg')))
      )

      expect(createGiOptNodeDigest(treeA)).toBe(createGiOptNodeDigest(treeB))
    })

    it('produces stable artifact feature and categorical digests', () => {
      const artifact = createArtifact()
      const sameArtifact = createArtifact()
      const differentArtifact = createArtifact({
        slotKey: 'plume',
        mainStatKey: 'atk',
      })

      // Feature digest: same → same, different → different
      const featureA = createGiArtifactFeatureDigest(artifact)
      const featureB = createGiArtifactFeatureDigest(sameArtifact)
      const featureC = createGiArtifactFeatureDigest(differentArtifact)
      expect(featureA).toBe(featureB)
      expect(featureA).not.toBe(featureC)

      // Categorical digest: same → same, different → different
      const catA = createGiArtifactCategoricalSignatureDigest(artifact)
      const catB = createGiArtifactCategoricalSignatureDigest(sameArtifact)
      const catC = createGiArtifactCategoricalSignatureDigest(differentArtifact)
      expect(catA).toBe(catB)
      expect(catA).not.toBe(catC)
    })
  })

  // =========================================================================
  // 2. Golden Harness Integration at Adapter Level
  // =========================================================================

  describe('golden harness integration', () => {
    it('validates F-IR interval bounds for additive formula via golden enumeration', () => {
      // Formula: x + y
      const target = optAdd(optRead('x'), optRead('y'))
      const compilation = compileGiOptNodeToFir(target)
      expect(compilation.ok).toBe(true)
      if (!compilation.ok) return

      const { graph, variableMapping } = compilation.result
      const xVar = variableMapping.get('x')!
      const yVar = variableMapping.get('y')!

      const domains: LapicGoldenDomain[] = [
        {
          domainId: 'slot-a',
          candidates: [
            { candidateId: 'a1', variables: new Map([[xVar, 100]]) },
            { candidateId: 'a2', variables: new Map([[xVar, 200]]) },
            { candidateId: 'a3', variables: new Map([[xVar, 150]]) },
          ],
        },
        {
          domainId: 'slot-b',
          candidates: [
            { candidateId: 'b1', variables: new Map([[yVar, 50]]) },
            { candidateId: 'b2', variables: new Map([[yVar, 80]]) },
          ],
        },
      ]

      const result = runLapicGoldenHarness({ graph, domains })

      expect(result.ok).toBe(true)
      expect(result.violations).toHaveLength(0)
      expect(result.totalCombinations).toBe(6) // 3 × 2
      expect(result.maxScalarValue).toBe(280) // 200 + 80
      expect(result.minScalarValue).toBe(150) // 100 + 50
    })

    it('validates F-IR interval bounds for multiplicative formula via golden enumeration', () => {
      // Formula: x * y
      const target = optMul(optRead('x'), optRead('y'))
      const compilation = compileGiOptNodeToFir(target)
      expect(compilation.ok).toBe(true)
      if (!compilation.ok) return

      const { graph, variableMapping } = compilation.result
      const xVar = variableMapping.get('x')!
      const yVar = variableMapping.get('y')!

      const domains: LapicGoldenDomain[] = [
        {
          domainId: 'slot-a',
          candidates: [
            { candidateId: 'a1', variables: new Map([[xVar, 10]]) },
            { candidateId: 'a2', variables: new Map([[xVar, 20]]) },
          ],
        },
        {
          domainId: 'slot-b',
          candidates: [
            { candidateId: 'b1', variables: new Map([[yVar, 3]]) },
            { candidateId: 'b2', variables: new Map([[yVar, 7]]) },
            { candidateId: 'b3', variables: new Map([[yVar, 5]]) },
          ],
        },
      ]

      const result = runLapicGoldenHarness({ graph, domains })

      expect(result.ok).toBe(true)
      expect(result.violations).toHaveLength(0)
      expect(result.totalCombinations).toBe(6) // 2 × 3
      expect(result.maxScalarValue).toBe(140) // 20 * 7
      expect(result.minScalarValue).toBe(30) // 10 * 3
    })

    it('validates F-IR interval bounds for GI-like damage formula', () => {
      // damage = (baseAtk + flatAtk) * (1 + critRate * critDmg)
      const target = optMul(
        optAdd(optRead('baseAtk'), optRead('flatAtk')),
        optAdd(optConst(1), optMul(optRead('critRate'), optRead('critDmg')))
      )
      const compilation = compileGiOptNodeToFir(target)
      expect(compilation.ok).toBe(true)
      if (!compilation.ok) return

      const { graph, variableMapping } = compilation.result
      const baseAtkVar = variableMapping.get('baseAtk')!
      const flatAtkVar = variableMapping.get('flatAtk')!
      const critRateVar = variableMapping.get('critRate')!
      const critDmgVar = variableMapping.get('critDmg')!

      // Weapon slot contributes base ATK
      // Artifact slot contributes flat ATK, crit rate, crit dmg
      const domains: LapicGoldenDomain[] = [
        {
          domainId: 'weapon',
          candidates: [
            { candidateId: 'w1', variables: new Map([[baseAtkVar, 500]]) },
            { candidateId: 'w2', variables: new Map([[baseAtkVar, 600]]) },
          ],
        },
        {
          domainId: 'artifact-set',
          candidates: [
            {
              candidateId: 'art1',
              variables: new Map([
                [flatAtkVar, 100],
                [critRateVar, 0.5],
                [critDmgVar, 1.0],
              ]),
            },
            {
              candidateId: 'art2',
              variables: new Map([
                [flatAtkVar, 200],
                [critRateVar, 0.3],
                [critDmgVar, 1.5],
              ]),
            },
            {
              candidateId: 'art3',
              variables: new Map([
                [flatAtkVar, 50],
                [critRateVar, 0.8],
                [critDmgVar, 2.0],
              ]),
            },
          ],
        },
      ]

      const result = runLapicGoldenHarness({ graph, domains })

      expect(result.ok).toBe(true)
      expect(result.violations).toHaveLength(0)
      expect(result.totalCombinations).toBe(6) // 2 × 3
      // Best: (600 + 200) * (1 + 0.3*1.5) = 800 * 1.45 = 1160
      // or:   (600 + 50) * (1 + 0.8*2.0) = 650 * 2.6 = 1690
      expect(result.maxScalarValue).toBeCloseTo(1690, 10)
    })
  })

  // =========================================================================
  // 3. Certificate Structural Completeness
  // =========================================================================

  describe('certificate structural completeness', () => {
    it('FinalOptimalityCert contains all required payload and replay recipe fields', async () => {
      const { artifactStore, controller } = createSolveController()
      const request = createGiRequest()
      request.giContext.optimizationRequest.topN = 1
      request.normalizationInput.topN = 1

      const result = await executeGiLapicBoundedCurrentOnlySolve({
        request,
        canonicalIdentity: createGiLapicCanonicalIdentity({
          problemId: 'cert-validation-problem',
          problemDigest: 'cert-validation-digest',
          engineVersion: 'engine-version',
          arithmeticPolicyId: 'arithmetic-policy',
        }),
        controller,
        artifactStore,
        evaluateCombination({ candidates }) {
          const score = candidates.map((c) => c.candidateId).join('|')
          return {
            ok: true,
            value: {
              objectiveValue: score,
              evidenceDigest: `evidence:${score}`,
              orderingKey: [score],
            },
            diagnostics: [],
          }
        },
        maxCombinationCount: 8,
      })

      expect(result.completion.summary.solveState).toBe('completed')

      const finalCert = result.completion.emittedCertificates.find(
        (c) => c.certKind === 'FinalOptimalityCert'
      )
      expect(finalCert).toBeDefined()
      if (!finalCert) return

      // Base certificate fields
      expect(finalCert.certId).toEqual(expect.any(String))
      expect(finalCert.certKind).toBe('FinalOptimalityCert')
      expect(finalCert.schemaVersion).toEqual(expect.any(String))
      expect(finalCert.problemId).toBe('cert-validation-problem')
      expect(finalCert.arithmeticPolicyId).toBe('arithmetic-policy')
      expect(finalCert.decisionClass).toBe('optimality-proof')
      expect(finalCert.evidenceDigest).toEqual(expect.any(String))
      expect(finalCert.emittedAtStep).toEqual(expect.any(Number))
      expect(finalCert.validationStatus).toBe('validated')
      expect(Array.isArray(finalCert.referencedStateIds)).toBe(true)
      expect(Array.isArray(finalCert.referencedBlockIds)).toBe(true)
      expect(Array.isArray(finalCert.referencedRegionIds)).toBe(true)
      expect(Array.isArray(finalCert.referencedRelaxIds)).toBe(true)

      // Payload fields (FinalOptimalityCert specific)
      const payload = finalCert.payload as Record<string, unknown>
      expect(payload.winningStateId).toEqual(expect.any(String))
      expect(payload.optimalityGap).toBe('0')
      expect(payload.finalThresholdDigest).toEqual(expect.any(String))
      expect(payload.finalIncumbentSetDigest).toEqual(expect.any(String))
      expect(payload.queueExhaustionSummaryDigest).toEqual(expect.any(String))
      expect(payload.thresholdPruneSummaryDigest).toEqual(expect.any(String))
      expect(payload.escalatedReplaySummaryDigest).toEqual(expect.any(String))
      expect(payload.stableOrderCompletenessDigest).toEqual(expect.any(String))

      // Replay recipe completeness
      const recipe = finalCert.replayRecipe
      expect(recipe).toBeDefined()
      expect(Array.isArray(recipe.requiredIrObjects)).toBe(true)
      expect(Array.isArray(recipe.requiredRegionPredicates)).toBe(true)
      expect(recipe.arithmeticMode).toEqual(expect.any(String))
      expect(recipe.replayPathKind).toEqual(expect.any(String))
      expect(recipe.exactComparisonRule).toEqual(expect.any(String))
      expect(recipe.expectedVerdict).toEqual(expect.any(String))
    })

    it('all emitted certificates share consistent problem context', async () => {
      const { artifactStore, controller } = createSolveController()
      const request = createGiRequest()
      request.giContext.optimizationRequest.topN = 3
      request.normalizationInput.topN = 3

      const result = await executeGiLapicBoundedCurrentOnlySolve({
        request,
        canonicalIdentity: createGiLapicCanonicalIdentity({
          problemId: 'context-consistency-problem',
          problemDigest: 'context-consistency-digest',
          engineVersion: 'engine-version',
          arithmeticPolicyId: 'arithmetic-policy',
        }),
        controller,
        artifactStore,
        evaluateCombination({ candidates }) {
          const score = candidates.map((c) => c.candidateId).join('|')
          return {
            ok: true,
            value: {
              objectiveValue: score,
              evidenceDigest: `evidence:${score}`,
              orderingKey: [score],
            },
            diagnostics: [],
          }
        },
        maxCombinationCount: 8,
      })

      expect(result.completion.emittedCertificates.length).toBeGreaterThan(0)

      for (const cert of result.completion.emittedCertificates) {
        // Every certificate must reference the same problem
        expect(cert.problemId).toBe('context-consistency-problem')
        expect(cert.arithmeticPolicyId).toBe('arithmetic-policy')

        // Every certificate must have valid structural fields
        expect(cert.certId).toBeTruthy()
        expect(cert.schemaVersion).toBeTruthy()
        expect(cert.evidenceDigest).toBeTruthy()
        expect(cert.emittedAtStep).toBeGreaterThanOrEqual(0)
        expect(['unvalidated', 'validated', 'rejected']).toContain(
          cert.validationStatus
        )
        expect([
          'exact-prune',
          'relaxation-prune',
          'dominance-prune',
          'optimality-proof',
        ]).toContain(cert.decisionClass)
        expect([
          'BranchReachabilityCert',
          'InfeasibilityCert',
          'BoundPruneCert',
          'DominanceCert',
          'FinalOptimalityCert',
        ]).toContain(cert.certKind)

        // Every certificate must have a replay recipe
        expect(cert.replayRecipe).toBeDefined()
        expect(cert.replayRecipe.arithmeticMode).toBeTruthy()
        expect(cert.replayRecipe.replayPathKind).toBeTruthy()
        expect(cert.replayRecipe.exactComparisonRule).toBeTruthy()
      }
    })
  })

  // =========================================================================
  // 4. Canonical Export Construction Stability
  // =========================================================================

  describe('canonical export construction stability', () => {
    it('produces structurally identical exports from identical requests', () => {
      const identity = createGiLapicCanonicalIdentity({
        problemId: 'stability-problem',
        problemDigest: 'stability-digest',
        engineVersion: 'engine-version',
        arithmeticPolicyId: 'arithmetic-policy',
      })

      const requestA = createGiRequest()
      const requestB = createGiRequest()

      const exportA = buildGiLapicCanonicalExportFromRequest({
        request: requestA,
        canonicalIdentity: identity,
      })
      const exportB = buildGiLapicCanonicalExportFromRequest({
        request: requestB,
        canonicalIdentity: identity,
      })

      expect(exportA.ok).toBe(true)
      expect(exportB.ok).toBe(true)
      if (!exportA.ok || !exportB.ok) return

      const a = exportA.value
      const b = exportB.value

      // Structural identity: same input → same output
      expect(a.canonicalProblemDigest).toBe(b.canonicalProblemDigest)
      expect(a.sourceSnapshotDigest).toBe(b.sourceSnapshotDigest)
      expect(a.adapterVersion).toBe(b.adapterVersion)
      expect(a.formulaCompilationMode).toBe(b.formulaCompilationMode)
      expect(a.featureSchemaVersion).toBe(b.featureSchemaVersion)
      expect(a.filterTransformationLog).toEqual(b.filterTransformationLog)
      expect(a.unsupportedFeatureList).toEqual(b.unsupportedFeatureList)
      expect(a.replayReconstructionHints).toEqual(b.replayReconstructionHints)
      expect(a.supportedGraphOutputModes).toEqual(b.supportedGraphOutputModes)
    })

    it('canonical export contains all required structural fields', () => {
      const identity = createGiLapicCanonicalIdentity({
        problemId: 'field-check-problem',
        problemDigest: 'field-check-digest',
        engineVersion: 'engine-version',
        arithmeticPolicyId: 'arithmetic-policy',
      })

      const result = buildGiLapicCanonicalExportFromRequest({
        request: createGiRequest(),
        canonicalIdentity: identity,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const ex = result.value

      // Required structural fields per GiLapicCanonicalExport
      expect(ex.adapterKind).toBe('gi')
      expect(ex.problem).toBeDefined()
      expect(ex.canonicalProblemDigest).toEqual(expect.any(String))
      expect(ex.adapterVersion).toEqual(expect.any(String))
      expect(ex.sourceSnapshotDigest).toEqual(expect.any(String))
      expect(Array.isArray(ex.sourceSnapshotDigestSet)).toBe(true)
      expect(ex.formulaCompilationMode).toEqual(expect.any(String))
      expect(ex.featureSchemaVersion).toEqual(expect.any(String))
      expect(Array.isArray(ex.filterTransformationLog)).toBe(true)
      expect(Array.isArray(ex.unsupportedFeatureList)).toBe(true)
      expect(Array.isArray(ex.replayReconstructionHints)).toBe(true)
      expect(Array.isArray(ex.supportedGraphOutputModes)).toBe(true)

      // Problem sub-structure
      expect(ex.problem.problemDigest).toBe('field-check-digest')
      expect(ex.problem.teamLayout).toBeDefined()
      expect(ex.problem.slotDescriptors).toBeDefined()
      expect(ex.problem.objective).toBeDefined()
    })
  })
})
