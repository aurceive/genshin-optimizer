import {
  createLapicCertificateSummary,
} from '@genshin-optimizer/lapic/cert'
import type { LapicCertificate } from '@genshin-optimizer/lapic/cert'
import { createLapicSuccessResult } from '@genshin-optimizer/lapic/core'
import type { LapicValidationResult } from '@genshin-optimizer/lapic/core'
import type {
  LapicFailureRecord,
  LapicProgressEvent,
} from '@genshin-optimizer/lapic/runtime'
import type {
  LapicArtifactRef,
  LapicArtifactStore,
} from '@genshin-optimizer/lapic/storage'
import { createLapicOfflineReplayBundleDescriptor } from '../replay/builders'
import type {
  LapicArtifactSummary,
  LapicFailureTimelineView,
  LapicInspectionRequest,
  LapicOfflineReplayBundleDescriptor,
  LapicPhaseSummary,
  LapicThresholdLineageView,
  LapicTraceQuery,
} from '../types'
import { createDebugFailure } from '../validation/internal'
import {
  createLapicArtifactSummary,
  createLapicFailureTimelineView,
  createLapicPhaseSummary,
  createLapicThresholdLineageView,
} from './builders'
import { validateLapicInspectionRequest } from './validation'

export function summarizeLapicTraceByPhase(
  query: LapicTraceQuery,
  progressEvents: readonly LapicProgressEvent[]
): readonly LapicPhaseSummary[] {
  const filtered = progressEvents.filter((event) => event.sessionId === query.sessionId)
  const phases = new Map<string, LapicProgressEvent[]>()

  filtered.forEach((event) => {
    const phaseEvents = phases.get(event.phase) ?? []
    phaseEvents.push(event)
    phases.set(event.phase, phaseEvents)
  })

  return [...phases.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([phase, phaseEvents]) =>
      createLapicPhaseSummary(query.sessionId, phase, phaseEvents)
    )
}

export function createLapicThresholdLineageFromCertificates(
  certificates: readonly LapicCertificate[]
): readonly LapicThresholdLineageView[] {
  const thresholdToCertificates = new Map<string, string[]>()

  certificates.forEach((certificate) => {
    const summaryResult = createLapicCertificateSummary(certificate)
    if (!summaryResult.ok || !summaryResult.value.thresholdDigest) return

    const certIds = thresholdToCertificates.get(summaryResult.value.thresholdDigest) ?? []
    certIds.push(certificate.certId)
    thresholdToCertificates.set(summaryResult.value.thresholdDigest, certIds)
  })

  return [...thresholdToCertificates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([thresholdDigest, relatedCertificates]) =>
      createLapicThresholdLineageView(thresholdDigest, relatedCertificates)
    )
}

export function summarizeLapicFailures(
  failures: readonly LapicFailureRecord[],
  sessionId?: string
): LapicFailureTimelineView {
  return createLapicFailureTimelineView(
    sessionId ? failures.filter((failure) => failure.sessionId === sessionId) : failures
  )
}

export async function inspectLapicArtifact(
  store: LapicArtifactStore,
  request: LapicInspectionRequest
): Promise<LapicValidationResult<LapicArtifactSummary>> {
  const requestValidation = validateLapicInspectionRequest(request)
  if (!requestValidation.ok) return requestValidation

  try {
    const readResult = await store.read({ artifactRef: request.artifactRef })
    const summary = createLapicArtifactSummary(
      request.artifactRef,
      readResult.envelope.contentHash,
      request.includePotentialViews ? [readResult.payloadDigest] : []
    )
    return createLapicSuccessResult(summary)
  } catch {
    return createDebugFailure('Referenced artifact could not be inspected.', ['artifactRef'])
  }
}

export function createLapicReplayBundleDescriptor(
  certificateId: string,
  artifactRefs: readonly LapicArtifactRef[]
): LapicOfflineReplayBundleDescriptor {
  return createLapicOfflineReplayBundleDescriptor(
    `replay-bundle:${certificateId}`,
    artifactRefs
  )
}
