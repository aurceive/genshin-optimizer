/**
 * Message protocol between the orchestrator worker (LapicSolveWorker)
 * and sub-workers (LapicSubWorker) for parallel partition execution.
 *
 * After initialization, dispatch communication flows through the
 * MessagePort using the existing dispatch-partition / partition-result
 * protocol from message-port.ts.
 */

import type { ArtifactBuildData, DynStat } from '@genshin-optimizer/gi/solver'
import type { OptNode } from '@genshin-optimizer/gi/wr'
import type { LapicCanonicalProblem } from '@genshin-optimizer/lapic/core'

// ---------------------------------------------------------------------------
// Orchestrator → Sub-Worker
// ---------------------------------------------------------------------------

/**
 * Initialization message sent from the orchestrator worker to each
 * sub-worker.  Contains everything needed to reconstruct the evaluator
 * and set up the bounded-exact partition handler.
 *
 * The MessagePort for dispatch communication is passed as a
 * transferable via `postMessage` (not in the message body).
 */
export interface LapicSubWorkerInitMsg {
  readonly type: 'sub-worker-init'
  readonly optimizedNodes: OptNode[]
  readonly base: DynStat
  readonly artsBySlot: ArtifactBuildData[][]
  readonly constraintMinimums: number[]
  readonly canonicalProblem: LapicCanonicalProblem
}

// ---------------------------------------------------------------------------
// Sub-Worker → Orchestrator
// ---------------------------------------------------------------------------

export interface LapicSubWorkerReadyMsg {
  readonly type: 'sub-worker-ready'
}

export interface LapicSubWorkerErrorMsg {
  readonly type: 'sub-worker-error'
  readonly message: string
}

export type LapicSubWorkerOutMsg =
  | LapicSubWorkerReadyMsg
  | LapicSubWorkerErrorMsg
