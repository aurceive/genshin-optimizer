import {
  isBranchRegionGuardSatisfied,
  isDominated,
  isFullyDominated,
  isUpperBoundGuardSatisfied,
} from './compare'
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

describe('isUpperBoundGuardSatisfied', () => {
  function vec(
    dims: number[],
    ub?: number[],
    br?: string
  ): LapicDominanceVector {
    return {
      candidateId: 'x',
      dimensions: dims,
      ...(ub ? { upperBoundDimensions: ub } : {}),
      ...(br ? { branchRegionDigest: br } : {}),
    }
  }

  it('returns true when neither has upper bounds (additive-safe)', () => {
    expect(isUpperBoundGuardSatisfied(vec([10]), vec([5]))).toBe(true)
  })

  it('returns true when only dominator has upper bounds', () => {
    expect(isUpperBoundGuardSatisfied(vec([10], [15]), vec([5]))).toBe(true)
  })

  it('returns true when only dominated has upper bounds', () => {
    expect(isUpperBoundGuardSatisfied(vec([10]), vec([5], [8]))).toBe(true)
  })

  it('returns true when dominator upper bounds >= dominated', () => {
    expect(
      isUpperBoundGuardSatisfied(vec([10], [20, 30]), vec([5], [15, 25]))
    ).toBe(true)
  })

  it('returns true when upper bounds are equal', () => {
    expect(
      isUpperBoundGuardSatisfied(vec([10], [20, 30]), vec([5], [20, 30]))
    ).toBe(true)
  })

  it('returns false when dominator upper bound < dominated on any dim', () => {
    expect(
      isUpperBoundGuardSatisfied(vec([10], [20, 25]), vec([5], [15, 30]))
    ).toBe(false)
  })

  it('returns false when upper bound dimension counts differ', () => {
    expect(
      isUpperBoundGuardSatisfied(vec([10], [20]), vec([5], [15, 25]))
    ).toBe(false)
  })
})

describe('isBranchRegionGuardSatisfied', () => {
  function vec(dims: number[], br?: string): LapicDominanceVector {
    return {
      candidateId: 'x',
      dimensions: dims,
      ...(br ? { branchRegionDigest: br } : {}),
    }
  }

  it('returns true when neither has a digest (region-agnostic)', () => {
    expect(isBranchRegionGuardSatisfied(vec([10]), vec([5]))).toBe(true)
  })

  it('returns true when both have the same digest', () => {
    expect(
      isBranchRegionGuardSatisfied(vec([10], 'region-A'), vec([5], 'region-A'))
    ).toBe(true)
  })

  it('returns false when digests differ', () => {
    expect(
      isBranchRegionGuardSatisfied(vec([10], 'region-A'), vec([5], 'region-B'))
    ).toBe(false)
  })

  it('returns false when only one has a digest', () => {
    expect(isBranchRegionGuardSatisfied(vec([10], 'region-A'), vec([5]))).toBe(
      false
    )
    expect(isBranchRegionGuardSatisfied(vec([10]), vec([5], 'region-B'))).toBe(
      false
    )
  })
})

describe('isFullyDominated', () => {
  function vec(
    id: string,
    dims: number[],
    ub?: number[],
    br?: string
  ): LapicDominanceVector {
    return {
      candidateId: id,
      dimensions: dims,
      ...(ub ? { upperBoundDimensions: ub } : {}),
      ...(br ? { branchRegionDigest: br } : {}),
    }
  }

  it('returns true when all conditions pass', () => {
    expect(
      isFullyDominated(
        vec('a', [10, 20], [30, 40], 'same'),
        vec('b', [5, 15], [25, 35], 'same')
      )
    ).toBe(true)
  })

  it('returns false when condition 2 fails (dimensions)', () => {
    expect(
      isFullyDominated(
        vec('a', [5, 20], [30, 40], 'same'),
        vec('b', [10, 15], [25, 35], 'same')
      )
    ).toBe(false)
  })

  it('returns false when condition 3 fails (upper bounds)', () => {
    expect(
      isFullyDominated(
        vec('a', [10, 20], [30, 25], 'same'),
        vec('b', [5, 15], [25, 35], 'same')
      )
    ).toBe(false)
  })

  it('returns false when condition 4 fails (branch region)', () => {
    expect(
      isFullyDominated(
        vec('a', [10, 20], [30, 40], 'region-A'),
        vec('b', [5, 15], [25, 35], 'region-B')
      )
    ).toBe(false)
  })

  it('works with conditions 3+4 absent (backward compatible)', () => {
    expect(isFullyDominated(vec('a', [10, 20]), vec('b', [5, 15]))).toBe(true)
  })
})

describe('computeSkyline with conditions 3+4', () => {
  function vec(
    id: string,
    dims: number[],
    ub?: number[],
    br?: string
  ): LapicDominanceVector {
    return {
      candidateId: id,
      dimensions: dims,
      ...(ub ? { upperBoundDimensions: ub } : {}),
      ...(br ? { branchRegionDigest: br } : {}),
    }
  }

  it('preserves entry with lower dims but higher upper bounds', () => {
    const entries = [vec('a', [10, 20], [15, 22]), vec('b', [5, 15], [25, 35])]
    const result = computeSkyline(entries)
    expect(result.kept).toHaveLength(2)
    expect(result.dominatedPairs).toEqual([])
  })

  it('removes dominated entry when upper bounds also dominated', () => {
    const entries = [vec('a', [10, 20], [30, 40]), vec('b', [5, 15], [25, 35])]
    const result = computeSkyline(entries)
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0]!.candidateId).toBe('a')
  })

  it('prevents dominance across different branch regions', () => {
    const entries = [
      vec('a', [10, 20], undefined, 'region-A'),
      vec('b', [5, 15], undefined, 'region-B'),
    ]
    const result = computeSkyline(entries)
    // b would be dominated by a on dimensions alone, but branch guard blocks it
    expect(result.kept).toHaveLength(2)
    expect(result.dominatedPairs).toEqual([])
  })

  it('allows dominance within same branch region', () => {
    const entries = [
      vec('a', [10, 20], undefined, 'region-A'),
      vec('b', [5, 15], undefined, 'region-A'),
    ]
    const result = computeSkyline(entries)
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0]!.candidateId).toBe('a')
  })

  it('mixed: condition 3 prevents some dominations, condition 4 prevents others', () => {
    const entries = [
      vec('a', [10, 20], [30, 40], 'region-A'),
      vec('b', [5, 15], [25, 35], 'region-A'), // dominated by a (same region, ub okay)
      vec('c', [3, 10], [50, 50], 'region-A'), // NOT dominated (ub exceeds a)
      vec('d', [2, 8], [10, 10], 'region-B'), // NOT dominated (different region)
    ]
    const result = computeSkyline(entries)
    const keptIds = result.kept.map((k) => k.candidateId).sort()
    expect(keptIds).toEqual(['a', 'c', 'd'])
  })
})

describe('extractDominanceVector with context', () => {
  it('extracts upper bound dimensions from context', () => {
    const vars = new Map([
      ['x', 10],
      ['y', 20],
    ])
    const ubVars = new Map([
      ['x', 15],
      ['y', 30],
    ])
    const vector = extractDominanceVector('cand-a', vars, ['x', 'y'], {
      upperBoundVariables: ubVars,
    })
    expect(vector.dimensions).toEqual([10, 20])
    expect(vector.upperBoundDimensions).toEqual([15, 30])
  })

  it('extracts branch region digest from context', () => {
    const vars = new Map([['x', 10]])
    const vector = extractDominanceVector('cand-a', vars, ['x'], {
      branchRegionDigest: 'region-A',
    })
    expect(vector.branchRegionDigest).toBe('region-A')
  })

  it('omits optional fields when context is absent', () => {
    const vars = new Map([['x', 10]])
    const vector = extractDominanceVector('cand-a', vars, ['x'])
    expect(vector.upperBoundDimensions).toBeUndefined()
    expect(vector.branchRegionDigest).toBeUndefined()
  })

  it('handles missing upper bound variables as 0', () => {
    const vars = new Map([['x', 10]])
    const ubVars = new Map<string, number>()
    const vector = extractDominanceVector('cand-a', vars, ['x'], {
      upperBoundVariables: ubVars,
    })
    expect(vector.upperBoundDimensions).toEqual([0])
  })
})

describe('validation with conditions 3+4', () => {
  it('isValidDominanceVector validates upper bound dimensions length', () => {
    expect(
      isValidDominanceVector({
        candidateId: 'a',
        dimensions: [10, 20],
        upperBoundDimensions: [15], // wrong length
      })
    ).toBe(false)
  })

  it('isValidDominanceVector rejects non-finite upper bounds', () => {
    expect(
      isValidDominanceVector({
        candidateId: 'a',
        dimensions: [10],
        upperBoundDimensions: [NaN],
      })
    ).toBe(false)
  })

  it('isValidDominanceVector rejects upper bounds below point values', () => {
    expect(
      isValidDominanceVector({
        candidateId: 'a',
        dimensions: [10, 20],
        upperBoundDimensions: [15, 15], // ub[1] < dim[1]
      })
    ).toBe(false)
  })

  it('isValidDominanceVector accepts valid upper bounds', () => {
    expect(
      isValidDominanceVector({
        candidateId: 'a',
        dimensions: [10, 20],
        upperBoundDimensions: [15, 30],
      })
    ).toBe(true)
  })
})
