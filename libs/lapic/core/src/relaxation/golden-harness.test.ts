import {
  LapicFirGraphBuilder,
  type LapicLinearModel,
  type LapicLpProvider,
  type LapicLpSolveResult,
} from '@genshin-optimizer/lapic/core'
import type { LapicGoldenDomain } from '../fir/golden-harness'
import { runLapicLpGoldenHarness } from './golden-harness'

// ---------------------------------------------------------------------------
// Mock LP provider — solves by variable bound maximization
// ---------------------------------------------------------------------------

/**
 * A mock LP provider that computes the objective value by using
 * the upper bounds of objective variables. This produces an
 * admissible (but possibly loose) upper bound for maximization.
 */
function createAdmissibleMockProvider(): LapicLpProvider {
  return {
    deterministicMode: {
      profileId: 'golden-mock',
      configRecordDigest: 'mock-digest',
    },
    solve(model: LapicLinearModel): LapicLpSolveResult {
      let objectiveValue = model.objective.offset ?? 0
      for (let i = 0; i < model.objective.coefficients.length; i++) {
        const coeff = model.objective.coefficients[i]!
        const varIdx = model.objective.variableIndices[i]!
        const variable = model.variables[varIdx]!
        if (coeff >= 0) {
          objectiveValue +=
            coeff *
            (Number.isFinite(variable.upperBound) ? variable.upperBound : 1e6)
        } else {
          objectiveValue +=
            coeff *
            (Number.isFinite(variable.lowerBound) ? variable.lowerBound : -1e6)
        }
      }
      return {
        outcome: 'solved',
        objectiveValue: String(objectiveValue),
        boundDirection: 'upper',
        evidenceDigest: `mock:${model.modelDigest}`,
        iterationCount: 1,
        numericallyQuestionable: false,
      }
    },
    serializeEvidence(result: LapicLpSolveResult) {
      return { evidenceDigest: result.evidenceDigest }
    },
  }
}

/**
 * A mock LP provider that returns a dangerously tight bound
 * (the exact max rather than an over-estimate). Still admissible
 * but tests the tightness checking.
 */
function createExactMockProvider(exactValue: number): LapicLpProvider {
  return {
    deterministicMode: {
      profileId: 'exact-mock',
      configRecordDigest: 'mock-digest',
    },
    solve(model: LapicLinearModel): LapicLpSolveResult {
      return {
        outcome: 'solved',
        objectiveValue: String(exactValue),
        boundDirection: 'upper',
        evidenceDigest: `exact:${model.modelDigest}`,
        iterationCount: 1,
        numericallyQuestionable: false,
      }
    },
    serializeEvidence(result: LapicLpSolveResult) {
      return { evidenceDigest: result.evidenceDigest }
    },
  }
}

/**
 * A mock LP provider that returns an inadmissible bound
 * (below the true maximum). Used to verify violation detection.
 */
function createInadmissibleMockProvider(lowBound: number): LapicLpProvider {
  return {
    deterministicMode: {
      profileId: 'bad-mock',
      configRecordDigest: 'mock-digest',
    },
    solve(model: LapicLinearModel): LapicLpSolveResult {
      return {
        outcome: 'solved',
        objectiveValue: String(lowBound),
        boundDirection: 'upper',
        evidenceDigest: `bad:${model.modelDigest}`,
        iterationCount: 1,
        numericallyQuestionable: false,
      }
    },
    serializeEvidence(result: LapicLpSolveResult) {
      return { evidenceDigest: result.evidenceDigest }
    },
  }
}

// ---------------------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------------------

function goldenDomain(
  domainId: string,
  candidates: Array<[string, Record<string, number>]>
): LapicGoldenDomain {
  return {
    domainId,
    candidates: candidates.map(([id, vars]) => ({
      candidateId: id,
      variables: new Map(Object.entries(vars)),
    })),
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('runLapicLpGoldenHarness', () => {
  describe('linear formula: x + y', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.add(x, y)
    const graph = b.build(root)

    const domains = [
      goldenDomain('A', [
        ['a1', { x: 1 }],
        ['a2', { x: 3 }],
        ['a3', { x: 5 }],
      ]),
      goldenDomain('B', [
        ['b1', { y: 2 }],
        ['b2', { y: 4 }],
        ['b3', { y: 6 }],
      ]),
    ]

    it('passes with admissible LP bounds', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      expect(result.ok).toBe(true)
      expect(result.violations).toHaveLength(0)
      expect(result.totalCombinations).toBe(9) // 3 × 3
      expect(result.partialAssignmentsChecked).toBeGreaterThan(0)
      expect(result.lpSolveInvocations).toBeGreaterThan(0)
    })

    it('reports violations with inadmissible LP bounds', () => {
      // True max for unassigned is x_max + y_max = 5 + 6 = 11
      // Providing a bound of 5 is inadmissible
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createInadmissibleMockProvider(5),
      })

      expect(result.ok).toBe(false)
      expect(result.violations.length).toBeGreaterThan(0)
      // At least the fully-unassigned case should be a violation
      const fullyUnassigned = result.violations.find(
        (v) => v.assignedCandidateIds.length === 0
      )
      expect(fullyUnassigned).toBeDefined()
      expect(fullyUnassigned!.maxCompletionScalar).toBe(11)
      expect(fullyUnassigned!.lpUpperBound).toBe(5)
    })

    it('records tightness comparisons', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      expect(result.tightnessRecords.length).toBe(
        result.partialAssignmentsChecked
      )

      for (const record of result.tightnessRecords) {
        // LP bound should be ≥ max completion scalar
        expect(record.lpUpperBound).toBeGreaterThanOrEqual(
          record.maxCompletionScalar - 1e-9
        )
        // LP gap should be ≥ 0
        expect(record.lpGap).toBeGreaterThanOrEqual(-1e-9)
        // Interval gap should be ≥ 0
        expect(record.intervalGap).toBeGreaterThanOrEqual(-1e-9)
      }
    })

    it('LP is exactly as tight as interval for pure linear formulas', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      // For linear formulas, interval and LP should produce the same bound
      // (no inter-variable correlation loss)
      expect(result.equalTightnessCount + result.lpTighterCount).toBe(
        result.partialAssignmentsChecked
      )
    })
  })

  describe('nonlinear formula: x * y (product)', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.mul(x, y)
    const graph = b.build(root)

    const domains = [
      goldenDomain('A', [
        ['a1', { x: 2 }],
        ['a2', { x: 4 }],
      ]),
      goldenDomain('B', [
        ['b1', { y: 3 }],
        ['b2', { y: 5 }],
      ]),
    ]

    it('passes with admissible LP bounds', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      expect(result.ok).toBe(true)
      expect(result.violations).toHaveLength(0)
      expect(result.totalCombinations).toBe(4) // 2 × 2
    })

    it('records tightness data for products', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      // Verify tightness records exist and have valid data
      expect(result.tightnessRecords.length).toBeGreaterThan(0)
      for (const record of result.tightnessRecords) {
        expect(Number.isFinite(record.lpUpperBound)).toBe(true)
        expect(Number.isFinite(record.intervalUpperBound)).toBe(true)
        expect(record.lpGap).toBeGreaterThanOrEqual(-1e-9)
        expect(record.intervalGap).toBeGreaterThanOrEqual(-1e-9)
      }
    })
  })

  describe('affine formula: 2*x + 3*y + 10', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.affineForm(10, [
      { coeff: 2, childId: x },
      { coeff: 3, childId: y },
    ])
    const graph = b.build(root)

    const domains = [
      goldenDomain('A', [
        ['a1', { x: 1 }],
        ['a2', { x: 5 }],
      ]),
      goldenDomain('B', [
        ['b1', { y: 2 }],
        ['b2', { y: 8 }],
      ]),
    ]

    it('passes with admissible LP bounds', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      expect(result.ok).toBe(true)
      // Max is 2*5 + 3*8 + 10 = 10 + 24 + 10 = 44
      const fullyUnassigned = result.tightnessRecords.find(
        (r) => r.assignedCandidateIds.length === 0
      )
      expect(fullyUnassigned).toBeDefined()
      expect(fullyUnassigned!.maxCompletionScalar).toBe(44)
    })
  })

  describe('min/max formula (nonlinear)', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.min(x, y)
    const graph = b.build(root)

    const domains = [
      goldenDomain('A', [
        ['a1', { x: 2 }],
        ['a2', { x: 8 }],
      ]),
      goldenDomain('B', [
        ['b1', { y: 3 }],
        ['b2', { y: 10 }],
      ]),
    ]

    it('passes with admissible LP bounds', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      expect(result.ok).toBe(true)
      // min(8, 10) = 8 is the max possible value
      const fullyUnassigned = result.tightnessRecords.find(
        (r) => r.assignedCandidateIds.length === 0
      )
      expect(fullyUnassigned!.maxCompletionScalar).toBe(8)
    })
  })

  describe('global constants', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const c = b.read('c')
    const root = b.add(x, c)
    const graph = b.build(root)

    const domains = [
      goldenDomain('A', [
        ['a1', { x: 1 }],
        ['a2', { x: 5 }],
      ]),
    ]

    it('includes global constants in evaluation', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
        globalConstants: new Map([['c', 100]]),
      })

      expect(result.ok).toBe(true)
      // Max is 5 + 100 = 105
      const fullyUnassigned = result.tightnessRecords.find(
        (r) => r.assignedCandidateIds.length === 0
      )
      expect(fullyUnassigned!.maxCompletionScalar).toBe(105)
    })
  })

  describe('single-domain problem', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const root = b.affineForm(0, [{ coeff: 2, childId: x }])
    const graph = b.build(root)

    const domains = [
      goldenDomain('A', [
        ['a1', { x: 3 }],
        ['a2', { x: 7 }],
        ['a3', { x: 10 }],
      ]),
    ]

    it('checks only the fully-unassigned partial', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      expect(result.ok).toBe(true)
      // Only one partial: fully unassigned
      expect(result.partialAssignmentsChecked).toBe(1)
      expect(result.tightnessRecords[0]!.maxCompletionScalar).toBe(20) // 2*10
    })
  })

  describe('three-domain problem', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const z = b.read('z')
    const root = b.add(x, y, z)
    const graph = b.build(root)

    const domains = [
      goldenDomain('A', [
        ['a1', { x: 1 }],
        ['a2', { x: 3 }],
      ]),
      goldenDomain('B', [
        ['b1', { y: 10 }],
        ['b2', { y: 20 }],
      ]),
      goldenDomain('C', [
        ['c1', { z: 100 }],
        ['c2', { z: 200 }],
      ]),
    ]

    it('checks multiple depths of partial assignments', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      expect(result.ok).toBe(true)
      expect(result.totalCombinations).toBe(8) // 2 × 2 × 2
      // Partials: fully-unassigned (1) + depth-1 (2) + depth-2 (2×2=4) = 7
      expect(result.partialAssignmentsChecked).toBe(7)
    })
  })

  describe('maxPartialChecks limit', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.add(x, y)
    const graph = b.build(root)

    const domains = [
      goldenDomain('A', [
        ['a1', { x: 1 }],
        ['a2', { x: 3 }],
        ['a3', { x: 5 }],
        ['a4', { x: 7 }],
      ]),
      goldenDomain('B', [
        ['b1', { y: 2 }],
        ['b2', { y: 4 }],
        ['b3', { y: 6 }],
        ['b4', { y: 8 }],
      ]),
    ]

    it('limits the number of partial assignments checked', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
        maxPartialChecks: 3,
      })

      expect(result.partialAssignmentsChecked).toBeLessThanOrEqual(3)
      expect(result.lpSolveInvocations).toBeLessThanOrEqual(3)
    })
  })

  describe('violation detection', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.add(x, y)
    const graph = b.build(root)

    const domains = [
      goldenDomain('A', [
        ['a1', { x: 10 }],
        ['a2', { x: 20 }],
      ]),
      goldenDomain('B', [
        ['b1', { y: 30 }],
        ['b2', { y: 40 }],
      ]),
    ]

    it('detects inadmissible LP bounds', () => {
      // Max is 20 + 40 = 60, but provider says 25
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createInadmissibleMockProvider(25),
      })

      expect(result.ok).toBe(false)
      expect(result.violations.length).toBeGreaterThan(0)

      for (const v of result.violations) {
        expect(v.message).toContain('LP upper bound')
      }
    })

    it('accepts tight but admissible bounds', () => {
      // For a linear formula, the admissible mock produces exactly-tight bounds
      // (variable upper bound = interval upper bound for linear)
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      expect(result.ok).toBe(true)
      // All bounds should be tight for a linear formula
      for (const record of result.tightnessRecords) {
        expect(record.lpGap).toBeGreaterThanOrEqual(-1e-9)
      }
    })
  })

  describe('composite GI-like damage formula', () => {
    it('validates LP admissibility for multi-operator graph', () => {
      const b = new LapicFirGraphBuilder()
      const atk = b.read('atk')
      const dmgBonus = b.read('dmgBonus')
      const critRate = b.read('critRate')
      const critDmg = b.read('critDmg')
      const one = b.constant(1)

      // critMult = 1 + critRate * critDmg
      const critProd = b.bilinearKernel(critRate, critDmg)
      const critMult = b.add(one, critProd)

      // dmgMult = 1 + dmgBonus
      const dmgMult = b.add(one, dmgBonus)

      // atk * dmgMult  (simplified, no triple product to keep domains small)
      const root = b.bilinearKernel(atk, dmgMult)
      const graph = b.build(root)

      const domains = [
        goldenDomain('weapon', [
          ['w1', { atk: 500, dmgBonus: 0.2 }],
          ['w2', { atk: 700, dmgBonus: 0.1 }],
          ['w3', { atk: 600, dmgBonus: 0.3 }],
        ]),
        goldenDomain('artifact', [
          ['a1', { critRate: 0.3, critDmg: 0.6 }],
          ['a2', { critRate: 0.5, critDmg: 1.0 }],
          ['a3', { critRate: 0.7, critDmg: 0.4 }],
        ]),
      ]

      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      expect(result.ok).toBe(true)
      expect(result.totalCombinations).toBe(9)
      expect(result.partialAssignmentsChecked).toBeGreaterThan(0)

      // Verify meaningful tightness data was collected
      for (const record of result.tightnessRecords) {
        expect(Number.isFinite(record.lpUpperBound)).toBe(true)
        expect(Number.isFinite(record.intervalUpperBound)).toBe(true)
        expect(Number.isFinite(record.maxCompletionScalar)).toBe(true)
        expect(record.lpGap).toBeGreaterThanOrEqual(-1e-9)
      }
    })
  })

  describe('result structure', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.add(x, y)
    const graph = b.build(root)

    const domains = [
      goldenDomain('A', [
        ['a1', { x: 1 }],
        ['a2', { x: 3 }],
      ]),
      goldenDomain('B', [
        ['b1', { y: 2 }],
        ['b2', { y: 4 }],
      ]),
    ]

    it('has correct summary statistics', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      expect(result.totalCombinations).toBe(4)
      expect(result.partialAssignmentsChecked).toBe(3) // unassigned + a1 + a2
      expect(result.lpSolveInvocations).toBe(3)
      expect(result.tightnessRecords).toHaveLength(3)
      expect(Number.isFinite(result.averageLpGap)).toBe(true)
      expect(Number.isFinite(result.averageIntervalGap)).toBe(true)
      expect(result.averageLpGap).toBeGreaterThanOrEqual(0)
      expect(result.averageIntervalGap).toBeGreaterThanOrEqual(0)
    })

    it('counts tightness correctly', () => {
      const result = runLapicLpGoldenHarness({
        graph,
        domains,
        lpProvider: createAdmissibleMockProvider(),
      })

      expect(
        result.lpTighterCount + result.equalTightnessCount
      ).toBeLessThanOrEqual(result.partialAssignmentsChecked)
    })
  })
})
