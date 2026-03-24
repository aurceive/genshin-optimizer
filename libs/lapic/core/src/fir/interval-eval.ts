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

import {
  lapicIntervalAdd,
  lapicIntervalAffine,
  lapicIntervalMax,
  lapicIntervalMaxN,
  lapicIntervalMin,
  lapicIntervalMinN,
  lapicIntervalMul,
  lapicIntervalNeg,
  lapicIntervalPiecewiseAffine,
  lapicIntervalProduct,
  lapicIntervalResistanceTransform,
  lapicIntervalSaturate,
  lapicIntervalSumFrac,
  lapicIntervalThresholdSelect,
} from '../interval/arithmetic'
import type { LapicInterval } from '../interval/types'
import { LAPIC_INTERVAL_EMPTY, lapicIntervalPoint } from '../interval/types'
import type {
  LapicFirGraph,
  LapicFirNode,
  LapicFirNodeId,
  LapicFirVariableId,
} from './types'
import { lapicFirNodeChildIds } from './types'

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

  const getBound = (id: LapicFirNodeId): LapicInterval =>
    bounds.get(id) ?? LAPIC_INTERVAL_EMPTY

  // Evaluate in topological order (children before parents)
  for (const nodeId of order) {
    const node = graph.nodes.get(nodeId)!
    bounds.set(nodeId, evaluateNode(node, getBound, env))
  }

  return {
    rootBound: bounds.get(graph.rootId) ?? LAPIC_INTERVAL_EMPTY,
    nodeBounds: bounds,
  }
}

// ---------------------------------------------------------------------------
// Cached interval evaluator
// ---------------------------------------------------------------------------

/**
 * Create a cached interval evaluator that pre-computes topological
 * order once and reuses evaluation buffers across calls.
 *
 * This is the hot-path evaluator for B&B bound checks —
 * called millions of times per solve. It eliminates per-call
 * allocations (DFS traversal, Map, Set, Array) by caching them
 * at construction time and mutating a pre-allocated bounds array.
 */
export function createLapicFirCachedIntervalEvaluator(
  graph: LapicFirGraph
): (env: LapicFirIntervalEnv) => LapicInterval {
  // Pre-compute topological order once
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

  const nodeCount = order.length
  if (nodeCount === 0) return () => LAPIC_INTERVAL_EMPTY

  // Pre-resolve nodes and build index map
  const nodes: LapicFirNode[] = new Array(nodeCount)
  const nodeToIdx = new Map<LapicFirNodeId, number>()
  for (let i = 0; i < nodeCount; i++) {
    nodes[i] = graph.nodes.get(order[i]!)!
    nodeToIdx.set(order[i]!, i)
  }

  // Pre-allocate bounds buffer (mutated on each call)
  const boundsArr: LapicInterval[] = new Array(nodeCount)
  const rootIdx = nodeCount - 1

  // Stable closure for child bound lookup (no per-call allocation)
  const getBound = (id: LapicFirNodeId): LapicInterval => {
    const idx = nodeToIdx.get(id)
    return idx !== undefined ? boundsArr[idx] : LAPIC_INTERVAL_EMPTY
  }

  return (env: LapicFirIntervalEnv): LapicInterval => {
    for (let i = 0; i < nodeCount; i++) {
      boundsArr[i] = evaluateNode(nodes[i]!, getBound, env)
    }
    return boundsArr[rootIdx]!
  }
}

// ---------------------------------------------------------------------------
// Per-node evaluation
// ---------------------------------------------------------------------------

function evaluateNode(
  node: LapicFirNode,
  getBound: (id: LapicFirNodeId) => LapicInterval,
  env: LapicFirIntervalEnv
): LapicInterval {
  switch (node.operator) {
    case 'constant':
      return lapicIntervalPoint(node.value)

    case 'read':
      return env.get(node.variableId) ?? { lo: -Infinity, hi: Infinity }

    case 'add': {
      const ids = node.childIds
      let acc = getBound(ids[0]!)
      for (let i = 1; i < ids.length; i++) {
        acc = lapicIntervalAdd(acc, getBound(ids[i]!))
      }
      return acc
    }

    case 'mul': {
      const ids = node.childIds
      if (ids.length === 2)
        return lapicIntervalMul(getBound(ids[0]!), getBound(ids[1]!))
      return lapicIntervalProduct(ids.map((id) => getBound(id)))
    }

    case 'min': {
      const ids = node.childIds
      if (ids.length === 2)
        return lapicIntervalMin(getBound(ids[0]!), getBound(ids[1]!))
      return lapicIntervalMinN(ids.map((id) => getBound(id)))
    }

    case 'max': {
      const ids = node.childIds
      if (ids.length === 2)
        return lapicIntervalMax(getBound(ids[0]!), getBound(ids[1]!))
      return lapicIntervalMaxN(ids.map((id) => getBound(id)))
    }

    case 'neg':
      return lapicIntervalNeg(getBound(node.childId))

    case 'affineForm':
      return lapicIntervalAffine(
        node.bias,
        node.terms.map((t) => ({
          coeff: t.coeff,
          interval: getBound(t.childId),
        }))
      )

    case 'thresholdSelect':
      return lapicIntervalThresholdSelect(
        getBound(node.guardId),
        node.threshold,
        getBound(node.thenId),
        getBound(node.elseId)
      )

    case 'resistanceTransform':
      return lapicIntervalResistanceTransform(getBound(node.resId))

    case 'piecewiseAffineKernel':
      return lapicIntervalPiecewiseAffine(getBound(node.childId), node.segments)

    case 'bilinearKernel':
      return lapicIntervalMul(getBound(node.leftId), getBound(node.rightId))

    case 'multilinearKernel':
      return lapicIntervalProduct(node.childIds.map((id) => getBound(id)))

    case 'saturatingKernel':
      return lapicIntervalSaturate(getBound(node.childId), node.cap)

    case 'sumFrac':
      return lapicIntervalSumFrac(
        getBound(node.numeratorId),
        getBound(node.addendId)
      )

    default: {
      const _exhaustive: never = node
      throw new Error(
        `Unhandled F-IR operator: ${(_exhaustive as LapicFirNode).operator}`
      )
    }
  }
}
