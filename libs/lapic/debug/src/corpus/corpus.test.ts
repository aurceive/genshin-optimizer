/**
 * Validation corpus regression tests (§5.2 — Golden Enumeration Tests).
 *
 * Runs every corpus fixture through the full solve pipeline, comparing
 * against exhaustive oracle ground truth.
 */

import { lapicValidationCorpus } from './fixtures'
import { runCorpusFixture } from './runner'

describe('validation corpus', () => {
  for (const fixture of lapicValidationCorpus) {
    it(`${fixture.fixtureId}: ${fixture.description}`, async () => {
      const result = await runCorpusFixture(fixture)

      if (!result.passed) {
        const messages = result.violations.map(
          (v) => `  [${v.kind}] ${v.message}`
        )
        throw new Error(
          `Corpus fixture '${fixture.fixtureId}' failed:\n${messages.join('\n')}`
        )
      }

      expect(result.passed).toBe(true)
      expect(result.oracleMaxValue).toBe(fixture.golden.bestObjectiveValue)
    })
  }

  it('solver produces fewer evaluations than brute-force when pruning is active', async () => {
    // The three-domain fixture should benefit from pruning
    const fixture = lapicValidationCorpus.find(
      (f) => f.fixtureId === 'three-domain-additive-pruning'
    )!
    const result = await runCorpusFixture(fixture)
    expect(result.passed).toBe(true)
    // 2*2*2 = 8 total combinations; pruning should skip some
    expect(result.evaluationCount).toBeLessThan(result.totalCombinations)
  })

  it('all fixtures in corpus have unique fixture IDs', () => {
    const ids = lapicValidationCorpus.map((f) => f.fixtureId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
