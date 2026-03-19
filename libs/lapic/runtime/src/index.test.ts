import { createLapicArtifactWriteRequest, createLapicMemoryArtifactStore, createLapicStorageEnvelope } from '@genshin-optimizer/lapic/storage'
import {
  createLapicFailureRecord,
  createLapicInMemorySessionController,
  createLapicRuntimeRecoveryEligibility,
  createLapicSessionIdentity,
  createLapicSessionSummary,
  createLapicSolveRequest,
  createLapicSubscriptionToken,
  validateLapicInMemorySessionControllerOptions,
  validateLapicObservationalCounterSummary,
  validateLapicProgressEvent,
  validateLapicSessionIdentity,
  validateLapicSubscriptionToken,
  validateLapicWorkerRequest,
} from './index'

function createSessionIdentity() {
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

describe('lapic runtime', () => {
  it('validates a well-formed session identity', () => {
    const result = validateLapicSessionIdentity(createSessionIdentity())

    expect(result.ok).toBe(true)
  })

  it('rejects a progress event whose total units are below completed units', () => {
    const result = validateLapicProgressEvent({
      sessionId: 'session-id',
      phase: 'analyze',
      completedUnits: 5,
      totalUnits: 4,
    })

    expect(result.ok).toBe(false)
  })

  it('validates a worker request with a supported work unit', () => {
    const result = validateLapicWorkerRequest({
      tag: 'StartWork',
      sessionId: 'session-id',
      workUnit: {
        workUnitId: 'work-id',
        kind: 'AnalyzeRegion',
        determinismClass: 'pure-deterministic',
        priority: {
          upperBoundOrderingDigest: 'upper-bound',
          uncertaintyGapDigest: 'uncertainty-gap',
          residualCostDigest: 'residual-cost',
          deterministicTieBreakDigest: 'tie-break',
          costModelVersion: 'cost-model-v1',
        },
        retryPolicy: {
          maxAttempts: 1,
          replaySafe: true,
        },
      },
    })

    expect(result.ok).toBe(true)
  })

  it('validates runtime helper surface shapes', () => {
    expect(
      validateLapicSubscriptionToken(
        createLapicSubscriptionToken('subscription-id', () => {})
      ).ok
    ).toBe(true)
    expect(
      validateLapicObservationalCounterSummary({
        counterId: 'observed-progress-events',
        value: 3,
      }).ok
    ).toBe(true)
    expect(
      validateLapicInMemorySessionControllerOptions({
        identity: createSessionIdentity(),
        solveRequest: createLapicSolveRequest('problem-digest'),
        initialArtifacts: [],
        initialCertificates: [],
      }).ok
    ).toBe(true)
  })

  it('tracks progress, artifacts, checkpoints, and completion through the in-memory session controller', async () => {
    const { store, writeRequest } = createArtifactStore()
    const commit = await store.write(writeRequest)
    const controller = createLapicInMemorySessionController({
      identity: createSessionIdentity(),
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
      identity: createSessionIdentity(),
      solveRequest: createLapicSolveRequest('problem-digest'),
    })

    controller.activate('analyze')
    const cancelResult = await controller.requestCancel()
    const completion = await controller.awaitCompletion()

    expect(cancelResult.accepted).toBe(true)
    expect(completion.summary.solveState).toBe('cancelled')
  })

  it('rejects awaitCompletion with a failed session summary when the controller fails', async () => {
    const controller = createLapicInMemorySessionController({
      identity: createSessionIdentity(),
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

  it('classifies worker failure as recoverable and storage failure as non-recoverable', () => {
    const workerRecovery = createLapicRuntimeRecoveryEligibility({
      summary: createLapicSessionSummary(createSessionIdentity(), 'failed'),
      failure: createLapicFailureRecord(
        'session-id',
        'workerFailure',
        'worker failed'
      ),
    })
    const storageRecovery = createLapicRuntimeRecoveryEligibility({
      summary: createLapicSessionSummary(createSessionIdentity(), 'failed'),
      failure: createLapicFailureRecord(
        'session-id',
        'storageIntegrityFailure',
        'store corrupted'
      ),
    })

    expect(workerRecovery.eligible).toBe(true)
    expect(storageRecovery.eligible).toBe(false)
  })
})
