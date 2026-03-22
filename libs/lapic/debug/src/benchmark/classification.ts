import type { LapicCertificate } from '@genshin-optimizer/lapic/cert'
import type {
  LapicProgressEvent,
  LapicSessionSummary,
  LapicTraceEvent,
} from '@genshin-optimizer/lapic/runtime'
import type {
  LapicArtifactRef,
  LapicArtifactStore,
} from '@genshin-optimizer/lapic/storage'
import { createLapicAuditReport } from '../audit'
import { createLapicAuditReportRequest } from '../audit/builders'
import { createLapicHarnessReportManifest } from '../audit/builders'
import {
  createLapicThresholdLineageFromCertificates,
  summarizeLapicTraceByPhase,
} from '../inspection'
import { createLapicTraceQuery } from '../inspection/builders'
import type { LapicBenchmarkReport } from '../types'
import type { LapicRegressionClassificationSummary } from '../types'
import type { LapicSolveSliceHarnessReport } from '../types'
import { createLapicRegressionClassificationSummary } from './builders'
import {
  createLapicBenchmarkReport,
  createLapicPublicationReadyReportManifest,
} from './builders'

export function classifyLapicBenchmarkRegression(
  baseline: LapicBenchmarkReport,
  candidate: LapicBenchmarkReport
): LapicRegressionClassificationSummary {
  if (baseline.correctnessQualified && !candidate.correctnessQualified)
    return createLapicRegressionClassificationSummary(
      'correctness',
      'Candidate benchmark lost correctness qualification relative to baseline.'
    )

  const upgradeDelta =
    (candidate.upgradeFrontierCostShare ?? 0) -
    (baseline.upgradeFrontierCostShare ?? 0)
  const graphDelta =
    (candidate.graphOutputCostShare ?? 0) - (baseline.graphOutputCostShare ?? 0)

  if (upgradeDelta > 0.05 || graphDelta > 0.05)
    return createLapicRegressionClassificationSummary(
      'performance',
      'Candidate benchmark increased measured upgrade-frontier or graph-output cost share.'
    )

  return createLapicRegressionClassificationSummary(
    'none',
    'Candidate benchmark preserved correctness qualification without material cost-share regression.'
  )
}

export async function createLapicSolveSliceHarnessReport(
  store: LapicArtifactStore,
  session: LapicSessionSummary,
  progressEvents: readonly LapicProgressEvent[],
  traceEvents: readonly LapicTraceEvent[],
  certificates: readonly LapicCertificate[],
  artifactRefs: readonly LapicArtifactRef[],
  benchmarkId: string,
  environmentLabel: string
): Promise<LapicSolveSliceHarnessReport> {
  const auditReport = await createLapicAuditReport(
    store,
    createLapicAuditReportRequest(session.identity.sessionId, true, true),
    session,
    traceEvents,
    certificates,
    artifactRefs
  )
  const phaseSummaries = summarizeLapicTraceByPhase(
    createLapicTraceQuery(session.identity.sessionId, false),
    progressEvents
  )
  const thresholdLineage =
    createLapicThresholdLineageFromCertificates(certificates)
  const publicationManifest = createLapicPublicationReadyReportManifest(
    createLapicBenchmarkReport(
      benchmarkId,
      environmentLabel,
      session.solveState === 'completed'
    ),
    createLapicRegressionClassificationSummary(
      'none',
      'Live solve-slice harness completed without benchmark-qualified regression.'
    ),
    auditReport.session.solveState === 'completed' &&
      certificates.some((cert) => cert.certKind === 'FinalOptimalityCert')
      ? (() => {
          const finalCert = certificates.find(
            (cert) => cert.certKind === 'FinalOptimalityCert'
          )!
          return {
            winnerStateId: finalCert.payload.winningStateId,
            winnerDigest: finalCert.evidenceDigest,
            certId: finalCert.certId,
            decisionMetadata: {
              thresholdDigest: finalCert.payload.finalThresholdDigest,
              exactReplayRequired:
                finalCert.replayRecipe.arithmeticMode === 'exact',
              dangerZoneDetected: false,
            },
          }
        })()
      : undefined
  )
  const harnessManifest = createLapicHarnessReportManifest(
    `harness:${benchmarkId}:${session.identity.sessionId}`,
    artifactRefs
  )

  return {
    auditReport,
    phaseSummaries,
    thresholdLineage,
    publicationManifest,
    harnessManifest,
  }
}
