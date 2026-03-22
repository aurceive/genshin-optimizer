import type {
  LapicLinearConstraint,
  LapicLinearModel,
  LapicLinearObjective,
  LapicLinearVariable,
  LapicLpProvider,
} from '@genshin-optimizer/lapic/core'
import {
  createLapicHighsProvider,
  serializeModelToLpFormat,
} from './highs-provider'

// ---------------------------------------------------------------------------
// Model fixtures
// ---------------------------------------------------------------------------

function makeVariable(
  index: number,
  lo: number,
  hi: number
): LapicLinearVariable {
  return {
    variableIndex: index,
    name: `x${index}`,
    lowerBound: lo,
    upperBound: hi,
  }
}

function makeConstraint(
  id: string,
  coeffs: number[],
  varIndices: number[],
  lo: number,
  hi: number
): LapicLinearConstraint {
  return {
    constraintId: id,
    coefficients: coeffs,
    variableIndices: varIndices,
    lowerBound: lo,
    upperBound: hi,
  }
}

function makeObjective(
  sense: 'minimize' | 'maximize',
  coeffs: number[],
  varIndices: number[],
  offset = 0
): LapicLinearObjective {
  return { sense, coefficients: coeffs, variableIndices: varIndices, offset }
}

function makeModel(
  variables: LapicLinearVariable[],
  constraints: LapicLinearConstraint[],
  objective: LapicLinearObjective,
  digest = 'test-model'
): LapicLinearModel {
  return { modelDigest: digest, variables, constraints, objective }
}

// ---------------------------------------------------------------------------
// LP format serialization
// ---------------------------------------------------------------------------

describe('serializeModelToLpFormat', () => {
  it('serializes a simple maximization problem', () => {
    const model = makeModel(
      [makeVariable(0, 0, 10), makeVariable(1, 0, 5)],
      [makeConstraint('c0', [1, 1], [0, 1], -Infinity, 12)],
      makeObjective('maximize', [3, 2], [0, 1])
    )
    const lp = serializeModelToLpFormat(model)

    expect(lp).toContain('Maximize')
    expect(lp).toContain('3 x0')
    expect(lp).toContain('2 x1')
    expect(lp).toContain('c0:')
    expect(lp).toContain('<= 12')
    expect(lp).toContain('0 <= x0 <= 10')
    expect(lp).toContain('End')
  })

  it('serializes equality constraints', () => {
    const model = makeModel(
      [makeVariable(0, 0, 10)],
      [makeConstraint('eq', [1], [0], 5, 5)],
      makeObjective('minimize', [1], [0])
    )
    const lp = serializeModelToLpFormat(model)

    expect(lp).toContain('= 5')
  })

  it('serializes lower-bound constraints', () => {
    const model = makeModel(
      [makeVariable(0, 0, 10)],
      [makeConstraint('lb', [1], [0], 3, Infinity)],
      makeObjective('minimize', [1], [0])
    )
    const lp = serializeModelToLpFormat(model)

    expect(lp).toContain('>= 3')
  })

  it('serializes range constraints as two rows', () => {
    const model = makeModel(
      [makeVariable(0, 0, 10)],
      [makeConstraint('rng', [1], [0], 2, 8)],
      makeObjective('minimize', [1], [0])
    )
    const lp = serializeModelToLpFormat(model)

    expect(lp).toContain('rng_lo:')
    expect(lp).toContain('>= 2')
    expect(lp).toContain('rng_hi:')
    expect(lp).toContain('<= 8')
  })

  it('handles negative coefficients', () => {
    const model = makeModel(
      [makeVariable(0, 0, 10), makeVariable(1, 0, 10)],
      [],
      makeObjective('maximize', [1, -2], [0, 1])
    )
    const lp = serializeModelToLpFormat(model)

    expect(lp).toContain('x0')
    expect(lp).toContain('- 2 x1')
  })

  it('handles free variables', () => {
    const model = makeModel(
      [makeVariable(0, -Infinity, Infinity)],
      [],
      makeObjective('minimize', [1], [0])
    )
    const lp = serializeModelToLpFormat(model)

    expect(lp).toContain('x0 free')
  })
})

// ---------------------------------------------------------------------------
// HiGHS provider integration tests
// ---------------------------------------------------------------------------

describe('createLapicHighsProvider', () => {
  let provider: LapicLpProvider

  beforeAll(async () => {
    provider = await createLapicHighsProvider()
  })

  describe('deterministic mode', () => {
    it('has the expected profile ID', () => {
      expect(provider.deterministicMode.profileId).toBe(
        'lapic-highs-deterministic-v1'
      )
    })

    it('has a config record digest', () => {
      expect(provider.deterministicMode.configRecordDigest).toBeTruthy()
    })
  })

  describe('solve', () => {
    it('solves a simple maximization', () => {
      const model = makeModel(
        [makeVariable(0, 0, 10), makeVariable(1, 0, 5)],
        [makeConstraint('c0', [1, 1], [0, 1], -Infinity, 12)],
        makeObjective('maximize', [3, 2], [0, 1])
      )

      const result = provider.solve(model)

      expect(result.outcome).toBe('solved')
      expect(result.objectiveValue).toBeDefined()
      // x0=10, x1=2 → obj=30+4=34 OR x0=7, x1=5 → obj=21+10=31
      // Actually: max 3x0+2x1 s.t. x0+x1≤12, 0≤x0≤10, 0≤x1≤5
      // Optimal: x0=7, x1=5 → 21+10=31? No. x0=10, x1=2 → 30+4=34.
      // Check: 10+2=12 ≤ 12 ✓
      expect(Number(result.objectiveValue)).toBeCloseTo(34, 5)
      expect(result.boundDirection).toBe('upper')
      expect(result.numericallyQuestionable).toBe(false)
    })

    it('solves a simple minimization', () => {
      const model = makeModel(
        [makeVariable(0, 0, 10), makeVariable(1, 0, 10)],
        [makeConstraint('c0', [1, 1], [0, 1], 5, Infinity)],
        makeObjective('minimize', [2, 3], [0, 1])
      )

      const result = provider.solve(model)

      expect(result.outcome).toBe('solved')
      // min 2x0+3x1 s.t. x0+x1≥5, x0,x1∈[0,10]
      // Optimal: x0=5, x1=0 → 10
      expect(Number(result.objectiveValue)).toBeCloseTo(10, 5)
      expect(result.boundDirection).toBe('lower')
    })

    it('handles objective offset', () => {
      const model = makeModel(
        [makeVariable(0, 0, 10)],
        [],
        makeObjective('maximize', [1], [0], 100)
      )

      const result = provider.solve(model)

      expect(result.outcome).toBe('solved')
      // max x0 + 100, x0∈[0,10] → x0=10 → 110
      expect(Number(result.objectiveValue)).toBeCloseTo(110, 5)
    })

    it('detects infeasible problems', () => {
      const model = makeModel(
        [makeVariable(0, 0, 10)],
        [
          makeConstraint('lo', [1], [0], 15, Infinity), // x0 >= 15
        ],
        makeObjective('maximize', [1], [0])
      )

      const result = provider.solve(model)

      expect(result.outcome).toBe('infeasible')
      expect(result.objectiveValue).toBeUndefined()
    })

    it('produces deterministic results across multiple solves', () => {
      const model = makeModel(
        [makeVariable(0, 0, 100), makeVariable(1, 0, 100)],
        [
          makeConstraint('c0', [1, 1], [0, 1], -Infinity, 50),
          makeConstraint('c1', [2, 1], [0, 1], -Infinity, 80),
        ],
        makeObjective('maximize', [5, 4], [0, 1])
      )

      const r1 = provider.solve(model)
      const r2 = provider.solve(model)

      expect(r1.outcome).toBe('solved')
      expect(r2.outcome).toBe('solved')
      expect(r1.objectiveValue).toBe(r2.objectiveValue)
    })

    it('handles equality constraints', () => {
      const model = makeModel(
        [makeVariable(0, 0, 10), makeVariable(1, 0, 10)],
        [makeConstraint('eq', [1, 1], [0, 1], 7, 7)],
        makeObjective('maximize', [1, 2], [0, 1])
      )

      const result = provider.solve(model)

      expect(result.outcome).toBe('solved')
      // max x0+2x1 s.t. x0+x1=7, x0,x1∈[0,10]
      // Optimal: x0=0, x1=7 → 14
      expect(Number(result.objectiveValue)).toBeCloseTo(14, 5)
    })

    it('handles single variable trivial problem', () => {
      const model = makeModel(
        [makeVariable(0, 3, 7)],
        [],
        makeObjective('maximize', [1], [0])
      )

      const result = provider.solve(model)

      expect(result.outcome).toBe('solved')
      expect(Number(result.objectiveValue)).toBeCloseTo(7, 5)
    })
  })

  describe('serializeEvidence', () => {
    it('produces HighsEvidenceV1-shaped evidence', () => {
      const model = makeModel(
        [makeVariable(0, 0, 10)],
        [],
        makeObjective('maximize', [1], [0])
      )
      const result = provider.solve(model)
      const evidence = provider.serializeEvidence(result) as Record<
        string,
        unknown
      >

      expect(evidence.schemaKind).toBe('HighsEvidenceV1')
      expect(evidence.providerFamily).toBe('highs')
      expect(evidence.providerProfileId).toBe('lapic-highs-deterministic-v1')
      expect(evidence.solveOutcome).toBe('solved')
      expect(evidence.objectiveValuePayload).toBe('10')
      expect(evidence.boundDirection).toBe('upper')
      expect(evidence.presolveApplied).toBe(true)
    })

    it('includes diagnostics in evidence', () => {
      const model = makeModel(
        [makeVariable(0, 0, 10)],
        [],
        makeObjective('maximize', [1], [0])
      )
      const result = provider.solve(model)
      const evidence = provider.serializeEvidence(result) as Record<
        string,
        unknown
      >
      const diagnostics = evidence.diagnostics as Record<string, unknown>

      expect(diagnostics).toBeDefined()
      expect(diagnostics.terminationReason).toBe('Optimal')
      expect(diagnostics.numericallyQuestionable).toBe(false)
    })

    it('includes danger zone assessment in evidence', () => {
      const model = makeModel(
        [makeVariable(0, 0, 10)],
        [],
        makeObjective('maximize', [1], [0])
      )
      const result = provider.solve(model)
      const evidence = provider.serializeEvidence(result) as Record<
        string,
        unknown
      >
      const dz = evidence.dangerZoneAssessment as Record<string, unknown>

      expect(dz.triggered).toBe(false)
      expect(dz.assessmentOutcome).toBe('safe')
    })

    it('produces replay-eligible evidence', () => {
      const model = makeModel(
        [makeVariable(0, 0, 10)],
        [],
        makeObjective('maximize', [1], [0])
      )
      const result = provider.solve(model)
      const evidence = provider.serializeEvidence(result) as Record<
        string,
        unknown
      >
      const replay = evidence.replayEligibility as Record<string, unknown>

      expect(replay.eligible).toBe(true)
    })
  })

  describe('custom config', () => {
    it('respects custom iteration limit', async () => {
      const p = await createLapicHighsProvider({
        iterationLimit: 50_000,
      })
      expect(p.deterministicMode.configRecordDigest).toContain(
        'iterLimit-50000'
      )
    })

    it('respects presolve off', async () => {
      const p = await createLapicHighsProvider({
        presolveMode: 'off',
      })
      expect(p.deterministicMode.configRecordDigest).toContain('presolve-off')

      const model = makeModel(
        [makeVariable(0, 0, 10)],
        [],
        makeObjective('maximize', [1], [0])
      )
      const result = p.solve(model)
      expect(result.outcome).toBe('solved')

      const evidence = p.serializeEvidence(result) as Record<string, unknown>
      expect(evidence.presolveApplied).toBe(false)
    })
  })
})
