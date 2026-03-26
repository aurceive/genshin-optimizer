import {
  type LapicFirGraph,
  LapicFirGraphBuilder,
  type LapicFirVariableId,
  lapicInterval,
  lapicIntervalAdd,
  lapicIntervalPoint,
} from '@genshin-optimizer/lapic/core'
import type { LapicCandidateDescriptor } from '@genshin-optimizer/lapic/core'
import type { LapicBoundedExactPartialCombination } from '../solve/types'
import {
  createLapicFirPartialIntervalEnv,
  fillLapicFirPartialIntervalEnv,
  precomputeDomainEnvelopes,
} from './env-factory'
import { createLapicFirBoundProvider } from './provider'
import type { LapicFirDomainVariableMap } from './types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function candidateDescriptor(
  candidateId: string,
  domainId: string
): LapicCandidateDescriptor {
  return {
    candidateId,
    sourceRecordDigest: candidateId,
    domainId,
    slotId: domainId,
    additiveFeatureDigest: candidateId,
    discreteCounters: [],
    categoricalSignatureDigest: candidateId,
    provenance: {
      slotId: domainId,
      sourceEntityId: 'test',
      sourceRecordDigests: [candidateId],
      exclusiveResourceClaims: [],
      concreteInventoryBacked: true,
      featureExtractionDigest: candidateId,
    },
  }
}

function createMinimalProblem(domainIds: string[]) {
  return {
    problemId: 'test-problem',
    problemDigest: 'test-digest',
    engineVersion: '0.1.0-test',
    arithmeticPolicyId: 'fast-float',
    teamLayout: {
      teamKind: 'test',
      slotCount: domainIds.length,
      slotIds: domainIds,
      slotRoleTaxonomy: ['test'],
      slotRequirements: Object.fromEntries(
        domainIds.map((d) => [d, 'required'])
      ),
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: domainIds.map((d) => ({
      slotId: d,
      slotRole: 'test',
      participationMode: 'optimizedBuild',
      occupantDomainId: d,
      equipmentOwnershipModel: 'hard-reserved-inventory',
      contributesToObjective: true,
      contributesToConstraints: false,
      mayRemainEmpty: false,
    })),
    sharedTeamContext: {
      adapterSemanticMode: 'test',
      aggregateFacts: {},
      metadata: {},
    },
    frameAxis: [],
    itemDomains: domainIds.map((d) => ({
      domainId: d,
      slotId: d,
      candidates: [],
    })),
    compatibilityRules: [],
    objective: {
      objectiveId: 'test-obj',
      objectiveKind: 'single-slot',
      expressionDigest: 'test-obj-digest',
      targetSlotIds: domainIds,
      frameIds: [],
    },
    constraints: [],
    topN: 1,
    orderingPolicy: {
      tieBreakDimensions: ['value'],
      canonicalCandidateOrdering: ['value'],
    },
    adapterMetadata: {
      adapterKind: 'test',
      adapterVersion: '0.1.0-test',
      sourceSnapshotDigests: [],
      declaredUnsupportedFeatures: [],
      metadata: {},
    },
    provenance: {
      teamLayoutDigest: 'test',
      sharedTeamContextDigest: 'test',
      crossSlotRuleDescriptorVersion: '0.1.0-test',
      compatibilitySignatureSchemaVersion: '0.1.0-test',
      slotProvenance: [],
    },
    auxiliaryOutputs: [],
  }
}

function partial(
  domainIds: string[],
  assigned: LapicCandidateDescriptor[]
): LapicBoundedExactPartialCombination {
  return {
    problem: createMinimalProblem(domainIds) as any,
    assignedCandidates: assigned,
    assignedDomainCount: assigned.length,
    totalDomainCount: domainIds.length,
  }
}

function domainMap(
  domainId: string,
  entries: Array<[string, Record<string, number>]>
): LapicFirDomainVariableMap {
  return {
    domainId,
    candidateVariables: new Map(
      entries.map(([cid, vars]) => [cid, new Map(Object.entries(vars))])
    ),
  }
}

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

/** Build F-IR graph: x + y */
function buildSumGraph(): LapicFirGraph {
  const b = new LapicFirGraphBuilder()
  const x = b.read('x')
  const y = b.read('y')
  const root = b.add(x, y)
  return b.build(root)
}

/** Build F-IR graph: x * y */
function buildProductGraph(): LapicFirGraph {
  const b = new LapicFirGraphBuilder()
  const x = b.read('x')
  const y = b.read('y')
  const root = b.mul(x, y)
  return b.build(root)
}

/** Build F-IR graph: 2*x + 3*y + c (c = global constant) */
function buildAffineGraph(): LapicFirGraph {
  const b = new LapicFirGraphBuilder()
  const x = b.read('x')
  const y = b.read('y')
  const c = b.read('c')
  const root = b.affineForm(0, [
    { coeff: 2, childId: x },
    { coeff: 3, childId: y },
    { coeff: 1, childId: c },
  ])
  return b.build(root)
}

// ===========================================================================
// Tests
// ===========================================================================

describe('precomputeDomainEnvelopes', () => {
  it('should compute min/max for each variable across candidates', () => {
    const maps = [
      domainMap('A', [
        ['a1', { x: 1, z: 10 }],
        ['a2', { x: 5, z: 7 }],
        ['a3', { x: 3, z: 15 }],
      ]),
    ]
    const envelopes = precomputeDomainEnvelopes(maps)
    const aEnv = envelopes.get('A')!
    expect(aEnv.get('x')).toEqual(lapicInterval(1, 5))
    expect(aEnv.get('z')).toEqual(lapicInterval(7, 15))
  })

  it('should handle single-candidate domain as point interval', () => {
    const maps = [domainMap('B', [['b1', { y: 42 }]])]
    const envelopes = precomputeDomainEnvelopes(maps)
    expect(envelopes.get('B')!.get('y')).toEqual(lapicIntervalPoint(42))
  })

  it('should handle multiple domains independently', () => {
    const maps = [
      domainMap('A', [
        ['a1', { x: 1 }],
        ['a2', { x: 3 }],
      ]),
      domainMap('B', [
        ['b1', { y: 10 }],
        ['b2', { y: 20 }],
      ]),
    ]
    const envelopes = precomputeDomainEnvelopes(maps)
    expect(envelopes.get('A')!.get('x')).toEqual(lapicInterval(1, 3))
    expect(envelopes.get('B')!.get('y')).toEqual(lapicInterval(10, 20))
  })

  it('should handle empty domain variable map', () => {
    const envelopes = precomputeDomainEnvelopes([])
    expect(envelopes.size).toBe(0)
  })
})

describe('createLapicFirPartialIntervalEnv', () => {
  const maps = [
    domainMap('A', [
      ['a1', { x: 1 }],
      ['a2', { x: 5 }],
    ]),
    domainMap('B', [
      ['b1', { y: 10 }],
      ['b2', { y: 20 }],
    ]),
  ]
  const envelopes = precomputeDomainEnvelopes(maps)

  it('should use point interval for assigned candidate', () => {
    const env = createLapicFirPartialIntervalEnv(
      [candidateDescriptor('a1', 'A')],
      maps,
      envelopes
    )
    expect(env.get('x')).toEqual(lapicIntervalPoint(1))
    // B is unassigned → envelope
    expect(env.get('y')).toEqual(lapicInterval(10, 20))
  })

  it('should use envelope for all unassigned domains', () => {
    const env = createLapicFirPartialIntervalEnv([], maps, envelopes)
    expect(env.get('x')).toEqual(lapicInterval(1, 5))
    expect(env.get('y')).toEqual(lapicInterval(10, 20))
  })

  it('should use point intervals when all domains are assigned', () => {
    const env = createLapicFirPartialIntervalEnv(
      [candidateDescriptor('a2', 'A'), candidateDescriptor('b1', 'B')],
      maps,
      envelopes
    )
    expect(env.get('x')).toEqual(lapicIntervalPoint(5))
    expect(env.get('y')).toEqual(lapicIntervalPoint(10))
  })

  it('should include global constants as point intervals', () => {
    const globals = new Map<LapicFirVariableId, number>([['c', 100]])
    const env = createLapicFirPartialIntervalEnv(
      [candidateDescriptor('a1', 'A')],
      maps,
      envelopes,
      globals
    )
    expect(env.get('c')).toEqual(lapicIntervalPoint(100))
    expect(env.get('x')).toEqual(lapicIntervalPoint(1))
  })

  it('should gracefully handle unknown domain in assigned candidate', () => {
    const env = createLapicFirPartialIntervalEnv(
      [candidateDescriptor('z1', 'UNKNOWN')],
      maps,
      envelopes
    )
    // Unknown domain is ignored; A and B remain unassigned
    expect(env.get('x')).toEqual(lapicInterval(1, 5))
    expect(env.get('y')).toEqual(lapicInterval(10, 20))
  })
})

describe('createLapicFirBoundProvider', () => {
  describe('with sum formula (x + y)', () => {
    const graph = buildSumGraph()
    const maps = [
      domainMap('A', [
        ['a1', { x: 1 }],
        ['a2', { x: 3 }],
      ]),
      domainMap('B', [
        ['b1', { y: 2 }],
        ['b2', { y: 5 }],
      ]),
    ]

    it('should compute tight upper bound with one assigned domain', () => {
      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: maps,
      })
      // a1 assigned (x=1), B unassigned (y ∈ [2,5])
      // bound = 1 + [2,5] = [3,6], upper = 6
      const bound = provider(
        partial(['A', 'B'], [candidateDescriptor('a1', 'A')])
      )
      expect(bound).toBeDefined()
      expect(Number(bound!.upperBoundValue)).toBe(6)
    })

    it('should compute tighter bound with better candidate', () => {
      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: maps,
      })
      // a2 assigned (x=3), B unassigned (y ∈ [2,5])
      // bound = 3 + [2,5] = [5,8], upper = 8
      const bound = provider(
        partial(['A', 'B'], [candidateDescriptor('a2', 'A')])
      )
      expect(bound).toBeDefined()
      expect(Number(bound!.upperBoundValue)).toBe(8)
    })

    it('should compute widest bound with no assignments', () => {
      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: maps,
      })
      // No assigned, A (x ∈ [1,3]) + B (y ∈ [2,5]) = [3,8], upper = 8
      const bound = provider(partial(['A', 'B'], []))
      expect(bound).toBeDefined()
      expect(Number(bound!.upperBoundValue)).toBe(8)
    })

    it('should compute exact value with all assigned', () => {
      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: maps,
      })
      // a1 + b2 = 1 + 5 = 6
      const bound = provider(
        partial(
          ['A', 'B'],
          [candidateDescriptor('a1', 'A'), candidateDescriptor('b2', 'B')]
        )
      )
      expect(bound).toBeDefined()
      expect(Number(bound!.upperBoundValue)).toBe(6)
    })
  })

  describe('with product formula (x * y)', () => {
    const graph = buildProductGraph()
    const maps = [
      domainMap('A', [
        ['a1', { x: 2 }],
        ['a2', { x: 4 }],
      ]),
      domainMap('B', [
        ['b1', { y: 3 }],
        ['b2', { y: 6 }],
      ]),
    ]

    it('should compute correct upper bound for product', () => {
      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: maps,
      })
      // a1 assigned (x=2), B unassigned (y ∈ [3,6])
      // bound = 2 * [3,6] = [6,12], upper = 12
      const bound = provider(
        partial(['A', 'B'], [candidateDescriptor('a1', 'A')])
      )
      expect(bound).toBeDefined()
      expect(Number(bound!.upperBoundValue)).toBe(12)
    })
  })

  describe('with affine formula (2x + 3y + c)', () => {
    const graph = buildAffineGraph()
    const maps = [
      domainMap('A', [
        ['a1', { x: 1 }],
        ['a2', { x: 4 }],
      ]),
      domainMap('B', [
        ['b1', { y: 2 }],
        ['b2', { y: 5 }],
      ]),
    ]
    const globals = new Map<LapicFirVariableId, number>([['c', 10]])

    it('should include global constants in bound', () => {
      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: maps,
        globalConstants: globals,
      })
      // a1 (x=1), B unassigned (y ∈ [2,5])
      // 2*1 + 3*[2,5] + 10 = 2 + [6,15] + 10 = [18,27], upper = 27
      const bound = provider(
        partial(['A', 'B'], [candidateDescriptor('a1', 'A')])
      )
      expect(bound).toBeDefined()
      expect(Number(bound!.upperBoundValue)).toBe(27)
    })

    it('should compute exact value when fully assigned', () => {
      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: maps,
        globalConstants: globals,
      })
      // a2 (x=4), b2 (y=5): 2*4 + 3*5 + 10 = 8 + 15 + 10 = 33
      const bound = provider(
        partial(
          ['A', 'B'],
          [candidateDescriptor('a2', 'A'), candidateDescriptor('b2', 'B')]
        )
      )
      expect(bound).toBeDefined()
      expect(Number(bound!.upperBoundValue)).toBe(33)
    })
  })

  describe('edge cases', () => {
    it('should use custom formatUpperBound', () => {
      const graph = buildSumGraph()
      const maps = [
        domainMap('A', [['a1', { x: 1.5 }]]),
        domainMap('B', [['b1', { y: 2.5 }]]),
      ]
      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: maps,
        formatUpperBound: (v) => v.toFixed(2),
      })
      const bound = provider(
        partial(['A', 'B'], [candidateDescriptor('a1', 'A')])
      )
      expect(bound).toBeDefined()
      expect(bound!.upperBoundValue).toBe('4.00')
    })

    it('should include evidence digest with interval bounds', () => {
      const graph = buildSumGraph()
      const maps = [
        domainMap('A', [['a1', { x: 1 }]]),
        domainMap('B', [['b1', { y: 2 }]]),
      ]
      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: maps,
      })
      const bound = provider(
        partial(['A', 'B'], [candidateDescriptor('a1', 'A')])
      )
      expect(bound).toBeDefined()
      expect(bound!.evidenceDigest).toMatch(/^fir-interval-bound:/)
    })

    it('should return undefined when no domain maps provided', () => {
      // Graph has variables x, y but no domain maps → variables are unbounded
      const graph = buildSumGraph()
      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: [],
      })
      // x and y default to (-∞, +∞), so hi = +∞ → undefined
      const bound = provider(partial([], []))
      expect(bound).toBeUndefined()
    })

    it('should handle three-domain problem', () => {
      const b = new LapicFirGraphBuilder()
      const x = b.read('x')
      const y = b.read('y')
      const z = b.read('z')
      const root = b.add(x, y, z)
      const graph = b.build(root)

      const maps = [
        domainMap('A', [
          ['a1', { x: 1 }],
          ['a2', { x: 4 }],
        ]),
        domainMap('B', [
          ['b1', { y: 10 }],
          ['b2', { y: 20 }],
        ]),
        domainMap('C', [
          ['c1', { z: 100 }],
          ['c2', { z: 200 }],
        ]),
      ]

      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: maps,
      })

      // a1 assigned (x=1), B + C unassigned
      // 1 + [10,20] + [100,200] = [111, 221], upper = 221
      const bound = provider(
        partial(['A', 'B', 'C'], [candidateDescriptor('a1', 'A')])
      )
      expect(bound).toBeDefined()
      expect(Number(bound!.upperBoundValue)).toBe(221)
    })

    it('should handle candidates with multiple variables per domain', () => {
      const b = new LapicFirGraphBuilder()
      const a = b.read('atk')
      const cr = b.read('crit_rate')
      const root = b.mul(a, cr)
      const graph = b.build(root)

      const maps = [
        domainMap('flower', [
          ['f1', { atk: 100, crit_rate: 0.05 }],
          ['f2', { atk: 200, crit_rate: 0.1 }],
          ['f3', { atk: 150, crit_rate: 0.15 }],
        ]),
      ]

      const provider = createLapicFirBoundProvider({
        graph,
        domainVariableMaps: maps,
      })

      // No assignments: atk ∈ [100,200], crit_rate ∈ [0.05,0.15]
      // Product: [100*0.05, 200*0.15] = [5, 30], upper = 30
      const bound = provider(partial(['flower'], []))
      expect(bound).toBeDefined()
      expect(Number(bound!.upperBoundValue)).toBe(30)
    })
  })
})

// ===========================================================================
// precomputeDomainEnvelopes — zero-floor for missing variables
// ===========================================================================

describe('precomputeDomainEnvelopes — zero-floor', () => {
  it('treats missing variable as 0 in envelope computation', () => {
    // Candidate c1 has x=5, candidate c2 has x=10, candidate c3 has no x.
    // Envelope should be [0, 10] (zero-floor for c3).
    const maps = [
      domainMap('A', [
        ['c1', { x: 5 }],
        ['c2', { x: 10 }],
        ['c3', { y: 1 }],
      ]),
    ]
    const envelopes = precomputeDomainEnvelopes(maps)
    const aEnv = envelopes.get('A')!
    expect(aEnv.get('x')).toEqual(lapicInterval(0, 10))
  })

  it('produces [0, v] when only one candidate has the variable', () => {
    const maps = [
      domainMap('A', [
        ['c1', { x: 7 }],
        ['c2', { y: 3 }],
      ]),
    ]
    const envelopes = precomputeDomainEnvelopes(maps)
    expect(envelopes.get('A')!.get('x')).toEqual(lapicInterval(0, 7))
    expect(envelopes.get('A')!.get('y')).toEqual(lapicInterval(0, 3))
  })
})

// ===========================================================================
// fillLapicFirPartialIntervalEnv — ADD semantics
// ===========================================================================

describe('fillLapicFirPartialIntervalEnv — ADD semantics', () => {
  const mapsAB = [
    domainMap('A', [
      ['a1', { x: 1, y: 10 }],
      ['a2', { x: 3, y: 20 }],
    ]),
    domainMap('B', [
      ['b1', { x: 5 }],
      ['b2', { x: 8 }],
    ]),
  ]
  const envelopes = precomputeDomainEnvelopes(mapsAB)

  it('sums contributions from multiple domains via interval ADD', () => {
    const env = new Map<LapicFirVariableId, LapicInterval>()
    // Both unassigned: env[x] = envelopeA(x) + envelopeB(x)
    fillLapicFirPartialIntervalEnv(env, [], mapsAB, envelopes)
    // A: x ∈ [1,3], B: x ∈ [5,8] → sum x ∈ [6,11]
    expect(env.get('x')).toEqual(
      lapicIntervalAdd(lapicInterval(1, 3), lapicInterval(5, 8))
    )
    // A: y ∈ [10,20], B: no y → sum y ∈ [10,20]
    expect(env.get('y')).toEqual(lapicInterval(10, 20))
  })

  it('adds assigned candidate point to unassigned envelopes', () => {
    const env = new Map<LapicFirVariableId, LapicInterval>()
    // A assigned (a1: x=1, y=10), B unassigned (x ∈ [5,8])
    fillLapicFirPartialIntervalEnv(
      env,
      [candidateDescriptor('a1', 'A')],
      mapsAB,
      envelopes
    )
    // x = point(1) + [5,8] = [6,9]
    expect(env.get('x')).toEqual(
      lapicIntervalAdd(lapicIntervalPoint(1), lapicInterval(5, 8))
    )
    // y = point(10) (only A contributes y)
    expect(env.get('y')).toEqual(lapicIntervalPoint(10))
  })

  it('adds global constants to domain contributions', () => {
    const env = new Map<LapicFirVariableId, LapicInterval>()
    const globals = new Map<LapicFirVariableId, number>([['x', 100]])
    fillLapicFirPartialIntervalEnv(env, [], mapsAB, envelopes, globals)
    // x = global(100) + envelopeA(x:[1,3]) + envelopeB(x:[5,8]) = [106,111]
    const expected = lapicIntervalAdd(
      lapicIntervalAdd(lapicIntervalPoint(100), lapicInterval(1, 3)),
      lapicInterval(5, 8)
    )
    expect(env.get('x')).toEqual(expected)
  })

  it('throws on duplicate domain assignment', () => {
    const env = new Map<LapicFirVariableId, LapicInterval>()
    expect(() =>
      fillLapicFirPartialIntervalEnv(
        env,
        [candidateDescriptor('a1', 'A'), candidateDescriptor('a2', 'A')],
        mapsAB,
        envelopes
      )
    ).toThrow(/duplicate assignment/)
  })
})
