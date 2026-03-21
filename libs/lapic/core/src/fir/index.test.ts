import { describe, expect, it } from 'vitest'
import { LapicFirGraphBuilder } from './builders'
import { validateLapicFirGraph } from './validation'
import { evaluateLapicFirIntervals } from './interval-eval'
import { evaluateLapicFirScalar } from './scalar-eval'
import { runLapicGoldenHarness } from './golden-harness'
import { lapicInterval, lapicIntervalPoint } from '../interval/types'
import { lapicFirNodeChildIds } from './types'
import type { LapicFirNode } from './types'

// =========================================================================
// Graph Builder
// =========================================================================

describe('LapicFirGraphBuilder', () => {
  it('builds a simple constant graph', () => {
    const b = new LapicFirGraphBuilder()
    const c = b.constant(42)
    const g = b.build(c)

    expect(g.rootId).toBe(c)
    expect(g.nodes.size).toBe(1)
    expect(g.nodes.get(c)!.operator).toBe('constant')
    expect(g.variableIds.size).toBe(0)
  })

  it('builds a graph with variables', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const sum = b.add(x, y)
    const g = b.build(sum)

    expect(g.nodes.size).toBe(3)
    expect(g.variableIds).toEqual(new Set(['x', 'y']))
  })

  it('hash-conses duplicate constants', () => {
    const b = new LapicFirGraphBuilder()
    const c1 = b.constant(7)
    const c2 = b.constant(7)
    expect(c1).toBe(c2)

    const g = b.build(c1)
    expect(g.nodes.size).toBe(1)
  })

  it('hash-conses duplicate reads', () => {
    const b = new LapicFirGraphBuilder()
    const x1 = b.read('x')
    const x2 = b.read('x')
    expect(x1).toBe(x2)
  })

  it('hash-conses commutative operations', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const add1 = b.add(x, y)
    const add2 = b.add(y, x)
    expect(add1).toBe(add2)
  })

  it('builds complex expressions', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('atk')
    const y = b.read('dmgBonus')
    const baseDmg = b.mul(x, y)
    const cap = b.saturatingKernel(baseDmg, 9999)
    const g = b.build(cap)

    expect(g.nodes.size).toBe(4) // x, y, mul, saturate
    expect(g.variableIds).toEqual(new Set(['atk', 'dmgBonus']))
  })

  it('builds affine form', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const af = b.affineForm(10, [
      { coeff: 2, childId: x },
      { coeff: -1, childId: y },
    ])
    const g = b.build(af)

    expect(g.nodes.size).toBe(3)
    const node = g.nodes.get(af)!
    expect(node.operator).toBe('affineForm')
  })

  it('builds threshold select', () => {
    const b = new LapicFirGraphBuilder()
    const guard = b.read('hp')
    const high = b.constant(100)
    const low = b.constant(50)
    const sel = b.thresholdSelect(guard, 0.5, high, low)
    const g = b.build(sel)

    expect(g.nodes.size).toBe(4)
    const node = g.nodes.get(sel)!
    expect(node.operator).toBe('thresholdSelect')
  })

  it('builds resistance transform', () => {
    const b = new LapicFirGraphBuilder()
    const res = b.read('enemyRes')
    const rt = b.resistanceTransform(res)
    const g = b.build(rt)

    expect(g.nodes.size).toBe(2)
  })

  it('builds bilinear kernel with commutative hash-consing', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const bl1 = b.bilinearKernel(x, y)
    const bl2 = b.bilinearKernel(y, x)
    expect(bl1).toBe(bl2)
  })

  it('builds piecewise-affine kernel', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const pw = b.piecewiseAffineKernel(x, [
      { breakpoint: 0, slope: 1, intercept: 0 },
      { breakpoint: 10, slope: 0.5, intercept: 10 },
    ])
    const g = b.build(pw)

    expect(g.nodes.size).toBe(2)
  })

  it('throws when building with missing root', () => {
    const b = new LapicFirGraphBuilder()
    b.constant(1)
    expect(() => b.build('nonexistent')).toThrow('Root node')
  })
})

// =========================================================================
// Node child traversal
// =========================================================================

describe('lapicFirNodeChildIds', () => {
  it('returns empty for constant', () => {
    const node: LapicFirNode = { nodeId: 'c', operator: 'constant', value: 1 }
    expect(lapicFirNodeChildIds(node)).toEqual([])
  })

  it('returns empty for read', () => {
    const node: LapicFirNode = { nodeId: 'r', operator: 'read', variableId: 'x' }
    expect(lapicFirNodeChildIds(node)).toEqual([])
  })

  it('returns childIds for add', () => {
    const node: LapicFirNode = { nodeId: 'a', operator: 'add', childIds: ['x', 'y'] }
    expect(lapicFirNodeChildIds(node)).toEqual(['x', 'y'])
  })

  it('returns guard, then, else for thresholdSelect', () => {
    const node: LapicFirNode = {
      nodeId: 'ts',
      operator: 'thresholdSelect',
      guardId: 'g',
      threshold: 0.5,
      thenId: 't',
      elseId: 'e',
    }
    expect(lapicFirNodeChildIds(node)).toEqual(['g', 't', 'e'])
  })
})

// =========================================================================
// Validation
// =========================================================================

describe('validateLapicFirGraph', () => {
  it('passes valid graph', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const c = b.constant(2)
    const root = b.mul(x, c)
    const g = b.build(root)

    const result = validateLapicFirGraph(g)
    expect(result.ok).toBe(true)
  })

  it('fails with missing root', () => {
    const graph = {
      rootId: 'missing',
      nodes: new Map(),
      variableIds: new Set<string>(),
    }
    const result = validateLapicFirGraph(graph)
    expect(result.ok).toBe(false)
  })

  it('fails with dangling child reference', () => {
    const graph = {
      rootId: 'add1',
      nodes: new Map([
        ['add1', { nodeId: 'add1', operator: 'add' as const, childIds: ['x', 'missing'] }],
        ['x', { nodeId: 'x', operator: 'read' as const, variableId: 'x' }],
      ]),
      variableIds: new Set(['x']),
    }
    const result = validateLapicFirGraph(graph)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.message.includes('missing'))).toBe(true)
  })

  it('fails with too few children in add', () => {
    const graph = {
      rootId: 'add1',
      nodes: new Map([
        ['add1', { nodeId: 'add1', operator: 'add' as const, childIds: ['x'] }],
        ['x', { nodeId: 'x', operator: 'read' as const, variableId: 'x' }],
      ]),
      variableIds: new Set(['x']),
    }
    const result = validateLapicFirGraph(graph)
    expect(result.ok).toBe(false)
    expect(result.diagnostics.some((d) => d.message.includes('≥ 2'))).toBe(true)
  })

  it('warns about variable set mismatch', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const g = b.build(x)
    // Tamper with variable set
    const tampered = { ...g, variableIds: new Set(['x', 'phantom']) }
    const result = validateLapicFirGraph(tampered)
    expect(result.ok).toBe(true) // warnings don't fail
    expect(result.diagnostics.some((d) => d.message.includes('phantom'))).toBe(true)
  })

  it('fails on unsorted piecewise breakpoints', () => {
    const graph = {
      rootId: 'pw',
      nodes: new Map([
        ['x', { nodeId: 'x', operator: 'read' as const, variableId: 'x' }],
        ['pw', {
          nodeId: 'pw',
          operator: 'piecewiseAffineKernel' as const,
          childId: 'x',
          segments: [
            { breakpoint: 10, slope: 1, intercept: 0 },
            { breakpoint: 5, slope: 0.5, intercept: 10 },
          ],
        }],
      ]),
      variableIds: new Set(['x']),
    }
    const result = validateLapicFirGraph(graph)
    expect(result.ok).toBe(false)
  })
})

// =========================================================================
// Interval Evaluation
// =========================================================================

describe('evaluateLapicFirIntervals', () => {
  it('evaluates constant', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.constant(42)
    const g = b.build(root)

    const result = evaluateLapicFirIntervals(g, new Map())
    expect(result.rootBound.lo).toBe(42)
    expect(result.rootBound.hi).toBe(42)
  })

  it('evaluates variable from env', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.read('x')
    const g = b.build(root)

    const env = new Map([['x', lapicInterval(3, 7)]])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(3)
    expect(result.rootBound.hi).toBe(7)
  })

  it('evaluates addition: x + y', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.add(x, y)
    const g = b.build(root)

    const env = new Map([
      ['x', lapicInterval(1, 3)],
      ['y', lapicInterval(2, 5)],
    ])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(3)
    expect(result.rootBound.hi).toBe(8)
  })

  it('evaluates multiplication: x * y', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.mul(x, y)
    const g = b.build(root)

    const env = new Map([
      ['x', lapicInterval(2, 3)],
      ['y', lapicInterval(4, 5)],
    ])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(8)
    expect(result.rootBound.hi).toBe(15)
  })

  it('evaluates negation', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const root = b.neg(x)
    const g = b.build(root)

    const env = new Map([['x', lapicInterval(2, 5)]])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(-5)
    expect(result.rootBound.hi).toBe(-2)
  })

  it('evaluates min(x, y)', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.min(x, y)
    const g = b.build(root)

    const env = new Map([
      ['x', lapicInterval(1, 5)],
      ['y', lapicInterval(3, 7)],
    ])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(1)
    expect(result.rootBound.hi).toBe(5)
  })

  it('evaluates max(x, y)', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.max(x, y)
    const g = b.build(root)

    const env = new Map([
      ['x', lapicInterval(1, 5)],
      ['y', lapicInterval(3, 7)],
    ])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(3)
    expect(result.rootBound.hi).toBe(7)
  })

  it('evaluates affine form: 10 + 2x − y', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.affineForm(10, [
      { coeff: 2, childId: x },
      { coeff: -1, childId: y },
    ])
    const g = b.build(root)

    const env = new Map([
      ['x', lapicInterval(1, 3)],
      ['y', lapicInterval(2, 4)],
    ])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(8)
    expect(result.rootBound.hi).toBe(14)
  })

  it('evaluates threshold select with guard above', () => {
    const b = new LapicFirGraphBuilder()
    const guard = b.read('hp')
    const high = b.constant(100)
    const low = b.constant(50)
    const root = b.thresholdSelect(guard, 0.5, high, low)
    const g = b.build(root)

    // Guard is [0.8, 1.0] — entirely above 0.5
    const env = new Map([['hp', lapicInterval(0.8, 1.0)]])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(100)
    expect(result.rootBound.hi).toBe(100)
  })

  it('evaluates threshold select with guard below', () => {
    const b = new LapicFirGraphBuilder()
    const guard = b.read('hp')
    const high = b.constant(100)
    const low = b.constant(50)
    const root = b.thresholdSelect(guard, 0.5, high, low)
    const g = b.build(root)

    // Guard is [0.1, 0.3] — entirely below 0.5
    const env = new Map([['hp', lapicInterval(0.1, 0.3)]])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(50)
    expect(result.rootBound.hi).toBe(50)
  })

  it('evaluates threshold select with straddling guard', () => {
    const b = new LapicFirGraphBuilder()
    const guard = b.read('hp')
    const high = b.constant(100)
    const low = b.constant(50)
    const root = b.thresholdSelect(guard, 0.5, high, low)
    const g = b.build(root)

    // Guard is [0.3, 0.8] — straddles 0.5
    const env = new Map([['hp', lapicInterval(0.3, 0.8)]])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(50)
    expect(result.rootBound.hi).toBe(100)
  })

  it('evaluates resistance transform', () => {
    const b = new LapicFirGraphBuilder()
    const res = b.read('res')
    const root = b.resistanceTransform(res)
    const g = b.build(root)

    // res = 0.3 → 1 − 0.3 = 0.7
    const env = new Map([['res', lapicIntervalPoint(0.3)]])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBeCloseTo(0.7)
    expect(result.rootBound.hi).toBeCloseTo(0.7)
  })

  it('evaluates saturating kernel', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const root = b.saturatingKernel(x, 100)
    const g = b.build(root)

    const env = new Map([['x', lapicInterval(50, 200)]])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(50)
    expect(result.rootBound.hi).toBe(100)
  })

  it('evaluates bilinear kernel as product', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.bilinearKernel(x, y)
    const g = b.build(root)

    const env = new Map([
      ['x', lapicInterval(2, 3)],
      ['y', lapicInterval(4, 5)],
    ])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(8)
    expect(result.rootBound.hi).toBe(15)
  })

  it('evaluates multilinear kernel', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const z = b.read('z')
    const root = b.multilinearKernel(x, y, z)
    const g = b.build(root)

    const env = new Map([
      ['x', lapicIntervalPoint(2)],
      ['y', lapicIntervalPoint(3)],
      ['z', lapicIntervalPoint(5)],
    ])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.rootBound.lo).toBe(30)
    expect(result.rootBound.hi).toBe(30)
  })

  it('evaluates piecewise-affine kernel', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const root = b.piecewiseAffineKernel(x, [
      { breakpoint: 0, slope: 1, intercept: 0 },
      { breakpoint: 10, slope: 0.5, intercept: 10 },
    ])
    const g = b.build(root)

    const env = new Map([['x', lapicInterval(5, 15)]])
    const result = evaluateLapicFirIntervals(g, env)
    // x=5 → 5, x=10 → 10 (breakpoint), x=15 → 0.5*(15-10)+10 = 12.5
    expect(result.rootBound.lo).toBeCloseTo(5)
    expect(result.rootBound.hi).toBeCloseTo(12.5)
  })

  it('provides nodeBounds for all nodes', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const sum = b.add(x, y)
    const g = b.build(sum)

    const env = new Map([
      ['x', lapicInterval(1, 2)],
      ['y', lapicInterval(3, 4)],
    ])
    const result = evaluateLapicFirIntervals(g, env)
    expect(result.nodeBounds.size).toBe(3)
    expect(result.nodeBounds.get(x)!.lo).toBe(1)
    expect(result.nodeBounds.get(y)!.lo).toBe(3)
    expect(result.nodeBounds.get(sum)!.lo).toBe(4)
  })

  it('evaluates complex GI-like damage formula', () => {
    // Simplified GI damage: atk * (1 + dmgBonus) * critMult * resMult
    const b = new LapicFirGraphBuilder()
    const atk = b.read('atk')
    const dmgBonus = b.read('dmgBonus')
    const critMult = b.read('critMult')
    const enemyRes = b.read('enemyRes')

    const one = b.constant(1)
    const dmgMult = b.add(one, dmgBonus)
    const resMult = b.resistanceTransform(enemyRes)
    const raw = b.mul(atk, dmgMult)
    const withCrit = b.mul(raw, critMult)
    const root = b.mul(withCrit, resMult)
    const g = b.build(root)

    const env = new Map([
      ['atk', lapicInterval(2000, 2500)],
      ['dmgBonus', lapicInterval(0.4, 0.8)],
      ['critMult', lapicInterval(1.5, 2.0)],
      ['enemyRes', lapicIntervalPoint(0.1)],  // 1-0.1 = 0.9
    ])

    const result = evaluateLapicFirIntervals(g, env)

    // Lower: 2000 * 1.4 * 1.5 * 0.9 = 3780
    // Upper: 2500 * 1.8 * 2.0 * 0.9 = 8100
    expect(result.rootBound.lo).toBeCloseTo(3780)
    expect(result.rootBound.hi).toBeCloseTo(8100)
  })
})

// =========================================================================
// Scalar Evaluator
// =========================================================================

describe('evaluateLapicFirScalar', () => {
  it('evaluates a constant', () => {
    const b = new LapicFirGraphBuilder()
    const c = b.constant(42)
    const g = b.build(c)

    const result = evaluateLapicFirScalar(g, new Map())
    expect(result.rootValue).toBe(42)
  })

  it('evaluates a variable read', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const g = b.build(x)

    const result = evaluateLapicFirScalar(g, new Map([['x', 7]]))
    expect(result.rootValue).toBe(7)
  })

  it('returns NaN for missing variable', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const g = b.build(x)

    const result = evaluateLapicFirScalar(g, new Map())
    expect(result.rootValue).toBeNaN()
  })

  it('evaluates addition', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.add(b.constant(3), b.constant(4))
    const g = b.build(root)

    const result = evaluateLapicFirScalar(g, new Map())
    expect(result.rootValue).toBe(7)
  })

  it('evaluates multiplication', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.mul(b.constant(3), b.constant(5))
    const g = b.build(root)

    const result = evaluateLapicFirScalar(g, new Map())
    expect(result.rootValue).toBe(15)
  })

  it('evaluates min', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.min(b.constant(3), b.constant(7), b.constant(1))
    const g = b.build(root)

    const result = evaluateLapicFirScalar(g, new Map())
    expect(result.rootValue).toBe(1)
  })

  it('evaluates max', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.max(b.constant(3), b.constant(7), b.constant(1))
    const g = b.build(root)

    const result = evaluateLapicFirScalar(g, new Map())
    expect(result.rootValue).toBe(7)
  })

  it('evaluates negation', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.neg(b.constant(5))
    const g = b.build(root)

    const result = evaluateLapicFirScalar(g, new Map())
    expect(result.rootValue).toBe(-5)
  })

  it('evaluates affine form', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    // 10 + 2*x + 3*y
    const root = b.affineForm(10, [
      { coeff: 2, childId: x },
      { coeff: 3, childId: y },
    ])
    const g = b.build(root)

    const result = evaluateLapicFirScalar(g, new Map([['x', 4], ['y', 5]]))
    // 10 + 2*4 + 3*5 = 10 + 8 + 15 = 33
    expect(result.rootValue).toBe(33)
  })

  it('evaluates threshold select (above)', () => {
    const b = new LapicFirGraphBuilder()
    const guard = b.read('guard')
    const then_ = b.constant(100)
    const else_ = b.constant(0)
    const root = b.thresholdSelect(guard, 0.5, then_, else_)
    const g = b.build(root)

    const result = evaluateLapicFirScalar(g, new Map([['guard', 0.7]]))
    expect(result.rootValue).toBe(100)
  })

  it('evaluates threshold select (below)', () => {
    const b = new LapicFirGraphBuilder()
    const guard = b.read('guard')
    const then_ = b.constant(100)
    const else_ = b.constant(0)
    const root = b.thresholdSelect(guard, 0.5, then_, else_)
    const g = b.build(root)

    const result = evaluateLapicFirScalar(g, new Map([['guard', 0.3]]))
    expect(result.rootValue).toBe(0)
  })

  it('evaluates resistance transform (negative res)', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.resistanceTransform(b.read('res'))
    const g = b.build(root)

    // res = -0.2 → 1 - (-0.2)/2 = 1.1
    const result = evaluateLapicFirScalar(g, new Map([['res', -0.2]]))
    expect(result.rootValue).toBeCloseTo(1.1)
  })

  it('evaluates resistance transform (mid range)', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.resistanceTransform(b.read('res'))
    const g = b.build(root)

    // res = 0.1 → 1 - 0.1 = 0.9
    const result = evaluateLapicFirScalar(g, new Map([['res', 0.1]]))
    expect(result.rootValue).toBeCloseTo(0.9)
  })

  it('evaluates resistance transform (high res)', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.resistanceTransform(b.read('res'))
    const g = b.build(root)

    // res = 1.0 → 1/(4*1+1) = 0.2
    const result = evaluateLapicFirScalar(g, new Map([['res', 1.0]]))
    expect(result.rootValue).toBeCloseTo(0.2)
  })

  it('evaluates piecewise affine kernel', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.piecewiseAffineKernel(b.read('x'), [
      { breakpoint: 0, slope: 1, intercept: 0 },     // y = x for x < 10
      { breakpoint: 10, slope: 0.5, intercept: 10 },  // y = 0.5*(x-10) + 10 for x >= 10
    ])
    const g = b.build(root)

    // x = 5 → first segment: 1*(5-0)+0 = 5
    expect(evaluateLapicFirScalar(g, new Map([['x', 5]])).rootValue).toBe(5)
    // x = 20 → second segment: 0.5*(20-10)+10 = 15
    expect(evaluateLapicFirScalar(g, new Map([['x', 20]])).rootValue).toBe(15)
  })

  it('evaluates bilinear kernel', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.bilinearKernel(b.read('x'), b.read('y'))
    const g = b.build(root)

    const result = evaluateLapicFirScalar(g, new Map([['x', 3], ['y', 7]]))
    expect(result.rootValue).toBe(21)
  })

  it('evaluates multilinear kernel', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.multilinearKernel(b.read('a'), b.read('b'), b.read('c'))
    const g = b.build(root)

    const result = evaluateLapicFirScalar(g, new Map([['a', 2], ['b', 3], ['c', 5]]))
    expect(result.rootValue).toBe(30)
  })

  it('evaluates saturating kernel', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.saturatingKernel(b.read('x'), 10)
    const g = b.build(root)

    expect(evaluateLapicFirScalar(g, new Map([['x', 5]])).rootValue).toBe(5)
    expect(evaluateLapicFirScalar(g, new Map([['x', 15]])).rootValue).toBe(10)
  })

  it('populates nodeValues for every node', () => {
    const b = new LapicFirGraphBuilder()
    const x = b.read('x')
    const y = b.read('y')
    const root = b.add(x, y)
    const g = b.build(root)

    const result = evaluateLapicFirScalar(g, new Map([['x', 3], ['y', 4]]))
    expect(result.nodeValues.size).toBe(3)
    expect(result.nodeValues.get(x)).toBe(3)
    expect(result.nodeValues.get(y)).toBe(4)
    expect(result.nodeValues.get(root)).toBe(7)
  })

  it('evaluates a GI-like damage formula', () => {
    const b = new LapicFirGraphBuilder()
    const baseDmg = b.read('baseDmg')
    const dmgBonus = b.read('dmgBonus')
    const critMult = b.read('critMult')
    const res = b.read('res')

    // baseDmg * (1 + dmgBonus) * critMult * resMult
    const dmgMul = b.add(b.constant(1), dmgBonus)
    const resMul = b.resistanceTransform(res)
    const root = b.mul(baseDmg, dmgMul, critMult, resMul)
    const g = b.build(root)

    const env = new Map<string, number>([
      ['baseDmg', 2000],
      ['dmgBonus', 0.466],
      ['critMult', 1.5],
      ['res', 0.1],
    ])
    const result = evaluateLapicFirScalar(g, env)
    // 2000 * 1.466 * 1.5 * 0.9 = 3958.2
    expect(result.rootValue).toBeCloseTo(3958.2, 0)
  })
})

// =========================================================================
// Golden Validation Harness
// =========================================================================

describe('runLapicGoldenHarness', () => {
  it('passes with a simple sum formula', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.add(b.read('x'), b.read('y'))
    const g = b.build(root)

    const result = runLapicGoldenHarness({
      graph: g,
      domains: [
        {
          domainId: 'A',
          candidates: [
            { candidateId: 'a1', variables: new Map([['x', 1]]) },
            { candidateId: 'a2', variables: new Map([['x', 3]]) },
          ],
        },
        {
          domainId: 'B',
          candidates: [
            { candidateId: 'b1', variables: new Map([['y', 10]]) },
            { candidateId: 'b2', variables: new Map([['y', 20]]) },
          ],
        },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.totalCombinations).toBe(4)
    expect(result.scalarEvaluations).toBe(4)
    expect(result.minScalarValue).toBe(11) // 1+10
    expect(result.maxScalarValue).toBe(23) // 3+20
  })

  it('passes with product formula', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.mul(b.read('x'), b.read('y'))
    const g = b.build(root)

    const result = runLapicGoldenHarness({
      graph: g,
      domains: [
        {
          domainId: 'A',
          candidates: [
            { candidateId: 'a1', variables: new Map([['x', 2]]) },
            { candidateId: 'a2', variables: new Map([['x', 4]]) },
          ],
        },
        {
          domainId: 'B',
          candidates: [
            { candidateId: 'b1', variables: new Map([['y', 3]]) },
            { candidateId: 'b2', variables: new Map([['y', 5]]) },
          ],
        },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.minScalarValue).toBe(6)  // 2*3
    expect(result.maxScalarValue).toBe(20) // 4*5
  })

  it('passes with global constants', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.add(b.read('x'), b.read('c'))
    const g = b.build(root)

    const result = runLapicGoldenHarness({
      graph: g,
      domains: [
        {
          domainId: 'A',
          candidates: [
            { candidateId: 'a1', variables: new Map([['x', 5]]) },
            { candidateId: 'a2', variables: new Map([['x', 10]]) },
          ],
        },
      ],
      globalConstants: new Map([['c', 100]]),
    })

    expect(result.ok).toBe(true)
    expect(result.minScalarValue).toBe(105)
    expect(result.maxScalarValue).toBe(110)
  })

  it('passes with three domains', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.add(b.read('x'), b.read('y'), b.read('z'))
    const g = b.build(root)

    const result = runLapicGoldenHarness({
      graph: g,
      domains: [
        {
          domainId: 'A',
          candidates: [
            { candidateId: 'a1', variables: new Map([['x', 1]]) },
            { candidateId: 'a2', variables: new Map([['x', 2]]) },
          ],
        },
        {
          domainId: 'B',
          candidates: [
            { candidateId: 'b1', variables: new Map([['y', 10]]) },
            { candidateId: 'b2', variables: new Map([['y', 20]]) },
          ],
        },
        {
          domainId: 'C',
          candidates: [
            { candidateId: 'c1', variables: new Map([['z', 100]]) },
            { candidateId: 'c2', variables: new Map([['z', 200]]) },
          ],
        },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.totalCombinations).toBe(8)
    expect(result.minScalarValue).toBe(111) // 1+10+100
    expect(result.maxScalarValue).toBe(222) // 2+20+200
  })

  it('passes with GI-like damage formula', () => {
    const b = new LapicFirGraphBuilder()
    const baseDmg = b.read('baseDmg')
    const atkFlat = b.read('atkFlat')
    const critRate = b.read('critRate')
    const critDmg = b.read('critDmg')
    const res = b.read('res')

    // (baseDmg + atkFlat) * (1 + critRate * critDmg) * resMult
    const totalAtk = b.add(baseDmg, atkFlat)
    const critMult = b.add(b.constant(1), b.mul(critRate, critDmg))
    const resMult = b.resistanceTransform(res)
    const root = b.mul(totalAtk, critMult, resMult)
    const g = b.build(root)

    const result = runLapicGoldenHarness({
      graph: g,
      domains: [
        {
          domainId: 'flower',
          candidates: [
            { candidateId: 'f1', variables: new Map([['atkFlat', 100], ['critRate', 0.05]]) },
            { candidateId: 'f2', variables: new Map([['atkFlat', 200], ['critRate', 0.10]]) },
            { candidateId: 'f3', variables: new Map([['atkFlat', 150], ['critRate', 0.08]]) },
          ],
        },
        {
          domainId: 'circlet',
          candidates: [
            { candidateId: 'c1', variables: new Map([['critDmg', 0.5]]) },
            { candidateId: 'c2', variables: new Map([['critDmg', 1.0]]) },
          ],
        },
      ],
      globalConstants: new Map([
        ['baseDmg', 2000],
        ['res', 0.1],
      ]),
    })

    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.totalCombinations).toBe(6) // 3 × 2
  })

  it('passes with single-domain single-candidate trivial case', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.read('x')
    const g = b.build(root)

    const result = runLapicGoldenHarness({
      graph: g,
      domains: [
        {
          domainId: 'A',
          candidates: [
            { candidateId: 'a1', variables: new Map([['x', 42]]) },
          ],
        },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.totalCombinations).toBe(1)
    expect(result.minScalarValue).toBe(42)
    expect(result.maxScalarValue).toBe(42)
  })

  it('performs interval evaluations for partial assignments', () => {
    const b = new LapicFirGraphBuilder()
    const root = b.add(b.read('x'), b.read('y'))
    const g = b.build(root)

    const result = runLapicGoldenHarness({
      graph: g,
      domains: [
        {
          domainId: 'A',
          candidates: [
            { candidateId: 'a1', variables: new Map([['x', 1]]) },
            { candidateId: 'a2', variables: new Map([['x', 3]]) },
          ],
        },
        {
          domainId: 'B',
          candidates: [
            { candidateId: 'b1', variables: new Map([['y', 10]]) },
            { candidateId: 'b2', variables: new Map([['y', 20]]) },
          ],
        },
      ],
    })

    expect(result.ok).toBe(true)
    // Should have interval evaluations for partial assignments
    expect(result.intervalEvaluations).toBeGreaterThan(result.scalarEvaluations)
  })
})