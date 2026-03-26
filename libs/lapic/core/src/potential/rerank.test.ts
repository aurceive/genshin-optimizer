import { rerankByPotential } from './rerank'
import type {
  LapicPotentialRerankEvaluator,
  LapicRerankCandidateEntry,
} from './types'

function entry(
  id: string,
  value: string,
  orderingKey?: readonly string[]
): LapicRerankCandidateEntry {
  return {
    stateId: id,
    candidates: [],
    evaluation: {
      objectiveValue: value,
      evidenceDigest: `digest:${id}`,
      ...(orderingKey ? { orderingKey } : {}),
    },
  }
}

describe('rerankByPotential', () => {
  it('returns empty for empty input', () => {
    const evaluator: LapicPotentialRerankEvaluator = () => undefined
    const { reranked, summary } = rerankByPotential([], evaluator)
    expect(reranked).toEqual([])
    expect(summary).toEqual({
      totalEntries: 0,
      evaluatedEntries: 0,
      reorderedCount: 0,
    })
  })

  it('preserves order when evaluator returns undefined for all', () => {
    // Already sorted best-to-worst by objectiveValue (lexicographic)
    const entries = [entry('a', '300'), entry('b', '200'), entry('c', '100')]
    const evaluator: LapicPotentialRerankEvaluator = () => undefined
    const { reranked, summary } = rerankByPotential(entries, evaluator)
    expect(reranked.map((e) => e.stateId)).toEqual(['a', 'b', 'c'])
    expect(summary.evaluatedEntries).toBe(0)
    expect(summary.reorderedCount).toBe(0)
  })

  it('reranks entries by potential ordering key', () => {
    const entries = [entry('a', '300'), entry('b', '200'), entry('c', '100')]
    const evaluator: LapicPotentialRerankEvaluator = (e) => {
      // Reverse: c gets highest potential, a gets lowest
      const potentialMap: Record<string, string> = {
        a: '010',
        b: '020',
        c: '030',
      }
      return {
        potentialOrderingKey: [potentialMap[e.stateId] ?? '000'],
        potentialEvidenceDigest: `pot:${e.stateId}`,
      }
    }
    const { reranked, summary } = rerankByPotential(entries, evaluator)
    expect(reranked.map((e) => e.stateId)).toEqual(['c', 'b', 'a'])
    expect(summary.evaluatedEntries).toBe(3)
    expect(summary.reorderedCount).toBeGreaterThan(0)
  })

  it('mixes evaluated and unevaluated entries', () => {
    const entries = [
      entry('a', '150'),
      entry('b', '140'),
      entry('c', '130'),
      entry('d', '120'),
    ]
    const evaluator: LapicPotentialRerankEvaluator = (e) => {
      // Only evaluate b and c, giving c higher potential than all others
      if (e.stateId === 'b')
        return {
          potentialOrderingKey: ['200'],
          potentialEvidenceDigest: 'pot:b',
        }
      if (e.stateId === 'c')
        return {
          potentialOrderingKey: ['300'],
          potentialEvidenceDigest: 'pot:c',
        }
      return undefined
    }
    const { reranked, summary } = rerankByPotential(entries, evaluator)
    // c(pot:300) > b(pot:200) > a(fallback:150) > d(fallback:120)
    expect(reranked.map((e) => e.stateId)).toEqual(['c', 'b', 'a', 'd'])
    expect(summary.evaluatedEntries).toBe(2)
  })

  it('attaches potentialOrderingKey and potentialEvidenceDigest to evaluated entries', () => {
    const entries = [entry('a', '300')]
    const evaluator: LapicPotentialRerankEvaluator = () => ({
      potentialOrderingKey: ['999'],
      potentialEvidenceDigest: 'pot:ev',
    })
    const { reranked } = rerankByPotential(entries, evaluator)
    expect(reranked[0]!.potentialOrderingKey).toEqual(['999'])
    expect(reranked[0]!.potentialEvidenceDigest).toBe('pot:ev')
  })

  it('does not attach potential fields to unevaluated entries', () => {
    const entries = [entry('a', '300')]
    const evaluator: LapicPotentialRerankEvaluator = () => undefined
    const { reranked } = rerankByPotential(entries, evaluator)
    expect(reranked[0]!.potentialOrderingKey).toBeUndefined()
    expect(reranked[0]!.potentialEvidenceDigest).toBeUndefined()
  })

  it('is stable — equal potential keys preserve current-value order', () => {
    const entries = [entry('a', '300'), entry('b', '200'), entry('c', '100')]
    const evaluator: LapicPotentialRerankEvaluator = () => ({
      potentialOrderingKey: ['same'],
      potentialEvidenceDigest: 'pot:same',
    })
    const { reranked, summary } = rerankByPotential(entries, evaluator)
    // All have equal potential key → stable: original order preserved
    expect(reranked.map((e) => e.stateId)).toEqual(['a', 'b', 'c'])
    expect(summary.reorderedCount).toBe(0)
  })

  it('is idempotent — reranking already-reranked entries gives same result', () => {
    const entries = [entry('a', '300'), entry('b', '200'), entry('c', '100')]
    const evaluator: LapicPotentialRerankEvaluator = (e) => ({
      potentialOrderingKey: [e.stateId === 'c' ? '999' : '001'],
      potentialEvidenceDigest: `pot:${e.stateId}`,
    })
    const first = rerankByPotential(entries, evaluator)
    const second = rerankByPotential(first.reranked, evaluator)
    expect(second.reranked.map((e) => e.stateId)).toEqual(
      first.reranked.map((e) => e.stateId)
    )
  })
})
