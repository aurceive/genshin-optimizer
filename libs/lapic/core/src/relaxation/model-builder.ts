/**
 * Compile an F-IR formula graph into an LP relaxation model.
 *
 * Traverses the F-IR DAG in topological order, emitting one LP
 * variable per node and linear constraints that conservatively
 * approximate each operator.
 *
 * Linear-preserving operators (add, neg, affineForm, constant, read)
 * produce exact equality constraints.  Non-linear operators are
 * relaxed conservatively to produce admissible upper bounds:
 *
 *   min(a, b):       y ≤ a,  y ≤ b
 *   max(a, b):       y ≥ a,  y ≥ b
 *   saturatingKernel: y ≤ child, y ≤ cap
 *   thresholdSelect: y ≤ max(then, else)  (envelope)
 *   bilinear/multi:  McCormick over-estimator from interval bounds
 *   resistance/pwa:  piecewise-linear envelopes from interval bounds
 *
 * The resulting model is solver-agnostic and conforms to the
 * LapicLinearModel contract from relaxation/types.ts.
 */

import type {
  LapicFirGraph,
  LapicFirNode,
  LapicFirNodeId,
  LapicFirVariableId,
} from '../fir/types'
import { lapicFirNodeChildIds } from '../fir/types'
import type { LapicInterval } from '../interval/types'
import type {
  LapicLinearConstraint,
  LapicLinearModel,
  LapicLinearObjective,
  LapicLinearVariable,
} from './types'

// ---------------------------------------------------------------------------
// Variable-bound environment
// ---------------------------------------------------------------------------

/**
 * Per-variable interval bounds used for McCormick and envelope
 * relaxations of non-linear operators.
 */
export type LapicLpVariableBounds = ReadonlyMap<
  LapicFirVariableId,
  LapicInterval
>

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * Result of LP model compilation.
 *
 * `model` is the compiled LP model.
 * `nodeVariableIndex` maps every F-IR node to its LP variable index.
 * `relaxedNodeIds` lists nodes where exact constraints could not be
 * emitted and a conservative relaxation was used instead.
 */
export interface LapicLpModelBuildResult {
  readonly model: LapicLinearModel
  readonly nodeVariableIndex: ReadonlyMap<LapicFirNodeId, number>
  readonly relaxedNodeIds: ReadonlySet<LapicFirNodeId>
}

// ---------------------------------------------------------------------------
// Builder context (mutable during compilation)
// ---------------------------------------------------------------------------

interface BuilderCtx {
  nextVarIdx: number
  readonly variables: LapicLinearVariable[]
  readonly constraints: LapicLinearConstraint[]
  readonly nodeVarIdx: Map<LapicFirNodeId, number>
  readonly relaxedNodes: Set<LapicFirNodeId>
  readonly nodeBounds: Map<LapicFirNodeId, LapicInterval>
  constraintSeq: number
}

function allocVar(
  ctx: BuilderCtx,
  name: string,
  lo: number,
  hi: number
): number {
  const idx = ctx.nextVarIdx++
  ctx.variables.push({
    variableIndex: idx,
    name,
    lowerBound: lo,
    upperBound: hi,
  })
  return idx
}

function addConstraint(
  ctx: BuilderCtx,
  coefficients: number[],
  variableIndices: number[],
  lo: number,
  hi: number
): void {
  ctx.constraints.push({
    constraintId: `c${ctx.constraintSeq++}`,
    coefficients,
    variableIndices,
    lowerBound: lo,
    upperBound: hi,
  })
}

function nodeIdx(ctx: BuilderCtx, nodeId: LapicFirNodeId): number {
  const idx = ctx.nodeVarIdx.get(nodeId)
  if (idx === undefined)
    throw new Error(`LP variable not allocated for node ${nodeId}`)
  return idx
}

function nodeBound(ctx: BuilderCtx, nodeId: LapicFirNodeId): LapicInterval {
  return ctx.nodeBounds.get(nodeId) ?? { lo: -Infinity, hi: Infinity }
}

// ---------------------------------------------------------------------------
// Topological compilation
// ---------------------------------------------------------------------------

/**
 * Build an LP relaxation model from an F-IR graph.
 *
 * @param graph — The F-IR formula DAG
 * @param variableBounds — Per-variable interval bounds (used for
 *   non-linear relaxations; unbounded variables default to [-Inf, Inf])
 * @param modelDigest — Content digest for the resulting model
 */
export function buildLinearModelFromFir(
  graph: LapicFirGraph,
  variableBounds: LapicLpVariableBounds,
  modelDigest: string
): LapicLpModelBuildResult {
  const ctx: BuilderCtx = {
    nextVarIdx: 0,
    variables: [],
    constraints: [],
    nodeVarIdx: new Map(),
    relaxedNodes: new Set(),
    nodeBounds: new Map(),
    constraintSeq: 0,
  }

  // Topological order via post-order DFS
  const order: LapicFirNodeId[] = []
  const visited = new Set<LapicFirNodeId>()

  function topoVisit(id: LapicFirNodeId): void {
    if (visited.has(id)) return
    visited.add(id)
    const node = graph.nodes.get(id)
    if (!node) return
    for (const childId of lapicFirNodeChildIds(node)) {
      topoVisit(childId)
    }
    order.push(id)
  }

  topoVisit(graph.rootId)

  // Compile each node in topological order
  for (const nodeId of order) {
    const node = graph.nodes.get(nodeId)!
    compileNode(ctx, node, variableBounds)
  }

  // Objective: maximize the root node's LP variable
  const rootIdx = ctx.nodeVarIdx.get(graph.rootId)
  const objective: LapicLinearObjective =
    rootIdx !== undefined
      ? {
          sense: 'maximize',
          coefficients: [1],
          variableIndices: [rootIdx],
          offset: 0,
        }
      : { sense: 'maximize', coefficients: [], variableIndices: [], offset: 0 }

  return {
    model: {
      modelDigest,
      variables: ctx.variables,
      constraints: ctx.constraints,
      objective,
    },
    nodeVariableIndex: ctx.nodeVarIdx,
    relaxedNodeIds: ctx.relaxedNodes,
  }
}

// ---------------------------------------------------------------------------
// Per-node compilation
// ---------------------------------------------------------------------------

function compileNode(
  ctx: BuilderCtx,
  node: LapicFirNode,
  varBounds: LapicLpVariableBounds
): void {
  switch (node.operator) {
    case 'constant':
      return compileConstant(ctx, node)
    case 'read':
      return compileRead(ctx, node, varBounds)
    case 'add':
      return compileAdd(ctx, node)
    case 'neg':
      return compileNeg(ctx, node)
    case 'affineForm':
      return compileAffine(ctx, node)
    case 'min':
      return compileMin(ctx, node)
    case 'max':
      return compileMax(ctx, node)
    case 'saturatingKernel':
      return compileSaturate(ctx, node)
    case 'mul':
    case 'bilinearKernel':
    case 'multilinearKernel':
      return compileProduct(ctx, node)
    case 'thresholdSelect':
      return compileThresholdSelect(ctx, node)
    case 'resistanceTransform':
      return compileResistance(ctx, node)
    case 'sumFrac':
      return compileSumFrac(ctx, node)
    case 'piecewiseAffineKernel':
      return compilePiecewiseAffine(ctx, node)
    default: {
      const _exhaustive: never = node
      throw new Error(
        `Unhandled F-IR operator: ${(_exhaustive as LapicFirNode).operator}`
      )
    }
  }
}

// -- Leaf nodes -------------------------------------------------------------

function compileConstant(
  ctx: BuilderCtx,
  node: LapicFirNode & { operator: 'constant'; value: number }
): void {
  const idx = allocVar(ctx, `const_${node.nodeId}`, node.value, node.value)
  ctx.nodeVarIdx.set(node.nodeId, idx)
  ctx.nodeBounds.set(node.nodeId, { lo: node.value, hi: node.value })
}

function compileRead(
  ctx: BuilderCtx,
  node: LapicFirNode & { operator: 'read'; variableId: string },
  varBounds: LapicLpVariableBounds
): void {
  const bounds = varBounds.get(node.variableId) ?? {
    lo: -Infinity,
    hi: Infinity,
  }
  const idx = allocVar(ctx, `read_${node.variableId}`, bounds.lo, bounds.hi)
  ctx.nodeVarIdx.set(node.nodeId, idx)
  ctx.nodeBounds.set(node.nodeId, bounds)
}

// -- Exact linear operators -------------------------------------------------

function compileAdd(
  ctx: BuilderCtx,
  node: LapicFirNode & { operator: 'add'; childIds: readonly string[] }
): void {
  const childIndices = node.childIds.map((id) => nodeIdx(ctx, id))
  const childBounds = node.childIds.map((id) => nodeBound(ctx, id))
  const lo = childBounds.reduce((s, b) => s + b.lo, 0)
  const hi = childBounds.reduce((s, b) => s + b.hi, 0)

  const yIdx = allocVar(ctx, `add_${node.nodeId}`, lo, hi)
  ctx.nodeVarIdx.set(node.nodeId, yIdx)
  ctx.nodeBounds.set(node.nodeId, { lo, hi })

  // y = Σ children  →  y - Σ children = 0
  addConstraint(
    ctx,
    [1, ...childIndices.map(() => -1)],
    [yIdx, ...childIndices],
    0,
    0
  )
}

function compileNeg(
  ctx: BuilderCtx,
  node: LapicFirNode & { operator: 'neg'; childId: string }
): void {
  const cIdx = nodeIdx(ctx, node.childId)
  const cb = nodeBound(ctx, node.childId)
  const lo = -cb.hi
  const hi = -cb.lo

  const yIdx = allocVar(ctx, `neg_${node.nodeId}`, lo, hi)
  ctx.nodeVarIdx.set(node.nodeId, yIdx)
  ctx.nodeBounds.set(node.nodeId, { lo, hi })

  // y = -child  →  y + child = 0
  addConstraint(ctx, [1, 1], [yIdx, cIdx], 0, 0)
}

function compileAffine(
  ctx: BuilderCtx,
  node: LapicFirNode & {
    operator: 'affineForm'
    bias: number
    terms: readonly { coeff: number; childId: string }[]
  }
): void {
  const termIndices = node.terms.map((t) => nodeIdx(ctx, t.childId))
  const termBounds = node.terms.map((t) => {
    const b = nodeBound(ctx, t.childId)
    return t.coeff >= 0
      ? { lo: t.coeff * b.lo, hi: t.coeff * b.hi }
      : { lo: t.coeff * b.hi, hi: t.coeff * b.lo }
  })
  const lo = node.bias + termBounds.reduce((s, b) => s + b.lo, 0)
  const hi = node.bias + termBounds.reduce((s, b) => s + b.hi, 0)

  const yIdx = allocVar(ctx, `affine_${node.nodeId}`, lo, hi)
  ctx.nodeVarIdx.set(node.nodeId, yIdx)
  ctx.nodeBounds.set(node.nodeId, { lo, hi })

  // y = bias + Σ coeff_i * child_i  →  y - Σ coeff_i * child_i = bias
  addConstraint(
    ctx,
    [1, ...node.terms.map((t) => -t.coeff)],
    [yIdx, ...termIndices],
    node.bias,
    node.bias
  )
}

// -- Relaxed operators ------------------------------------------------------

function compileMin(
  ctx: BuilderCtx,
  node: LapicFirNode & { operator: 'min'; childIds: readonly string[] }
): void {
  const childBounds = node.childIds.map((id) => nodeBound(ctx, id))
  const lo = Math.min(...childBounds.map((b) => b.lo))
  const hi = Math.min(...childBounds.map((b) => b.hi))

  const yIdx = allocVar(ctx, `min_${node.nodeId}`, lo, hi)
  ctx.nodeVarIdx.set(node.nodeId, yIdx)
  ctx.nodeBounds.set(node.nodeId, { lo, hi })
  ctx.relaxedNodes.add(node.nodeId)

  // y ≤ child_i  for each child (upper-bound relaxation)
  for (const childId of node.childIds) {
    const cIdx = nodeIdx(ctx, childId)
    // y - child ≤ 0
    addConstraint(ctx, [1, -1], [yIdx, cIdx], -Infinity, 0)
  }
}

function compileMax(
  ctx: BuilderCtx,
  node: LapicFirNode & { operator: 'max'; childIds: readonly string[] }
): void {
  const childBounds = node.childIds.map((id) => nodeBound(ctx, id))
  const lo = Math.max(...childBounds.map((b) => b.lo))
  const hi = Math.max(...childBounds.map((b) => b.hi))

  const yIdx = allocVar(ctx, `max_${node.nodeId}`, lo, hi)
  ctx.nodeVarIdx.set(node.nodeId, yIdx)
  ctx.nodeBounds.set(node.nodeId, { lo, hi })
  ctx.relaxedNodes.add(node.nodeId)

  // y ≥ child_i  for each child (lower-bound relaxation)
  for (const childId of node.childIds) {
    const cIdx = nodeIdx(ctx, childId)
    // y - child ≥ 0
    addConstraint(ctx, [1, -1], [yIdx, cIdx], 0, Infinity)
  }
}

function compileSaturate(
  ctx: BuilderCtx,
  node: LapicFirNode & {
    operator: 'saturatingKernel'
    childId: string
    cap: number
  }
): void {
  const cIdx = nodeIdx(ctx, node.childId)
  const cb = nodeBound(ctx, node.childId)
  const lo = Math.min(cb.lo, node.cap)
  const hi = Math.min(cb.hi, node.cap)

  const yIdx = allocVar(ctx, `sat_${node.nodeId}`, lo, hi)
  ctx.nodeVarIdx.set(node.nodeId, yIdx)
  ctx.nodeBounds.set(node.nodeId, { lo, hi })
  ctx.relaxedNodes.add(node.nodeId)

  // y ≤ child
  addConstraint(ctx, [1, -1], [yIdx, cIdx], -Infinity, 0)
  // y ≤ cap
  addConstraint(ctx, [1], [yIdx], -Infinity, node.cap)
}

/**
 * McCormick relaxation for products (bilinear/multilinear/mul).
 *
 * For y = a * b with a ∈ [aL, aU], b ∈ [bL, bU]:
 *   y ≤ aU*b + bU*a - aU*bU   (McCormick upper envelope)
 *   y ≤ aL*b + bL*a - aL*bL
 *
 * For n-ary products, recursively pair variables.
 */
function compileProduct(
  ctx: BuilderCtx,
  node: LapicFirNode & {
    operator: 'mul' | 'bilinearKernel' | 'multilinearKernel'
  }
): void {
  let childIds: readonly string[]
  if (node.operator === 'bilinearKernel') {
    childIds = [
      (node as LapicFirNode & { leftId: string }).leftId,
      (node as LapicFirNode & { rightId: string }).rightId,
    ]
  } else {
    childIds = (node as LapicFirNode & { childIds: readonly string[] }).childIds
  }

  if (childIds.length === 0) {
    // Empty product = 1
    const yIdx = allocVar(ctx, `prod_${node.nodeId}`, 1, 1)
    ctx.nodeVarIdx.set(node.nodeId, yIdx)
    ctx.nodeBounds.set(node.nodeId, { lo: 1, hi: 1 })
    return
  }
  if (childIds.length === 1) {
    // Unary product = identity (exact)
    const cIdx = nodeIdx(ctx, childIds[0]!)
    const cb = nodeBound(ctx, childIds[0]!)
    const yIdx = allocVar(ctx, `prod_${node.nodeId}`, cb.lo, cb.hi)
    ctx.nodeVarIdx.set(node.nodeId, yIdx)
    ctx.nodeBounds.set(node.nodeId, cb)
    addConstraint(ctx, [1, -1], [yIdx, cIdx], 0, 0)
    return
  }

  ctx.relaxedNodes.add(node.nodeId)

  // Pairwise McCormick: reduce to bilinear products
  const currentId = childIds[0]!
  let currentBound = nodeBound(ctx, currentId)
  let currentIdx = nodeIdx(ctx, currentId)

  for (let i = 1; i < childIds.length; i++) {
    const bId = childIds[i]!
    const bIdx = nodeIdx(ctx, bId)
    const bb = nodeBound(ctx, bId)

    const prodBounds = mccormickBounds(currentBound, bb)
    const isLast = i === childIds.length - 1
    const name = isLast ? `prod_${node.nodeId}` : `prodaux_${node.nodeId}_${i}`

    const yIdx = allocVar(ctx, name, prodBounds.lo, prodBounds.hi)

    if (isLast) {
      ctx.nodeVarIdx.set(node.nodeId, yIdx)
      ctx.nodeBounds.set(node.nodeId, prodBounds)
    }

    emitMcCormickConstraints(ctx, yIdx, currentIdx, currentBound, bIdx, bb)

    currentIdx = yIdx
    currentBound = prodBounds
  }
}

function mccormickBounds(a: LapicInterval, b: LapicInterval): LapicInterval {
  const products = [a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi]
  return {
    lo: Math.min(...products),
    hi: Math.max(...products),
  }
}

function emitMcCormickConstraints(
  ctx: BuilderCtx,
  yIdx: number,
  aIdx: number,
  ab: LapicInterval,
  bIdx: number,
  bb: LapicInterval
): void {
  // McCormick upper envelope:
  //   y ≤ aU*b + bU*a - aU*bU
  //   y ≤ aL*b + bL*a - aL*bL
  // i.e.  y - aU*b - bU*a ≤ -aU*bU
  //       y - aL*b - bL*a ≤ -aL*bL
  addConstraint(
    ctx,
    [1, -ab.hi, -bb.hi],
    [yIdx, bIdx, aIdx],
    -Infinity,
    -(ab.hi * bb.hi)
  )
  addConstraint(
    ctx,
    [1, -ab.lo, -bb.lo],
    [yIdx, bIdx, aIdx],
    -Infinity,
    -(ab.lo * bb.lo)
  )
  // McCormick lower envelope:
  //   y ≥ aL*b + bU*a - aL*bU
  //   y ≥ aU*b + bL*a - aU*bL
  addConstraint(
    ctx,
    [1, -ab.lo, -bb.hi],
    [yIdx, bIdx, aIdx],
    -(ab.lo * bb.hi),
    Infinity
  )
  addConstraint(
    ctx,
    [1, -ab.hi, -bb.lo],
    [yIdx, bIdx, aIdx],
    -(ab.hi * bb.lo),
    Infinity
  )
}

/**
 * Threshold select: conservative envelope relaxation.
 * Since we cannot choose a branch in LP, take the widest envelope.
 */
function compileThresholdSelect(
  ctx: BuilderCtx,
  node: LapicFirNode & {
    operator: 'thresholdSelect'
    guardId: string
    threshold: number
    thenId: string
    elseId: string
  }
): void {
  const thenBound = nodeBound(ctx, node.thenId)
  const elseBound = nodeBound(ctx, node.elseId)
  const lo = Math.min(thenBound.lo, elseBound.lo)
  const hi = Math.max(thenBound.hi, elseBound.hi)

  const yIdx = allocVar(ctx, `thresh_${node.nodeId}`, lo, hi)
  ctx.nodeVarIdx.set(node.nodeId, yIdx)
  ctx.nodeBounds.set(node.nodeId, { lo, hi })
  ctx.relaxedNodes.add(node.nodeId)

  // y ≤ max(then, else) upper bound
  const thenIdx = nodeIdx(ctx, node.thenId)
  const elseIdx = nodeIdx(ctx, node.elseId)

  // Relaxation: y ≤ then.hi and y ≤ else.hi (already in variable bounds)
  // Also: y ≥ then.lo and y ≥ else.lo (already in variable bounds)
  // Tighten with per-branch constraints:
  //   y ≤ then  (valid when guard ≥ threshold)
  //   y ≤ else  (valid when guard < threshold)
  // Since LP cannot branch, emit both as envelope:
  addConstraint(ctx, [1, -1], [yIdx, thenIdx], -Infinity, 0)
  addConstraint(ctx, [1, -1], [yIdx, elseIdx], -Infinity, 0)
}

/**
 * Resistance transform: piecewise non-linear.
 * Relaxed via concave upper envelope across the three segments.
 */
function compileResistance(
  ctx: BuilderCtx,
  node: LapicFirNode & { operator: 'resistanceTransform'; resId: string }
): void {
  const rb = nodeBound(ctx, node.resId)
  const rIdx = nodeIdx(ctx, node.resId)

  // Compute output bounds by evaluating at segment boundaries
  const evalRes = (r: number): number => {
    if (r < 0) return 1 - r / 2
    if (r < 0.75) return 1 - r
    return 1 / (4 * r + 1)
  }

  const samplePoints = [rb.lo, 0, 0.75, rb.hi].filter(
    (p) => p >= rb.lo && p <= rb.hi
  )
  const sampleValues = samplePoints.map(evalRes)
  const lo = Math.min(...sampleValues)
  const hi = Math.max(...sampleValues)

  const yIdx = allocVar(ctx, `res_${node.nodeId}`, lo, hi)
  ctx.nodeVarIdx.set(node.nodeId, yIdx)
  ctx.nodeBounds.set(node.nodeId, { lo, hi })
  ctx.relaxedNodes.add(node.nodeId)

  // Linear upper envelope: y ≤ 1 - res/2 (segment 1 is the loosest upper bound)
  // This is admissible because the resistance function is always ≤ 1 - res/2
  // for all non-negative res, and ≤ 1 - res/2 trivially for negative res.
  // Constraint: y ≤ 1 - r/2  →  y + r/2 ≤ 1
  addConstraint(ctx, [1, 0.5], [yIdx, rIdx], -Infinity, 1)
}

/**
 * Sum-fraction: y = x / (x + c), relaxed via interval bounds.
 *
 * The function is concave in x (for c > 0) and convex in c (for x > 0).
 * We use a conservative bound: allocate y with interval-evaluated bounds
 * and constrain y ≤ 1 (since x/(x+c) < 1 for c > 0).
 */
function compileSumFrac(
  ctx: BuilderCtx,
  node: LapicFirNode & {
    operator: 'sumFrac'
    numeratorId: string
    addendId: string
  }
): void {
  const nb = nodeBound(ctx, node.numeratorId)
  const ab = nodeBound(ctx, node.addendId)

  const evalSF = (x: number, c: number): number => {
    const denom = x + c
    if (denom === 0) return 0
    return x / denom
  }

  // Evaluate at corners to find tight bounds
  const values = [
    evalSF(nb.lo, ab.lo),
    evalSF(nb.lo, ab.hi),
    evalSF(nb.hi, ab.lo),
    evalSF(nb.hi, ab.hi),
  ]
  const lo = Math.min(...values)
  const hi = Math.max(...values)

  const yIdx = allocVar(ctx, `sf_${node.nodeId}`, lo, hi)
  ctx.nodeVarIdx.set(node.nodeId, yIdx)
  ctx.nodeBounds.set(node.nodeId, { lo, hi })
  ctx.relaxedNodes.add(node.nodeId)

  // y ≤ 1 (x/(x+c) < 1 for any c > 0)
  addConstraint(ctx, [1], [yIdx], -Infinity, 1)
}

/**
 * Piecewise-affine kernel: emit per-segment upper-bound constraints.
 */
function compilePiecewiseAffine(
  ctx: BuilderCtx,
  node: LapicFirNode & {
    operator: 'piecewiseAffineKernel'
    childId: string
    segments: readonly {
      breakpoint: number
      slope: number
      intercept: number
    }[]
  }
): void {
  const cb = nodeBound(ctx, node.childId)
  const cIdx = nodeIdx(ctx, node.childId)

  // Evaluate at all breakpoints and endpoints to find output bounds
  const points = [
    cb.lo,
    cb.hi,
    ...node.segments
      .map((s) => s.breakpoint)
      .filter((bp) => bp >= cb.lo && bp <= cb.hi),
  ]
  const evalPwa = (x: number): number => {
    let seg = node.segments[0]!
    for (let i = 1; i < node.segments.length; i++) {
      if (x >= node.segments[i]!.breakpoint) seg = node.segments[i]!
      else break
    }
    return seg.slope * (x - seg.breakpoint) + seg.intercept
  }
  const values = points.map(evalPwa)
  const lo = Math.min(...values)
  const hi = Math.max(...values)

  const yIdx = allocVar(ctx, `pwa_${node.nodeId}`, lo, hi)
  ctx.nodeVarIdx.set(node.nodeId, yIdx)
  ctx.nodeBounds.set(node.nodeId, { lo, hi })
  ctx.relaxedNodes.add(node.nodeId)

  // Upper envelope: for each segment with non-negative slope,
  // y ≤ slope * (x - breakpoint) + intercept is an admissible constraint
  // when the segment is active. As an envelope, emit for all segments:
  for (const seg of node.segments) {
    // y ≤ slope * x + (intercept - slope * breakpoint)
    // y - slope * x ≤ intercept - slope * breakpoint
    const rhs = seg.intercept - seg.slope * seg.breakpoint
    addConstraint(ctx, [1, -seg.slope], [yIdx, cIdx], -Infinity, rhs)
  }
}
