import {
  createLapicArtifactWriteRequest,
  createLapicMemoryArtifactStore,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import {
  createLapicSessionIdentity,
  createLapicSolveRequest,
} from '../builders'
import {
  createLapicInMemorySessionController,
} from './index'

function createCertificate() {
  return {
    certId: 'cert-id',
    certKind: 'FinalOptimalityCert' as const,
    schemaVersion: '0.1.0-draft' as const,
    problemId: 'problem-digest',
    arithmeticPolicyId: 'arith-policy',
    decisionClass: 'optimality-proof' as const,
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
      expectedVerdict: 'matched' as const,
    },
    emittedAtStep: 1,
    validationStatus: 'validated' as const,
    payload: {
      winningStateId: 'state-id',
      optimalityGap: '0',
      finalThresholdDigest: 'threshold-digest',
      finalIncumbentSetDigest: 'incumbent-set-digest',
      queueExhaustionSummaryDigest: 'queue-exhaustion-digest',
      thresholdPruneSummaryDigest: 'threshold-prune-summary-digest',
      escalatedReplaySummaryDigest: 'escalated-replay-summary-digest',
      stableOrderCompletenessDigest: 'stable-order-digest',
    },
  }
}

function createSessionIdentityFixture() {
  return createLapicSessionIdentity({
    sessionId: 'session-id',
    problemDigest: 'problem-digest',
    engineVersion: 'engine-version',
    arithmeticPolicyId: 'arith-policy',
    runtimeProtocolVersion: '0.1.0-draft',
    createdAtLogicalTimestamp: 'ts-1',
  })
}

function createArtifactStore() {
  const store = createLapicMemoryArtifactStore()
  const writeRequest = createLapicArtifactWriteRequest(
    createLapicStorageEnvelope({
      artifactKind: 'frontier-block',
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

describe('lapic runtime session controller', () => {
  it('tracks progress, artifacts, checkpoints, and completion through the in-memory session controller', async () => {
    const { store, writeRequest } = createArtifactStore()
    const commit = await store.write(writeRequest)
    const controller = createLapicInMemorySessionController({
      identity: createSessionIdentityFixture(),
      solveRequest: createLapicSolveRequest('problem-digest'),
      artifactStore: store,
      initialArtifacts: [commit.artifactRef],
    })

    const progressEvents: string[] = []
    const diagnosticTags: string[] = []

    controller.subscribeProgress((event) => {
      progressEvents.push(`${event.phase}:${event.completedUnits}`)
    })
    controller.subscribeDiagnostics((event) => {
      diagnosticTags.push('tag' in event ? event.tag : event.failureClass)
    })

    controller.activate('frontier-build')
    controller.publishProgress({
      phase: 'frontier-build',
      completedUnits: 1,
      totalUnits: 3,
    })

    const checkpoint = await controller.requestCheckpoint()
    const exported = await controller.exportCheckpoint()
    const completion = await controller.complete()

    expect(progressEvents).toEqual(['frontier-build:1'])
    expect(diagnosticTags).toContain('StartWork')
    expect(diagnosticTags).toContain('Progress')
    expect(diagnosticTags).toContain('AcknowledgeCheckpoint')
    expect(checkpoint.checkpoint.verification.resumable).toBe(true)
    expect(exported.inventory.requiredArtifacts).toHaveLength(1)
    expect(completion.summary.solveState).toBe('completed')
  })

  it('supports cancellation and exposes cancelled completion state', async () => {
    const controller = createLapicInMemorySessionController({
      identity: createSessionIdentityFixture(),
      solveRequest: createLapicSolveRequest('problem-digest'),
    })

    controller.activate('analyze')
    const cancelResult = await controller.requestCancel()
    const completion = await controller.awaitCompletion()

    expect(cancelResult.accepted).toBe(true)
    expect(completion.summary.solveState).toBe('cancelled')
  })

  it('rejects invalid emitted certificates', async () => {
    const controller = createLapicInMemorySessionController({
      identity: createSessionIdentityFixture(),
      solveRequest: createLapicSolveRequest('problem-digest'),
    })

    const invalidCertificate = createCertificate()
    invalidCertificate.payload.stableOrderCompletenessDigest = ''

    expect(() => controller.emitCertificate(invalidCertificate)).toThrow(
      'stableOrderCompletenessDigest must not be empty.'
    )
  })

  it('rejects awaitCompletion with a failed session summary when the controller fails', async () => {
    const controller = createLapicInMemorySessionController({
      identity: createSessionIdentityFixture(),
      solveRequest: createLapicSolveRequest('problem-digest'),
    })

    const diagnostics: string[] = []
    controller.subscribeDiagnostics((event) => {
      diagnostics.push('tag' in event ? event.tag : event.failureClass)
    })

    const completionPromise = controller.awaitCompletion()
    await expect(
      controller.fail('workerFailure', 'executor crashed', [])
    ).rejects.toMatchObject({
      failure: { failureClass: 'workerFailure' },
    })
    await expect(completionPromise).rejects.toMatchObject({
      failure: { failureClass: 'workerFailure' },
    })
    expect(diagnostics).toContain('workerFailure')
    expect(diagnostics).toContain('ReportFailure')
  })
})
