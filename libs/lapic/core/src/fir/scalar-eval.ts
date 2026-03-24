/**
 * Evaluate an F-IR graph with scalar (point) inputs.
 *
 * Mirrors the interval evaluator but operates on plain numbers.
 * Used for exact objective computation and golden-harness validation.
 *
 * Variables not in `env` evaluate to `NaN` (signals a missing binding).
 */

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

/** Variable point values: for each variable, a concrete numeric value. */
export type LapicFirScalarEnv = ReadonlyMap<LapicFirVariableId, number>

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * Result of scalar evaluation.
 * `rootValue` is the objective value at the given point.
 * `nodeValues` maps every visited node to its computed value.
 */
export interface LapicFirScalarEvalResult {
  readonly rootValue: number
  readonly nodeValues: ReadonlyMap<LapicFirNodeId, number>
}

// ---------------------------------------------------------------------------
// Topological evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate the F-IR graph with scalar inputs.
 *
 * Variables not in `env` are treated as `NaN`.
 */
export function evaluateLapicFirScalar(
  graph: LapicFirGraph,
  env: LapicFirScalarEnv
): LapicFirScalarEvalResult {
  const values = new Map<LapicFirNodeId, number>()

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

  for (const nodeId of order) {
    const node = graph.nodes.get(nodeId)!
    values.set(nodeId, evaluateNodeScalar(node, values, env))
  }

  return {
    rootValue: values.get(graph.rootId) ?? NaN,
    nodeValues: values,
  }
}

// ---------------------------------------------------------------------------
// Per-node evaluation
// ---------------------------------------------------------------------------

function evaluateNodeScalar(
  node: LapicFirNode,
  values: ReadonlyMap<LapicFirNodeId, number>,
  env: LapicFirScalarEnv
): number {
  switch (node.operator) {
    case 'constant':
      return node.value

    case 'read':
      return env.get(node.variableId) ?? NaN

    case 'add':
      return node.childIds.reduce((sum, id) => sum + childValue(values, id), 0)

    case 'mul':
      return node.childIds.reduce(
        (product, id) => product * childValue(values, id),
        1
      )

    case 'min':
      return Math.min(...node.childIds.map((id) => childValue(values, id)))

    case 'max':
      return Math.max(...node.childIds.map((id) => childValue(values, id)))

    case 'neg':
      return -childValue(values, node.childId)

    case 'affineForm':
      return (
        node.bias +
        node.terms.reduce(
          (sum, t) => sum + t.coeff * childValue(values, t.childId),
          0
        )
      )

    case 'thresholdSelect': {
      const guard = childValue(values, node.guardId)
      return guard >= node.threshold
        ? childValue(values, node.thenId)
        : childValue(values, node.elseId)
    }

    case 'resistanceTransform':
      return resistanceTransformScalar(childValue(values, node.resId))

    case 'piecewiseAffineKernel':
      return piecewiseAffineScalar(
        childValue(values, node.childId),
        node.segments
      )

    case 'bilinearKernel':
      return childValue(values, node.leftId) * childValue(values, node.rightId)

    case 'multilinearKernel':
      return node.childIds.reduce(
        (product, id) => product * childValue(values, id),
        1
      )

    case 'saturatingKernel':
      return Math.min(childValue(values, node.childId), node.cap)

    case 'sumFrac': {
      const num = childValue(values, node.numeratorId)
      const add = childValue(values, node.addendId)
      return num / (num + add)
    }

    default: {
      const _exhaustive: never = node
      throw new Error(
        `Unhandled F-IR operator: ${(_exhaustive as LapicFirNode).operator}`
      )
    }
  }
}

function childValue(
  values: ReadonlyMap<LapicFirNodeId, number>,
  childId: LapicFirNodeId
): number {
  return values.get(childId) ?? NaN
}

// ---------------------------------------------------------------------------
// Game-specific scalar kernels
// ---------------------------------------------------------------------------

/**
 * GI resistance transform (scalar):
 *   res < 0      → 1 − res/2
 *   0 ≤ res < 0.75 → 1 − res
 *   res ≥ 0.75   → 1 / (4·res + 1)
 */
function resistanceTransformScalar(res: number): number {
  if (res < 0) return 1 - res / 2
  if (res < 0.75) return 1 - res
  return 1 / (4 * res + 1)
}

/**
 * Piecewise-affine scalar evaluation.
 * Segments must be sorted by breakpoint.
 */
function piecewiseAffineScalar(
  x: number,
  segments: readonly {
    readonly breakpoint: number
    readonly slope: number
    readonly intercept: number
  }[]
): number {
  let seg = segments[0]!
  for (let i = 1; i < segments.length; i++) {
    if (x >= segments[i]!.breakpoint) {
      seg = segments[i]!
    } else {
      break
    }
  }
  return seg.slope * (x - seg.breakpoint) + seg.intercept
}
