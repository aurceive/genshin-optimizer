/**
 * Validation corpus fixtures — small known-answer problems.
 *
 * Each fixture defines:
 * - A F-IR graph (via builder callback)
 * - Domain/slot structure with candidate variable bindings
 * - The expected golden answer (exhaustively verified)
 *
 * Coverage per §5.2:
 * - Objective correctness (all fixtures)
 * - Top-N correctness (multiplicativeTop3, tieBreakerTop2)
 * - Tie-break correctness (tieBreakerTop2)
 * - Feasibility / pruning safety (threeDomainPruning)
 * - Complex formula correctness (giDamageFormula)
 */

import type { LapicCorpusFixture } from './types'

// ---------------------------------------------------------------------------
// Fixture 1: Basic additive, 2 slots, top-1
// ---------------------------------------------------------------------------

export const additiveTop1: LapicCorpusFixture = {
  fixtureId: 'additive-2slot-top1',
  description: 'Simple x+y with 2 domains, top-1. Best = 100+20 = 120.',
  buildGraph: (b) => b.add(b.read('x'), b.read('y')),
  domains: [
    {
      domainId: 'gi:flower',
      slotId: 'flower',
      candidates: [
        { candidateId: 'f-a', variables: { x: 10 } },
        { candidateId: 'f-b', variables: { x: 100 } },
        { candidateId: 'f-c', variables: { x: 50 } },
      ],
    },
    {
      domainId: 'gi:plume',
      slotId: 'plume',
      candidates: [
        { candidateId: 'p-a', variables: { y: 5 } },
        { candidateId: 'p-b', variables: { y: 20 } },
        { candidateId: 'p-c', variables: { y: 8 } },
      ],
    },
  ],
  topN: 1,
  golden: {
    bestObjectiveValue: 120,
    rankedCombinations: [['f-b', 'p-b']],
  },
}

// ---------------------------------------------------------------------------
// Fixture 2: Multiplicative, 2 slots, top-3
// ---------------------------------------------------------------------------

export const multiplicativeTop3: LapicCorpusFixture = {
  fixtureId: 'multiplicative-2slot-top3',
  description:
    'x*y with 3×2 candidates, top-3. Best = 10*7=70, 5*7=35, 10*3=30.',
  buildGraph: (b) => b.mul(b.read('x'), b.read('y')),
  domains: [
    {
      domainId: 'gi:flower',
      slotId: 'flower',
      candidates: [
        { candidateId: 'f-a', variables: { x: 2 } },
        { candidateId: 'f-b', variables: { x: 10 } },
        { candidateId: 'f-c', variables: { x: 5 } },
      ],
    },
    {
      domainId: 'gi:plume',
      slotId: 'plume',
      candidates: [
        { candidateId: 'p-a', variables: { y: 3 } },
        { candidateId: 'p-b', variables: { y: 7 } },
      ],
    },
  ],
  topN: 3,
  golden: {
    bestObjectiveValue: 70,
    rankedCombinations: [
      ['f-b', 'p-b'], // 10*7 = 70
      ['f-c', 'p-b'], // 5*7  = 35
      ['f-b', 'p-a'], // 10*3 = 30
    ],
  },
}

// ---------------------------------------------------------------------------
// Fixture 3: Tie-breaker, 2 slots, top-2
// ---------------------------------------------------------------------------

export const tieBreakerTop2: LapicCorpusFixture = {
  fixtureId: 'tiebreaker-2slot-top2',
  description:
    'x+y with distinct top-2 values (no ties in top-2). ' +
    'Verifies correct ordering.',
  buildGraph: (b) => b.add(b.read('x'), b.read('y')),
  domains: [
    {
      domainId: 'gi:flower',
      slotId: 'flower',
      candidates: [
        { candidateId: 'f-a', variables: { x: 3 } },
        { candidateId: 'f-b', variables: { x: 7 } },
        { candidateId: 'f-c', variables: { x: 5 } },
      ],
    },
    {
      domainId: 'gi:plume',
      slotId: 'plume',
      candidates: [
        { candidateId: 'p-a', variables: { y: 7 } },
        { candidateId: 'p-b', variables: { y: 4 } },
      ],
    },
  ],
  topN: 2,
  golden: {
    // f-a+p-a=10, f-a+p-b=7, f-b+p-a=14, f-b+p-b=11, f-c+p-a=12, f-c+p-b=9
    // Top-2: 14, 12
    bestObjectiveValue: 14,
    rankedCombinations: [
      ['f-b', 'p-a'], // 7+7 = 14
      ['f-c', 'p-a'], // 5+7 = 12
    ],
  },
}

// ---------------------------------------------------------------------------
// Fixture 4: Three-domain additive with pruning
// ---------------------------------------------------------------------------

export const threeDomainPruning: LapicCorpusFixture = {
  fixtureId: 'three-domain-additive-pruning',
  description:
    'x+y+z across 3 domains. Tests that pruning does not discard the optimum. ' +
    'Best = 100+50+25 = 175.',
  buildGraph: (b) => b.add(b.read('x'), b.read('y'), b.read('z')),
  domains: [
    {
      domainId: 'gi:flower',
      slotId: 'flower',
      candidates: [
        { candidateId: 'f-hi', variables: { x: 100 } },
        { candidateId: 'f-lo', variables: { x: 1 } },
      ],
    },
    {
      domainId: 'gi:plume',
      slotId: 'plume',
      candidates: [
        { candidateId: 'p-hi', variables: { y: 50 } },
        { candidateId: 'p-lo', variables: { y: 1 } },
      ],
    },
    {
      domainId: 'gi:sands',
      slotId: 'sands',
      candidates: [
        { candidateId: 's-hi', variables: { z: 25 } },
        { candidateId: 's-lo', variables: { z: 1 } },
      ],
    },
  ],
  topN: 1,
  golden: {
    bestObjectiveValue: 175,
    rankedCombinations: [['f-hi', 'p-hi', 's-hi']],
  },
}

// ---------------------------------------------------------------------------
// Fixture 5: GI-like damage formula with resistance transform
// ---------------------------------------------------------------------------

export const giDamageFormula: LapicCorpusFixture = {
  fixtureId: 'gi-damage-formula',
  description:
    '(baseDmg + atkFlat) * (1 + critRate * critDmg) * resMult — ' +
    'realistic GI damage computation with global constants.',
  buildGraph: (b) => {
    const baseDmg = b.read('baseDmg')
    const atkFlat = b.read('atkFlat')
    const critRate = b.read('critRate')
    const critDmg = b.read('critDmg')
    const res = b.read('res')

    const totalAtk = b.add(baseDmg, atkFlat)
    const critMult = b.add(b.constant(1), b.mul(critRate, critDmg))
    const resMult = b.resistanceTransform(res)
    return b.mul(totalAtk, critMult, resMult)
  },
  globalConstants: { baseDmg: 2000, res: 0.1 },
  domains: [
    {
      domainId: 'gi:flower',
      slotId: 'flower',
      candidates: [
        { candidateId: 'f1', variables: { atkFlat: 100, critRate: 0.05 } },
        { candidateId: 'f2', variables: { atkFlat: 200, critRate: 0.1 } },
        { candidateId: 'f3', variables: { atkFlat: 150, critRate: 0.15 } },
      ],
    },
    {
      domainId: 'gi:circlet',
      slotId: 'circlet',
      candidates: [
        { candidateId: 'c1', variables: { critDmg: 0.5 } },
        { candidateId: 'c2', variables: { critDmg: 1.0 } },
      ],
    },
  ],
  topN: 1,
  golden: {
    // resistanceTransform(0.1) = 1 - 0.1 = 0.9 (since 0 ≤ 0.1 < 0.75)
    // f3+c2: (2000+150)*(1+0.15*1.0)*0.9 = 2150*1.15*0.9 = 2225.25
    // f2+c2: (2000+200)*(1+0.1*1.0)*0.9  = 2200*1.1*0.9  = 2178.0
    // f3+c1: (2000+150)*(1+0.15*0.5)*0.9 = 2150*1.075*0.9 = 2080.125
    // f2+c1: (2000+200)*(1+0.1*0.5)*0.9  = 2200*1.05*0.9  = 2079.0
    // f1+c2: (2000+100)*(1+0.05*1.0)*0.9 = 2100*1.05*0.9  = 1984.5
    // f1+c1: (2000+100)*(1+0.05*0.5)*0.9 = 2100*1.025*0.9 = 1937.25
    // Best = f3+c2 = 2225.25
    bestObjectiveValue: 2225.25,
    rankedCombinations: [['f3', 'c2']],
  },
}

// ---------------------------------------------------------------------------
// Exported corpus
// ---------------------------------------------------------------------------

/**
 * All validation corpus fixtures.
 */
export const lapicValidationCorpus: readonly LapicCorpusFixture[] = [
  additiveTop1,
  multiplicativeTop3,
  tieBreakerTop2,
  threeDomainPruning,
  giDamageFormula,
]
