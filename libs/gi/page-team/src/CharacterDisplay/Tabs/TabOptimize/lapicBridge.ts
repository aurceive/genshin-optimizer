/**
 * Message protocol between the GI optimization UI and the lapic
 * engine Web Worker (`LapicSolveWorker.ts`).
 *
 * The Worker runs the full lapic orchestration pipeline internally:
 * - Builds a GI canonical export from the adapter request
 * - Compiles the formula via `precompute()`
 * - Runs `executeCoordinatedBoundedExactSolve()` with B&B pruning
 * - Returns top-N candidates with artifact IDs
 *
 * Progress events use canonical runtime types (`LapicProgressEvent`)
 * to stay aligned with the lapic session lifecycle protocol.
 *
 * Diagnostics are not streamed across the Worker boundary (D-007).
 * Solve failures surface through the error message type.
 */

import type { ICachedArtifact, OptConfig } from '@genshin-optimizer/gi/db'
import type { ArtifactBuildData, DynStat } from '@genshin-optimizer/gi/solver'
import type { OptNode } from '@genshin-optimizer/gi/wr'
import type { LapicProgressEvent } from '@genshin-optimizer/lapic/runtime'

// ---------------------------------------------------------------------------
// Main → Worker messages
// ---------------------------------------------------------------------------

export interface LapicWorkerInitMsg {
  readonly type: 'init'

  // ---- Evaluator reconstruction (for precompute) ----
  /** Optimized formula nodes: [...constraintNodes, targetNode] */
  readonly optimizedNodes: OptNode[]
  /** Base stats from compactArtifacts */
  readonly base: DynStat
  /** Compacted artifact arrays per slot (for evaluator buffer lookup) */
  readonly artsBySlot: ArtifactBuildData[][]
  /** Minimum thresholds for constraint nodes (aligned with optimizedNodes) */
  readonly constraintMinimums: number[]

  // ---- Canonical export inputs ----
  /** Full artifact objects for building the lapic canonical problem */
  readonly artifacts: ICachedArtifact[]
  /** The unoptimized optimization target node */
  readonly optimizationTarget: OptNode
  /** Stat filter constraints (unoptimized nodes with minimums) */
  readonly constraints: ReadonlyArray<{
    readonly value: OptNode
    readonly minimum: number
  }>
  /** Optimization config from the database */
  readonly optConfig: OptConfig

  // ---- Solve parameters ----
  /** Number of top builds to return */
  readonly topN: number
  /** Number of domain partitions for coordinated solve */
  readonly workerCount: number
  /** Problem identifier (e.g., "characterKey:teamId") */
  readonly problemId: string
}

export interface LapicWorkerCancelMsg {
  readonly type: 'cancel'
}

export interface LapicWorkerPauseMsg {
  readonly type: 'pause'
}

export type LapicWorkerInMsg =
  | LapicWorkerInitMsg
  | LapicWorkerCancelMsg
  | LapicWorkerPauseMsg

// ---------------------------------------------------------------------------
// Worker → Main messages
// ---------------------------------------------------------------------------

/** Forwards a canonical `LapicProgressEvent` from the runtime. */
export interface LapicWorkerProgressMsg {
  readonly type: 'progress'
  readonly event: LapicProgressEvent
}

export interface LapicWorkerResultMsg {
  readonly type: 'result'
  /** Top-N builds with artifact IDs and objective values */
  readonly builds: ReadonlyArray<{
    readonly value: number
    readonly artifactIds: string[]
  }>
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
