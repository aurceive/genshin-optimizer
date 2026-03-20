import { createLapicWorkerRequest } from '../builders'
import { validateLapicWorkerRequest } from './worker'

describe('lapic runtime worker validation', () => {
  it('validates a worker request with a supported work unit', () => {
    const result = validateLapicWorkerRequest(
      createLapicWorkerRequest('StartWork', 'session-id', {
        workUnitId: 'work-id',
        kind: 'AnalyzeRegion',
        determinismClass: 'pure-deterministic',
        priority: {
          upperBoundOrderingDigest: 'upper-bound',
          uncertaintyGapDigest: 'uncertainty-gap',
          residualCostDigest: 'residual-cost',
          deterministicTieBreakDigest: 'tie-break',
          costModelVersion: 'cost-model-v1',
        },
        retryPolicy: {
          maxAttempts: 1,
          replaySafe: true,
        },
      })
    )

    expect(result.ok).toBe(true)
  })
})
