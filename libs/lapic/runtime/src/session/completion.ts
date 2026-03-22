import type { LapicFinalOptimalitySummary } from '@genshin-optimizer/lapic/cert'
import type { LapicDiagnostic } from '@genshin-optimizer/lapic/core'
import {
  createLapicCancelRequestResult,
  createLapicFailedSessionSummary,
  createLapicFailureRecord,
  createLapicSolveCompletionResult,
} from '../builders'
import type {
  LapicCancelRequestResult,
  LapicFailedSessionSummary,
  LapicFailureClass,
  LapicSolveCompletionResult,
} from '../types'
import {
  type LapicSessionControllerContext,
  currentSummary,
  emitTrace,
  ensureNonTerminal,
  moveToState,
  notifyFailure,
} from './context'
import { terminalInternalStates } from './internal'

export class LapicSessionFailureError extends Error {
  readonly summary: LapicFailedSessionSummary['summary']
  readonly failure: LapicFailedSessionSummary['failure']
  constructor(failedSummary: LapicFailedSessionSummary) {
    super(failedSummary.failure.message)
    this.name = 'LapicSessionFailureError'
    this.summary = failedSummary.summary
    this.failure = failedSummary.failure
  }
}

export function awaitCompletion(
  context: LapicSessionControllerContext
): Promise<LapicSolveCompletionResult> {
  return context.completionPromise
}

export function settleCompletion(
  context: LapicSessionControllerContext,
  result: LapicSolveCompletionResult
): void {
  if (context.completionSettled) return
  context.completionSettled = true
  context.resolveCompletion(result)
}

export function rejectFailedCompletion(
  context: LapicSessionControllerContext,
  failedSummary: ReturnType<typeof createLapicFailedSessionSummary>
): void {
  if (context.completionSettled) return
  context.completionSettled = true
  context.rejectCompletion(failedSummary)
}

export function requestCancel(
  context: LapicSessionControllerContext
): LapicCancelRequestResult {
  if (terminalInternalStates.has(context.internalState))
    return createLapicCancelRequestResult(false)

  moveToState(context, 'cancelled')
  settleCompletion(
    context,
    createLapicSolveCompletionResult(
      currentSummary(context),
      context.emittedCertificates,
      context.finalOptimality
    )
  )
  emitTrace(context, 'Shutdown')
  return createLapicCancelRequestResult(true)
}

export function completeSession(
  context: LapicSessionControllerContext,
  nextFinalOptimality?: LapicFinalOptimalitySummary
): LapicSolveCompletionResult {
  ensureNonTerminal(context, 'complete session')
  moveToState(context, 'finalizing', context.activePhase)
  context.finalOptimality = nextFinalOptimality ?? context.finalOptimality
  moveToState(context, 'completed', context.activePhase)
  const result = createLapicSolveCompletionResult(
    currentSummary(context),
    context.emittedCertificates,
    context.finalOptimality
  )
  settleCompletion(context, result)
  emitTrace(context, 'Shutdown')
  return result
}

export function failSession(
  context: LapicSessionControllerContext,
  failureClass: LapicFailureClass,
  message: string,
  diagnostics: readonly LapicDiagnostic[] = []
): never {
  ensureNonTerminal(context, 'fail session')
  const nextFailure = createLapicFailureRecord(
    context.options.identity.sessionId,
    failureClass,
    message,
    diagnostics
  )
  moveToState(context, 'failed', context.activePhase)
  notifyFailure(context, nextFailure)
  emitTrace(context, 'ReportFailure')
  const failedSummary = createLapicFailedSessionSummary(
    currentSummary(context),
    nextFailure
  )
  rejectFailedCompletion(context, failedSummary)
  throw new LapicSessionFailureError(failedSummary)
}
