/**
 * Web Worker for lapic engine computation.
 *
 * Receives optimized formula nodes and compacted artifact data,
 * evaluates all combinations using `precompute()`, and returns
 * the top-N builds.
 *
 * This runs heavy computation off the main thread to keep the UI
 * responsive — mirroring the approach used by the legacy GOSolver.
 */

import type { ArtifactBuildData, DynStat } from '@genshin-optimizer/gi/solver'
import type { OptNode } from '@genshin-optimizer/gi/wr'
import { precompute } from '@genshin-optimizer/gi/wr'
import type {
  LapicWorkerInMsg,
  LapicWorkerOutMsg,
  LapicWorkerStartMsg,
} from './lapicBridge'

declare function postMessage(msg: LapicWorkerOutMsg): void

let cancelled = false

onmessage = (e: MessageEvent<LapicWorkerInMsg>) => {
  const msg = e.data

  if (msg.type === 'cancel') {
    cancelled = true
    return
  }

  if (msg.type === 'start') {
    cancelled = false
    try {
      solve(msg)
    } catch (err) {
      postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

function solve(msg: LapicWorkerStartMsg): void {
  const { nodes, base, artsBySlot, constraintMinimums, topN } = msg

  // Sort slot arrays by length (smallest first for cache-friendly inner loops)
  const arts = artsBySlot.slice().sort((a, b) => a.length - b.length)

  // Compile the evaluation function (same pipeline as legacy ComputeWorker)
  const compute = precompute(
    nodes as OptNode[],
    base as DynStat,
    (f) => f.path[1],
    arts.length
  )

  // Count total combinations
  let total = 1
  for (const slotArts of arts) total *= slotArts.length

  // Top-N build collector
  let builds: Array<{ value: number; artifactIds: string[] }> = []
  let threshold = -Infinity

  const buffer = new Array<ArtifactBuildData>(arts.length)
  let testedBatch = 0
  let failedBatch = 0
  let testedTotal = 0

  function refresh(force: boolean): void {
    if (builds.length >= 1000 || force) {
      builds.sort((a, b) => b.value - a.value)
      builds = builds.slice(0, topN)
      threshold = Math.max(threshold, builds[topN - 1]?.value ?? -Infinity)
    }
  }

  function report(): void {
    refresh(false)
    testedTotal += testedBatch
    postMessage({
      type: 'progress',
      tested: testedTotal,
      failed: failedBatch,
      total,
    })
    testedBatch = 0
    failedBatch = 0
  }

  const permute = (i: number): void => {
    if (cancelled) return

    if (i < 0) {
      const result = compute(buffer)

      // Check constraints (first N entries in result)
      for (let c = 0; c < constraintMinimums.length; c++) {
        if (result[c] < constraintMinimums[c]) {
          failedBatch++
          return
        }
      }

      // Objective value is at index constraintMinimums.length
      const value = result[constraintMinimums.length]
      if (value >= threshold) {
        builds.push({
          value,
          artifactIds: buffer
            .map((x) => x.id)
            .filter((id): id is string => !!id),
        })
      }
      return
    }

    for (const art of arts[i]) {
      buffer[i] = art
      permute(i - 1)
    }

    // Progress reporting at the innermost iteration level
    if (i === 0) {
      testedBatch += arts[0].length
      if (testedBatch > 1 << 16) report()
    }
  }

  permute(arts.length - 1)

  // Final result
  testedTotal += testedBatch
  refresh(true)
  postMessage({
    type: 'result',
    builds: builds.slice(0, topN),
    tested: testedTotal,
    failed: failedBatch,
    total,
  })
}
