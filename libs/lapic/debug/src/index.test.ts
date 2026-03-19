import type { LapicCertificate } from '@genshin-optimizer/lapic/cert'
import { createLapicSessionIdentity, createLapicSessionSummary } from '@genshin-optimizer/lapic/runtime'
import {
  createLapicArtifactWriteRequest,
  createLapicCheckpointClosureVerificationResult,
  createLapicMemoryArtifactStore,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import {
  classifyLapicBenchmarkRegression,
  createLapicArtifactSummary,
  createLapicAdapterParityValidationSummary,
  createLapicAuditReport,
  createLapicAuditReportRequest,
  createLapicBenchmarkReport,
  createLapicGoldenEnumerationHarnessConfiguration,
  createLapicHarnessReportManifest,
  createLapicPotentialAuditSummary,
  createLapicPublicationReadyReportManifest,
  createLapicRegressionClassificationSummary,
  createLapicReplayClosureSummary,
  createLapicReplayInspectionRequest,
  createLapicReplayBundleDescriptor,
  createLapicReplayCoverageFromCertificates,
  createLapicThresholdLineageFromCertificates,
  inspectLapicArtifact,
  summarizeLapicFailures,
  summarizeLapicTraceByPhase,
  validateLapicArtifactSummary,
  validateLapicCertificateInspectionView,
  validateLapicCertificateReplayCoverageSummary,
  validateLapicCheckpointClosureAuditSummary,
  validateLapicAuditReportRequest,
  validateLapicAdapterParityValidationSummary,
  validateLapicFormulaRegionDecompositionExportDescriptor,
  validateLapicFrontierSkylineVisualizationExportDescriptor,
  validateLapicGoldenEnumerationHarnessConfiguration,
  validateLapicHarnessReportManifest,
  validateLapicPotentialAuditSummary,
  validateLapicPotentialGraphInspectionDescriptor,
  validateLapicPotentialSummaryView,
  validateLapicPublicationReadyReportManifest,
  validateLapicRegressionClassificationSummary,
  validateLapicReplayClosureSummary,
  validateLapicReplayInspectionRequest,
  validateLapicStateBlockInspectionView,
} from './index'

function createSessionSummary() {
  return createLapicSessionSummary(
    createLapicSessionIdentity({
      sessionId: 'session-id',
      problemDigest: 'problem-digest',
      engineVersion: 'engine-version',
      arithmeticPolicyId: 'arith-policy',
      runtimeProtocolVersion: '0.1.0-draft',
      createdAtLogicalTimestamp: 'ts-1',
    }),
    'completed',
    'analyze'
  )
}

function createStoreAndArtifact() {
  const store = createLapicMemoryArtifactStore()
  const writeRequest = createLapicArtifactWriteRequest(
    createLapicStorageEnvelope({
      artifactKind: 'certificate',
      schemaVersion: '0.1.0-draft',
      payloadEncoding: 'json',
      payloadLength: 128,
      contentHash: 'content-hash',
      checksum: {
        algorithm: 'sha256',
        checksum: 'checksum-value',
      },
      compressionCodec: 'none',
      creationEngineVersion: 'engine-version',
      arithmeticPolicyId: 'arith-policy',
      dependencyDigestSet: ['dep-a'],
    }),
    'payload-digest'
  )

  return { store, writeRequest }
}

function createCertificate(
  overrides: Partial<LapicCertificate> = {}
): LapicCertificate {
  return {
    certId: 'cert-id',
    certKind: 'FinalOptimalityCert',
    schemaVersion: '0.1.0-draft',
    problemId: 'problem-id',
    arithmeticPolicyId: 'arith-policy',
    decisionClass: 'optimality-proof',
    referencedStateIds: ['state-id'],
    referencedBlockIds: [],
    referencedRegionIds: [],
    referencedRelaxIds: [],
    evidenceDigest: 'evidence-digest',
    replayRecipe: {
      requiredIrObjects: ['objective-digest'],
      requiredRegionPredicates: [],
      arithmeticMode: 'exact',
      replayPathKind: 'full-replay',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: 1,
    validationStatus: 'validated',
    payload: {
      winningStateId: 'state-id',
      optimalityGap: '0',
      finalThresholdDigest: 'threshold-digest',
      finalIncumbentSetDigest: 'incumbent-set-digest',
      queueExhaustionSummaryDigest: 'queue-exhaustion-digest',
      thresholdPruneSummaryDigest: 'threshold-prune-summary-digest',
      escalatedReplaySummaryDigest: 'escalated-replay-summary-digest',
      stableOrderCompletenessDigest: 'stable-order-digest',
      rankingParticipationMode: 'auxiliary-only',
      potentialDecisionBasis: {
        solveMode: 'current-only',
        participationMode: 'auxiliary-only',
      },
    },
    ...overrides,
  } as LapicCertificate
}

describe('lapic debug', () => {
  it('validates a well-formed audit report request', () => {
    const result = validateLapicAuditReportRequest(
      createLapicAuditReportRequest('session-id', true, true)
    )

    expect(result.ok).toBe(true)
  })

  it('validates an artifact summary', () => {
    const result = validateLapicArtifactSummary(
      createLapicArtifactSummary(
        {
          artifactId: 'artifact-id',
          artifactKind: 'certificate',
          contentHash: 'content-hash',
        },
        'envelope-digest',
        ['summary-digest']
      )
    )

    expect(result.ok).toBe(true)
  })

  it('summarizes trace events by phase deterministically', () => {
    const summaries = summarizeLapicTraceByPhase(
      { sessionId: 'session-id', includeFailures: false },
      [
        {
          sessionId: 'session-id',
          phase: 'join',
          completedUnits: 2,
          totalUnits: 5,
        },
        {
          sessionId: 'session-id',
          phase: 'analyze',
          completedUnits: 1,
          totalUnits: 1,
        },
      ]
    )

    expect(summaries.map((summary) => summary.phase)).toEqual(['analyze', 'join'])
  })

  it('builds threshold lineage from certificates', () => {
    const lineage = createLapicThresholdLineageFromCertificates([
      createCertificate({ certId: 'cert-a' }),
      createCertificate({ certId: 'cert-b' }),
    ])

    expect(lineage).toHaveLength(1)
    expect(lineage[0]?.thresholdDigest).toBe('threshold-digest')
    expect(lineage[0]?.relatedCertificates).toEqual(['cert-a', 'cert-b'])
  })

  it('inspects persisted artifacts through the storage abstraction', async () => {
    const { store, writeRequest } = createStoreAndArtifact()
    const commit = await store.write(writeRequest)
    const inspection = await inspectLapicArtifact(store, {
      artifactRef: commit.artifactRef,
      includePayloadSummary: true,
      includePotentialViews: true,
    })

    expect(inspection.ok).toBe(true)
    if (!inspection.ok) return

    expect(inspection.value.envelopeDigest).toBe('content-hash')
    expect(inspection.value.potentialSummaryDigests).toEqual(['payload-digest'])
  })

  it('creates audit reports with replay coverage and integrity scan', async () => {
    const { store, writeRequest } = createStoreAndArtifact()
    const commit = await store.write(writeRequest)
    const auditReport = await createLapicAuditReport(
      store,
      createLapicAuditReportRequest('session-id', true, true),
      createSessionSummary(),
      [
        {
          sessionId: 'session-id',
          tag: 'Progress',
          eventDigest: 'trace-2',
        },
        {
          sessionId: 'session-id',
          tag: 'InitSession',
          eventDigest: 'trace-1',
        },
      ],
      [createCertificate()],
      [commit.artifactRef]
    )

    expect(auditReport.traceEvents.map((event) => event.eventDigest)).toEqual([
      'trace-1',
      'trace-2',
    ])
    expect(auditReport.replayCoverage?.replayedCertificateIds).toEqual(['cert-id'])
    expect(auditReport.integrityScan?.ok).toBe(true)
    expect(auditReport.potentialAuditSummary?.auxiliaryOnlyOutputCount).toBe(1)
  })

  it('summarizes failures and replay coverage', () => {
    const failureTimeline = summarizeLapicFailures([
      {
        sessionId: 'session-id',
        failureClass: 'workerFailure',
        message: 'worker died',
        diagnostics: [],
      },
      {
        sessionId: 'other-session',
        failureClass: 'providerFailure',
        message: 'provider died',
        diagnostics: [],
      },
    ], 'session-id')
    const coverage = createLapicReplayCoverageFromCertificates(
      [createCertificate({ certId: 'cert-a' }), createCertificate({ certId: 'cert-b' })],
      ['cert-b']
    )

    expect(failureTimeline.failures).toHaveLength(1)
    expect(coverage.replayedCertificateIds).toEqual(['cert-b'])
    expect(coverage.missingCertificateIds).toEqual(['cert-a'])
  })

  it('creates potential audit and replay bundle descriptors', () => {
    const potentialAudit = createLapicPotentialAuditSummary(
      [createCertificate()],
      2
    )
    const replayBundle = createLapicReplayBundleDescriptor('cert-id', [
      {
        artifactId: 'artifact-id',
        artifactKind: 'certificate',
        contentHash: 'content-hash',
      },
    ])

    expect(validateLapicPotentialAuditSummary(potentialAudit).ok).toBe(true)
    expect(replayBundle.bundleDigest).toBe('replay-bundle:cert-id')
  })

  it('validates replay, harness, and publication helper shapes', () => {
    const artifactRef = {
      artifactId: 'artifact-id',
      artifactKind: 'certificate' as const,
      contentHash: 'content-hash',
    }

    expect(
      validateLapicReplayInspectionRequest(
        createLapicReplayInspectionRequest('cert-id')
      ).ok
    ).toBe(true)
    expect(
      validateLapicReplayClosureSummary(
        createLapicReplayClosureSummary(
          {
            reproducedVerdict: 'matched',
            validationOutcome: 'validated',
            arithmeticModeUsed: 'exact',
            referencedEvidenceDigests: ['evidence-digest'],
            exactReplayInvoked: true,
          },
          [artifactRef]
        )
      ).ok
    ).toBe(true)
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

  it('validates remaining inspection and coverage helper shapes', () => {
    const artifactRef = {
      artifactId: 'artifact-id',
      artifactKind: 'certificate' as const,
      contentHash: 'content-hash',
    }

    expect(
      validateLapicStateBlockInspectionView({
        blockRef: artifactRef,
        potentialFrontierDigests: ['frontier-digest'],
        potentialSummaries: [],
      }).ok
    ).toBe(true)
    expect(
      validateLapicCertificateInspectionView({
        certificate: createCertificate(),
      }).ok
    ).toBe(true)
    expect(
      validateLapicFrontierSkylineVisualizationExportDescriptor({
        artifactRef,
        exportDigest: 'skyline-export-digest',
      }).ok
    ).toBe(true)
    expect(
      validateLapicFormulaRegionDecompositionExportDescriptor({
        regionDigest: 'region-digest',
        exportDigest: 'region-export-digest',
      }).ok
    ).toBe(true)
    expect(
      validateLapicPotentialSummaryView({
        candidateId: 'candidate-id',
        summaries: [],
      }).ok
    ).toBe(true)
    expect(
      validateLapicPotentialGraphInspectionDescriptor({
        outputDigest: 'graph-output-digest',
        graphKind: 'potential-graph',
        exactness: 'exact',
      }).ok
    ).toBe(true)
    expect(
      validateLapicCertificateReplayCoverageSummary({
        replayedCertificateIds: ['cert-a'],
        missingCertificateIds: ['cert-b'],
      }).ok
    ).toBe(true)
    expect(
      validateLapicCheckpointClosureAuditSummary({
        verification: createLapicCheckpointClosureVerificationResult(
          'checkpoint-id',
          true,
          [],
          []
        ),
      }).ok
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
})
