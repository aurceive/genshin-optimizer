import type { OptNode } from '@genshin-optimizer/gi/wr'
import { evaluateLapicFirScalar } from '@genshin-optimizer/lapic/core'
import { compileGiOptNodeToFir } from './compilation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function constNode(value: number): OptNode {
  return {
    operation: 'const',
    operands: [],
    value,
    type: 'number',
  } as unknown as OptNode
}

function readNode(path: string[]): OptNode {
  return {
    operation: 'read',
    operands: [],
    path,
    type: 'number',
  } as unknown as OptNode
}

function addNode(...children: OptNode[]): OptNode {
  return { operation: 'add', operands: children } as unknown as OptNode
}

function mulNode(...children: OptNode[]): OptNode {
  return { operation: 'mul', operands: children } as unknown as OptNode
}

function minNode(...children: OptNode[]): OptNode {
  return { operation: 'min', operands: children } as unknown as OptNode
}

function maxNode(...children: OptNode[]): OptNode {
  return { operation: 'max', operands: children } as unknown as OptNode
}

function resNode(child: OptNode): OptNode {
  return { operation: 'res', operands: [child] } as unknown as OptNode
}

function thresholdNode(
  value: OptNode,
  threshold: OptNode,
  pass: OptNode,
  fail: OptNode
): OptNode {
  return {
    operation: 'threshold',
    operands: [value, threshold, pass, fail],
  } as unknown as OptNode
}

function sumFracNode(x: OptNode, c: OptNode): OptNode {
  return { operation: 'sum_frac', operands: [x, c] } as unknown as OptNode
}

/**
 * Compile an OptNode, assert success, then scalar-evaluate with the given env.
 */
function compileAndEval(root: OptNode, env: Record<string, number>): number {
  const outcome = compileGiOptNodeToFir(root)
  expect(outcome.ok).toBe(true)
  if (!outcome.ok) throw new Error('compilation failed')

  const result = evaluateLapicFirScalar(
    outcome.result.graph,
    new Map(Object.entries(env))
  )
  return result.rootValue
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GI OptNode → F-IR compiler', () => {
  describe('constant nodes', () => {
    it('compiles a numeric constant', () => {
      const value = compileAndEval(constNode(42), {})
      expect(value).toBe(42)
    })

    it('compiles zero', () => {
      expect(compileAndEval(constNode(0), {})).toBe(0)
    })

    it('compiles negative constant', () => {
      expect(compileAndEval(constNode(-3.5), {})).toBe(-3.5)
    })
  })

  describe('read nodes', () => {
    it('compiles a single-segment path', () => {
      const value = compileAndEval(readNode(['atk']), { atk: 2000 })
      expect(value).toBe(2000)
    })

    it('compiles a multi-segment path joined with :', () => {
      const value = compileAndEval(readNode(['base', 'atk']), {
        'base:atk': 500,
      })
      expect(value).toBe(500)
    })

    it('reports variable mapping', () => {
      const outcome = compileGiOptNodeToFir(readNode(['total', 'critRate_']))
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return
      expect(outcome.result.variableMapping.get('total:critRate_')).toBe(
        'total:critRate_'
      )
    })
  })

  describe('arithmetic operators', () => {
    it('compiles add', () => {
      const tree = addNode(constNode(10), constNode(20), constNode(5))
      expect(compileAndEval(tree, {})).toBe(35)
    })

    it('compiles mul', () => {
      const tree = mulNode(constNode(3), constNode(7))
      expect(compileAndEval(tree, {})).toBe(21)
    })

    it('compiles min', () => {
      const tree = minNode(constNode(10), constNode(3), constNode(7))
      expect(compileAndEval(tree, {})).toBe(3)
    })

    it('compiles max', () => {
      const tree = maxNode(constNode(1), constNode(9), constNode(5))
      expect(compileAndEval(tree, {})).toBe(9)
    })

    it('compiles nested add(read, mul(read, const))', () => {
      // base + bonus * multiplier
      const tree = addNode(
        readNode(['base']),
        mulNode(readNode(['bonus']), constNode(1.5))
      )
      expect(compileAndEval(tree, { base: 100, bonus: 40 })).toBe(160)
    })
  })

  describe('resistance transform', () => {
    it('compiles res with positive resistance (0 ≤ res < 0.75)', () => {
      // res(0.1) = 1 - 0.1 = 0.9
      const tree = resNode(constNode(0.1))
      expect(compileAndEval(tree, {})).toBeCloseTo(0.9, 10)
    })

    it('compiles res with negative resistance', () => {
      // res(-0.2) = 1 - (-0.2)/2 = 1.1
      const tree = resNode(constNode(-0.2))
      expect(compileAndEval(tree, {})).toBeCloseTo(1.1, 10)
    })

    it('compiles res with high resistance (>= 0.75)', () => {
      // res(0.75) = 1 / (4*0.75 + 1) = 1/4 = 0.25
      const tree = resNode(constNode(0.75))
      expect(compileAndEval(tree, {})).toBeCloseTo(0.25, 10)
    })

    it('compiles res with variable input', () => {
      const tree = resNode(readNode(['enemy', 'res']))
      expect(compileAndEval(tree, { 'enemy:res': 0.1 })).toBeCloseTo(0.9, 10)
    })
  })

  describe('threshold select', () => {
    it('compiles threshold with constant comparison (pass branch)', () => {
      // critRate >= 0.5 ? 100 : 50; critRate = 0.8 → 100
      const tree = thresholdNode(
        readNode(['critRate']),
        constNode(0.5),
        constNode(100),
        constNode(50)
      )
      expect(compileAndEval(tree, { critRate: 0.8 })).toBe(100)
    })

    it('compiles threshold with constant comparison (fail branch)', () => {
      // critRate >= 0.5 ? 100 : 50; critRate = 0.3 → 50
      const tree = thresholdNode(
        readNode(['critRate']),
        constNode(0.5),
        constNode(100),
        constNode(50)
      )
      expect(compileAndEval(tree, { critRate: 0.3 })).toBe(50)
    })

    it('compiles threshold at exact boundary (pass)', () => {
      const tree = thresholdNode(
        readNode(['level']),
        constNode(90),
        constNode(1),
        constNode(0)
      )
      expect(compileAndEval(tree, { level: 90 })).toBe(1)
    })

    it('errors on non-constant threshold value', () => {
      const tree = thresholdNode(
        readNode(['a']),
        readNode(['b']),
        constNode(1),
        constNode(0)
      )
      const outcome = compileGiOptNodeToFir(tree)
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) {
        expect(outcome.errors).toHaveLength(1)
        expect(outcome.errors[0]!.operation).toBe('threshold')
      }
    })
  })

  describe('unsupported operations', () => {
    it('reports sum_frac as unsupported', () => {
      const tree = sumFracNode(readNode(['em']), constNode(1400))
      const outcome = compileGiOptNodeToFir(tree)
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) {
        expect(outcome.errors).toHaveLength(1)
        expect(outcome.errors[0]!.operation).toBe('sum_frac')
      }
    })

    it('reports unknown operation', () => {
      const tree = { operation: 'foobar', operands: [] } as unknown as OptNode
      const outcome = compileGiOptNodeToFir(tree)
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) {
        expect(outcome.errors[0]!.operation).toBe('foobar')
      }
    })

    it('collects multiple errors from different subtrees', () => {
      // add(sum_frac(...), sum_frac(...))
      const tree = addNode(
        sumFracNode(readNode(['em']), constNode(1400)),
        sumFracNode(readNode(['em']), constNode(2800))
      )
      const outcome = compileGiOptNodeToFir(tree)
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) {
        expect(outcome.errors.length).toBeGreaterThanOrEqual(2)
      }
    })
  })

  describe('DAG deduplication', () => {
    it('shared subexpression produces a single F-IR node', () => {
      const shared = readNode(['atk'])
      // add(atk, atk) — same object reference
      const tree = addNode(shared, shared)
      const outcome = compileGiOptNodeToFir(tree)
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return
      // The graph should have exactly 2 nodes: 1 read + 1 add
      expect(outcome.result.graph.nodes.size).toBe(2)
    })

    it('structurally identical but distinct objects still deduplicate via hash-consing', () => {
      // Two separate constNode(42) objects — different references
      const tree = addNode(constNode(42), constNode(42))
      const outcome = compileGiOptNodeToFir(tree)
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return
      // 1 constant(42) + 1 add = 2 nodes (builder hash-conses constants)
      expect(outcome.result.graph.nodes.size).toBe(2)
    })
  })

  describe('complex formulas', () => {
    it('GI damage formula: (baseDmg + flat) * (1 + cr*cd) * resMult', () => {
      const tree = mulNode(
        addNode(readNode(['base', 'dmg']), readNode(['flat'])),
        addNode(
          constNode(1),
          mulNode(readNode(['critRate']), readNode(['critDmg']))
        ),
        resNode(readNode(['enemy', 'res']))
      )

      const value = compileAndEval(tree, {
        'base:dmg': 2000,
        flat: 200,
        critRate: 0.8,
        critDmg: 1.5,
        'enemy:res': 0.1,
      })

      // (2000 + 200) * (1 + 0.8 * 1.5) * (1 - 0.1)
      // = 2200 * 2.2 * 0.9
      // = 4356
      expect(value).toBeCloseTo(4356, 6)
    })

    it('conditional damage with threshold', () => {
      // level >= 90 ? highDmg : lowDmg
      // where highDmg = atk * 2.0, lowDmg = atk * 1.0
      const atk = readNode(['atk'])
      const tree = thresholdNode(
        readNode(['level']),
        constNode(90),
        mulNode(atk, constNode(2.0)),
        mulNode(atk, constNode(1.0))
      )

      expect(compileAndEval(tree, { atk: 1000, level: 90 })).toBe(2000)
      expect(compileAndEval(tree, { atk: 1000, level: 80 })).toBe(1000)
    })

    it('nested min/max capping', () => {
      // clamp critRate to [0, 1]: max(0, min(1, critRate))
      const tree = maxNode(
        constNode(0),
        minNode(constNode(1), readNode(['critRate']))
      )

      expect(compileAndEval(tree, { critRate: 0.5 })).toBe(0.5)
      expect(compileAndEval(tree, { critRate: 1.5 })).toBe(1)
      expect(compileAndEval(tree, { critRate: -0.2 })).toBe(0)
    })

    it('variable mapping includes all referenced variables', () => {
      const tree = mulNode(
        addNode(readNode(['base', 'atk']), readNode(['bonus', 'flat'])),
        readNode(['critDmg'])
      )
      const outcome = compileGiOptNodeToFir(tree)
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return

      const vars = outcome.result.variableMapping
      expect(vars.size).toBe(3)
      expect(vars.has('base:atk')).toBe(true)
      expect(vars.has('bonus:flat')).toBe(true)
      expect(vars.has('critDmg')).toBe(true)
    })

    it('graph variable set matches mapping', () => {
      const tree = addNode(readNode(['a']), readNode(['b']), readNode(['c']))
      const outcome = compileGiOptNodeToFir(tree)
      expect(outcome.ok).toBe(true)
      if (!outcome.ok) return

      expect(outcome.result.graph.variableIds.size).toBe(3)
      expect(outcome.result.graph.variableIds.has('a')).toBe(true)
      expect(outcome.result.graph.variableIds.has('b')).toBe(true)
      expect(outcome.result.graph.variableIds.has('c')).toBe(true)
    })
  })
})
