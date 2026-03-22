import { LapicFirGraphBuilder } from '../fir/builders'
import { evaluateLapicFirIntervals } from '../fir/interval-eval'
import { evaluateLapicFirScalar } from '../fir/scalar-eval'
import type { LapicInterval } from '../interval/types'
import type { LapicFirVariableId } from '../fir/types'
import { buildLinearModelFromFir } from './model-builder'
import { validateLinearModel } from './validation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bounds(
  ...entries: [string, number, number][]
): ReadonlyMap<LapicFirVariableId, LapicInterval> {
  return new Map(entries.map(([id, lo, hi]) => [id, { lo, hi }]))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildLinearModelFromFir', () => {
  describe('constant-only graph', () => {
    it('produces a valid model with a single fixed variable', () => {
      const b = new LapicFirGraphBuilder()
      const root = b.constant(42)
      const graph = b.build(root)

      const result = buildLinearModelFromFir(graph, new Map(), 'test-const')
      expect(result.model.variables).toHaveLength(1)
      expect(result.model.variables[0]!.lowerBound).toBe(42)
      expect(result.model.variables[0]!.upperBound).toBe(42)
      expect(result.model.objective.coefficients).toEqual([1])
      expect(result.relaxedNodeIds.size).toBe(0)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('read variable graph', () => {
    it('creates a variable with provided bounds', () => {
      const b = new LapicFirGraphBuilder()
      const root = b.read('x')
      const graph = b.build(root)

      const vb = bounds(['x', 10, 50])
      const result = buildLinearModelFromFir(graph, vb, 'test-read')

      expect(result.model.variables).toHaveLength(1)
      expect(result.model.variables[0]!.lowerBound).toBe(10)
      expect(result.model.variables[0]!.upperBound).toBe(50)
      expect(result.relaxedNodeIds.size).toBe(0)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })

    it('defaults to unbounded when no bounds provided', () => {
      const b = new LapicFirGraphBuilder()
      const root = b.read('y')
      const graph = b.build(root)

      const result = buildLinearModelFromFir(graph, new Map(), 'test-unbound')
      expect(result.model.variables[0]!.lowerBound).toBe(-Infinity)
      expect(result.model.variables[0]!.upperBound).toBe(Infinity)
    })
  })

  describe('add operator (exact)', () => {
    it('emits equality constraint: y = a + b', () => {
      const b = new LapicFirGraphBuilder()
      const a = b.read('a')
      const bv = b.read('b')
      const root = b.add(a, bv)
      const graph = b.build(root)

      const vb = bounds(['a', 0, 10], ['b', 0, 20])
      const result = buildLinearModelFromFir(graph, vb, 'test-add')

      // 3 variables: a, b, add_result
      expect(result.model.variables).toHaveLength(3)
      // 1 constraint: y - a - b = 0
      expect(result.model.constraints).toHaveLength(1)
      const c = result.model.constraints[0]!
      expect(c.lowerBound).toBe(0)
      expect(c.upperBound).toBe(0)
      expect(result.relaxedNodeIds.size).toBe(0)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('neg operator (exact)', () => {
    it('emits equality constraint: y + child = 0', () => {
      const b = new LapicFirGraphBuilder()
      const x = b.read('x')
      const root = b.neg(x)
      const graph = b.build(root)

      const vb = bounds(['x', 5, 15])
      const result = buildLinearModelFromFir(graph, vb, 'test-neg')

      expect(result.model.variables).toHaveLength(2)
      expect(result.model.constraints).toHaveLength(1)
      // y bounds should be [-15, -5]
      const yVar = result.model.variables.find((v) => v.name.startsWith('neg_'))!
      expect(yVar.lowerBound).toBe(-15)
      expect(yVar.upperBound).toBe(-5)
      expect(result.relaxedNodeIds.size).toBe(0)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('affineForm operator (exact)', () => {
    it('emits equality constraint: y = bias + Σ coeff*child', () => {
      const b = new LapicFirGraphBuilder()
      const x = b.read('x')
      const y = b.read('y')
      const root = b.affineForm(10, [
        { coeff: 3, childId: x },
        { coeff: -2, childId: y },
      ])
      const graph = b.build(root)

      const vb = bounds(['x', 0, 5], ['y', 0, 3])
      const result = buildLinearModelFromFir(graph, vb, 'test-affine')

      // 3 variables: x, y, affine_result
      expect(result.model.variables).toHaveLength(3)
      // 1 constraint: result - 3*x + 2*y = 10
      expect(result.model.constraints).toHaveLength(1)
      expect(result.relaxedNodeIds.size).toBe(0)

      // Verify bound computation: bias + [3*0, 3*5] + [-2*3, -2*0] = 10 + [0,15] + [-6,0] = [4, 25]
      const affVar = result.model.variables.find((v) =>
        v.name.startsWith('affine_')
      )!
      expect(affVar.lowerBound).toBe(4)
      expect(affVar.upperBound).toBe(25)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('min operator (relaxed)', () => {
    it('emits upper-bound constraints: y ≤ each child', () => {
      const b = new LapicFirGraphBuilder()
      const a = b.read('a')
      const bv = b.read('b')
      const root = b.min(a, bv)
      const graph = b.build(root)

      const vb = bounds(['a', 0, 10], ['b', 5, 20])
      const result = buildLinearModelFromFir(graph, vb, 'test-min')

      expect(result.model.variables).toHaveLength(3)
      // 2 constraints: y - a ≤ 0, y - b ≤ 0
      expect(result.model.constraints).toHaveLength(2)
      expect(result.relaxedNodeIds.has(graph.rootId)).toBe(true)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('max operator (relaxed)', () => {
    it('emits lower-bound constraints: y ≥ each child', () => {
      const b = new LapicFirGraphBuilder()
      const a = b.read('a')
      const bv = b.read('b')
      const root = b.max(a, bv)
      const graph = b.build(root)

      const vb = bounds(['a', 0, 10], ['b', 5, 20])
      const result = buildLinearModelFromFir(graph, vb, 'test-max')

      expect(result.model.variables).toHaveLength(3)
      // 2 constraints: y - a ≥ 0, y - b ≥ 0
      expect(result.model.constraints).toHaveLength(2)
      expect(result.relaxedNodeIds.has(graph.rootId)).toBe(true)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('saturatingKernel (relaxed)', () => {
    it('emits y ≤ child and y ≤ cap', () => {
      const b = new LapicFirGraphBuilder()
      const x = b.read('x')
      const root = b.saturatingKernel(x, 100)
      const graph = b.build(root)

      const vb = bounds(['x', 50, 200])
      const result = buildLinearModelFromFir(graph, vb, 'test-sat')

      expect(result.model.constraints).toHaveLength(2)
      expect(result.relaxedNodeIds.has(graph.rootId)).toBe(true)
      // y upper bound should be min(200, 100) = 100
      const yVar = result.model.variables.find((v) => v.name.startsWith('sat_'))!
      expect(yVar.upperBound).toBe(100)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('bilinearKernel (McCormick relaxation)', () => {
    it('emits 4 McCormick envelope constraints', () => {
      const b = new LapicFirGraphBuilder()
      const a = b.read('a')
      const bv = b.read('b')
      const root = b.bilinearKernel(a, bv)
      const graph = b.build(root)

      const vb = bounds(['a', 2, 5], ['b', 3, 7])
      const result = buildLinearModelFromFir(graph, vb, 'test-bilinear')

      // 3 variables: a, b, product
      expect(result.model.variables).toHaveLength(3)
      // 4 McCormick constraints
      expect(result.model.constraints).toHaveLength(4)
      expect(result.relaxedNodeIds.has(graph.rootId)).toBe(true)
      // Product bounds: [2*3, 5*7] = [6, 35]
      const yVar = result.model.variables.find((v) =>
        v.name.startsWith('prod_')
      )!
      expect(yVar.lowerBound).toBe(6)
      expect(yVar.upperBound).toBe(35)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('thresholdSelect (relaxed)', () => {
    it('emits envelope constraints over both branches', () => {
      const b = new LapicFirGraphBuilder()
      const guard = b.read('g')
      const thenBranch = b.constant(100)
      const elseBranch = b.constant(50)
      const root = b.thresholdSelect(guard, 0.5, thenBranch, elseBranch)
      const graph = b.build(root)

      const vb = bounds(['g', 0, 1])
      const result = buildLinearModelFromFir(graph, vb, 'test-thresh')

      // 4 variables: g, const_100, const_50, thresh_result
      expect(result.model.variables).toHaveLength(4)
      // 2 envelope constraints
      expect(result.model.constraints).toHaveLength(2)
      expect(result.relaxedNodeIds.has(graph.rootId)).toBe(true)
      // y ∈ [50, 100]
      const yVar = result.model.variables.find((v) =>
        v.name.startsWith('thresh_')
      )!
      expect(yVar.lowerBound).toBe(50)
      expect(yVar.upperBound).toBe(100)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('resistanceTransform (relaxed)', () => {
    it('emits a linear upper envelope constraint', () => {
      const b = new LapicFirGraphBuilder()
      const res = b.read('res')
      const root = b.resistanceTransform(res)
      const graph = b.build(root)

      const vb = bounds(['res', 0, 0.5])
      const result = buildLinearModelFromFir(graph, vb, 'test-res')

      // At least 1 constraint (upper envelope)
      expect(result.model.constraints.length).toBeGreaterThanOrEqual(1)
      expect(result.relaxedNodeIds.has(graph.rootId)).toBe(true)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('piecewiseAffineKernel (relaxed)', () => {
    it('emits per-segment upper-bound constraints', () => {
      const b = new LapicFirGraphBuilder()
      const x = b.read('x')
      const root = b.piecewiseAffineKernel(x, [
        { breakpoint: 0, slope: 1, intercept: 0 },
        { breakpoint: 10, slope: 2, intercept: 10 },
      ])
      const graph = b.build(root)

      const vb = bounds(['x', 0, 20])
      const result = buildLinearModelFromFir(graph, vb, 'test-pwa')

      // 2 segments → 2 constraints
      expect(result.model.constraints).toHaveLength(2)
      expect(result.relaxedNodeIds.has(graph.rootId)).toBe(true)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('composite graph: additive GI damage formula', () => {
    it('produces an admissible LP upper bound', () => {
      // Formula: atk * (1 + dmgBonus) * critMultiplier
      // where critMultiplier = 1 + critRate * critDmg
      const b = new LapicFirGraphBuilder()
      const atk = b.read('atk')
      const dmgBonus = b.read('dmgBonus')
      const critRate = b.read('critRate')
      const critDmg = b.read('critDmg')
      const one = b.constant(1)

      // critMultiplier = 1 + critRate * critDmg
      const critProd = b.bilinearKernel(critRate, critDmg)
      const critMult = b.add(one, critProd)

      // 1 + dmgBonus
      const dmgMult = b.add(one, dmgBonus)

      // atk * dmgMult * critMult
      const root = b.multilinearKernel(atk, dmgMult, critMult)
      const graph = b.build(root)

      const vb = bounds(
        ['atk', 2000, 3000],
        ['dmgBonus', 0.5, 1.5],
        ['critRate', 0.5, 1.0],
        ['critDmg', 1.0, 2.5]
      )

      const result = buildLinearModelFromFir(graph, vb, 'gi-damage')
      expect(validateLinearModel(result.model).ok).toBe(true)
      expect(result.relaxedNodeIds.size).toBeGreaterThan(0)

      // Verify LP upper bound is admissible by comparing against
      // interval evaluation (LP bound should be ≤ interval bound)
      const intervalResult = evaluateLapicFirIntervals(graph, vb)
      const lpRootVar = result.model.variables[
        result.nodeVariableIndex.get(graph.rootId)!
      ]!
      expect(lpRootVar.upperBound).toBeLessThanOrEqual(
        intervalResult.rootBound.hi
      )

      // Verify a concrete scalar point falls within LP variable bounds
      const scalarEnv = new Map<LapicFirVariableId, number>([
        ['atk', 2500],
        ['dmgBonus', 1.0],
        ['critRate', 0.75],
        ['critDmg', 1.5],
      ])
      const scalarResult = evaluateLapicFirScalar(graph, scalarEnv)
      expect(scalarResult.rootValue).toBeLessThanOrEqual(
        lpRootVar.upperBound + 1e-9
      )
    })
  })

  describe('model digest and nodeVariableIndex', () => {
    it('preserves the provided model digest', () => {
      const b = new LapicFirGraphBuilder()
      const root = b.constant(1)
      const graph = b.build(root)

      const result = buildLinearModelFromFir(graph, new Map(), 'my-digest-123')
      expect(result.model.modelDigest).toBe('my-digest-123')
    })

    it('maps every graph node to an LP variable index', () => {
      const b = new LapicFirGraphBuilder()
      const x = b.read('x')
      const y = b.read('y')
      const root = b.add(x, y)
      const graph = b.build(root)

      const vb = bounds(['x', 0, 1], ['y', 0, 1])
      const result = buildLinearModelFromFir(graph, vb, 'test-idx')

      // Every node in the graph has an LP variable
      for (const nodeId of graph.nodes.keys()) {
        expect(result.nodeVariableIndex.has(nodeId)).toBe(true)
        const idx = result.nodeVariableIndex.get(nodeId)!
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThan(result.model.variables.length)
      }
    })
  })

  describe('mul operator edge cases', () => {
    it('handles empty product as constant 1', () => {
      // Can't build empty mul via builder, so test unary
      const b = new LapicFirGraphBuilder()
      const x = b.read('x')
      const root = b.mul(x) // unary product = identity
      const graph = b.build(root)

      const vb = bounds(['x', 3, 7])
      const result = buildLinearModelFromFir(graph, vb, 'test-unary-mul')

      // 2 variables: x and prod
      expect(result.model.variables).toHaveLength(2)
      // 1 equality constraint: prod = x
      expect(result.model.constraints).toHaveLength(1)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })

    it('handles 3-way product via pairwise McCormick', () => {
      const b = new LapicFirGraphBuilder()
      const a = b.read('a')
      const bv = b.read('b')
      const c = b.read('c')
      const root = b.mul(a, bv, c)
      const graph = b.build(root)

      const vb = bounds(['a', 1, 2], ['b', 1, 3], ['c', 1, 4])
      const result = buildLinearModelFromFir(graph, vb, 'test-3-mul')

      // 3 reads + 1 aux product + 1 final product = 5 variables
      expect(result.model.variables).toHaveLength(5)
      // 2 bilinear pairs × 4 McCormick constraints = 8
      expect(result.model.constraints).toHaveLength(8)
      expect(validateLinearModel(result.model).ok).toBe(true)
    })
  })

  describe('all models pass structural validation', () => {
    it('every generated model satisfies validateLinearModel', () => {
      // Build a graph with every operator type
      const b = new LapicFirGraphBuilder()
      const x = b.read('x')
      const y = b.read('y')
      const c5 = b.constant(5)
      const sum = b.add(x, y)
      const negX = b.neg(x)
      const aff = b.affineForm(2, [
        { coeff: 3, childId: x },
        { coeff: -1, childId: y },
      ])
      const mn = b.min(x, y)
      const mx = b.max(x, y)
      const prod = b.bilinearKernel(x, y)
      const sat = b.saturatingKernel(sum, 15)
      const thresh = b.thresholdSelect(x, 5, c5, y)
      const root = b.add(aff, mn, mx, prod, sat, thresh, negX)
      const graph = b.build(root)

      const vb = bounds(['x', 1, 10], ['y', 2, 8])
      const result = buildLinearModelFromFir(graph, vb, 'test-all-ops')

      expect(validateLinearModel(result.model).ok).toBe(true)
      expect(result.model.variables.length).toBeGreaterThan(0)
      expect(result.model.constraints.length).toBeGreaterThan(0)
    })
  })
})
