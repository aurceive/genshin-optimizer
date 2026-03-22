import { describe, expect, it } from 'vitest'
import { LapicFirGraphBuilder } from '../fir/builders'
import { analyzeLapicFirGraph } from './analysis'
import { inferForcedBranches } from './branch-inference'
import { validateLapicAirGraph } from './validation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAndAnalyze(setup: (b: LapicFirGraphBuilder) => string) {
  const b = new LapicFirGraphBuilder()
  const rootId = setup(b)
  const graph = b.build(rootId)
  const airGraph = analyzeLapicFirGraph(graph)
  return { graph, airGraph, rootId }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('A-IR analysis engine', () => {
  describe('constant nodes', () => {
    it('computes exact bounds for a constant', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) => b.constant(42))

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.exactLower).toBe(42)
      expect(ann.exactUpper).toBe(42)
      expect(ann.curvature).toBe('affine')
      expect(ann.requiredVariables).toBeUndefined()
    })
  })

  describe('read nodes', () => {
    it('marks the variable as required and increasing', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) => b.read('x'))

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.requiredVariables).toBeDefined()
      expect(ann.requiredVariables!.has('x')).toBe(true)
      expect(ann.monotonicityByVariable!.get('x')).toBe('increasing')
      expect(ann.curvature).toBe('affine')
    })
  })

  describe('add nodes', () => {
    it('computes bounds for sum of constants', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.add(b.constant(10), b.constant(20))
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.exactLower).toBe(30)
      expect(ann.exactUpper).toBe(30)
      expect(ann.curvature).toBe('affine')
    })

    it('preserves monotonicity through addition', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.add(b.read('x'), b.read('y'))
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.monotonicityByVariable!.get('x')).toBe('increasing')
      expect(ann.monotonicityByVariable!.get('y')).toBe('increasing')
      expect(ann.requiredVariables!.size).toBe(2)
    })
  })

  describe('mul nodes', () => {
    it('computes bounds for product of constants', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.mul(b.constant(3), b.constant(7))
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.exactLower).toBe(21)
      expect(ann.exactUpper).toBe(21)
    })

    it('determines monotonicity when co-factor is non-negative constant', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.mul(b.read('x'), b.constant(5))
      )

      const ann = airGraph.annotations.get(rootId)!
      // constant 5 ≥ 0, so x is increasing
      expect(ann.monotonicityByVariable!.get('x')).toBe('increasing')
    })

    it('flips monotonicity when co-factor is non-positive constant', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.mul(b.read('x'), b.constant(-3))
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.monotonicityByVariable!.get('x')).toBe('decreasing')
    })

    it('detects nonlinear interactions between variables', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.mul(b.read('x'), b.read('y'))
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.nonlinearInteractions).toBeDefined()
      expect(ann.nonlinearInteractions!.size).toBe(1)
    })
  })

  describe('neg nodes', () => {
    it('flips bounds and monotonicity', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.neg(b.read('x'))
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.monotonicityByVariable!.get('x')).toBe('decreasing')
    })
  })

  describe('min/max nodes', () => {
    it('min is concave', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.min(b.read('x'), b.read('y'))
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.curvature).toBe('concave')
    })

    it('max is convex', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.max(b.read('x'), b.read('y'))
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.curvature).toBe('convex')
    })

    it('min computes correct bounds from constants', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.min(b.constant(10), b.constant(20))
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.exactLower).toBe(10)
      expect(ann.exactUpper).toBe(10)
    })

    it('max computes correct bounds from constants', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.max(b.constant(10), b.constant(20))
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.exactLower).toBe(20)
      expect(ann.exactUpper).toBe(20)
    })
  })

  describe('thresholdSelect nodes', () => {
    it('forces then-branch when guard lower bound >= threshold', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.thresholdSelect(
          b.constant(10), // guard = 10, always >= 5
          5,              // threshold
          b.constant(100), // then
          b.constant(0)    // else
        )
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.exactLower).toBe(100)
      expect(ann.exactUpper).toBe(100)
      expect(ann.branchControlSet).toBeDefined()
      expect(ann.branchControlSet!.size).toBeGreaterThanOrEqual(1)
    })

    it('forces else-branch when guard upper bound < threshold', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.thresholdSelect(
          b.constant(3), // guard = 3, always < 5
          5,              // threshold
          b.constant(100), // then
          b.constant(0)    // else
        )
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.exactLower).toBe(0)
      expect(ann.exactUpper).toBe(0)
    })

    it('emits regions for threshold branching', () => {
      const { airGraph } = buildAndAnalyze((b) =>
        b.thresholdSelect(
          b.read('x'), // guard is variable → both branches possible
          5,
          b.constant(100),
          b.constant(0)
        )
      )

      // Should have 3 regions: parent + then + else
      expect(airGraph.regions.length).toBe(3)
      const parent = airGraph.regions.find((r) => r.childRegionIds.length > 0)!
      expect(parent.childRegionIds).toHaveLength(2)
    })

    it('provides conservative bounds when both branches possible', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.thresholdSelect(
          b.read('x'),
          5,
          b.constant(100),
          b.constant(0)
        )
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.exactLower).toBe(0)
      expect(ann.exactUpper).toBe(100)
    })
  })

  describe('resistanceTransform', () => {
    it('flips monotonicity (higher resistance → lower multiplier)', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.resistanceTransform(b.read('res'))
      )

      const ann = airGraph.annotations.get(rootId)!
      expect(ann.monotonicityByVariable!.get('res')).toBe('decreasing')
    })

    it('computes bounds for constant resistance', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) =>
        b.resistanceTransform(b.constant(0.1))
      )

      const ann = airGraph.annotations.get(rootId)!
      // res = 0.1, in [0, 0.75) range: 1 - 0.1 = 0.9
      expect(ann.exactLower).toBeCloseTo(0.9, 10)
      expect(ann.exactUpper).toBeCloseTo(0.9, 10)
    })
  })

  describe('composite formulas', () => {
    it('GI damage formula: (baseDmg + flat) * (1 + cr*cd) * resMult', () => {
      const { airGraph, rootId } = buildAndAnalyze((b) => {
        const base = b.add(b.read('baseDmg'), b.read('flat'))
        const crit = b.add(b.constant(1), b.mul(b.read('cr'), b.read('cd')))
        const resMult = b.resistanceTransform(b.read('res'))
        return b.mul(base, crit, resMult)
      })

      const rootAnn = airGraph.annotations.get(rootId)!

      // Required variables: all 5
      expect(rootAnn.requiredVariables!.size).toBe(5)
      expect(rootAnn.requiredVariables!.has('baseDmg')).toBe(true)
      expect(rootAnn.requiredVariables!.has('flat')).toBe(true)
      expect(rootAnn.requiredVariables!.has('cr')).toBe(true)
      expect(rootAnn.requiredVariables!.has('cd')).toBe(true)
      expect(rootAnn.requiredVariables!.has('res')).toBe(true)

      // cr and cd should have nonlinear interaction
      expect(rootAnn.nonlinearInteractions!.size).toBeGreaterThan(0)

      // Root sufficient variables match F-IR's variable set
      expect(airGraph.rootRequiredVariables.size).toBe(5)
    })
  })

  describe('branch inference', () => {
    it('detects forced then-branch when guard lower bound >= threshold', () => {
      const { airGraph } = buildAndAnalyze((b) =>
        b.thresholdSelect(
          b.constant(10), // guard = 10, always >= 5
          5,
          b.constant(100),
          b.constant(0)
        )
      )

      const forced = inferForcedBranches(airGraph)
      expect(forced).toHaveLength(1)
      expect(forced[0]!.forcedArm).toBe('then')
      expect(forced[0]!.guardLower).toBe(10)
      expect(forced[0]!.guardUpper).toBe(10)
    })

    it('detects forced else-branch when guard upper bound < threshold', () => {
      const { airGraph } = buildAndAnalyze((b) =>
        b.thresholdSelect(
          b.constant(3), // guard = 3, always < 5
          5,
          b.constant(100),
          b.constant(0)
        )
      )

      const forced = inferForcedBranches(airGraph)
      expect(forced).toHaveLength(1)
      expect(forced[0]!.forcedArm).toBe('else')
    })

    it('returns empty when neither branch is forced', () => {
      const { airGraph } = buildAndAnalyze((b) =>
        b.thresholdSelect(
          b.read('x'), // variable guard → both branches possible
          5,
          b.constant(100),
          b.constant(0)
        )
      )

      const forced = inferForcedBranches(airGraph)
      expect(forced).toHaveLength(0)
    })

    it('detects multiple forced branches in a complex graph', () => {
      const { airGraph } = buildAndAnalyze((b) => {
        const branch1 = b.thresholdSelect(
          b.constant(10), 5,
          b.read('x'), b.constant(0)
        )
        const branch2 = b.thresholdSelect(
          b.constant(1), 5,
          b.constant(100), b.read('y')
        )
        return b.add(branch1, branch2)
      })

      const forced = inferForcedBranches(airGraph)
      expect(forced).toHaveLength(2)
      expect(forced.some((f) => f.forcedArm === 'then')).toBe(true)
      expect(forced.some((f) => f.forcedArm === 'else')).toBe(true)
    })

    it('includes region IDs in evidence', () => {
      const { airGraph } = buildAndAnalyze((b) =>
        b.thresholdSelect(
          b.constant(10), 5,
          b.constant(100), b.constant(0)
        )
      )

      const forced = inferForcedBranches(airGraph)
      expect(forced[0]!.parentRegionId).toMatch(/^region:threshold:/)
      expect(forced[0]!.feasibleRegionId).toMatch(/:then$/)
      expect(forced[0]!.infeasibleRegionId).toMatch(/:else$/)
    })
  })

  describe('validation', () => {
    it('validates a well-formed A-IR graph', () => {
      const { airGraph } = buildAndAnalyze((b) =>
        b.add(b.read('x'), b.mul(b.read('y'), b.constant(2)))
      )

      const result = validateLapicAirGraph(airGraph)
      expect(result.ok).toBe(true)
    })

    it('validates a graph with threshold regions', () => {
      const { airGraph } = buildAndAnalyze((b) =>
        b.thresholdSelect(
          b.read('x'), 5,
          b.read('y'), b.constant(0)
        )
      )

      const result = validateLapicAirGraph(airGraph)
      expect(result.ok).toBe(true)
    })
  })
})
