/**
 * Message protocol for secondary compute workers.
 *
 * Main thread sends a compute-init message with evaluator data
 * and a MessagePort (as transferable).  The canonical problem
 * arrives later from the primary worker through the port.
 */

import type { ArtifactBuildData, DynStat } from '@genshin-optimizer/gi/solver'
import type { OptNode } from '@genshin-optimizer/gi/wr'

/**
 * Main thread → secondary compute worker.
 *
 * Contains everything needed to reconstruct the evaluator.
 * The MessagePort for dispatch communication is passed as a
 * transferable via `postMessage` (not in the message body).
 */
export interface LapicComputeWorkerInitMsg {
  readonly type: 'compute-init'
  readonly optimizedNodes: OptNode[]
  readonly base: DynStat
  readonly artsBySlot: ArtifactBuildData[][]
  readonly constraintMinimums: number[]
}
