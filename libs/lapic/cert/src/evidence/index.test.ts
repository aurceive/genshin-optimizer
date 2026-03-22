import type {
  LapicHighsDangerZoneAssessment,
  LapicHighsDiagnostics,
  LapicHighsEvidenceV1,
} from './types'
import {
  validateHighsDangerZoneAssessment,
  validateHighsDiagnostics,
  validateHighsEvidenceV1,
} from './validation'

function makeValidDiagnostics(): LapicHighsDiagnostics {
  return {
    maxPrimalResidual: 1e-14,
    maxDualResidual: 2e-14,
    maxConstraintViolation: 0,
    maxBoundViolation: 0,
    objectiveGapEstimate: 0,
    conditionEstimate: 1.2,
    presolveReductionCounts: { rows: 0, cols: 0 },
    solverWarningFlags: [],
    terminationReason: 'optimal',
    numericallyQuestionable: false,
  }
}

function makeValidDangerZone(
  triggered = false
): LapicHighsDangerZoneAssessment {
  return {
    thresholdDigest: 'threshold-digest-abc',
    comparisonDirection: 'strictly-less',
    distanceToThresholdEncodingKind: 'exact-decimal',
    distanceToThresholdPayload: '42.5',
    dangerZoneTriggered: triggered,
    triggerReasons: triggered ? ['objectiveNearThreshold'] : [],
    verificationAction: triggered ? 'exactReplay' : 'none',
  }
}

function makeValidEvidence(
  overrides: Partial<LapicHighsEvidenceV1> = {}
): LapicHighsEvidenceV1 {
  return {
    schemaKind: 'HighsEvidenceV1',
    schemaVersion: '0.1.0-draft',
    providerFamily: 'highs',
    providerProfileId: 'lapic-highs-deterministic-v1',
    providerVersion: '1.7.0',
    buildFingerprint: 'wasm-v1.7.0-emscripten',
    platformFingerprint: 'browser-wasm32',
    linearModelDigest: 'model-digest-001',
    relaxationDigest: 'relax-digest-001',
    solveInvocationId: 'inv-001',
    objectiveSense: 'maximize',
    solveOutcome: 'solved',
    primalStatus: 'feasible',
    dualStatus: 'feasible',
    objectiveValueEncodingKind: 'exact-decimal',
    objectiveValuePayload: '1234.5678',
    boundDirection: 'upper',
    iterationCount: 47,
    presolveApplied: true,
    scalingApplied: false,
    basisAvailability: 'available',
    diagnostics: makeValidDiagnostics(),
    dangerZoneAssessment: makeValidDangerZone(false),
    replayEligibility: 'providerReplayEligible',
    configRecordDigest: 'config-digest-xyz',
    ...overrides,
  }
}

describe('validateHighsDiagnostics', () => {
  it('accepts valid diagnostics', () => {
    expect(validateHighsDiagnostics(makeValidDiagnostics()).ok).toBe(true)
  })

  it('rejects non-number maxPrimalResidual', () => {
    const d = { ...makeValidDiagnostics(), maxPrimalResidual: 'bad' as never }
    expect(validateHighsDiagnostics(d).ok).toBe(false)
  })

  it('rejects non-boolean numericallyQuestionable', () => {
    const d = { ...makeValidDiagnostics(), numericallyQuestionable: 1 as never }
    expect(validateHighsDiagnostics(d).ok).toBe(false)
  })

  it('rejects non-array solverWarningFlags', () => {
    const d = { ...makeValidDiagnostics(), solverWarningFlags: 'warn' as never }
    expect(validateHighsDiagnostics(d).ok).toBe(false)
  })
})

describe('validateHighsDangerZoneAssessment', () => {
  it('accepts valid non-triggered assessment', () => {
    expect(
      validateHighsDangerZoneAssessment(makeValidDangerZone(false)).ok
    ).toBe(true)
  })

  it('accepts valid triggered assessment', () => {
    expect(
      validateHighsDangerZoneAssessment(makeValidDangerZone(true)).ok
    ).toBe(true)
  })

  it('rejects triggered=true with action=none', () => {
    const dz: LapicHighsDangerZoneAssessment = {
      ...makeValidDangerZone(true),
      verificationAction: 'none',
    }
    const result = validateHighsDangerZoneAssessment(dz)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('must not be "none"')
  })

  it('rejects triggered=false with action≠none', () => {
    const dz: LapicHighsDangerZoneAssessment = {
      ...makeValidDangerZone(false),
      verificationAction: 'exactReplay',
    }
    const result = validateHighsDangerZoneAssessment(dz)
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('must be "none"')
  })

  it('rejects triggered=true with no trigger reasons', () => {
    const dz: LapicHighsDangerZoneAssessment = {
      ...makeValidDangerZone(true),
      triggerReasons: [],
    }
    expect(validateHighsDangerZoneAssessment(dz).ok).toBe(false)
  })

  it('rejects invalid trigger reason', () => {
    const dz: LapicHighsDangerZoneAssessment = {
      ...makeValidDangerZone(true),
      triggerReasons: ['madeUpReason' as never],
    }
    expect(validateHighsDangerZoneAssessment(dz).ok).toBe(false)
  })

  it('accepts all valid trigger reasons', () => {
    const reasons = [
      'objectiveNearThreshold',
      'poorConditioning',
      'highResidual',
      'unstableBasis',
      'providerWarning',
      'missingCriticalDiagnostic',
    ] as const
    for (const reason of reasons) {
      const dz: LapicHighsDangerZoneAssessment = {
        ...makeValidDangerZone(true),
        triggerReasons: [reason],
      }
      expect(validateHighsDangerZoneAssessment(dz).ok).toBe(true)
    }
  })

  it('accepts all valid verification actions for triggered zone', () => {
    const actions = [
      'repeatWithConservativeNumericMode',
      'exactReplay',
      'rejectProviderDecision',
    ] as const
    for (const action of actions) {
      const dz: LapicHighsDangerZoneAssessment = {
        ...makeValidDangerZone(true),
        verificationAction: action,
      }
      expect(validateHighsDangerZoneAssessment(dz).ok).toBe(true)
    }
  })
})

describe('validateHighsEvidenceV1', () => {
  it('accepts valid evidence', () => {
    expect(validateHighsEvidenceV1(makeValidEvidence()).ok).toBe(true)
  })

  it('rejects wrong schemaKind', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({ schemaKind: 'WrongKind' as never })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('HighsEvidenceV1')
  })

  it('rejects wrong providerFamily', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({ providerFamily: 'glpk' as never })
    )
    expect(result.ok).toBe(false)
  })

  it('rejects wrong providerProfileId', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({ providerProfileId: 'custom' as never })
    )
    expect(result.ok).toBe(false)
  })

  it('rejects invalid objectiveSense', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({ objectiveSense: 'optimize' as never })
    )
    expect(result.ok).toBe(false)
  })

  it('rejects invalid solveOutcome', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({ solveOutcome: 'crashed' as never })
    )
    expect(result.ok).toBe(false)
  })

  it('rejects negative iterationCount', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({ iterationCount: -1 })
    )
    expect(result.ok).toBe(false)
  })

  it('rejects invalid boundDirection', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({ boundDirection: 'both' as never })
    )
    expect(result.ok).toBe(false)
  })

  it('rejects invalid basisAvailability', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({ basisAvailability: 'partial' as never })
    )
    expect(result.ok).toBe(false)
  })

  it('rejects invalid replayEligibility', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({ replayEligibility: 'maybe' as never })
    )
    expect(result.ok).toBe(false)
  })

  it('rejects danger-zone triggered with providerReplayEligible', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({
        dangerZoneAssessment: makeValidDangerZone(true),
        replayEligibility: 'providerReplayEligible',
      })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain(
      'must not be "providerReplayEligible"'
    )
  })

  it('accepts danger-zone triggered with exactReplayRequired', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({
        dangerZoneAssessment: makeValidDangerZone(true),
        replayEligibility: 'exactReplayRequired',
      })
    )
    expect(result.ok).toBe(true)
  })

  it('accepts infeasible solve outcome', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({ solveOutcome: 'infeasible' })
    )
    expect(result.ok).toBe(true)
  })

  it('accepts all valid solve outcomes', () => {
    const outcomes = [
      'solved',
      'infeasible',
      'unbounded',
      'interrupted',
    ] as const
    for (const outcome of outcomes) {
      expect(
        validateHighsEvidenceV1(makeValidEvidence({ solveOutcome: outcome })).ok
      ).toBe(true)
    }
  })

  it('validates nested diagnostics errors', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({
        diagnostics: {
          ...makeValidDiagnostics(),
          maxPrimalResidual: 'bad' as never,
        },
      })
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]!.message).toContain('maxPrimalResidual')
  })

  it('validates nested dangerZone errors', () => {
    const result = validateHighsEvidenceV1(
      makeValidEvidence({
        dangerZoneAssessment: {
          ...makeValidDangerZone(true),
          verificationAction: 'none',
        },
      })
    )
    expect(result.ok).toBe(false)
  })
})
