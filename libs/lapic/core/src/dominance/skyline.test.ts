import { isDominated } from './compare'
import {
  deriveDominanceVariableOrder,
  extractDominanceVector,
} from './projection'
import { computeSkyline } from './skyline'
import type { LapicDominanceVector } from './types'
import {
  isValidDominanceVector,
  isValidSkylineSummary,
  validateSkylineResult,
} from './validation'

describe('isDominated', () => {
  it('returns false for empty vectors', () => {
    expect(isDominated([], [])).toBe(false)
  })

  it('returns true when a strictly dominates b', () => {
    expect(isDominated([10, 20], [5, 15])).toBe(true)
  })

  it('returns true when a weakly dominates b (>= all, > at least one)', () => {
    expect(isDominated([10, 20], [10, 15])).toBe(true)
  })

  it('returns false for equal vectors (Pareto-equivalent)', () => {
    expect(isDominated([10, 20], [10, 20])).toBe(false)
  })

  it('returns false when a is worse on at least one dimension', () => {
    expect(isDominated([5, 20], [10, 15])).toBe(false)
  })

  it('returns false for different-length vectors', () => {
    expect(isDominated([10], [5, 15])).toBe(false)
  })

  it('handles single-dimension dominance', () => {
    expect(isDominated([10], [5])).toBe(true)
    expect(isDominated([5], [10])).toBe(false)
    expect(isDominated([5], [5])).toBe(false)
  })
})

describe('computeSkyline', () => {
  function vec(id: string, dims: number[]): LapicDominanceVector {
    return { candidateId: id, dimensions: dims }
  }

  it('returns empty for empty input', () => {
    const result = computeSkyline([])
    expect(result.kept).toEqual([])
    expect(result.dominatedPairs).toEqual([])
  })

  it('returns the single entry for single input', () => {
    const entry = vec('a', [10, 20])
    const result = computeSkyline([entry])
    expect(result.kept).toEqual([entry])
    expect(result.dominatedPairs).toEqual([])
  })

  it('keeps all entries when none is dominated', () => {
    const entries = [vec('a', [10, 5]), vec('b', [5, 10])]
    const result = computeSkyline(entries)
    expect(result.kept).toHaveLength(2)
    expect(result.dominatedPairs).toEqual([])
  })

  it('removes dominated entries', () => {
    const entries = [vec('a', [10, 20]), vec('b', [5, 15]), vec('c', [3, 10])]
    const result = computeSkyline(entries)
    expect(result.kept).toEqual([vec('a', [10, 20])])
    expect(result.dominatedPairs).toHaveLength(2)
  })

  it('keeps all Pareto-equivalent entries (identical vectors)', () => {
    const entries = [vec('a', [10, 20]), vec('b', [10, 20])]
    const result = computeSkyline(entries)
    expect(result.kept).toHaveLength(2)
    expect(result.dominatedPairs).toEqual([])
  })

  it('handles partial dominance (some kept, some removed)', () => {
    const entries = [
      vec('a', [10, 5]),
      vec('b', [5, 10]),
      vec('c', [3, 3]),
      vec('d', [8, 8]),
    ]
    const result = computeSkyline(entries)
    const keptIds = result.kept.map((k) => k.candidateId).sort()
    expect(keptIds).toEqual(['a', 'b', 'd'])
    expect(result.dominatedPairs).toHaveLength(1)
    expect(result.dominatedPairs[0]!.dominatedCandidateId).toBe('c')
  })

  it('preserves input order in kept entries', () => {
    const entries = [vec('z', [1, 10]), vec('a', [10, 1]), vec('m', [5, 5])]
    const result = computeSkyline(entries)
    expect(result.kept.map((k) => k.candidateId)).toEqual(['z', 'a', 'm'])
  })

  it('is idempotent — re-running on kept yields same result', () => {
    const entries = [vec('a', [10, 5]), vec('b', [5, 10]), vec('c', [3, 3])]
    const first = computeSkyline(entries)
    const second = computeSkyline(first.kept)
    expect(second.kept).toEqual(first.kept)
    expect(second.dominatedPairs).toEqual([])
  })
})

describe('deriveDominanceVariableOrder', () => {
  it('returns sorted union of all variable IDs', () => {
    const allVars = new Map([
      [
        'cand-a',
        new Map([
          ['x', 10],
          ['z', 30],
        ]),
      ],
      [
        'cand-b',
        new Map([
          ['x', 5],
          ['y', 20],
          ['z', 15],
        ]),
      ],
    ])
    expect(deriveDominanceVariableOrder(allVars)).toEqual(['x', 'y', 'z'])
  })

  it('returns empty for empty input', () => {
    expect(deriveDominanceVariableOrder(new Map())).toEqual([])
  })
})

describe('extractDominanceVector', () => {
  it('extracts values in specified order', () => {
    const vars = new Map([
      ['x', 10],
      ['y', 20],
      ['z', 30],
    ])
    const vector = extractDominanceVector('cand-a', vars, ['z', 'x', 'y'])
    expect(vector).toEqual({
      candidateId: 'cand-a',
      dimensions: [30, 10, 20],
    })
  })

  it('uses 0 for missing variables', () => {
    const vars = new Map([['x', 10]])
    const vector = extractDominanceVector('cand-a', vars, ['x', 'y'])
    expect(vector).toEqual({
      candidateId: 'cand-a',
      dimensions: [10, 0],
    })
  })
})

describe('validation', () => {
  it('isValidDominanceVector rejects empty dimensions', () => {
    expect(isValidDominanceVector({ candidateId: 'a', dimensions: [] })).toBe(
      false
    )
  })

  it('isValidDominanceVector rejects non-finite dimensions', () => {
    expect(
      isValidDominanceVector({ candidateId: 'a', dimensions: [1, NaN, 3] })
    ).toBe(false)
    expect(
      isValidDominanceVector({
        candidateId: 'a',
        dimensions: [1, Infinity, 3],
      })
    ).toBe(false)
  })

  it('isValidDominanceVector accepts finite non-empty vectors', () => {
    expect(
      isValidDominanceVector({ candidateId: 'a', dimensions: [1, 2, 3] })
    ).toBe(true)
  })

  it('validateSkylineResult passes for valid skyline', () => {
    const result = computeSkyline([
      { candidateId: 'a', dimensions: [10, 5] },
      { candidateId: 'b', dimensions: [5, 10] },
      { candidateId: 'c', dimensions: [3, 3] },
    ])
    expect(validateSkylineResult(result)).toBe(true)
  })

  it('isValidSkylineSummary validates counts', () => {
    expect(
      isValidSkylineSummary({
        totalRows: 10,
        keptRows: 7,
        dominatedCount: 3,
        groupCount: 2,
      })
    ).toBe(true)
    expect(
      isValidSkylineSummary({
        totalRows: 10,
        keptRows: 7,
        dominatedCount: 4,
        groupCount: 2,
      })
    ).toBe(false)
  })
})
