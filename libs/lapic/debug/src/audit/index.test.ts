import type { LapicCertificate } from '@genshin-optimizer/lapic/cert'
import {
  createLapicSessionIdentity,
  createLapicSessionSummary,
} from '@genshin-optimizer/lapic/runtime'
import {
  createLapicArtifactWriteRequest,
  createLapicCheckpointClosureVerificationResult,
  createLapicMemoryArtifactStore,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import {
  createLapicAuditReportRequest,
} from './builders'
import {
  createLapicAuditReport,
  createLapicPotentialAuditSummary,
  createLapicReplayCoverageFromCertificates,
} from './index'
import {
  validateLapicAuditReportRequest,
  validateLapicCertificateReplayCoverageSummary,
  validateLapicCheckpointClosureAuditSummary,
  validateLapicPotentialAuditSummary,
} from './validation'

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

describe('lapic debug audit', () => {
  it('validates a well-formed audit report request', () => {
    const result = validateLapicAuditReportRequest(
      createLapicAuditReportRequest('session-id', true, true)
    )

    expect(result.ok).toBe(true)
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
    expect(auditReport.replayCoverage?.missingCertificateIds).toEqual([])
    expect(auditReport.integrityScan?.ok).toBe(true)
    expect(auditReport.potentialAuditSummary?.auxiliaryOnlyOutputCount).toBe(1)
  })

  it('orders audit trace events deterministically when digests collide', async () => {
    const { store, writeRequest } = createStoreAndArtifact()
    const commit = await store.write(writeRequest)
    const auditReport = await createLapicAuditReport(
      store,
      createLapicAuditReportRequest('session-id', false, false),
      createSessionSummary(),
      [
        {
          sessionId: 'session-z',
          tag: 'Progress',
          eventDigest: 'trace-same',
        },
        {
          sessionId: 'session-a',
          tag: 'InitSession',
          eventDigest: 'trace-same',
        },
        {
          sessionId: 'session-b',
          tag: 'Progress',
          eventDigest: 'trace-same',
        },
      ],
      [createCertificate()],
      [commit.artifactRef]
    )

    expect(
      auditReport.traceEvents.map((event) => [
        event.eventDigest,
        event.tag,
        event.sessionId,
      ])
    ).toEqual([
      ['trace-same', 'InitSession', 'session-a'],
      ['trace-same', 'Progress', 'session-b'],
      ['trace-same', 'Progress', 'session-z'],
    ])
  })

  it('summarizes replay coverage and potential audit output', () => {
    const coverage = createLapicReplayCoverageFromCertificates(
      [createCertificate({ certId: 'cert-a' }), createCertificate({ certId: 'cert-b' })],
      ['cert-b']
    )
    const potentialAudit = createLapicPotentialAuditSummary([createCertificate()], 2)

    expect(coverage.replayedCertificateIds).toEqual(['cert-b'])
    expect(coverage.missingCertificateIds).toEqual(['cert-a'])
    expect(validateLapicPotentialAuditSummary(potentialAudit).ok).toBe(true)
  })

  it('validates remaining audit helper shapes', () => {
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
          true,
          []
        ),
      }).ok
    ).toBe(true)
  })
})
