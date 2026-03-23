import {
  giLapicTcAdapterCapabilities,
  giLapicTcAdapterKind,
  giLapicTcAdapterSchemaVersion,
  type GiLapicTcAdapterRequest,
  isGiLapicTcRequest,
  validateGiLapicTcAdapterRequest,
  validateGiLapicTcOptimizationRequest,
  giLapicTcScaffoldCorpus,
  giLapicTcScaffoldMilestoneGate,
} from './index'

// ---------------------------------------------------------------------------
// Type partitioning
// ---------------------------------------------------------------------------

describe('GI TC sub-family type partitioning', () => {
  it('has distinct adapterKind from artifact path', () => {
    expect(giLapicTcAdapterKind).toBe('gi-tc')
    expect(giLapicTcAdapterKind).not.toBe('gi')
  })

  it('has its own schema version', () => {
    expect(giLapicTcAdapterSchemaVersion).toBe('0.1.0-draft')
  })

  it('declares unsupported semantics', () => {
    expect(
      giLapicTcAdapterCapabilities.explicitlyUnsupportedSemantics.length
    ).toBeGreaterThan(0)
  })

  it('supports fully-achievable materializability mode', () => {
    expect(
      giLapicTcAdapterCapabilities.supportedMaterializabilityModes
    ).toContain('fully-achievable')
  })
})

// ---------------------------------------------------------------------------
// Request routing
// ---------------------------------------------------------------------------

describe('isGiLapicTcRequest', () => {
  it('returns true for gi-tc adapterKind', () => {
    expect(isGiLapicTcRequest({ adapterKind: 'gi-tc' })).toBe(true)
  })

  it('returns false for gi adapterKind', () => {
    expect(isGiLapicTcRequest({ adapterKind: 'gi' })).toBe(false)
  })

  it('returns false for unknown adapterKind', () => {
    expect(isGiLapicTcRequest({ adapterKind: 'sr' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC optimization request validation
// ---------------------------------------------------------------------------

describe('validateGiLapicTcOptimizationRequest', () => {
  const validRequest = {
    targetFormula: 'damage',
    slotConstraints: new Map(),
    rollBudget: 45,
    materializabilityFilter: 'fully-achievable' as const,
    topN: 5,
  }

  it('accepts valid TC optimization request', () => {
    const result = validateGiLapicTcOptimizationRequest(validRequest)
    expect(result.ok).toBe(true)
  })

  it('rejects null', () => {
    const result = validateGiLapicTcOptimizationRequest(null)
    expect(result.ok).toBe(false)
  })

  it('rejects empty targetFormula', () => {
    const result = validateGiLapicTcOptimizationRequest({
      ...validRequest,
      targetFormula: '',
    })
    expect(result.ok).toBe(false)
  })

  it('rejects negative rollBudget', () => {
    const result = validateGiLapicTcOptimizationRequest({
      ...validRequest,
      rollBudget: -1,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects topN < 1', () => {
    const result = validateGiLapicTcOptimizationRequest({
      ...validRequest,
      topN: 0,
    })
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC adapter request validation
// ---------------------------------------------------------------------------

describe('validateGiLapicTcAdapterRequest', () => {
  const validRequest: GiLapicTcAdapterRequest = {
    adapterKind: 'gi-tc',
    normalizationInput: {
      problemId: 'test-problem',
      engineVersion: 'test-version',
      arithmeticPolicyId: 'ieee754-double',
    },
    tcRequest: {
      targetFormula: 'damage',
      slotConstraints: new Map(),
      rollBudget: 45,
      materializabilityFilter: 'fully-achievable',
      topN: 5,
    },
  }

  it('accepts valid TC adapter request', () => {
    const result = validateGiLapicTcAdapterRequest(validRequest)
    expect(result.ok).toBe(true)
  })

  it('rejects wrong adapterKind', () => {
    const result = validateGiLapicTcAdapterRequest({
      ...validRequest,
      adapterKind: 'gi',
    })
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.message).toContain('gi-tc')
  })

  it('rejects missing normalizationInput', () => {
    const result = validateGiLapicTcAdapterRequest({
      adapterKind: 'gi-tc',
      tcRequest: validRequest.tcRequest,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects invalid tcRequest', () => {
    const result = validateGiLapicTcAdapterRequest({
      ...validRequest,
      tcRequest: { ...validRequest.tcRequest, topN: 0 },
    })
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TC governance
// ---------------------------------------------------------------------------

describe('GI TC governance scaffold', () => {
  it('has a distinct corpus from artifact path', () => {
    expect(giLapicTcScaffoldCorpus.corpusId).toContain('tc')
    expect(giLapicTcScaffoldCorpus.migrationState).toBe('tcScaffoldValidated')
  })

  it('has test case descriptors with materializability cases', () => {
    for (const tc of giLapicTcScaffoldCorpus.testCaseDescriptors) {
      expect(tc.materializabilityCase).toBeTruthy()
    }
  })

  it('milestone gate references TC corpus', () => {
    expect(giLapicTcScaffoldMilestoneGate.requiredCorpusId).toBe(
      giLapicTcScaffoldCorpus.corpusId
    )
  })

  it('milestone gate has required gate criteria', () => {
    expect(giLapicTcScaffoldMilestoneGate.gateCriteria.length).toBeGreaterThan(
      0
    )
    for (const criterion of giLapicTcScaffoldMilestoneGate.gateCriteria) {
      expect(criterion.required).toBe(true)
    }
  })
})
