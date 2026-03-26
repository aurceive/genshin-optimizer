import type { ICachedArtifact, ICachedSubstat } from '@genshin-optimizer/gi/db'
import type { LapicCandidateDescriptor } from '@genshin-optimizer/lapic/core'
import type { GiLapicSubstatRollTierData } from './types'
import {
  buildExpectedValueEnv,
  computeExpectedSubstatDelta,
} from './expected-env'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function mockSubstat(key: string, value: number): ICachedSubstat {
  return {
    key: key as ICachedSubstat['key'],
    value,
    rolls: [],
    efficiency: 0,
    accurateValue: value,
  }
}

function mockArtifact(
  overrides: Partial<ICachedArtifact> & { id: string }
): ICachedArtifact {
  return {
    setKey: 'GladiatorsFinale' as ICachedArtifact['setKey'],
    slotKey: 'flower',
    level: 0,
    rarity: 5 as ICachedArtifact['rarity'],
    mainStatKey: 'hp',
    mainStatVal: 717,
    location: '',
    lock: false,
    substats: [],
    unactivatedSubstats: undefined,
    ...overrides,
  }
}

function mockCandidate(
  candidateId: string,
  domainId: string
): LapicCandidateDescriptor {
  return {
    candidateId,
    domainId,
    slotId: 'flower',
    sourceRecordDigest: `digest:${candidateId}`,
    additiveFeatureDigest: `feat:${candidateId}`,
    categoricalSignatureDigest: `sig:${candidateId}`,
    discreteCounters: [],
    provenance: { sourceKind: 'inventory-slot' },
  } as LapicCandidateDescriptor
}

const SIMPLE_TIERS: GiLapicSubstatRollTierData = {
  5: {
    critRate_: [1, 2, 3, 4], // avg = 2.5
    critDMG_: [2, 4, 6, 8], // avg = 5.0
    atk_: [4, 4, 4, 4], // avg = 4.0
    hp: [100, 200, 300, 400], // avg = 250
  },
}

// ---------------------------------------------------------------------------
// computeExpectedSubstatDelta
// ---------------------------------------------------------------------------

describe('computeExpectedSubstatDelta', () => {
  it('returns empty map for fully-upgraded artifact (level 20)', () => {
    const art = mockArtifact({
      id: 'a1',
      level: 20,
      rarity: 5 as ICachedArtifact['rarity'],
      substats: [mockSubstat('critRate_', 0.1)],
    })

    const delta = computeExpectedSubstatDelta(art, SIMPLE_TIERS)
    expect(delta.size).toBe(0)
  })

  it('returns empty map for artifact with no active substats', () => {
    const art = mockArtifact({
      id: 'a2',
      level: 0,
      rarity: 5 as ICachedArtifact['rarity'],
      substats: [mockSubstat('', 0), mockSubstat('', 0)],
    })

    const delta = computeExpectedSubstatDelta(art, SIMPLE_TIERS)
    expect(delta.size).toBe(0)
  })

  it('computes correct delta for 4-substat level-0 5-star artifact', () => {
    // remaining = ceil((20 - 0) / 4) = 5
    // numSubstats = 4, rollShare = 0.25
    const art = mockArtifact({
      id: 'a3',
      level: 0,
      rarity: 5 as ICachedArtifact['rarity'],
      substats: [
        mockSubstat('critRate_', 0.1),
        mockSubstat('critDMG_', 0.2),
        mockSubstat('atk_', 0.1),
        mockSubstat('hp', 100),
      ],
    })

    const delta = computeExpectedSubstatDelta(art, SIMPLE_TIERS)

    // critRate_: 5 * 0.25 * 2.5 = 3.125
    expect(delta.get('dyn:critRate_')).toBeCloseTo(3.125)
    // critDMG_: 5 * 0.25 * 5.0 = 6.25
    expect(delta.get('dyn:critDMG_')).toBeCloseTo(6.25)
    // atk_: 5 * 0.25 * 4.0 = 5.0
    expect(delta.get('dyn:atk_')).toBeCloseTo(5.0)
    // hp: 5 * 0.25 * 250 = 312.5
    expect(delta.get('dyn:hp')).toBeCloseTo(312.5)
  })

  it('computes correct delta for 3-substat artifact', () => {
    // remaining = 5, numSubstats = 3, rollShare = 1/3
    const art = mockArtifact({
      id: 'a4',
      level: 0,
      rarity: 5 as ICachedArtifact['rarity'],
      substats: [
        mockSubstat('critRate_', 0.1),
        mockSubstat('critDMG_', 0.2),
        mockSubstat('atk_', 0.1),
      ],
    })

    const delta = computeExpectedSubstatDelta(art, SIMPLE_TIERS)

    // critRate_: 5 * (1/3) * 2.5 ≈ 4.1667
    expect(delta.get('dyn:critRate_')).toBeCloseTo(5 * (1 / 3) * 2.5)
    // critDMG_: 5 * (1/3) * 5.0 ≈ 8.3333
    expect(delta.get('dyn:critDMG_')).toBeCloseTo(5 * (1 / 3) * 5.0)
    // atk_: 5 * (1/3) * 4.0 ≈ 6.6667
    expect(delta.get('dyn:atk_')).toBeCloseTo(5 * (1 / 3) * 4.0)
  })

  it('handles partially-upgraded artifact correctly', () => {
    // level 12, rarity 5 → remaining = ceil((20 - 12) / 4) = 2
    const art = mockArtifact({
      id: 'a5',
      level: 12,
      rarity: 5 as ICachedArtifact['rarity'],
      substats: [
        mockSubstat('critRate_', 0.1),
        mockSubstat('critDMG_', 0.2),
        mockSubstat('atk_', 0.1),
        mockSubstat('hp', 100),
      ],
    })

    const delta = computeExpectedSubstatDelta(art, SIMPLE_TIERS)

    // remaining = 2, numSubstats = 4, rollShare = 0.25
    // critRate_: 2 * 0.25 * 2.5 = 1.25
    expect(delta.get('dyn:critRate_')).toBeCloseTo(1.25)
  })

  it('skips substats missing from roll tier data', () => {
    const art = mockArtifact({
      id: 'a6',
      level: 0,
      rarity: 5 as ICachedArtifact['rarity'],
      substats: [
        mockSubstat('critRate_', 0.1),
        mockSubstat('unknownStat_', 0.5),
      ],
    })

    const delta = computeExpectedSubstatDelta(art, SIMPLE_TIERS)

    expect(delta.has('dyn:critRate_')).toBe(true)
    expect(delta.has('dyn:unknownStat_')).toBe(false)
  })

  it('handles missing rarity in tier data gracefully', () => {
    const art = mockArtifact({
      id: 'a7',
      level: 0,
      rarity: 3 as ICachedArtifact['rarity'],
      substats: [mockSubstat('critRate_', 0.1)],
    })

    // SIMPLE_TIERS only has rarity 5
    const delta = computeExpectedSubstatDelta(art, SIMPLE_TIERS)
    expect(delta.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildExpectedValueEnv
// ---------------------------------------------------------------------------

describe('buildExpectedValueEnv', () => {
  it('includes global constants in the environment', () => {
    const globals = new Map([
      ['dyn:baseAtk', 500],
      ['dyn:baseDef', 300],
    ])

    const env = buildExpectedValueEnv(
      [],
      new Map(),
      () => new Map(),
      SIMPLE_TIERS,
      globals
    )

    expect(env.get('dyn:baseAtk')).toBe(500)
    expect(env.get('dyn:baseDef')).toBe(300)
  })

  it('sums current variables from multiple candidates', () => {
    const candidate1 = mockCandidate('art-1', 'domain-flower')
    const candidate2 = mockCandidate('art-2', 'domain-plume')

    const extractVariables = (candidateId: string) => {
      if (candidateId === 'art-1') {
        return new Map([
          ['dyn:critRate_', 0.05],
          ['dyn:atk_', 0.1],
        ])
      }
      return new Map([
        ['dyn:critRate_', 0.03],
        ['dyn:critDMG_', 0.2],
      ])
    }

    // Both artifacts at level 20 (no delta)
    const art1 = mockArtifact({
      id: 'art-1',
      level: 20,
      rarity: 5 as ICachedArtifact['rarity'],
    })
    const art2 = mockArtifact({
      id: 'art-2',
      level: 20,
      rarity: 5 as ICachedArtifact['rarity'],
    })
    const index = new Map([
      ['art-1', art1],
      ['art-2', art2],
    ])

    const env = buildExpectedValueEnv(
      [candidate1, candidate2],
      index,
      extractVariables,
      SIMPLE_TIERS
    )

    expect(env.get('dyn:critRate_')).toBeCloseTo(0.08) // 0.05 + 0.03
    expect(env.get('dyn:atk_')).toBeCloseTo(0.1)
    expect(env.get('dyn:critDMG_')).toBeCloseTo(0.2)
  })

  it('adds expected delta for artifacts below max level', () => {
    const candidate = mockCandidate('art-1', 'domain-flower')

    const art = mockArtifact({
      id: 'art-1',
      level: 0,
      rarity: 5 as ICachedArtifact['rarity'],
      substats: [mockSubstat('critRate_', 0.05), mockSubstat('critDMG_', 0.15)],
    })
    const index = new Map([['art-1', art]])

    const extractVariables = () =>
      new Map([
        ['dyn:critRate_', 0.05],
        ['dyn:critDMG_', 0.15],
      ])

    const env = buildExpectedValueEnv(
      [candidate],
      index,
      extractVariables,
      SIMPLE_TIERS
    )

    // remaining = 5, numSubstats = 2, rollShare = 0.5
    // critRate_ delta: 5 * 0.5 * 2.5 = 6.25
    // critDMG_ delta: 5 * 0.5 * 5.0 = 12.5
    expect(env.get('dyn:critRate_')).toBeCloseTo(0.05 + 6.25)
    expect(env.get('dyn:critDMG_')).toBeCloseTo(0.15 + 12.5)
  })

  it('combines globals, current values, and deltas', () => {
    const globals = new Map([['dyn:baseAtk', 100]])
    const candidate = mockCandidate('art-1', 'domain-flower')

    const art = mockArtifact({
      id: 'art-1',
      level: 16, // remaining = ceil(4/4) = 1
      rarity: 5 as ICachedArtifact['rarity'],
      substats: [mockSubstat('critRate_', 0.1), mockSubstat('atk_', 0.2)],
    })
    const index = new Map([['art-1', art]])

    const extractVariables = () =>
      new Map([
        ['dyn:critRate_', 0.1],
        ['dyn:atk_', 0.2],
        ['dyn:baseAtk', 50], // candidate also contributes to baseAtk
      ])

    const env = buildExpectedValueEnv(
      [candidate],
      index,
      extractVariables,
      SIMPLE_TIERS,
      globals
    )

    // baseAtk: 100 (global) + 50 (candidate) = 150
    expect(env.get('dyn:baseAtk')).toBeCloseTo(150)
    // remaining = 1, numSubstats = 2, rollShare = 0.5
    // critRate_: 0.1 + 1 * 0.5 * 2.5 = 1.35
    expect(env.get('dyn:critRate_')).toBeCloseTo(0.1 + 1.25)
    // atk_: 0.2 + 1 * 0.5 * 4.0 = 2.2
    expect(env.get('dyn:atk_')).toBeCloseTo(0.2 + 2.0)
  })

  it('handles missing artifact in index gracefully', () => {
    const candidate = mockCandidate('missing', 'domain-flower')

    const extractVariables = () => new Map([['dyn:critRate_', 0.1]])

    const env = buildExpectedValueEnv(
      [candidate],
      new Map(), // empty index
      extractVariables,
      SIMPLE_TIERS
    )

    // Current value from extractor, but no delta (artifact not found)
    expect(env.get('dyn:critRate_')).toBeCloseTo(0.1)
  })
})
