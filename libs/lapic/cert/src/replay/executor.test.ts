import type {
  LapicBoundPrunePayload,
  LapicBranchReachabilityPayload,
  LapicCertificate,
  LapicDominancePayload,
  LapicFinalOptimalityPayload,
  LapicInfeasibilityPayload,
} from '../types'
import {
  replayCertificate,
  replayCertificateBatch,
  summarizeReplayBatchVerdicts,
} from './executor'

// ---------------------------------------------------------------------------
// Certificate fixtures
// ---------------------------------------------------------------------------

function makeBoundPruneCert(
  overrides?: Partial<LapicBoundPrunePayload> & { incumbentDigest?: string }
): LapicCertificate<LapicBoundPrunePayload> {
  return {
    certId: 'cert:bound-prune:test:step-1',
    certKind: 'BoundPruneCert',
    schemaVersion: '0.1.0-draft',
    problemId: 'test-problem',
    arithmeticPolicyId: 'fast-float',
    decisionClass: 'relaxation-prune',
    referencedStateIds: [],
    referencedBlockIds: ['block-1'],
    referencedRegionIds: ['region:domain-0:test'],
    referencedRelaxIds: [],
    incumbentDigest: overrides?.incumbentDigest ?? '100',
    evidenceDigest: 'evidence:bound:test',
    replayRecipe: {
      requiredIrObjects: ['expr-digest'],
      requiredRegionPredicates: ['region:domain-0:test'],
      arithmeticMode: 'interval',
      replayPathKind: 'single-certificate',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: 1,
    validationStatus: 'validated',
    payload: {
      thresholdDigest: overrides?.thresholdDigest ?? 'threshold:test:100',
      boundSourceClass: overrides?.boundSourceClass ?? 'relaxationDerived',
      boundValue: overrides?.boundValue ?? '50',
      validityRegionId: overrides?.validityRegionId ?? 'region:domain-0:test',
      numericDiagnosticsDigest:
        overrides?.numericDiagnosticsDigest ?? 'numeric:test',
      dangerZoneRecord: overrides?.dangerZoneRecord ?? {
        triggered: false,
        verificationReplayInvoked: false,
      },
    },
  }
}

function makeDominanceCert(
  overrides?: Partial<LapicDominancePayload> & {
    referencedStateIds?: string[]
  }
): LapicCertificate<LapicDominancePayload> {
  const dominatingId = overrides?.dominatingStateId ?? 'state-winner'
  const dominatedId = overrides?.dominatedStateId ?? 'state-loser'

  return {
    certId: 'cert:dominance:test:step-2',
    certKind: 'DominanceCert',
    schemaVersion: '0.1.0-draft',
    problemId: 'test-problem',
    arithmeticPolicyId: 'fast-float',
    decisionClass: 'dominance-prune',
    referencedStateIds: overrides?.referencedStateIds ?? [
      dominatingId,
      dominatedId,
    ],
    referencedBlockIds: ['block-1'],
    referencedRegionIds: [],
    referencedRelaxIds: [],
    incumbentDigest: 'evidence:dominating',
    evidenceDigest: `dominance:${dominatingId}>${dominatedId}:test`,
    replayRecipe: {
      requiredIrObjects: ['expr-digest'],
      requiredRegionPredicates: [],
      arithmeticMode: 'exact',
      replayPathKind: 'single-certificate',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: 2,
    validationStatus: 'validated',
    payload: {
      dominatingStateId: dominatingId,
      dominatedStateId: dominatedId,
      comparisonDigest:
        overrides?.comparisonDigest ??
        `dominance:${dominatingId}>${dominatedId}:test`,
      exactSignatureGroupKeyDigest:
        overrides?.exactSignatureGroupKeyDigest ?? 'sig-group:test',
      compatibilityInclusionDigest:
        overrides?.compatibilityInclusionDigest ?? 'compat:test',
      monotoneProjectionDigest:
        overrides?.monotoneProjectionDigest ?? 'monotone:test',
      upperBoundProfileDigest:
        overrides?.upperBoundProfileDigest ?? 'ub-profile:test',
      strengthComparisonDigest:
        overrides?.strengthComparisonDigest ?? 'strength:test',
    },
  }
}

function makeBranchReachabilityCert(
  overrides?: Partial<LapicBranchReachabilityPayload> & {
    referencedRegionIds?: string[]
  }
): LapicCertificate<LapicBranchReachabilityPayload> {
  const regionId = overrides?.validityRegionId ?? 'region:branch:test'
  return {
    certId: 'cert:branch-reach:test:step-0',
    certKind: 'BranchReachabilityCert',
    schemaVersion: '0.1.0-draft',
    problemId: 'test-problem',
    arithmeticPolicyId: 'fast-float',
    decisionClass: 'exact-prune',
    referencedStateIds: [],
    referencedBlockIds: [],
    referencedRegionIds: overrides?.referencedRegionIds ?? [regionId],
    referencedRelaxIds: [],
    evidenceDigest: 'evidence:branch:test',
    replayRecipe: {
      requiredIrObjects: ['expr-digest'],
      requiredRegionPredicates: [regionId],
      arithmeticMode: 'exact',
      replayPathKind: 'single-certificate',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: 0,
    validationStatus: 'validated',
    payload: {
      branchPredicateDigest:
        overrides?.branchPredicateDigest ?? 'branch:node1:guard:node2:test',
      exactBoundsDigest:
        overrides?.exactBoundsDigest ?? 'bounds:[0,10]:nodeTest',
      selectedArm: overrides?.selectedArm ?? 'left',
      validityRegionId: regionId,
    },
  }
}

function makeFinalOptimalityCert(
  overrides?: Partial<LapicFinalOptimalityPayload> & {
    referencedStateIds?: string[]
  }
): LapicCertificate<LapicFinalOptimalityPayload> {
  const winnerId = overrides?.winningStateId ?? 'state-winner'
  return {
    certId: 'cert:final:test',
    certKind: 'FinalOptimalityCert',
    schemaVersion: '0.1.0-draft',
    problemId: 'test-problem',
    arithmeticPolicyId: 'fast-float',
    decisionClass: 'optimality-proof',
    referencedStateIds: overrides?.referencedStateIds ?? [winnerId],
    referencedBlockIds: ['block-1'],
    referencedRegionIds: [],
    referencedRelaxIds: [],
    incumbentDigest: '200',
    evidenceDigest: 'evidence:final:test',
    replayRecipe: {
      requiredIrObjects: ['expr-digest'],
      requiredRegionPredicates: [],
      arithmeticMode: 'exact',
      replayPathKind: 'full-replay',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: 1,
    validationStatus: 'validated',
    payload: {
      winningStateId: winnerId,
      optimalityGap: overrides?.optimalityGap ?? '0',
      finalThresholdDigest:
        overrides?.finalThresholdDigest ?? 'threshold:test:final',
      finalIncumbentSetDigest:
        overrides?.finalIncumbentSetDigest ?? 'incumbent:test',
      queueExhaustionSummaryDigest:
        overrides?.queueExhaustionSummaryDigest ?? 'queue:test',
      thresholdPruneSummaryDigest:
        overrides?.thresholdPruneSummaryDigest ?? 'prune:test',
      escalatedReplaySummaryDigest:
        overrides?.escalatedReplaySummaryDigest ?? 'replay:test',
      stableOrderCompletenessDigest:
        overrides?.stableOrderCompletenessDigest ?? 'order:test',
    },
  }
}

function makeInfeasibilityCert(
  overrides?: Partial<LapicInfeasibilityPayload>
): LapicCertificate<LapicInfeasibilityPayload> {
  return {
    certId: 'cert:infeasible:test',
    certKind: 'InfeasibilityCert',
    schemaVersion: '0.1.0-draft',
    problemId: 'test-problem',
    arithmeticPolicyId: 'fast-float',
    decisionClass: 'exact-prune',
    referencedStateIds: [],
    referencedBlockIds: ['block-1'],
    referencedRegionIds: [],
    referencedRelaxIds: [],
    evidenceDigest: 'evidence:infeasible:test',
    replayRecipe: {
      requiredIrObjects: ['expr-digest'],
      requiredRegionPredicates: [],
      arithmeticMode: 'exact',
      replayPathKind: 'full-replay',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: 1,
    validationStatus: 'validated',
    payload: {
      evidenceSourceClass: overrides?.evidenceSourceClass ?? 'exactSymbolic',
      infeasibleConstraintDigests: overrides?.infeasibleConstraintDigests ?? [
        'constraint-1',
      ],
      witnessDigest: overrides?.witnessDigest ?? 'witness:test',
      affectedBlockIds: overrides?.affectedBlockIds ?? ['block-1'],
      replayPathRequirement:
        overrides?.replayPathRequirement ?? 'bounded-cartesian-exhaustion',
    },
  }
}

// ===========================================================================
// Tests: replayCertificate
// ===========================================================================

describe('replayCertificate', () => {
  describe('BoundPruneCert', () => {
    it('matches a valid bound prune certificate', () => {
      const cert = makeBoundPruneCert()
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('matched')
      expect(result.value.validationOutcome).toBe('validated')
    })

    it('detects bound above threshold (prune not justified)', () => {
      // bound = 150, threshold = 100 → bound >= threshold → mismatch
      const cert = makeBoundPruneCert({
        boundValue: '150',
        incumbentDigest: '100',
      })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
      expect(result.value.mismatchExplanation?.reason).toContain(
        'not below threshold'
      )
    })

    it('detects non-finite bound value', () => {
      const cert = makeBoundPruneCert({ boundValue: 'NaN' })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
      expect(result.value.mismatchExplanation?.reason).toContain(
        'not a finite number'
      )
    })

    it('detects Infinity bound value', () => {
      const cert = makeBoundPruneCert({ boundValue: 'Infinity' })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
    })

    it('detects danger zone triggered but cert still emitted', () => {
      const cert = makeBoundPruneCert({
        dangerZoneRecord: {
          triggered: true,
          verificationReplayInvoked: false,
          explanation: 'test danger zone',
        },
      })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
      expect(result.value.mismatchExplanation?.reason).toContain(
        'dangerZoneRecord.triggered=true'
      )
    })

    it('matches when bound is strictly below threshold', () => {
      const cert = makeBoundPruneCert({
        boundValue: '99.999',
        incumbentDigest: '100',
      })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('matched')
    })

    it('detects bound equal to threshold (not strictly below)', () => {
      const cert = makeBoundPruneCert({
        boundValue: '100',
        incumbentDigest: '100',
      })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
    })

    it('includes evidence digests in result', () => {
      const cert = makeBoundPruneCert()
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.referencedEvidenceDigests.length).toBeGreaterThan(0)
    })
  })

  describe('DominanceCert', () => {
    it('matches a valid dominance certificate', () => {
      const cert = makeDominanceCert()
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('matched')
    })

    it('detects identical dominating and dominated states', () => {
      const cert = makeDominanceCert({
        dominatingStateId: 'same-state',
        dominatedStateId: 'same-state',
        referencedStateIds: ['same-state'],
      })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
      expect(result.value.mismatchExplanation?.reason).toContain('identical')
    })

    it('detects dominating state not in referencedStateIds', () => {
      const cert = makeDominanceCert({
        referencedStateIds: ['state-loser'],
      })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
      expect(result.value.mismatchExplanation?.reason).toContain(
        'not in referencedStateIds'
      )
    })

    it('uses exact arithmetic mode', () => {
      const cert = makeDominanceCert()
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.arithmeticModeUsed).toBe('exact')
      expect(result.value.exactReplayInvoked).toBe(true)
    })
  })

  describe('BranchReachabilityCert', () => {
    it('matches a valid branch reachability certificate', () => {
      const cert = makeBranchReachabilityCert()
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('matched')
    })

    it('matches with left arm selection', () => {
      const cert = makeBranchReachabilityCert({ selectedArm: 'left' })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('matched')
    })

    it('matches with right arm selection', () => {
      const cert = makeBranchReachabilityCert({ selectedArm: 'right' })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('matched')
    })

    it('detects validity region not in referencedRegionIds', () => {
      const cert = makeBranchReachabilityCert({
        validityRegionId: 'region:missing',
        referencedRegionIds: ['region:other'],
      })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
      expect(result.value.mismatchExplanation?.reason).toContain(
        'not in referencedRegionIds'
      )
    })

    it('matches with exact bounds digest', () => {
      const cert = makeBranchReachabilityCert({
        exactBoundsDigest: 'bounds:[5,10]:node1',
      })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('matched')
    })

    it('detects inverted guard bounds', () => {
      const cert = makeBranchReachabilityCert({
        exactBoundsDigest: 'bounds:[10,5]:node1',
      })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
      expect(result.value.mismatchExplanation?.reason).toContain('inverted')
    })
  })

  describe('FinalOptimalityCert', () => {
    it('matches a valid final optimality certificate', () => {
      const cert = makeFinalOptimalityCert()
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('matched')
    })

    it('detects non-zero optimality gap', () => {
      const cert = makeFinalOptimalityCert({ optimalityGap: '0.001' })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
      expect(result.value.mismatchExplanation?.reason).toContain(
        'Optimality gap'
      )
    })

    it('detects winner not in referencedStateIds', () => {
      const cert = makeFinalOptimalityCert({
        winningStateId: 'missing-winner',
        referencedStateIds: ['other-state'],
      })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
      expect(result.value.mismatchExplanation?.reason).toContain(
        'not in referencedStateIds'
      )
    })

    it('uses exact arithmetic mode for final cert', () => {
      const cert = makeFinalOptimalityCert()
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.arithmeticModeUsed).toBe('exact')
      expect(result.value.exactReplayInvoked).toBe(true)
    })
  })

  describe('InfeasibilityCert', () => {
    it('matches a valid infeasibility certificate', () => {
      const cert = makeInfeasibilityCert()
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('matched')
    })

    it('detects empty infeasible constraint digests', () => {
      const cert = makeInfeasibilityCert({
        infeasibleConstraintDigests: [],
      })
      const result = replayCertificate(cert)

      expect(result.ok).toBe(true)
      expect(result.value.reproducedVerdict).toBe('mismatched')
      expect(result.value.mismatchExplanation?.reason).toContain(
        'no infeasible constraint digests'
      )
    })
  })
})

// ===========================================================================
// Tests: replayCertificateBatch
// ===========================================================================

describe('replayCertificateBatch', () => {
  it('replays multiple certificates and returns results by ID', () => {
    const certs = [
      makeBoundPruneCert(),
      makeDominanceCert(),
      makeFinalOptimalityCert(),
    ]

    const results = replayCertificateBatch(certs)

    expect(results.size).toBe(3)
    for (const cert of certs) {
      expect(results.has(cert.certId)).toBe(true)
      expect(results.get(cert.certId)!.reproducedVerdict).toBe('matched')
    }
  })

  it('handles mixed valid and invalid certificates', () => {
    const certs = [
      makeBoundPruneCert(), // valid → matched
      makeBoundPruneCert({
        boundValue: '200',
        incumbentDigest: '100',
      }), // invalid → mismatched
    ]
    // Fix certId to be unique
    ;(certs[1] as any).certId = 'cert:bound-prune:test:step-2'

    const results = replayCertificateBatch(certs)

    expect(results.size).toBe(2)
    expect(results.get(certs[0]!.certId)!.reproducedVerdict).toBe('matched')
    expect(results.get(certs[1]!.certId)!.reproducedVerdict).toBe('mismatched')
  })

  it('handles empty batch', () => {
    const results = replayCertificateBatch([])
    expect(results.size).toBe(0)
  })
})

// ===========================================================================
// Tests: summarizeReplayBatchVerdicts
// ===========================================================================

describe('summarizeReplayBatchVerdicts', () => {
  it('correctly summarizes mixed verdicts', () => {
    const certs = [
      makeBoundPruneCert(),
      makeDominanceCert(),
      makeBoundPruneCert({
        boundValue: '200',
        incumbentDigest: '100',
      }),
    ]
    ;(certs[2] as any).certId = 'cert:bound-prune:test:step-bad'

    const results = replayCertificateBatch(certs)
    const summary = summarizeReplayBatchVerdicts(results)

    expect(summary.total).toBe(3)
    expect(summary.matched).toBe(2)
    expect(summary.mismatched).toBe(1)
    expect(summary.inconclusive).toBe(0)
    expect(summary.mismatchReasons.length).toBeGreaterThan(0)
  })

  it('reports all matched when all certificates are valid', () => {
    const certs = [
      makeBoundPruneCert(),
      makeDominanceCert(),
      makeFinalOptimalityCert(),
      makeInfeasibilityCert(),
    ]

    const results = replayCertificateBatch(certs)
    const summary = summarizeReplayBatchVerdicts(results)

    expect(summary.total).toBe(4)
    expect(summary.matched).toBe(4)
    expect(summary.mismatched).toBe(0)
    expect(summary.inconclusive).toBe(0)
    expect(summary.mismatchReasons).toHaveLength(0)
  })

  it('handles empty results', () => {
    const summary = summarizeReplayBatchVerdicts(new Map())
    expect(summary.total).toBe(0)
    expect(summary.matched).toBe(0)
    expect(summary.mismatched).toBe(0)
  })
})
