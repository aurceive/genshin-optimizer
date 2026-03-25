import type { LapicCertificate } from '@genshin-optimizer/lapic/cert'
import {
  createLapicArtifactWriteRequest,
  createLapicMemoryArtifactStore,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import {
  createLapicArtifactSummary,
  createLapicCertificateInspectionView,
  createLapicPotentialGraphInspectionDescriptor,
  createLapicPotentialSummaryView,
  createLapicStateBlockInspectionView,
} from './builders'
import {
  createLapicThresholdLineageFromCertificates,
  inspectLapicArtifact,
  summarizeLapicFailures,
  summarizeLapicTraceByPhase,
} from './index'
import {
  validateLapicArtifactSummary,
  validateLapicCertificateInspectionView,
  validateLapicFormulaRegionDecompositionExportDescriptor,
  validateLapicFrontierSkylineVisualizationExportDescriptor,
  validateLapicPotentialGraphInspectionDescriptor,
  validateLapicPotentialSummaryView,
  validateLapicStateBlockInspectionView,
} from './validation'

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
      branchReachabilitySummaryDigest: 'branch-reachability-summary-digest',
      dominanceSummaryDigest: 'dominance-summary-digest',
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

describe('lapic debug inspection', () => {
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

  it('omits undefined optional fields from inspection constructor helpers', () => {
    const artifactSummary = createLapicArtifactSummary(
      {
        artifactId: 'artifact-id',
        artifactKind: 'certificate',
        contentHash: 'content-hash',
      },
      'envelope-digest'
    )
    const stateBlockView = createLapicStateBlockInspectionView({
      blockRef: {
        artifactId: 'artifact-id',
        artifactKind: 'frontier-block',
        contentHash: 'content-hash',
      },
    })
    const certificateView = createLapicCertificateInspectionView(
      createCertificate()
    )

    expect('potentialSummaryDigests' in artifactSummary).toBe(false)
    expect('compatibilitySignature' in stateBlockView).toBe(false)
    expect('potentialDecisionBasis' in certificateView).toBe(false)
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

    expect(summaries.map((summary) => summary.phase)).toEqual([
      'analyze',
      'join',
    ])
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

  it('summarizes failures deterministically for a session', () => {
    const failureTimeline = summarizeLapicFailures(
      [
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
      ],
      'session-id'
    )

    expect(failureTimeline.failures).toHaveLength(1)
  })

  it('validates remaining inspection helper shapes', () => {
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
      validateLapicPotentialSummaryView(
        createLapicPotentialSummaryView('candidate-id', [])
      ).ok
    ).toBe(true)
    expect(
      validateLapicPotentialGraphInspectionDescriptor(
        createLapicPotentialGraphInspectionDescriptor(
          'graph-output-digest',
          'potential-graph',
          'exact'
        )
      ).ok
    ).toBe(true)
  })
})
