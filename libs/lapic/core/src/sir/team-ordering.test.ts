/**
 * Tests for Team-Level Tie-Break & Ordering (§7.3)
 */

import {
  compareTeamResults,
  createTeamTieBreakKey,
  sortTeamResults,
} from './team-ordering'
import type { LapicTeamResultEntry } from './team-ordering'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  objectiveValue: number,
  candidateIds: string[],
  overrides?: Partial<LapicTeamResultEntry>
): LapicTeamResultEntry {
  return {
    objectiveValue,
    slotCandidateIds: candidateIds,
    slotIds: candidateIds.map((_, i) => `gi-slot-${i}`),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// createTeamTieBreakKey
// ---------------------------------------------------------------------------

describe('createTeamTieBreakKey', () => {
  test('produces stable key from slot IDs and candidate IDs', () => {
    const entry = makeEntry(100, ['charA', 'charB', 'charC', 'charD'])
    const key = createTeamTieBreakKey(entry)

    expect(key).toBe(
      'gi-slot-0=charA|gi-slot-1=charB|gi-slot-2=charC|gi-slot-3=charD'
    )
  })

  test('same inputs always produce same key', () => {
    const e1 = makeEntry(50, ['x', 'y'])
    const e2 = makeEntry(50, ['x', 'y'])

    expect(createTeamTieBreakKey(e1)).toBe(createTeamTieBreakKey(e2))
  })

  test('different candidate IDs produce different keys', () => {
    const e1 = makeEntry(50, ['x', 'y'])
    const e2 = makeEntry(50, ['x', 'z'])

    expect(createTeamTieBreakKey(e1)).not.toBe(createTeamTieBreakKey(e2))
  })

  test('handles empty candidate list', () => {
    const entry = makeEntry(0, [])
    const key = createTeamTieBreakKey(entry)

    expect(key).toBe('')
  })
})

// ---------------------------------------------------------------------------
// compareTeamResults
// ---------------------------------------------------------------------------

describe('compareTeamResults', () => {
  test('higher objective wins (ranks first)', () => {
    const a = makeEntry(200, ['x', 'y'])
    const b = makeEntry(100, ['x', 'y'])

    expect(compareTeamResults(a, b)).toBeLessThan(0)
  })

  test('lower objective loses (ranks second)', () => {
    const a = makeEntry(100, ['x', 'y'])
    const b = makeEntry(200, ['x', 'y'])

    expect(compareTeamResults(a, b)).toBeGreaterThan(0)
  })

  test('same objective → tie-break by candidate IDs', () => {
    const a = makeEntry(100, ['alpha', 'beta'])
    const b = makeEntry(100, ['gamma', 'delta'])

    const cmp = compareTeamResults(a, b)
    // 'alpha' < 'gamma' alphabetically, so a should rank first
    expect(cmp).toBeLessThan(0)
  })

  test('secondary objective comparison when primary ties', () => {
    const a = makeEntry(100, ['x', 'y'], {
      secondaryObjectiveValues: [50, 30],
    })
    const b = makeEntry(100, ['x', 'y'], {
      secondaryObjectiveValues: [50, 20],
    })

    // Same primary, same secondary[0], secondary[1]: 30 > 20 → a wins
    expect(compareTeamResults(a, b)).toBeLessThan(0)
  })

  test('secondary objective: first dimension breaks tie', () => {
    const a = makeEntry(100, ['x', 'y'], {
      secondaryObjectiveValues: [40, 30],
    })
    const b = makeEntry(100, ['x', 'y'], {
      secondaryObjectiveValues: [50, 20],
    })

    // secondary[0]: 50 > 40 → b wins
    expect(compareTeamResults(a, b)).toBeGreaterThan(0)
  })

  test('missing secondary treated as 0', () => {
    const a = makeEntry(100, ['x', 'y'], {
      secondaryObjectiveValues: [50],
    })
    const b = makeEntry(100, ['x', 'y'], {
      secondaryObjectiveValues: [50, 20],
    })

    // secondary[1]: 0 < 20 → b wins
    expect(compareTeamResults(a, b)).toBeGreaterThan(0)
  })

  test('identical results → 0', () => {
    const a = makeEntry(100, ['x', 'y'])
    const b = makeEntry(100, ['x', 'y'])

    expect(compareTeamResults(a, b)).toBe(0)
  })

  test('determinism: same inputs always produce same order', () => {
    const a = makeEntry(100, ['alpha', 'beta'])
    const b = makeEntry(100, ['gamma', 'delta'])

    const cmp1 = compareTeamResults(a, b)
    const cmp2 = compareTeamResults(a, b)

    expect(cmp1).toBe(cmp2)
  })

  test('anti-symmetry: compare(a,b) = -compare(b,a)', () => {
    const a = makeEntry(150, ['x', 'y'])
    const b = makeEntry(100, ['x', 'y'])

    expect(Math.sign(compareTeamResults(a, b))).toBe(
      -Math.sign(compareTeamResults(b, a))
    )
  })
})

// ---------------------------------------------------------------------------
// sortTeamResults
// ---------------------------------------------------------------------------

describe('sortTeamResults', () => {
  test('sorts by descending objective', () => {
    const results = [
      makeEntry(50, ['a']),
      makeEntry(200, ['b']),
      makeEntry(100, ['c']),
    ]

    const sorted = sortTeamResults(results)

    expect(sorted[0].objectiveValue).toBe(200)
    expect(sorted[1].objectiveValue).toBe(100)
    expect(sorted[2].objectiveValue).toBe(50)
  })

  test('ties broken by candidate IDs', () => {
    const results = [
      makeEntry(100, ['charlie']),
      makeEntry(100, ['alpha']),
      makeEntry(100, ['bravo']),
    ]

    const sorted = sortTeamResults(results)

    expect(sorted[0].slotCandidateIds[0]).toBe('alpha')
    expect(sorted[1].slotCandidateIds[0]).toBe('bravo')
    expect(sorted[2].slotCandidateIds[0]).toBe('charlie')
  })

  test('does not mutate original array', () => {
    const results = [makeEntry(50, ['a']), makeEntry(200, ['b'])]

    const sorted = sortTeamResults(results)

    expect(results[0].objectiveValue).toBe(50)
    expect(sorted[0].objectiveValue).toBe(200)
    expect(sorted).not.toBe(results)
  })

  test('empty array → empty result', () => {
    const sorted = sortTeamResults([])
    expect(sorted).toEqual([])
  })

  test('single element → unchanged', () => {
    const results = [makeEntry(42, ['x'])]
    const sorted = sortTeamResults(results)

    expect(sorted).toHaveLength(1)
    expect(sorted[0].objectiveValue).toBe(42)
  })
})
