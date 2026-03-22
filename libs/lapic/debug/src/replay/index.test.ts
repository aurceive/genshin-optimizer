import type { LapicCertificate } from '@genshin-optimizer/lapic/cert'
import { createLapicReplayBundleDescriptor } from '../inspection'
import {
  createLapicReplayClosureSummary,
  createLapicReplayInspectionRequest,
} from './builders'
import {
  validateLapicReplayClosureSummary,
  validateLapicReplayInspectionRequest,
} from './validation'

// FIXME(lapic-audit): createCertificate is defined but never called.
// Plan: write the tests that need this helper, or remove it.
function _createCertificate(
  overrides: Partial<LapicCertificate> = {}
): LapicCertificate {
  return {
    certId: 'cert-id',
    certKind: 'FinalOptimalityCert',
    schemaVersion: '0.1.0-draft',
    problemId: 'problem-id',
    arithmeticPolicyId: 'arith-policy',
    decisionClass: 'optimality-proof',
    referencedStateIds: ['state-id'],
    referencedBlockIds: [],
    referencedRegionIds: [],
    referencedRelaxIds: [],
    evidenceDigest: 'evidence-digest',
    replayRecipe: {
      requiredIrObjects: ['objective-digest'],
      requiredRegionPredicates: [],
      arithmeticMode: 'exact',
      replayPathKind: 'full-replay',
      exactComparisonRule: 'stable-ordering',
      expectedVerdict: 'matched',
    },
    emittedAtStep: 1,
    validationStatus: 'validated',
    payload: {
      winningStateId: 'state-id',
      optimalityGap: '0',
      finalThresholdDigest: 'threshold-digest',
      finalIncumbentSetDigest: 'incumbent-set-digest',
      queueExhaustionSummaryDigest: 'queue-exhaustion-digest',
      thresholdPruneSummaryDigest: 'threshold-prune-summary-digest',
      branchReachabilitySummaryDigest: 'branch-reachability-summary-digest',
      dominanceSummaryDigest: 'dominance-summary-digest',
      escalatedReplaySummaryDigest: 'escalated-replay-summary-digest',
      stableOrderCompletenessDigest: 'stable-order-digest',
      rankingParticipationMode: 'auxiliary-only',
      potentialDecisionBasis: {
        solveMode: 'current-only',
        participationMode: 'auxiliary-only',
      },
    },
    ...overrides,
  } as LapicCertificate
}

describe('lapic debug replay', () => {
  it('creates potential replay bundle descriptors', () => {
    const replayBundle = createLapicReplayBundleDescriptor('cert-id', [
      {
        artifactId: 'artifact-id',
        artifactKind: 'certificate',
        contentHash: 'content-hash',
      },
    ])

    expect(replayBundle.bundleDigest).toBe('replay-bundle:cert-id')
  })

  it('validates replay helper shapes', () => {
    const artifactRef = {
      artifactId: 'artifact-id',
      artifactKind: 'certificate' as const,
      contentHash: 'content-hash',
    }

    expect(
      validateLapicReplayInspectionRequest(
        createLapicReplayInspectionRequest('cert-id')
      ).ok
    ).toBe(true)
    expect(
      validateLapicReplayClosureSummary(
        createLapicReplayClosureSummary(
          {
            reproducedVerdict: 'matched',
            validationOutcome: 'validated',
            arithmeticModeUsed: 'exact',
            referencedEvidenceDigests: ['evidence-digest'],
            exactReplayInvoked: true,
          },
          [artifactRef]
        )
      ).ok
    ).toBe(true)
  })
})
