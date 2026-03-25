import { createLapicReplayBundleDescriptor } from '../inspection'
import {
  createLapicReplayClosureSummary,
  createLapicReplayInspectionRequest,
} from './builders'
import {
  validateLapicReplayClosureSummary,
  validateLapicReplayInspectionRequest,
} from './validation'

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
