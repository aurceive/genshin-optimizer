import {
  createLapicFailureRecord,
  createLapicSessionIdentity,
  createLapicSessionSummary,
} from '../builders'
import { createLapicRuntimeRecoveryEligibility } from './index'

function createSessionIdentityFixture() {
  return createLapicSessionIdentity({
    sessionId: 'session-id',
    problemDigest: 'problem-digest',
    engineVersion: 'engine-version',
    arithmeticPolicyId: 'arith-policy',
    runtimeProtocolVersion: '0.1.0-draft',
    createdAtLogicalTimestamp: 'ts-1',
  })
}

describe('lapic runtime recovery', () => {
  it('classifies worker failure as recoverable and storage failure as non-recoverable', () => {
    const workerRecovery = createLapicRuntimeRecoveryEligibility({
      summary: createLapicSessionSummary(
        createSessionIdentityFixture(),
        'failed'
      ),
      failure: createLapicFailureRecord(
        'session-id',
        'workerFailure',
        'worker failed'
      ),
    })
    const storageRecovery = createLapicRuntimeRecoveryEligibility({
      summary: createLapicSessionSummary(
        createSessionIdentityFixture(),
        'failed'
      ),
      failure: createLapicFailureRecord(
        'session-id',
        'storageIntegrityFailure',
        'store corrupted'
      ),
    })

    expect(workerRecovery.eligible).toBe(true)
    expect(storageRecovery.eligible).toBe(false)
  })
})
