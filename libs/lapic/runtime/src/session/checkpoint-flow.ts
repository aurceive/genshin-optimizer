import {
  createLapicCheckpointClosureInventory,
  createLapicClosureExportDescriptor,
  verifyLapicCheckpointClosure,
} from '@genshin-optimizer/lapic/storage'
import { createLapicPauseRequestResult as createPauseRequestResult } from '../builders'
import {
  createLapicCheckpointCompletionResult,
  createLapicCheckpointExportDescriptor,
  createLapicPauseToCheckpointTransitionSummary,
} from '../checkpoint'
import { createCheckpointId } from '../checkpoint/internal'
import type {
  LapicPauseRequestResult,
  LapicPauseToCheckpointTransitionSummary,
} from '../types'
import {
  type LapicSessionControllerContext,
  checkpointArtifacts,
  emitTrace,
  ensureNonTerminal,
  moveToState,
} from './context'
import { terminalInternalStates } from './internal'

export async function requestPause(
  context: LapicSessionControllerContext
): Promise<LapicPauseRequestResult> {
  if (terminalInternalStates.has(context.internalState))
    return createPauseRequestResult(false)

  context.checkpointOrdinal += 1
  const targetCheckpointId = createCheckpointId(
    context.options.identity.sessionId,
    context.checkpointOrdinal
  )
  moveToState(context, 'pausing', context.activePhase)
  return createPauseRequestResult(true, targetCheckpointId)
}

export function reachPauseSafePoint(
  context: LapicSessionControllerContext
): void {
  if (context.internalState !== 'pausing')
    throw new Error('Pause safe point can only be reached from the pausing state.')

  moveToState(context, 'paused', context.activePhase)
  emitTrace(context, 'PauseAtSafePoint')
}

export function resumeSession(
  context: LapicSessionControllerContext,
  phase = context.activePhase ?? 'analyze'
): void {
  ensureNonTerminal(context, 'resume session')
  if (context.internalState !== 'paused' && context.internalState !== 'checkpointing')
    throw new Error('Resume is only allowed from paused or checkpointing states.')

  moveToState(context, 'resuming', phase)
  emitTrace(context, 'LoadArtifacts')
  moveToState(
    context,
    phase === 'frontier-build' ? 'frontier-building' : 'search-running',
    phase
  )
}

export async function requestCheckpoint(
  context: LapicSessionControllerContext
): Promise<LapicPauseToCheckpointTransitionSummary> {
  ensureNonTerminal(context, 'request checkpoint')
  if (context.internalState === 'created') moveToState(context, 'initializing', context.activePhase)
  if (context.internalState === 'pausing') reachPauseSafePoint(context)
  if (context.internalState !== 'paused') {
    const pauseRequest = await requestPause(context)
    if (!pauseRequest.accepted || !pauseRequest.targetCheckpointId)
      throw new Error('Checkpoint request was not accepted.')
    reachPauseSafePoint(context)
  }

  moveToState(context, 'checkpointing', context.activePhase)
  const checkpointId = createCheckpointId(
    context.options.identity.sessionId,
    context.checkpointOrdinal
  )
  const artifacts = checkpointArtifacts(context)
  const verification = await verifyLapicCheckpointClosure(context.artifactStore, {
    checkpointId,
    artifactRefs: artifacts,
  })
  const completion = createLapicCheckpointCompletionResult(checkpointId, verification)
  context.latestCheckpoint = createLapicPauseToCheckpointTransitionSummary(
    context.options.identity.sessionId,
    completion
  )
  moveToState(context, 'paused', context.activePhase)
  emitTrace(context, 'AcknowledgeCheckpoint')
  return context.latestCheckpoint
}

export async function exportCheckpoint(
  context: LapicSessionControllerContext
) {
  ensureNonTerminal(context, 'export checkpoint')
  const checkpointSummary = context.latestCheckpoint ?? (await requestCheckpoint(context))
  const artifacts = checkpointArtifacts(context)
  const inventory =
    checkpointSummary.checkpoint.verification.diagnostics.length === 0
      ? createLapicCheckpointClosureInventory(
          checkpointSummary.checkpoint.checkpointId,
          artifacts,
          []
        )
      : createLapicCheckpointClosureInventory(
          checkpointSummary.checkpoint.checkpointId,
          artifacts,
          artifacts.filter((artifactRef) =>
            checkpointSummary.checkpoint.verification.diagnostics.includes(
              `Missing artifact: ${artifactRef.artifactId}`
            )
          )
        )

  return createLapicCheckpointExportDescriptor(
    createLapicClosureExportDescriptor(
      checkpointSummary.checkpoint.checkpointId,
      `${checkpointSummary.checkpoint.checkpointId}:export`
    ),
    inventory
  )
}