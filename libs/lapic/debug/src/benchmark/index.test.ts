import type { LapicCanonicalProblem } from '@genshin-optimizer/lapic/core'
import {
  createLapicInMemorySessionController,
  createLapicSessionIdentity,
  createLapicSolveRequest,
  executeLapicBoundedExactSolve,
} from '@genshin-optimizer/lapic/runtime'
import {
  createLapicMemoryArtifactStore,
} from '@genshin-optimizer/lapic/storage'
import { createLapicHarnessReportManifest } from '../audit/builders'
import {
  createLapicAdapterParityValidationSummary,
  createLapicBenchmarkReport,
  createLapicGoldenEnumerationHarnessConfiguration,
  createLapicPublicationReadyReportManifest,
  createLapicRegressionClassificationSummary,
} from './builders'
import {
  classifyLapicBenchmarkRegression,
  createLapicSolveSliceHarnessReport,
} from './index'
import {
  validateLapicAdapterParityValidationSummary,
  validateLapicGoldenEnumerationHarnessConfiguration,
  validateLapicHarnessReportManifest,
  validateLapicPublicationReadyReportManifest,
  validateLapicRegressionClassificationSummary,
  validateLapicSolveSliceHarnessReport,
} from './validation'

function createProblem(): LapicCanonicalProblem {
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
      slotRequirements: { flower: 'required', plume: 'required' },
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
    topN: 1,
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

describe('lapic debug benchmark', () => {
  it('omits undefined optional fields from benchmark constructor helpers', () => {
    const benchmark = createLapicBenchmarkReport(
      'benchmark-id',
      'browser',
      true
    )
    const publicationManifest = createLapicPublicationReadyReportManifest(
      benchmark,
      createLapicRegressionClassificationSummary('none', 'stable')
    )

    expect('upgradeFrontierCostShare' in benchmark).toBe(false)
    expect('finalOptimality' in publicationManifest).toBe(false)
  })

  it('validates harness and publication helper shapes', () => {
    const artifactRef = {
      artifactId: 'artifact-id',
      artifactKind: 'certificate' as const,
      contentHash: 'content-hash',
    }

    expect(
      validateLapicGoldenEnumerationHarnessConfiguration(
        createLapicGoldenEnumerationHarnessConfiguration('fixture-id', 3)
      ).ok
    ).toBe(true)
    expect(
      validateLapicAdapterParityValidationSummary(
        createLapicAdapterParityValidationSummary('gi', true)
      ).ok
    ).toBe(true)
    expect(
      validateLapicHarnessReportManifest(
        createLapicHarnessReportManifest('report-digest', [artifactRef])
      ).ok
    ).toBe(true)
    expect(
      validateLapicRegressionClassificationSummary(
        createLapicRegressionClassificationSummary(
          'performance',
          'cost share increased'
        )
      ).ok
    ).toBe(true)
    expect(
      validateLapicPublicationReadyReportManifest(
        createLapicPublicationReadyReportManifest(
          createLapicBenchmarkReport('benchmark-id', 'node', true, 0.1, 0.2),
          createLapicRegressionClassificationSummary(
            'none',
            'no regression detected'
          )
        )
      ).ok
    ).toBe(true)
  })

  it('classifies benchmark regressions deterministically', () => {
    const performanceRegression = classifyLapicBenchmarkRegression(
      createLapicBenchmarkReport('baseline', 'node', true, 0.1, 0.1),
      createLapicBenchmarkReport('candidate', 'node', true, 0.2, 0.11)
    )
    const correctnessRegression = classifyLapicBenchmarkRegression(
      createLapicBenchmarkReport('baseline', 'node', true, 0.1, 0.1),
      createLapicBenchmarkReport('candidate', 'node', false, 0.1, 0.1)
    )
    const noRegression = classifyLapicBenchmarkRegression(
      createLapicBenchmarkReport('baseline', 'node', true, 0.1, 0.1),
      createLapicBenchmarkReport('candidate', 'node', true, 0.11, 0.1)
    )

    expect(performanceRegression.classification).toBe('performance')
    expect(correctnessRegression.classification).toBe('correctness')
    expect(noRegression.classification).toBe('none')
  })

  it('builds a solve-slice harness report from a live bounded runtime solve', async () => {
    const artifactStore = createLapicMemoryArtifactStore()
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
      artifactStore,
    })
    const progressEvents: Array<{
      sessionId: string
      phase: string
      completedUnits: number
      totalUnits?: number
    }> = []
    const traceEvents: Array<{
      sessionId: string
      tag: string
      eventDigest: string
    }> = []

    controller.subscribeProgress((event) => {
      progressEvents.push(event)
    })
    controller.subscribeDiagnostics((event) => {
      if ('tag' in event) traceEvents.push(event)
    })

    const completion = await executeLapicBoundedExactSolve({
      problem: createProblem(),
      controller,
      artifactStore,
      evaluateCombination({ candidates }) {
        const score = candidates.map((candidate) => candidate.candidateId).join('|')
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

    const harnessReport = await createLapicSolveSliceHarnessReport(
      artifactStore,
      completion.summary,
      progressEvents,
      traceEvents,
      completion.emittedCertificates,
      artifactStore.snapshot().map((entry) => entry.artifactRef),
      'bounded-runtime-slice',
      'node'
    )

    expect(validateLapicSolveSliceHarnessReport(harnessReport).ok).toBe(true)
    expect(harnessReport.auditReport.integrityScan?.ok).toBe(true)
    expect(harnessReport.phaseSummaries.map((summary) => summary.phase)).toEqual([
      'frontier-build',
      'join',
      'resolve-residual',
    ])
    expect(harnessReport.thresholdLineage).toHaveLength(1)
    expect(harnessReport.publicationManifest.finalOptimality?.winnerStateId).toBe(
      'state:problem-digest:flower:flower-a|plume:plume-a'
    )
    expect(harnessReport.harnessManifest.relatedArtifacts).toHaveLength(3)
  })
})
