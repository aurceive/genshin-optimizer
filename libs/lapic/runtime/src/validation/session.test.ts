import {
  createLapicProgressEvent,
  createLapicSessionIdentity,
  createLapicSessionSummary,
  createLapicSolveCompletionResult,
  createLapicSolveRequest,
  createLapicSubscriptionToken,
  createLapicTraceEvent,
} from '../builders'
import {
  validateLapicInMemorySessionControllerOptions,
  validateLapicObservationalCounterSummary,
  validateLapicProgressEvent,
  validateLapicSessionIdentity,
  validateLapicSubscriptionToken,
  validateLapicTraceEvent,
} from './session'

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
      branchReachabilitySummaryDigest: 'branch-reachability-summary-digest',
      dominanceSummaryDigest: 'dominance-summary-digest',
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

describe('lapic runtime session validation', () => {
  it('validates a well-formed session identity', () => {
    const result = validateLapicSessionIdentity(createSessionIdentityFixture())

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

  it('rejects a progress event with negative skippedUnits', () => {
    const result = validateLapicProgressEvent({
      sessionId: 'session-id',
      phase: 'join',
      completedUnits: 10,
      totalUnits: 100,
      skippedUnits: -1,
    })

    expect(result.ok).toBe(false)
  })

  it('rejects a progress event with skippedUnits > completedUnits', () => {
    const result = validateLapicProgressEvent({
      sessionId: 'session-id',
      phase: 'join',
      completedUnits: 5,
      totalUnits: 100,
      skippedUnits: 6,
    })

    expect(result.ok).toBe(false)
  })

  it('rejects a progress event with non-integer skippedUnits', () => {
    const result = validateLapicProgressEvent({
      sessionId: 'session-id',
      phase: 'join',
      completedUnits: 10,
      totalUnits: 100,
      skippedUnits: 3.5,
    })

    expect(result.ok).toBe(false)
  })

  it('accepts a valid progress event with skippedUnits', () => {
    const result = validateLapicProgressEvent({
      sessionId: 'session-id',
      phase: 'join',
      completedUnits: 10,
      totalUnits: 100,
      skippedUnits: 5,
    })

    expect(result.ok).toBe(true)
  })

  it('rejects a trace event with an unsupported tag', () => {
    const result = validateLapicTraceEvent({
      sessionId: 'session-id',
      tag: 'UnexpectedTag' as never,
      eventDigest: 'event-digest',
    })

    expect(result.ok).toBe(false)
  })

  it('validates runtime helper surface shapes', () => {
    expect(
      validateLapicTraceEvent(
        createLapicTraceEvent('session-id', 'InitSession', 'trace-digest')
      ).ok
    ).toBe(true)
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
        identity: createSessionIdentityFixture(),
        solveRequest: createLapicSolveRequest('problem-digest'),
        initialArtifacts: [],
        initialCertificates: [],
      }).ok
    ).toBe(true)
  })

  it('omits undefined optional fields from runtime constructor helpers', () => {
    const summary = createLapicSessionSummary(
      createSessionIdentityFixture(),
      'created'
    )
    const solveRequest = createLapicSolveRequest('problem-digest')
    const progressEvent = createLapicProgressEvent('session-id', 'analyze', 1)
    const completionResult = createLapicSolveCompletionResult(summary, [])

    expect('activePhase' in summary).toBe(false)
    expect('checkpointImport' in solveRequest).toBe(false)
    expect('totalUnits' in progressEvent).toBe(false)
    expect('finalOptimality' in completionResult).toBe(false)
  })

  it('rejects invalid initial certificates in session controller options', () => {
    const invalidCertificate = createCertificate()
    invalidCertificate.payload.stableOrderCompletenessDigest = ''

    const result = validateLapicInMemorySessionControllerOptions({
      identity: createSessionIdentityFixture(),
      solveRequest: createLapicSolveRequest('problem-digest'),
      initialCertificates: [invalidCertificate],
    })

    expect(result.ok).toBe(false)
  })
})
