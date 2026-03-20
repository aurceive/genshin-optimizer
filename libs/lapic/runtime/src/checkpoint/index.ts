import type {
  LapicCheckpointClosureInventory,
  LapicCheckpointClosureVerificationResult,
  LapicClosureExportDescriptor,
  LapicClosureImportDescriptor,
} from '@genshin-optimizer/lapic/storage'
import type {
  LapicCheckpointCompletionResult,
  LapicCheckpointExportDescriptor,
  LapicCheckpointImportDescriptor,
  LapicCheckpointRequest,
  LapicPauseToCheckpointTransitionSummary,
} from '../types'

export function createLapicCheckpointRequest(
  sessionId: string,
  checkpointId: string
): LapicCheckpointRequest {
  return {
    sessionId,
    checkpointId,
  }
}

export function createLapicCheckpointExportDescriptor(
  closure: LapicClosureExportDescriptor,
  inventory: LapicCheckpointClosureInventory
): LapicCheckpointExportDescriptor {
  return {
    closure,
    inventory,
  }
}

export function createLapicCheckpointImportDescriptor(
  closure: LapicClosureImportDescriptor
): LapicCheckpointImportDescriptor {
  return { closure }
}

export function createLapicCheckpointCompletionResult(
  checkpointId: string,
  verification: LapicCheckpointClosureVerificationResult
): LapicCheckpointCompletionResult {
  return {
    checkpointId,
    verification,
  }
}

export function createLapicPauseToCheckpointTransitionSummary(
  sessionId: string,
  checkpoint: LapicCheckpointCompletionResult
): LapicPauseToCheckpointTransitionSummary {
  return {
    sessionId,
    checkpoint,
  }
}