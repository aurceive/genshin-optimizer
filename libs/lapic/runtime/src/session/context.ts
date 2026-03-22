import {
  type LapicCertificate,
  type LapicFinalOptimalitySummary,
} from '@genshin-optimizer/lapic/cert'
import type { LapicDigest } from '@genshin-optimizer/lapic/core'
import {
  createLapicArtifactRef,
  createLapicArtifactRefKey,
  createLapicMemoryArtifactStore,
} from '@genshin-optimizer/lapic/storage'
import type {
  LapicArtifactRef,
  LapicArtifactStore,
} from '@genshin-optimizer/lapic/storage'
import { createLapicSessionSummary, createLapicTraceEvent } from '../builders'
import type {
  LapicActivePhase,
  LapicFailureRecord,
  LapicInMemorySessionControllerOptions,
  LapicInternalSolveState,
  LapicPauseToCheckpointTransitionSummary,
  LapicProgressEvent,
  LapicSessionSummary,
  LapicSolveCompletionResult,
  LapicTraceEvent,
} from '../types'
import { createRuntimeEventDigest, terminalInternalStates } from './internal'

export interface LapicSessionControllerContext {
  readonly options: LapicInMemorySessionControllerOptions
  readonly artifactStore: LapicArtifactStore
  readonly progressListeners: Map<string, (event: LapicProgressEvent) => void>
  readonly diagnosticListeners: Map<
    string,
    (event: LapicTraceEvent | LapicFailureRecord) => void
  >
  readonly openArtifacts: Map<string, ReturnType<typeof createLapicArtifactRef>>
  readonly emittedCertificates: LapicCertificate[]
  latestCheckpoint: LapicPauseToCheckpointTransitionSummary | undefined
  finalOptimality: LapicFinalOptimalitySummary | undefined
  activePhase: LapicActivePhase | undefined
  internalState: LapicInternalSolveState
  completionSettled: boolean
  subscriptionOrdinal: number
  eventOrdinal: number
  checkpointOrdinal: number
  readonly completionPromise: Promise<LapicSolveCompletionResult>
  resolveCompletion(result: LapicSolveCompletionResult): void
  rejectCompletion(reason: unknown): void
}

export function createSessionControllerContext(
  options: LapicInMemorySessionControllerOptions
): LapicSessionControllerContext {
  const artifactStore =
    options.artifactStore ?? createLapicMemoryArtifactStore()
  const progressListeners = new Map<
    string,
    (event: LapicProgressEvent) => void
  >()
  const diagnosticListeners = new Map<
    string,
    (event: LapicTraceEvent | LapicFailureRecord) => void
  >()

  const openArtifacts = new Map<
    string,
    ReturnType<typeof createLapicArtifactRef>
  >()
  options.initialArtifacts?.forEach((artifactRef) => {
    openArtifacts.set(
      createLapicArtifactRefKey(artifactRef),
      createLapicArtifactRef(artifactRef)
    )
  })

  const emittedCertificates: LapicCertificate[] = [
    ...(options.initialCertificates ?? []),
  ]

  let resolveCompletion!: (result: LapicSolveCompletionResult) => void
  let rejectCompletion!: (reason: unknown) => void
  const completionPromise = new Promise<LapicSolveCompletionResult>(
    (resolve, reject) => {
      resolveCompletion = resolve
      rejectCompletion = reject
    }
  )

  return {
    options,
    artifactStore,
    progressListeners,
    diagnosticListeners,
    openArtifacts,
    emittedCertificates,
    latestCheckpoint: undefined,
    finalOptimality: options.initialFinalOptimality,
    activePhase: undefined,
    internalState: 'created',
    completionSettled: false,
    subscriptionOrdinal: 0,
    eventOrdinal: 0,
    checkpointOrdinal: 0,
    completionPromise,
    resolveCompletion,
    rejectCompletion,
  }
}

export function ensureNonTerminal(
  context: LapicSessionControllerContext,
  action: string
): void {
  if (terminalInternalStates.has(context.internalState))
    throw new Error(
      `Cannot ${action} after session reached terminal state ${context.internalState}.`
    )
}

export function currentSummary(
  context: LapicSessionControllerContext
): LapicSessionSummary {
  return createLapicSessionSummary(
    context.options.identity,
    context.internalState,
    context.activePhase
  )
}

export function checkpointArtifacts(
  context: LapicSessionControllerContext
): readonly LapicArtifactRef[] {
  return [...context.openArtifacts.values()].map(createLapicArtifactRef)
}

export function moveToState(
  context: LapicSessionControllerContext,
  nextState: LapicInternalSolveState,
  phase?: LapicActivePhase
): void {
  context.internalState = nextState
  context.activePhase = phase
}

export function emitTrace(
  context: LapicSessionControllerContext,
  tag: LapicTraceEvent['tag'],
  digest?: LapicDigest
): void {
  const traceEvent = createLapicTraceEvent(
    context.options.identity.sessionId,
    tag,
    digest ??
      createRuntimeEventDigest(
        context.options.identity.sessionId,
        tag,
        context.eventOrdinal++
      )
  )
  context.diagnosticListeners.forEach((listener) => listener(traceEvent))
}

export function publishArtifactRef(
  context: LapicSessionControllerContext,
  artifactRef: LapicArtifactRef
): void {
  context.openArtifacts.set(
    createLapicArtifactRefKey(artifactRef),
    createLapicArtifactRef(artifactRef)
  )
}

export function notifyFailure(
  context: LapicSessionControllerContext,
  failure: LapicFailureRecord
): void {
  context.diagnosticListeners.forEach((listener) => listener(failure))
}
