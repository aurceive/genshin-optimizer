import { createLapicSubscriptionToken } from '../builders'
import type {
  LapicFailureRecord,
  LapicProgressEvent,
  LapicSubscriptionToken,
  LapicTraceEvent,
} from '../types'
import type { LapicSessionControllerContext } from './context'

export function subscribeProgress(
  context: LapicSessionControllerContext,
  listener: (event: LapicProgressEvent) => void
): LapicSubscriptionToken {
  return createSubscriptionToken(context.progressListeners, listener, context)
}

export function subscribeDiagnostics(
  context: LapicSessionControllerContext,
  listener: (event: LapicTraceEvent | LapicFailureRecord) => void
): LapicSubscriptionToken {
  return createSubscriptionToken(context.diagnosticListeners, listener, context)
}

export function publishProgressToSubscribers(
  context: LapicSessionControllerContext,
  event: LapicProgressEvent
): void {
  context.progressListeners.forEach((listener) => listener(event))
}

function createSubscriptionToken<T>(
  listeners: Map<string, T>,
  listener: T,
  context: LapicSessionControllerContext
): LapicSubscriptionToken {
  const subscriptionId = `${context.options.identity.sessionId}:subscription:${context.subscriptionOrdinal++}`
  listeners.set(subscriptionId, listener)
  return createLapicSubscriptionToken(subscriptionId, () => {
    listeners.delete(subscriptionId)
  })
}
