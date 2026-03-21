/**
 * Evaluate an F-IR graph over interval-valued inputs.
 *
 * Bottom-up DAG traversal: each node is evaluated exactly once
 * (in topological order), producing an interval enclosure of
 * all possible output values.
 *
 * This is the first (simplest) relaxation in the admissible
 * bound cascade described in relaxation-and-certificates.md.
 */

import type { LapicFirGraph, LapicFirNode, LapicFirNodeId, LapicFirVariableId } from './types'
import { lapicFirNodeChildIds } from './types'
import type { LapicInterval } from '../interval/types'
import { LAPIC_INTERVAL_EMPTY, lapicIntervalPoint } from '../interval/types'
import {
  lapicIntervalAdd,
  lapicIntervalAffine,
  lapicIntervalMaxN,
  lapicIntervalMinN,
  lapicIntervalNeg,
  lapicIntervalPiecewiseAffine,
  lapicIntervalProduct,
  lapicIntervalResistanceTransform,
  lapicIntervalSaturate,
  lapicIntervalThresholdSelect,
} from '../interval/arithmetic'

// ---------------------------------------------------------------------------
// Evaluation environment
// ---------------------------------------------------------------------------

/** Variable intervals: for each variable, the range of possible values. */
export type LapicFirIntervalEnv = ReadonlyMap<LapicFirVariableId, LapicInterval>

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * Result of interval evaluation.
 * `rootBound` is the enclosure of the objective.
 * `nodeBounds` maps every node to its computed interval.
 */
export interface LapicFirIntervalEvalResult {
  readonly rootBound: LapicInterval
  readonly nodeBounds: ReadonlyMap<LapicFirNodeId, LapicInterval>
}

// ---------------------------------------------------------------------------
// Topological evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate the F-IR graph with interval inputs.
 *
 * Variables not in `env` are treated as unbounded (−∞, +∞).
 */
export function evaluateLapicFirIntervals(
  graph: LapicFirGraph,
  env: LapicFirIntervalEnv
): LapicFirIntervalEvalResult {
  const bounds = new Map<LapicFirNodeId, LapicInterval>()

  // Topological order via post-order DFS
  const order: LapicFirNodeId[] = []
  const visited = new Set<LapicFirNodeId>()

  function topoVisit(nodeId: LapicFirNodeId): void {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    const node = graph.nodes.get(nodeId)
    if (!node) return
    for (const childId of lapicFirNodeChildIds(node)) {
      topoVisit(childId)
    }
    order.push(nodeId)
  }

  topoVisit(graph.rootId)

  // Evaluate in topological order (children before parents)
  for (const nodeId of order) {
    const node = graph.nodes.get(nodeId)!
    const iv = evaluateNode(node, bounds, env)
    bounds.set(nodeId, iv)
  }

  return {
    rootBound: bounds.get(graph.rootId) ?? LAPIC_INTERVAL_EMPTY,
    nodeBounds: bounds,
  }
}

// ---------------------------------------------------------------------------
// Per-node evaluation
// ---------------------------------------------------------------------------

function evaluateNode(
  node: LapicFirNode,
  bounds: ReadonlyMap<LapicFirNodeId, LapicInterval>,
  env: LapicFirIntervalEnv
): LapicInterval {
  switch (node.operator) {
    case 'constant':
      return lapicIntervalPoint(node.value)

    case 'read':
      return env.get(node.variableId) ?? { lo: -Infinity, hi: Infinity }

    case 'add':
      return lapicIntervalAdd(
        childBound(bounds, node.childIds[0]!),
        node.childIds.slice(1).reduce(
          (acc, id) => lapicIntervalAdd(acc, childBound(bounds, id)),
          lapicIntervalPoint(0)
        )
      )

    case 'mul':
      return lapicIntervalProduct(node.childIds.map((id) => childBound(bounds, id)))

    case 'min':
      return lapicIntervalMinN(node.childIds.map((id) => childBound(bounds, id)))

    case 'max':
      return lapicIntervalMaxN(node.childIds.map((id) => childBound(bounds, id)))

    case 'neg':
      return lapicIntervalNeg(childBound(bounds, node.childId))

    case 'affineForm':
      return lapicIntervalAffine(
        node.bias,
        node.terms.map((t) => ({ coeff: t.coeff, interval: childBound(bounds, t.childId) }))
      )

    case 'thresholdSelect':
      return lapicIntervalThresholdSelect(
        childBound(bounds, node.guardId),
        node.threshold,
        childBound(bounds, node.thenId),
        childBound(bounds, node.elseId)
      )

    case 'resistanceTransform':
      return lapicIntervalResistanceTransform(childBound(bounds, node.resId))

    case 'piecewiseAffineKernel':
      return lapicIntervalPiecewiseAffine(
        childBound(bounds, node.childId),
        node.segments
      )

    case 'bilinearKernel':
      return lapicIntervalProduct([
        childBound(bounds, node.leftId),
        childBound(bounds, node.rightId),
      ])

    case 'multilinearKernel':
      return lapicIntervalProduct(node.childIds.map((id) => childBound(bounds, id)))

    case 'saturatingKernel':
      return lapicIntervalSaturate(childBound(bounds, node.childId), node.cap)

    default: {
      const _exhaustive: never = node
      throw new Error(`Unhandled F-IR operator: ${(_exhaustive as LapicFirNode).operator}`)
    }
  }
}

function childBound(
  bounds: ReadonlyMap<LapicFirNodeId, LapicInterval>,
  childId: LapicFirNodeId
): LapicInterval {
  return bounds.get(childId) ?? LAPIC_INTERVAL_EMPTY
}