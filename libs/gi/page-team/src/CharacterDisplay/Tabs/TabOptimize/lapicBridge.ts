/**
 * Bridge between GI optimization UI data and the lapic Web Worker.
 *
 * Defines the message protocol for communicating with LapicSolveWorker.
 */

import type { ArtifactBuildData, DynStat } from '@genshin-optimizer/gi/solver'
import type { OptNode } from '@genshin-optimizer/gi/wr'

// ---------------------------------------------------------------------------
// Main → Worker messages
// ---------------------------------------------------------------------------

export interface LapicWorkerStartMsg {
  readonly type: 'start'
  /** Optimized formula nodes: [...constraintNodes, targetNode] */
  readonly nodes: OptNode[]
  /** Base stats from compactArtifacts */
  readonly base: DynStat
  /** Compacted artifact arrays per slot */
  readonly artsBySlot: ArtifactBuildData[][]
  /** Minimum thresholds for constraint nodes */
  readonly constraintMinimums: number[]
  /** Number of top builds to keep */
  readonly topN: number
}

export interface LapicWorkerCancelMsg {
  readonly type: 'cancel'
}

export type LapicWorkerInMsg = LapicWorkerStartMsg | LapicWorkerCancelMsg

// ---------------------------------------------------------------------------
// Worker → Main messages
// ---------------------------------------------------------------------------

export interface LapicWorkerProgressMsg {
  readonly type: 'progress'
  readonly tested: number
  readonly failed: number
  readonly total: number
}

export interface LapicWorkerResultMsg {
  readonly type: 'result'
  readonly builds: ReadonlyArray<{ value: number; artifactIds: string[] }>
  readonly tested: number
  readonly failed: number
  readonly total: number
}

export interface LapicWorkerErrorMsg {
  readonly type: 'error'
  readonly message: string
}

export type LapicWorkerOutMsg =
  | LapicWorkerProgressMsg
  | LapicWorkerResultMsg
  | LapicWorkerErrorMsg
