import { validateLapicCertificate } from '@genshin-optimizer/lapic/cert'
import type { LapicArtifactRef } from '@genshin-optimizer/lapic/storage'
import { createLapicProgressEvent } from '../builders'
import type {
  LapicActivePhase,
  LapicFailureClass,
  LapicInMemorySessionController,
  LapicInMemorySessionControllerOptions,
} from '../types'
import {
  validateLapicInMemorySessionControllerOptions,
  validateLapicProgressEvent,
} from '../validation/session'
import {
  exportCheckpoint,
  reachPauseSafePoint,
  requestCheckpoint,
  requestPause,
  resumeSession,
} from './checkpoint-flow'
import {
  awaitCompletion,
  completeSession,
  failSession,
  requestCancel,
} from './completion'
import {
  createSessionControllerContext,
  currentSummary,
  emitTrace,
  ensureNonTerminal,
  moveToState,
  publishArtifactRef,
} from './context'
import {
  publishProgressToSubscribers,
  subscribeDiagnostics,
  subscribeProgress,
} from './subscriptions'

export function createLapicInMemorySessionController(
  options: LapicInMemorySessionControllerOptions
): LapicInMemorySessionController {
  const optionsValidation =
    validateLapicInMemorySessionControllerOptions(options)
  if (!optionsValidation.ok)
    throw new Error(
      optionsValidation.diagnostics[0]?.message ??
        'Invalid in-memory session controller options.'
    )

  if (
    options.solveRequest &&
    options.solveRequest.problemDigest !== options.identity.problemDigest
  )
    throw new Error('Solve request problem digest must match session identity.')

  const context = createSessionControllerContext(options)

  return {
    subscribeProgress(listener) {
      return subscribeProgress(context, listener)
    },
    subscribeDiagnostics(listener) {
      return subscribeDiagnostics(context, listener)
    },
    activate(phase) {
      ensureNonTerminal(context, 'activate session')
      moveToState(
        context,
        phase === 'frontier-build' ? 'frontier-building' : 'search-running',
        phase
      )
      emitTrace(context, 'StartWork')
    },
    publishProgress(event) {
      ensureNonTerminal(context, 'publish progress')
      const progressEvent = createLapicProgressEvent(
        context.options.identity.sessionId,
        event.phase,
        event.completedUnits,
        event.totalUnits
      )
      const validation = validateLapicProgressEvent(progressEvent)
      if (!validation.ok)
        throw new Error(
          validation.diagnostics[0]?.message ?? 'Invalid progress event.'
        )

      context.activePhase = progressEvent.phase
      if (
        context.internalState === 'created' ||
        context.internalState === 'initializing'
      )
        context.internalState =
          progressEvent.phase === 'frontier-build'
            ? 'frontier-building'
            : 'search-running'

      publishProgressToSubscribers(context, progressEvent)
      emitTrace(context, 'Progress')
    },
    publishTrace(tag, eventDigest) {
      ensureNonTerminal(context, 'publish trace')
      emitTrace(context, tag, eventDigest)
    },
    publishArtifact(artifactRef: LapicArtifactRef) {
      ensureNonTerminal(context, 'publish artifact')
      publishArtifactRef(context, artifactRef)
      emitTrace(context, 'PublishArtifacts')
    },
    emitCertificate(certificate) {
      ensureNonTerminal(context, 'emit certificate')
      const certificateValidation = validateLapicCertificate(certificate)
      if (!certificateValidation.ok)
        throw new Error(
          certificateValidation.diagnostics[0]?.message ??
            'Invalid emitted certificate.'
        )

      context.emittedCertificates.push(certificate)
      emitTrace(context, 'EmitCertificate')
    },
    async requestPause() {
      return requestPause(context)
    },
    reachPauseSafePoint() {
      reachPauseSafePoint(context)
    },
    resume(phase?: LapicActivePhase) {
      resumeSession(context, phase)
    },
    async requestCheckpoint() {
      return requestCheckpoint(context)
    },
    async exportCheckpoint() {
      return exportCheckpoint(context)
    },
    async requestCancel() {
      return requestCancel(context)
    },
    async awaitCompletion() {
      return awaitCompletion(context)
    },
    async inspectSessionState() {
      return {
        summary: currentSummary(context),
        openArtifacts: [...context.openArtifacts.values()].map((artifact) => ({
          ...artifact,
        })),
      }
    },
    async complete(nextFinalOptimality, topNCandidates) {
      return completeSession(context, nextFinalOptimality, topNCandidates)
    },
    async fail(
      failureClass: LapicFailureClass,
      message: string,
      diagnostics = []
    ) {
      return failSession(context, failureClass, message, diagnostics)
    },
    getLatestCheckpoint() {
      return context.latestCheckpoint
    },
  }
}
