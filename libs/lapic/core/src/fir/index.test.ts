import { describe, expect, it } from 'vitest'
import { LapicFirGraphBuilder } from './builders'
import { validateLapicFirGraph } from './validation'
import { evaluateLapicFirIntervals } from './interval-eval'
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