import type { LapicDigest } from '@genshin-optimizer/lapic/core'
import type {
  LapicInternalSolveState,
  LapicSolveState,
  LapicTraceEvent,
} from '../types'

export const terminalInternalStates = new Set<LapicInternalSolveState>([
  'completed',
  'cancelled',
  'failed',
])

export function projectLapicSolveState(
  internalState: LapicInternalSolveState
): LapicSolveState {
  switch (internalState) {
    case 'created':
      return 'created'
    case 'initializing':
    case 'frontier-building':
    case 'search-running':
      return 'active'
    case 'pausing':
      return 'pausing'
    case 'paused':
      return 'paused'
    case 'checkpointing':
      return 'checkpointing'
    case 'resuming':
      return 'resuming'
    case 'finalizing':
      return 'finalizing'
    case 'completed':
      return 'completed'
    case 'cancelled':
      return 'cancelled'
    case 'failed':
      return 'failed'
  }
}

export function createRuntimeEventDigest(
  sessionId: string,
  tag: LapicTraceEvent['tag'],
  ordinal: number
): LapicDigest {
  return `${sessionId}:${tag}:${ordinal}`
}