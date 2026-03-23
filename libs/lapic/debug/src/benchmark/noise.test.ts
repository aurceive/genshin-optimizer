import {
  classifyCorpusChange,
  validateLapicBenchmarkCorpusRecord,
} from './registry'
import type {
  LapicBenchmarkCorpusRecord,
  LapicCorpusVersionDescriptor,
} from './registry'
import {
  computeBenchmarkStatistics,
  computeNoiseMargin,
  evaluateRegressionGate,
  isGatingEligible,
  isPerformanceRegression,
} from './noise'
import type {
  LapicBenchmarkStatistics,
  LapicRegressionGateInput,
} from './noise'

// =========================================================================
// Corpus Registry — validation
// =========================================================================

describe('Corpus Registry validation', () => {
  const validRecord: LapicBenchmarkCorpusRecord = {
    caseId: 'case-001',
    suiteId: 'gi-public',
    corpusVersion: '0.1.0',
    ownerRole: 'benchmarkGovernanceOwner',
    gameScope: 'gi',
    fixtureDigestSet: ['sha256:abc123'],
    problemDigest: 'sha256:def456',
    adapterVersion: '1.0.0',
    runtimeProfileClass: 'public',
    arithmeticPolicyId: 'f64-strict',
    validationClass: 'goldenEnumeration',
    caseStatus: 'active',
    introducedInVersion: '0.1.0',
  }

  test('accepts valid corpus record', () => {
    const result = validateLapicBenchmarkCorpusRecord(validRecord)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.caseId).toBe('case-001')
    }
  })

  test('rejects null input', () => {
    const result = validateLapicBenchmarkCorpusRecord(null)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics[0]!.message).toMatch(/must be an object/)
    }
  })

  test('rejects non-object input', () => {
    const result = validateLapicBenchmarkCorpusRecord('string')
    expect(result.ok).toBe(false)
  })

  test('rejects empty caseId', () => {
    const result = validateLapicBenchmarkCorpusRecord({
      ...validRecord,
      caseId: '',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['caseId'] })])
      )
    }
  })

  test('rejects missing suiteId', () => {
    const { suiteId: _, ...noSuite } = validRecord
    const result = validateLapicBenchmarkCorpusRecord(noSuite)
    expect(result.ok).toBe(false)
  })

  test('rejects invalid caseStatus', () => {
    const result = validateLapicBenchmarkCorpusRecord({
      ...validRecord,
      caseStatus: 'unknown',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['caseStatus'] }),
        ])
      )
    }
  })

  test('accumulates multiple diagnostics', () => {
    const result = validateLapicBenchmarkCorpusRecord({
      caseId: '',
      suiteId: '',
      caseStatus: 'bogus',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics.length).toBeGreaterThanOrEqual(3)
    }
  })
})

// =========================================================================
// Corpus versioning — change classification
// =========================================================================

describe('Corpus version change classification', () => {
  const base: LapicCorpusVersionDescriptor = {
    version: '0.2.0',
    changeClass: 'appendOnlyMinor',
    description: 'test',
    addedCases: [],
    removedCases: [],
    modifiedCases: [],
  }

  test('appendOnlyMinor when only additions', () => {
    expect(classifyCorpusChange({ ...base, addedCases: ['case-new'] })).toBe(
      'appendOnlyMinor'
    )
  })

  test('breakingMajor when removals present', () => {
    expect(classifyCorpusChange({ ...base, removedCases: ['case-old'] })).toBe(
      'breakingMajor'
    )
  })

  test('breakingMajor when modifications present', () => {
    expect(
      classifyCorpusChange({
        ...base,
        modifiedCases: ['case-mod'],
      })
    ).toBe('breakingMajor')
  })

  test('breakingMajor takes priority over additions', () => {
    expect(
      classifyCorpusChange({
        ...base,
        addedCases: ['case-new'],
        removedCases: ['case-old'],
      })
    ).toBe('breakingMajor')
  })

  test('governancePatch when no case changes', () => {
    expect(classifyCorpusChange(base)).toBe('governancePatch')
  })
})

// =========================================================================
// Noise Policy — statistics
// =========================================================================

describe('Benchmark statistics computation', () => {
  test('computes correct median and MAD', () => {
    const stats = computeBenchmarkStatistics([
      100, 102, 104, 106, 108, 110, 112, 114, 116,
    ])
    expect(stats.medianMs).toBe(108)
    expect(stats.sampleCount).toBe(9)
    expect(stats.minMs).toBe(100)
    expect(stats.maxMs).toBe(116)
  })

  test('computes MAD ratio correctly', () => {
    // All identical => MAD = 0, ratio = 0
    const stats = computeBenchmarkStatistics([50, 50, 50, 50, 50])
    expect(stats.madRatio).toBe(0)
    expect(stats.iqrMs).toBe(0)
  })

  test('handles unsorted input by sorting', () => {
    const stats = computeBenchmarkStatistics([300, 100, 200])
    expect(stats.medianMs).toBe(200)
    expect(stats.minMs).toBe(100)
    expect(stats.maxMs).toBe(300)
  })

  test('throws on empty input', () => {
    expect(() => computeBenchmarkStatistics([])).toThrow(/empty durations/)
  })

  test('single sample', () => {
    const stats = computeBenchmarkStatistics([42])
    expect(stats.medianMs).toBe(42)
    expect(stats.sampleCount).toBe(1)
    expect(stats.madRatio).toBe(0)
  })
})

// =========================================================================
// Noise Policy — margin computation
// =========================================================================

describe('Noise margin computation', () => {
  test('fallback 7% when no baseline', () => {
    expect(computeNoiseMargin(undefined)).toBeCloseTo(0.07)
  })

  test('minimum 5% when MAD is low', () => {
    const baseline: LapicBenchmarkStatistics = {
      medianMs: 100,
      sampleCount: 10,
      madRatio: 0.01,
      iqrMs: 2,
      minMs: 98,
      maxMs: 104,
    }
    expect(computeNoiseMargin(baseline)).toBe(0.05)
  })

  test('2 × MAD ratio when MAD is high', () => {
    const baseline: LapicBenchmarkStatistics = {
      medianMs: 100,
      sampleCount: 10,
      madRatio: 0.1,
      iqrMs: 20,
      minMs: 80,
      maxMs: 120,
    }
    // 2 * 0.1 = 0.2 > 0.05
    expect(computeNoiseMargin(baseline)).toBe(0.2)
  })
})

// =========================================================================
// Noise Policy — environment eligibility
// =========================================================================

describe('Environment gating eligibility', () => {
  test('controlled lab is eligible', () => {
    expect(isGatingEligible('browserControlledLab')).toBe(true)
  })

  test('browser CI is eligible', () => {
    expect(isGatingEligible('browserCI')).toBe(true)
  })

  test('node CI is eligible', () => {
    expect(isGatingEligible('nodeCI')).toBe(true)
  })

  test('uncontrolled browser local is NOT eligible', () => {
    expect(isGatingEligible('browserUncontrolledLocal')).toBe(false)
  })
})

// =========================================================================
// Noise Policy — regression detection
// =========================================================================

describe('Regression detection', () => {
  const baseline: LapicBenchmarkStatistics = {
    medianMs: 100,
    sampleCount: 20,
    madRatio: 0.02,
    iqrMs: 4,
    minMs: 96,
    maxMs: 108,
  }

  test('detects true regression (>5% above baseline)', () => {
    const candidate: LapicBenchmarkStatistics = {
      ...baseline,
      medianMs: 110,
    }
    expect(isPerformanceRegression(baseline, candidate)).toBe(true)
  })

  test('passes candidate within margin (<5%)', () => {
    const candidate: LapicBenchmarkStatistics = {
      ...baseline,
      medianMs: 104,
    }
    expect(isPerformanceRegression(baseline, candidate)).toBe(false)
  })

  test('borderline at exact threshold is not regression', () => {
    const candidate: LapicBenchmarkStatistics = {
      ...baseline,
      medianMs: 105, // exactly at 5%
    }
    expect(isPerformanceRegression(baseline, candidate)).toBe(false)
  })
})

// =========================================================================
// Noise Policy — full regression gate
// =========================================================================

describe('Full regression gate evaluation', () => {
  const baseline: LapicBenchmarkStatistics = {
    medianMs: 100,
    sampleCount: 20,
    madRatio: 0.02,
    iqrMs: 4,
    minMs: 96,
    maxMs: 108,
  }

  test('blocks correctness-unqualified candidates', () => {
    const input: LapicRegressionGateInput = {
      environmentClass: 'browserCI',
      correctnessQualified: false,
      baselineStats: baseline,
      candidateStats: { ...baseline, medianMs: 200 },
    }
    const result = evaluateRegressionGate(input)
    expect(result.gated).toBe(false)
    expect(result.classification).toBe('correctnessBlockedComparison')
  })

  test('skips gating for ineligible environments', () => {
    const input: LapicRegressionGateInput = {
      environmentClass: 'browserUncontrolledLocal',
      correctnessQualified: true,
      baselineStats: baseline,
      candidateStats: { ...baseline, medianMs: 200 },
    }
    const result = evaluateRegressionGate(input)
    expect(result.gated).toBe(false)
    expect(result.classification).toBe('not-applicable')
  })

  test('gates true regression in eligible environment', () => {
    const input: LapicRegressionGateInput = {
      environmentClass: 'browserCI',
      correctnessQualified: true,
      baselineStats: baseline,
      candidateStats: { ...baseline, medianMs: 120 },
    }
    const result = evaluateRegressionGate(input)
    expect(result.gated).toBe(true)
    expect(result.classification).toBe('truePerformanceRegression')
    expect(result.reason).toContain('120ms')
  })

  test('passes candidate within noise margin', () => {
    const input: LapicRegressionGateInput = {
      environmentClass: 'nodeCI',
      correctnessQualified: true,
      baselineStats: baseline,
      candidateStats: { ...baseline, medianMs: 103 },
    }
    const result = evaluateRegressionGate(input)
    expect(result.gated).toBe(false)
    expect(result.classification).toBe('not-applicable')
  })

  test('uses custom noise margin when provided', () => {
    const input: LapicRegressionGateInput = {
      environmentClass: 'browserCI',
      correctnessQualified: true,
      baselineStats: baseline,
      candidateStats: { ...baseline, medianMs: 120 },
      noiseMargin: 0.25, // 25% — candidate is within
    }
    const result = evaluateRegressionGate(input)
    expect(result.gated).toBe(false)
  })
})
