import type { LapicReplayResult } from '@genshin-optimizer/lapic/cert'
import type { LapicDigest } from '@genshin-optimizer/lapic/core'
import type { LapicArtifactRef } from '@genshin-optimizer/lapic/storage'
import type {
  LapicOfflineReplayBundleDescriptor,
  LapicReplayClosureSummary,
  LapicReplayInspectionRequest,
} from '../types'

export function createLapicReplayInspectionRequest(
  certificateId: string
): LapicReplayInspectionRequest {
  return { certificateId }
}

export function createLapicReplayClosureSummary(
  replayResult: LapicReplayResult,
  closureArtifacts: readonly LapicArtifactRef[]
): LapicReplayClosureSummary {
  return {
    replayResult,
    closureArtifacts: [...closureArtifacts],
  }
}

export function createLapicOfflineReplayBundleDescriptor(
  bundleDigest: LapicDigest,
  artifactRefs: readonly LapicArtifactRef[]
): LapicOfflineReplayBundleDescriptor {
  return {
    bundleDigest,
    artifactRefs: [...artifactRefs],
  }
}
