import {
  createLapicCertificateSummary,
  createLapicFinalOptimalityRollup,
  createLapicFinalOptimalitySummary,
  createLapicReplayCoverageSummary,
  createLapicThresholdSensitiveDecisionCounters,
  createLapicThresholdSensitiveDecisionMetadata,
  summarizeLapicReplayMismatch,
  validateLapicCertificate,
  validateLapicEvidenceBundleManifest,
  validateLapicFinalOptimalityPayload,
  validateLapicReplayRecipe,
  validateLapicReplayRequest,
  validateLapicReplayResult,
} from './index'

function createBoundPruneCertificate() {
  return {
    certId: 'bound-cert-id',
    certKind: 'BoundPruneCert' as const,
    schemaVersion: '0.1.0-draft' as const,
    problemId: 'problem-id',
    arithmeticPolicyId: 'arith-policy',
    decisionClass: 'relaxation-prune' as const,
    referencedStateIds: ['state-id'],
    referencedBlockIds: ['block-id'],
    referencedRegionIds: ['region-id'],
    referencedRelaxIds: ['relax-id'],
    evidenceDigest: 'bound-evidence-digest',
    replayRecipe: {
      requiredIrObjects: ['objective-digest'],
      requiredRegionPredicates: ['region-predicate'],
      arithmeticMode: 'exact',
      replayPathKind: 'bound-replay',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched' as const,
    },
    emittedAtStep: 2,
    validationStatus: 'validated' as const,
    payload: {
      thresholdDigest: 'bound-threshold-digest',
      boundSourceClass: 'providerDerived' as const,
      boundValue: '123.45',
      validityRegionId: 'region-id',
      numericDiagnosticsDigest: 'numeric-diagnostics-digest',
      dangerZoneRecord: {
        triggered: true,
        verificationReplayInvoked: true,
        explanation: 'danger-zone replay escalated',
      },
    },
  }
}

function createFinalOptimalityCertificate() {
  return {
    certId: 'cert-id',
    certKind: 'FinalOptimalityCert' as const,
    schemaVersion: '0.1.0-draft' as const,
    problemId: 'problem-id',
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
    validationStatus: 'unvalidated' as const,
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

describe('lapic cert validators', () => {
  it('validates a well-formed evidence bundle manifest', () => {
    const result = validateLapicEvidenceBundleManifest({
      evidenceDigests: [
        { evidenceDigest: 'evidence-digest', sourceClass: 'exactSymbolic' },
      ],
      thresholdSnapshotDigest: 'threshold-digest',
      providerEvidence: [],
    })

    expect(result.ok).toBe(true)
  })

  it('rejects evidence bundle manifest without evidence digests', () => {
    const result = validateLapicEvidenceBundleManifest({
      evidenceDigests: [],
      thresholdSnapshotDigest: 'threshold-digest',
      providerEvidence: [],
    })

    expect(result.ok).toBe(false)
  })

  it('validates a well-formed replay recipe', () => {
    const result = validateLapicReplayRecipe(
      createFinalOptimalityCertificate().replayRecipe
    )

    expect(result.ok).toBe(true)
  })

  it('rejects replay recipe without required IR objects', () => {
    const replayRecipe = createFinalOptimalityCertificate().replayRecipe
    replayRecipe.requiredIrObjects = []

    const result = validateLapicReplayRecipe(replayRecipe)

    expect(result.ok).toBe(false)
  })

  it('creates threshold-sensitive decision metadata', () => {
    const result = createLapicThresholdSensitiveDecisionMetadata(
      'threshold-digest',
      true,
      false
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.thresholdDigest).toBe('threshold-digest')
    expect(result.value.exactReplayRequired).toBe(true)
    expect(result.value.dangerZoneDetected).toBe(false)
  })

  it('validates a well-formed replay request', () => {
    const result = validateLapicReplayRequest({
      mode: 'single-certificate',
      certificateIds: ['cert-id'],
      problemId: 'problem-id',
      environment: {
        engineVersion: 'engine-version',
        arithmeticPolicyId: 'arith-policy',
      },
    })

    expect(result.ok).toBe(true)
  })

  it('rejects single-certificate replay request without certificateIds', () => {
    const result = validateLapicReplayRequest({
      mode: 'single-certificate',
      problemId: 'problem-id',
      environment: {
        engineVersion: 'engine-version',
        arithmeticPolicyId: 'arith-policy',
      },
    })

    expect(result.ok).toBe(false)
  })

  it('validates a well-formed replay result', () => {
    const result = validateLapicReplayResult({
      reproducedVerdict: 'matched',
      validationOutcome: 'validated',
      arithmeticModeUsed: 'exact',
      referencedEvidenceDigests: ['evidence-digest'],
      exactReplayInvoked: true,
    })

    expect(result.ok).toBe(true)
  })

  it('rejects mismatched replay result without mismatch explanation', () => {
    const result = validateLapicReplayResult({
      reproducedVerdict: 'mismatched',
      validationOutcome: 'rejected',
      arithmeticModeUsed: 'exact',
      referencedEvidenceDigests: ['evidence-digest'],
      exactReplayInvoked: true,
    })

    expect(result.ok).toBe(false)
  })

  it('validates a well-formed final optimality certificate', () => {
    const result = validateLapicCertificate(createFinalOptimalityCertificate())

    expect(result.ok).toBe(true)
  })

  it('rejects final optimality payload without stable order completeness digest', () => {
    const payload = createFinalOptimalityCertificate().payload
    payload.stableOrderCompletenessDigest = ''

    const result = validateLapicFinalOptimalityPayload(payload)

    expect(result.ok).toBe(false)
  })

  it('rejects incompatible decisionClass for certificate kind', () => {
    const cert = createFinalOptimalityCertificate()
    cert.decisionClass = 'exact-prune'

    const result = validateLapicCertificate(cert)

    expect(result.ok).toBe(false)
  })

  it('creates a final optimality summary from a valid certificate', () => {
    const result = createLapicFinalOptimalitySummary(
      createFinalOptimalityCertificate()
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.winnerStateId).toBe('state-id')
    expect(result.value.certId).toBe('cert-id')
    expect(result.value.decisionMetadata.exactReplayRequired).toBe(true)
  })

  it('creates a certificate summary from a valid certificate', () => {
    const result = createLapicCertificateSummary(
      createFinalOptimalityCertificate()
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.certKind).toBe('FinalOptimalityCert')
    expect(result.value.thresholdDigest).toBe('threshold-digest')
  })

  it('creates threshold-sensitive decision counters from bound and final certificates', () => {
    const result = createLapicThresholdSensitiveDecisionCounters([
      createBoundPruneCertificate(),
      createFinalOptimalityCertificate(),
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.thresholdSensitiveCertificateIds).toEqual([
      'bound-cert-id',
      'cert-id',
    ])
    expect(result.value.exactReplayRequiredCount).toBe(2)
    expect(result.value.dangerZoneDetectedCount).toBe(1)
  })

  it('creates replay coverage summary for validated replay results', () => {
    const result = createLapicReplayCoverageSummary(
      [createBoundPruneCertificate(), createFinalOptimalityCertificate()],
      {
        'bound-cert-id': {
          reproducedVerdict: 'matched' as const,
          validationOutcome: 'validated' as const,
          arithmeticModeUsed: 'exact',
          referencedEvidenceDigests: ['bound-evidence-digest'],
          exactReplayInvoked: true,
        },
      }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.replayedCertificateIds).toEqual(['bound-cert-id'])
    expect(result.value.missingCertificateIds).toEqual(['cert-id'])
    expect(result.value.matchedReplayCount).toBe(1)
  })

  it('summarizes replay mismatches deterministically', () => {
    const result = summarizeLapicReplayMismatch([
      {
        reproducedVerdict: 'mismatched',
        validationOutcome: 'rejected',
        arithmeticModeUsed: 'exact',
        mismatchExplanation: {
          reason: 'bound diverged',
          expectedDigest: 'expected-digest',
          actualDigest: 'actual-digest',
        },
        referencedEvidenceDigests: ['bound-evidence-digest'],
        exactReplayInvoked: true,
      },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.mismatchCount).toBe(1)
    expect(result.value.reasons).toEqual(['bound diverged'])
    expect(result.value.referencedEvidenceDigests).toEqual([
      'bound-evidence-digest',
    ])
  })

  it('creates a final optimality rollup for consistent certificates', () => {
    const first = createFinalOptimalityCertificate()
    const second = createFinalOptimalityCertificate()
    second.certId = 'cert-id-2'
    second.evidenceDigest = 'evidence-digest-2'
    second.payload.finalThresholdDigest = 'threshold-digest-2'

    const result = createLapicFinalOptimalityRollup([first, second])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.winnerStateId).toBe('state-id')
    expect(result.value.certIds).toEqual(['cert-id', 'cert-id-2'])
    expect(result.value.thresholdDigests).toEqual([
      'threshold-digest',
      'threshold-digest-2',
    ])
  })
})
