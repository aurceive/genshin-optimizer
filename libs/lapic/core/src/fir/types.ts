/**
 * F-IR (Formula Intermediate Representation) type definitions.
 *
 * A canonical DAG of arithmetic, branching, and game-kernel operators.
 * Nodes are stored in a flat map and reference children by ID, enabling
 * hash-consed deduplication and bottom-up evaluation.
 *
 * See: docs/architecture/lapic/canonical-ir.md §F-IR
 */

// ---------------------------------------------------------------------------
// Node identity
// ---------------------------------------------------------------------------

/** Content-hash–based node identifier, unique per structural content. */
export type LapicFirNodeId = string

/** Variable identifier used by Read nodes. */
export type LapicFirVariableId = string

// ---------------------------------------------------------------------------
// Operator taxonomy
// ---------------------------------------------------------------------------

export type LapicFirOperatorKind =
  // Constants & Reads
  | 'constant'
  | 'read'
  // Pure Arithmetic
  | 'add'
  | 'mul'
  | 'min'
  | 'max'
  | 'neg'
  | 'affineForm'
  // Branching
  | 'thresholdSelect'
  // Game Kernels
  | 'resistanceTransform'
  | 'piecewiseAffineKernel'
  | 'bilinearKernel'
  | 'multilinearKernel'
  | 'saturatingKernel'

// ---------------------------------------------------------------------------
// Node definitions (discriminated union on `operator`)
// ---------------------------------------------------------------------------

interface LapicFirNodeBase {
  readonly nodeId: LapicFirNodeId
  readonly operator: LapicFirOperatorKind
}

/** Literal numeric constant. */
export interface LapicFirConstantNode extends LapicFirNodeBase {
  readonly operator: 'constant'
  readonly value: number
}

/** Read a named variable. Leaf node — no children. */
export interface LapicFirReadNode extends LapicFirNodeBase {
  readonly operator: 'read'
  readonly variableId: LapicFirVariableId
}

/** Sum of children: Σ childIds[i]. */
export interface LapicFirAddNode extends LapicFirNodeBase {
  readonly operator: 'add'
  readonly childIds: readonly LapicFirNodeId[]
}

/** Product of children: Π childIds[i]. */
export interface LapicFirMulNode extends LapicFirNodeBase {
  readonly operator: 'mul'
  readonly childIds: readonly LapicFirNodeId[]
}

/** Minimum of children: min(childIds[i]). */
export interface LapicFirMinNode extends LapicFirNodeBase {
  readonly operator: 'min'
  readonly childIds: readonly LapicFirNodeId[]
}

/** Maximum of children: max(childIds[i]). */
export interface LapicFirMaxNode extends LapicFirNodeBase {
  readonly operator: 'max'
  readonly childIds: readonly LapicFirNodeId[]
}

/** Negation: −child. */
export interface LapicFirNegNode extends LapicFirNodeBase {
  readonly operator: 'neg'
  readonly childId: LapicFirNodeId
}

/** Affine combination: bias + Σ terms[i].coeff * terms[i].childId. */
export interface LapicFirAffineTerm {
  readonly coeff: number
  readonly childId: LapicFirNodeId
}
export interface LapicFirAffineFormNode extends LapicFirNodeBase {
  readonly operator: 'affineForm'
  readonly bias: number
  readonly terms: readonly LapicFirAffineTerm[]
}

/**
 * Conditional selection:
 *   guard >= threshold ? thenId : elseId
 */
export interface LapicFirThresholdSelectNode extends LapicFirNodeBase {
  readonly operator: 'thresholdSelect'
  readonly guardId: LapicFirNodeId
  readonly threshold: number
  readonly thenId: LapicFirNodeId
  readonly elseId: LapicFirNodeId
}

/**
 * Genshin resistance-damage transform.
 *   if res < 0:      1 − res/2
 *   if 0 ≤ res < 0.75: 1 − res
 *   if res ≥ 0.75:   1 / (4·res + 1)
 *
 * `resId` is the child supplying the resistance value.
 */
export interface LapicFirResistanceTransformNode extends LapicFirNodeBase {
  readonly operator: 'resistanceTransform'
  readonly resId: LapicFirNodeId
}

/**
 * Piecewise-affine kernel:
 *   Given sorted breakpoints and corresponding slopes/intercepts,
 *   evaluates the piecewise function at the child value.
 *
 * Each segment i covers [breakpoints[i], breakpoints[i+1]) with
 *   y = slopes[i] * (x − breakpoint) + intercepts[i]
 *
 * The last segment extends to +∞.
 */
export interface LapicFirPiecewiseAffineSegment {
  readonly breakpoint: number
  readonly slope: number
  readonly intercept: number
}
export interface LapicFirPiecewiseAffineKernelNode extends LapicFirNodeBase {
  readonly operator: 'piecewiseAffineKernel'
  readonly childId: LapicFirNodeId
  readonly segments: readonly LapicFirPiecewiseAffineSegment[]
}

/** Product of exactly two children (bilinear form). */
export interface LapicFirBilinearKernelNode extends LapicFirNodeBase {
  readonly operator: 'bilinearKernel'
  readonly leftId: LapicFirNodeId
  readonly rightId: LapicFirNodeId
}

/** Product of N children (multilinear form). */
export interface LapicFirMultilinearKernelNode extends LapicFirNodeBase {
  readonly operator: 'multilinearKernel'
  readonly childIds: readonly LapicFirNodeId[]
}

/** Saturating kernel: min(child, cap). */
export interface LapicFirSaturatingKernelNode extends LapicFirNodeBase {
  readonly operator: 'saturatingKernel'
  readonly childId: LapicFirNodeId
  readonly cap: number
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type LapicFirNode =
  | LapicFirConstantNode
  | LapicFirReadNode
  | LapicFirAddNode
  | LapicFirMulNode
  | LapicFirMinNode
  | LapicFirMaxNode
  | LapicFirNegNode
  | LapicFirAffineFormNode
  | LapicFirThresholdSelectNode
  | LapicFirResistanceTransformNode
  | LapicFirPiecewiseAffineKernelNode
  | LapicFirBilinearKernelNode
  | LapicFirMultilinearKernelNode
  | LapicFirSaturatingKernelNode

// ---------------------------------------------------------------------------
// Graph container
// ---------------------------------------------------------------------------

/**
 * A complete F-IR formula graph.
 *
 * Nodes are stored in a flat map keyed by content-hash IDs.
 * `rootId` designates the top-level objective node.
 * `variableIds` enumerates every distinct Read variable in the graph.
 */
export interface LapicFirGraph {
  readonly rootId: LapicFirNodeId
  readonly nodes: ReadonlyMap<LapicFirNodeId, LapicFirNode>
  readonly variableIds: ReadonlySet<LapicFirVariableId>
}

// ---------------------------------------------------------------------------
// Helpers for child traversal
// ---------------------------------------------------------------------------

/** Return all direct child node IDs of a given node. */
export function lapicFirNodeChildIds(node: LapicFirNode): readonly LapicFirNodeId[] {
  switch (node.operator) {
    case 'constant':
    case 'read':
      return []
    case 'add':
    case 'mul':
    case 'min':
    case 'max':
    case 'multilinearKernel':
      return node.childIds
    case 'neg':
    case 'saturatingKernel':
    case 'piecewiseAffineKernel':
      return [node.childId]
    case 'affineForm':
      return node.terms.map((t) => t.childId)
    case 'thresholdSelect':
      return [node.guardId, node.thenId, node.elseId]
    case 'resistanceTransform':
      return [node.resId]
    case 'bilinearKernel':
      return [node.leftId, node.rightId]
  }
}