/**
 * A-IR analysis engine.
 *
 * Walks an F-IR graph bottom-up (post-order) and computes
 * per-node annotations: bounds, monotonicity, curvature,
 * required variables, branch control sets, and nonlinear
 * interactions. Also extracts region decomposition from
 * thresholdSelect nodes.
 *
 * All annotations are conservative: if a fact cannot be
 * soundly proven, the engine emits 'unknown' or omits it.
 */

import type {
  LapicFirGraph,
  LapicFirNode,
  LapicFirNodeId,
  LapicFirVariableId,
} from '../fir/types'
import type {
  LapicAirCurvature,
  LapicAirFaceSelection,
  LapicAirGraph,
  LapicAirMonotonicity,
  LapicAirNodeAnnotation,
  LapicAirRegion,
} from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze an F-IR graph and produce an A-IR annotated graph.
 *
 * The analysis is a single bottom-up pass over the DAG.
 * Each node is visited exactly once (memoized). The result
 * contains per-node annotations and region decomposition.
 */
export function analyzeLapicFirGraph(graph: LapicFirGraph): LapicAirGraph {
  const engine = new AirAnalysisEngine(graph)
  engine.analyze(graph.rootId)

  const annotations = new Map<LapicFirNodeId, LapicAirNodeAnnotation>()
  for (const [nodeId, ann] of engine.annotations) {
    annotations.set(nodeId, ann)
  }

  const rootAnnotation = engine.annotations.get(graph.rootId)
  const rootRequiredVariables = rootAnnotation?.requiredVariables ?? new Set()

  return {
    firGraph: graph,
    annotations,
    regions: engine.regions,
    rootRequiredVariables,
  }
}

// ---------------------------------------------------------------------------
// Internal engine
// ---------------------------------------------------------------------------

/** Mutable annotation being built for a node. */
interface MutableAnnotation {
  firNodeId: LapicFirNodeId
  exactLower?: number
  exactUpper?: number
  monotonicityByVariable: Map<LapicFirVariableId, LapicAirMonotonicity>
  curvature: LapicAirCurvature
  branchControlSet: Set<LapicFirNodeId>
  requiredVariables: Set<LapicFirVariableId>
  nonlinearInteractions: Set<string>
}

function createMutableAnnotation(nodeId: LapicFirNodeId): MutableAnnotation {
  return {
    firNodeId: nodeId,
    monotonicityByVariable: new Map(),
    curvature: 'unknown',
    branchControlSet: new Set(),
    requiredVariables: new Set(),
    nonlinearInteractions: new Set(),
  }
}

function freezeAnnotation(m: MutableAnnotation): LapicAirNodeAnnotation {
  return {
    firNodeId: m.firNodeId,
    ...(m.exactLower !== undefined ? { exactLower: m.exactLower } : {}),
    ...(m.exactUpper !== undefined ? { exactUpper: m.exactUpper } : {}),
    ...(m.monotonicityByVariable.size > 0
      ? { monotonicityByVariable: new Map(m.monotonicityByVariable) }
      : {}),
    curvature: m.curvature,
    ...(m.branchControlSet.size > 0
      ? { branchControlSet: new Set(m.branchControlSet) }
      : {}),
    ...(m.requiredVariables.size > 0
      ? { requiredVariables: new Set(m.requiredVariables) }
      : {}),
    ...(m.nonlinearInteractions.size > 0
      ? { nonlinearInteractions: new Set(m.nonlinearInteractions) }
      : {}),
  }
}

/** Encode a variable pair as a canonical string key. */
function interactionKey(a: LapicFirVariableId, b: LapicFirVariableId): string {
  return a < b ? `${a}⊗${b}` : `${b}⊗${a}`
}

class AirAnalysisEngine {
  readonly annotations = new Map<LapicFirNodeId, LapicAirNodeAnnotation>()
  readonly regions: LapicAirRegion[] = []
  private readonly memos = new Map<LapicFirNodeId, MutableAnnotation>()

  constructor(private readonly graph: LapicFirGraph) {}

  analyze(nodeId: LapicFirNodeId): MutableAnnotation {
    const cached = this.memos.get(nodeId)
    if (cached) return cached

    const node = this.graph.nodes.get(nodeId)
    if (!node) {
      const fallback = createMutableAnnotation(nodeId)
      fallback.curvature = 'unknown'
      this.memos.set(nodeId, fallback)
      this.annotations.set(nodeId, freezeAnnotation(fallback))
      return fallback
    }

    const result = this.analyzeNode(nodeId, node)
    this.memos.set(nodeId, result)
    this.annotations.set(nodeId, freezeAnnotation(result))
    return result
  }

  private analyzeNode(
    nodeId: LapicFirNodeId,
    node: LapicFirNode
  ): MutableAnnotation {
    switch (node.operator) {
      case 'constant':
        return this.analyzeConstant(nodeId, node.value)
      case 'read':
        return this.analyzeRead(nodeId, node.variableId)
      case 'add':
        return this.analyzeAdd(nodeId, node.childIds)
      case 'mul':
        return this.analyzeMul(nodeId, node.childIds)
      case 'min':
        return this.analyzeMin(nodeId, node.childIds)
      case 'max':
        return this.analyzeMax(nodeId, node.childIds)
      case 'neg':
        return this.analyzeNeg(nodeId, node.childId)
      case 'affineForm':
        return this.analyzeAffineForm(nodeId, node)
      case 'thresholdSelect':
        return this.analyzeThresholdSelect(nodeId, node)
      case 'resistanceTransform':
        return this.analyzeResistanceTransform(nodeId, node.resId)
      case 'piecewiseAffineKernel':
        return this.analyzePiecewiseAffineKernel(nodeId, node.childId)
      case 'bilinearKernel':
        return this.analyzeBilinearKernel(nodeId, node.leftId, node.rightId)
      case 'multilinearKernel':
        return this.analyzeMultilinearKernel(nodeId, node.childIds)
      case 'saturatingKernel':
        return this.analyzeSaturatingKernel(nodeId, node)
      default: {
        const fallback = createMutableAnnotation(nodeId)
        return fallback
      }
    }
  }

  // --- Leaf nodes ---

  private analyzeConstant(
    nodeId: LapicFirNodeId,
    value: number
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    ann.exactLower = value
    ann.exactUpper = value
    ann.curvature = 'affine'
    return ann
  }

  private analyzeRead(
    nodeId: LapicFirNodeId,
    variableId: LapicFirVariableId
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    ann.curvature = 'affine'
    ann.requiredVariables.add(variableId)
    ann.monotonicityByVariable.set(variableId, 'increasing')
    return ann
  }

  // --- Arithmetic: add ---

  private analyzeAdd(
    nodeId: LapicFirNodeId,
    childIds: readonly LapicFirNodeId[]
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    const children = childIds.map((id) => this.analyze(id))

    // Bounds: sum of bounds
    if (children.every((c) => c.exactLower !== undefined)) {
      ann.exactLower = children.reduce((s, c) => s + c.exactLower!, 0)
    }
    if (children.every((c) => c.exactUpper !== undefined)) {
      ann.exactUpper = children.reduce((s, c) => s + c.exactUpper!, 0)
    }

    // Monotonicity: additive → each child's monotonicity propagates directly
    mergeMonotonicitiesAdditive(ann, children)

    // Curvature: sum of convex is convex, sum of concave is concave
    ann.curvature = mergeCurvaturesAdditive(children)

    // Dependencies: union of children
    mergeRequiredVariables(ann, children)
    mergeBranchControlSets(ann, children)
    mergeNonlinearInteractions(ann, children)

    return ann
  }

  // --- Arithmetic: mul ---

  private analyzeMul(
    nodeId: LapicFirNodeId,
    childIds: readonly LapicFirNodeId[]
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    const children = childIds.map((id) => this.analyze(id))

    // Bounds for multiplication (conservative)
    this.computeMulBounds(ann, children)

    // Monotonicity: depends on sign of co-factors (conservative)
    this.computeMulMonotonicity(ann, children)

    // Curvature: product is generally not convex/concave
    ann.curvature =
      children.length <= 1 ? (children[0]?.curvature ?? 'unknown') : 'unknown'

    // Dependencies
    mergeRequiredVariables(ann, children)
    mergeBranchControlSets(ann, children)
    mergeNonlinearInteractions(ann, children)

    // New interactions: variables from different children interact
    this.addCrossChildInteractions(ann, children)

    return ann
  }

  private computeMulBounds(
    ann: MutableAnnotation,
    children: MutableAnnotation[]
  ): void {
    if (
      !children.every(
        (c) => c.exactLower !== undefined && c.exactUpper !== undefined
      )
    )
      return

    // Compute all corner products to find exact bounds
    let lo = Infinity
    let hi = -Infinity
    const bounds = children.map((c) => [c.exactLower!, c.exactUpper!] as const)

    // For n children, check 2^n corners
    const n = bounds.length
    if (n > 10) return // Too many children for exact corner enumeration
    for (let mask = 0; mask < 1 << n; mask++) {
      let product = 1
      for (let i = 0; i < n; i++) {
        product *= (mask >> i) & 1 ? bounds[i]![1] : bounds[i]![0]
      }
      lo = Math.min(lo, product)
      hi = Math.max(hi, product)
    }
    ann.exactLower = lo
    ann.exactUpper = hi
  }

  private computeMulMonotonicity(
    ann: MutableAnnotation,
    children: MutableAnnotation[]
  ): void {
    // For a product, monotonicity w.r.t. variable x depends on
    // whether the co-factor (product of other children) is non-negative.
    // We can only determine this when co-factor bounds are known and same-sign.
    for (const child of children) {
      const coFactors = children.filter((c) => c !== child)
      const coFactorNonNeg = coFactors.every(
        (c) => c.exactLower !== undefined && c.exactLower >= 0
      )
      const coFactorNonPos = coFactors.every(
        (c) => c.exactUpper !== undefined && c.exactUpper <= 0
      )

      for (const [varId, childMono] of child.monotonicityByVariable) {
        if (childMono === 'constant') {
          ann.monotonicityByVariable.set(varId, 'constant')
          continue
        }
        if (coFactorNonNeg) {
          // Co-factor ≥ 0 → monotonicity preserved
          combineMonotonicity(ann.monotonicityByVariable, varId, childMono)
        } else if (coFactorNonPos) {
          // Co-factor ≤ 0 → monotonicity flipped
          combineMonotonicity(
            ann.monotonicityByVariable,
            varId,
            flipMonotonicity(childMono)
          )
        } else {
          // Unknown sign → unknown monotonicity
          ann.monotonicityByVariable.set(varId, 'unknown')
        }
      }
    }
  }

  private addCrossChildInteractions(
    ann: MutableAnnotation,
    children: MutableAnnotation[]
  ): void {
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const varsI = children[i]!.requiredVariables
        const varsJ = children[j]!.requiredVariables
        for (const vi of varsI) {
          for (const vj of varsJ) {
            ann.nonlinearInteractions.add(interactionKey(vi, vj))
          }
        }
      }
    }
  }

  // --- Arithmetic: min/max ---

  private analyzeMin(
    nodeId: LapicFirNodeId,
    childIds: readonly LapicFirNodeId[]
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    const children = childIds.map((id) => this.analyze(id))

    if (children.every((c) => c.exactLower !== undefined)) {
      ann.exactLower = Math.min(...children.map((c) => c.exactLower!))
    }
    if (children.every((c) => c.exactUpper !== undefined)) {
      ann.exactUpper = Math.min(...children.map((c) => c.exactUpper!))
    }

    // min is concave
    ann.curvature = 'concave'

    mergeMonotonicitiesPreserving(ann, children)
    mergeRequiredVariables(ann, children)
    mergeBranchControlSets(ann, children)
    mergeNonlinearInteractions(ann, children)

    return ann
  }

  private analyzeMax(
    nodeId: LapicFirNodeId,
    childIds: readonly LapicFirNodeId[]
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    const children = childIds.map((id) => this.analyze(id))

    if (children.every((c) => c.exactLower !== undefined)) {
      ann.exactLower = Math.max(...children.map((c) => c.exactLower!))
    }
    if (children.every((c) => c.exactUpper !== undefined)) {
      ann.exactUpper = Math.max(...children.map((c) => c.exactUpper!))
    }

    // max is convex
    ann.curvature = 'convex'

    mergeMonotonicitiesPreserving(ann, children)
    mergeRequiredVariables(ann, children)
    mergeBranchControlSets(ann, children)
    mergeNonlinearInteractions(ann, children)

    return ann
  }

  // --- Negation ---

  private analyzeNeg(
    nodeId: LapicFirNodeId,
    childId: LapicFirNodeId
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    const child = this.analyze(childId)

    if (child.exactUpper !== undefined) ann.exactLower = -child.exactUpper
    if (child.exactLower !== undefined) ann.exactUpper = -child.exactLower

    // Monotonicity: flipped
    for (const [varId, mono] of child.monotonicityByVariable) {
      ann.monotonicityByVariable.set(varId, flipMonotonicity(mono))
    }

    // Curvature: flipped
    ann.curvature = flipCurvature(child.curvature)

    copyDependencies(ann, child)

    return ann
  }

  // --- Affine form ---

  private analyzeAffineForm(
    nodeId: LapicFirNodeId,
    node: {
      readonly terms: readonly {
        readonly coeff: number
        readonly childId: LapicFirNodeId
      }[]
      readonly bias: number
    }
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    const children = node.terms.map((t) => ({
      ann: this.analyze(t.childId),
      coeff: t.coeff,
    }))

    // Bounds: Σ coeff_i * [lo_i, hi_i] + bias
    let lo = node.bias
    let hi = node.bias
    let boundsValid = true
    for (const { ann: c, coeff } of children) {
      if (c.exactLower === undefined || c.exactUpper === undefined) {
        boundsValid = false
        break
      }
      const prod1 = coeff * c.exactLower
      const prod2 = coeff * c.exactUpper
      lo += Math.min(prod1, prod2)
      hi += Math.max(prod1, prod2)
    }
    if (boundsValid) {
      ann.exactLower = lo
      ann.exactUpper = hi
    }

    // Monotonicity: depends on coefficient sign
    for (const { ann: child, coeff } of children) {
      for (const [varId, childMono] of child.monotonicityByVariable) {
        const effective =
          coeff > 0
            ? childMono
            : coeff < 0
              ? flipMonotonicity(childMono)
              : ('constant' as LapicAirMonotonicity)
        combineMonotonicity(ann.monotonicityByVariable, varId, effective)
      }
    }

    ann.curvature = 'affine'

    const childAnns = children.map((c) => c.ann)
    mergeRequiredVariables(ann, childAnns)
    mergeBranchControlSets(ann, childAnns)

    return ann
  }

  // --- Threshold select ---

  private analyzeThresholdSelect(
    nodeId: LapicFirNodeId,
    node: {
      readonly guardId: LapicFirNodeId
      readonly threshold: number
      readonly thenId: LapicFirNodeId
      readonly elseId: LapicFirNodeId
    }
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    const guard = this.analyze(node.guardId)
    const thenChild = this.analyze(node.thenId)
    const elseChild = this.analyze(node.elseId)

    // Determine if a branch is forced
    let forcedFace: LapicAirFaceSelection = 'both'
    if (guard.exactLower !== undefined && guard.exactLower >= node.threshold) {
      forcedFace = 'then'
    } else if (
      guard.exactUpper !== undefined &&
      guard.exactUpper < node.threshold
    ) {
      forcedFace = 'else'
    }

    // Bounds
    if (forcedFace === 'then') {
      if (thenChild.exactLower !== undefined)
        ann.exactLower = thenChild.exactLower
      if (thenChild.exactUpper !== undefined)
        ann.exactUpper = thenChild.exactUpper
    } else if (forcedFace === 'else') {
      if (elseChild.exactLower !== undefined)
        ann.exactLower = elseChild.exactLower
      if (elseChild.exactUpper !== undefined)
        ann.exactUpper = elseChild.exactUpper
    } else {
      // Both branches possible
      if (
        thenChild.exactLower !== undefined &&
        elseChild.exactLower !== undefined
      ) {
        ann.exactLower = Math.min(thenChild.exactLower, elseChild.exactLower)
      }
      if (
        thenChild.exactUpper !== undefined &&
        elseChild.exactUpper !== undefined
      ) {
        ann.exactUpper = Math.max(thenChild.exactUpper, elseChild.exactUpper)
      }
    }

    // Monotonicity: conservative (unknown unless branch is forced)
    if (forcedFace === 'then') {
      for (const [v, m] of thenChild.monotonicityByVariable) {
        ann.monotonicityByVariable.set(v, m)
      }
    } else if (forcedFace === 'else') {
      for (const [v, m] of elseChild.monotonicityByVariable) {
        ann.monotonicityByVariable.set(v, m)
      }
    } else {
      // Both branches active → conservative 'unknown' for all variables
      const allVars = new Set<LapicFirVariableId>()
      for (const v of thenChild.requiredVariables) allVars.add(v)
      for (const v of elseChild.requiredVariables) allVars.add(v)
      for (const v of guard.requiredVariables) allVars.add(v)
      for (const v of allVars) {
        ann.monotonicityByVariable.set(v, 'unknown')
      }
    }

    ann.curvature = 'unknown'

    // Branch control set: this node is a branch controller
    ann.branchControlSet.add(nodeId)
    mergeBranchControlSets(ann, [guard, thenChild, elseChild])

    // Required variables: guard + active branches
    for (const v of guard.requiredVariables) ann.requiredVariables.add(v)
    if (forcedFace !== 'else') {
      for (const v of thenChild.requiredVariables) ann.requiredVariables.add(v)
    }
    if (forcedFace !== 'then') {
      for (const v of elseChild.requiredVariables) ann.requiredVariables.add(v)
    }

    mergeNonlinearInteractions(ann, [guard, thenChild, elseChild])

    // Region decomposition
    this.emitThresholdRegions(nodeId, node.guardId, node.threshold, forcedFace)

    return ann
  }

  private emitThresholdRegions(
    nodeId: LapicFirNodeId,
    guardId: LapicFirNodeId,
    threshold: number,
    forced: LapicAirFaceSelection
  ): void {
    const parentId = `region:threshold:${nodeId}`
    const thenRegionId = `${parentId}:then`
    const elseRegionId = `${parentId}:else`

    const thenRegion: LapicAirRegion = {
      regionId: thenRegionId,
      guardPredicates: [guardId],
      activeFaces: new Map([[nodeId, 'then']]),
      feasibilityStatus:
        forced === 'else'
          ? 'infeasible'
          : forced === 'then'
            ? 'feasible'
            : 'unknown',
      parentRegionId: parentId,
      childRegionIds: [],
      thresholdValue: threshold,
    }

    const elseRegion: LapicAirRegion = {
      regionId: elseRegionId,
      guardPredicates: [guardId],
      activeFaces: new Map([[nodeId, 'else']]),
      feasibilityStatus:
        forced === 'then'
          ? 'infeasible'
          : forced === 'else'
            ? 'feasible'
            : 'unknown',
      parentRegionId: parentId,
      childRegionIds: [],
      thresholdValue: threshold,
    }

    const parentRegion: LapicAirRegion = {
      regionId: parentId,
      guardPredicates: [guardId],
      activeFaces: new Map([[nodeId, forced]]),
      feasibilityStatus: 'feasible',
      childRegionIds: [thenRegionId, elseRegionId],
      thresholdValue: threshold,
    }

    this.regions.push(parentRegion, thenRegion, elseRegion)
  }

  // --- Game kernels ---

  private analyzeResistanceTransform(
    nodeId: LapicFirNodeId,
    resId: LapicFirNodeId
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    const child = this.analyze(resId)

    // Resistance transform is piecewise: 3 regions
    // Always decreasing in resistance (higher res → lower damage multiplier)
    for (const [varId, childMono] of child.monotonicityByVariable) {
      ann.monotonicityByVariable.set(varId, flipMonotonicity(childMono))
    }

    // Bounds: if child has bounds, we can compute
    if (child.exactLower !== undefined && child.exactUpper !== undefined) {
      ann.exactLower = resistanceValue(child.exactUpper)
      ann.exactUpper = resistanceValue(child.exactLower)
    }

    ann.curvature = 'unknown' // piecewise → cannot classify globally
    ann.branchControlSet.add(nodeId) // implicitly branches
    copyDependencies(ann, child)

    return ann
  }

  private analyzePiecewiseAffineKernel(
    nodeId: LapicFirNodeId,
    childId: LapicFirNodeId
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    const child = this.analyze(childId)

    // Conservative: piecewise functions are generally non-smooth
    ann.curvature = 'unknown'
    ann.branchControlSet.add(nodeId)

    // Monotonicity: depends on segment slopes, conservative
    for (const v of child.requiredVariables) {
      ann.monotonicityByVariable.set(v, 'unknown')
    }

    copyDependencies(ann, child)

    return ann
  }

  private analyzeBilinearKernel(
    nodeId: LapicFirNodeId,
    leftId: LapicFirNodeId,
    rightId: LapicFirNodeId
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    const left = this.analyze(leftId)
    const right = this.analyze(rightId)

    // Bilinear = left * right → same as binary mul
    this.computeMulBounds(ann, [left, right])
    this.computeMulMonotonicity(ann, [left, right])
    ann.curvature = 'unknown'

    mergeRequiredVariables(ann, [left, right])
    mergeBranchControlSets(ann, [left, right])
    this.addCrossChildInteractions(ann, [left, right])

    return ann
  }

  private analyzeMultilinearKernel(
    nodeId: LapicFirNodeId,
    childIds: readonly LapicFirNodeId[]
  ): MutableAnnotation {
    // Same as general mul
    return this.analyzeMul(nodeId, childIds)
  }

  private analyzeSaturatingKernel(
    nodeId: LapicFirNodeId,
    node: { readonly childId: LapicFirNodeId; readonly cap: number }
  ): MutableAnnotation {
    const ann = createMutableAnnotation(nodeId)
    const child = this.analyze(node.childId)

    // Saturating kernel is min(child, cap)
    if (child.exactLower !== undefined) {
      ann.exactLower = Math.min(child.exactLower, node.cap)
    }
    if (child.exactUpper !== undefined) {
      ann.exactUpper = Math.min(child.exactUpper, node.cap)
    }

    // Monotone increasing (capped)
    for (const [varId, mono] of child.monotonicityByVariable) {
      ann.monotonicityByVariable.set(varId, mono)
    }
    ann.curvature = 'concave'

    copyDependencies(ann, child)

    return ann
  }
}

// ---------------------------------------------------------------------------
// Monotonicity helpers
// ---------------------------------------------------------------------------

function flipMonotonicity(mono: LapicAirMonotonicity): LapicAirMonotonicity {
  switch (mono) {
    case 'increasing':
      return 'decreasing'
    case 'decreasing':
      return 'increasing'
    case 'constant':
      return 'constant'
    case 'unknown':
      return 'unknown'
  }
}

function combineMonotonicity(
  map: Map<LapicFirVariableId, LapicAirMonotonicity>,
  varId: LapicFirVariableId,
  incoming: LapicAirMonotonicity
): void {
  const existing = map.get(varId)
  if (!existing || existing === 'constant') {
    map.set(varId, incoming)
  } else if (incoming === 'constant') {
    // keep existing
  } else if (existing !== incoming) {
    map.set(varId, 'unknown')
  }
}

function mergeMonotonicitiesAdditive(
  ann: MutableAnnotation,
  children: MutableAnnotation[]
): void {
  for (const child of children) {
    for (const [varId, mono] of child.monotonicityByVariable) {
      combineMonotonicity(ann.monotonicityByVariable, varId, mono)
    }
  }
}

function mergeMonotonicitiesPreserving(
  ann: MutableAnnotation,
  children: MutableAnnotation[]
): void {
  // min/max preserve monotonicity direction
  mergeMonotonicitiesAdditive(ann, children)
}

// ---------------------------------------------------------------------------
// Curvature helpers
// ---------------------------------------------------------------------------

function flipCurvature(c: LapicAirCurvature): LapicAirCurvature {
  switch (c) {
    case 'convex':
      return 'concave'
    case 'concave':
      return 'convex'
    case 'affine':
      return 'affine'
    case 'unknown':
      return 'unknown'
  }
}

function mergeCurvaturesAdditive(
  children: MutableAnnotation[]
): LapicAirCurvature {
  if (children.length === 0) return 'affine'
  let result: LapicAirCurvature = children[0]!.curvature
  for (let i = 1; i < children.length; i++) {
    result = combineCurvatures(result, children[i]!.curvature)
  }
  return result
}

function combineCurvatures(
  a: LapicAirCurvature,
  b: LapicAirCurvature
): LapicAirCurvature {
  if (a === 'affine') return b
  if (b === 'affine') return a
  if (a === b) return a
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Dependency merge helpers
// ---------------------------------------------------------------------------

function mergeRequiredVariables(
  ann: MutableAnnotation,
  children: MutableAnnotation[]
): void {
  for (const child of children) {
    for (const v of child.requiredVariables) {
      ann.requiredVariables.add(v)
    }
  }
}

function mergeBranchControlSets(
  ann: MutableAnnotation,
  children: MutableAnnotation[]
): void {
  for (const child of children) {
    for (const b of child.branchControlSet) {
      ann.branchControlSet.add(b)
    }
  }
}

function mergeNonlinearInteractions(
  ann: MutableAnnotation,
  children: MutableAnnotation[]
): void {
  for (const child of children) {
    for (const k of child.nonlinearInteractions) {
      ann.nonlinearInteractions.add(k)
    }
  }
}

function copyDependencies(
  ann: MutableAnnotation,
  child: MutableAnnotation
): void {
  for (const v of child.requiredVariables) ann.requiredVariables.add(v)
  for (const b of child.branchControlSet) ann.branchControlSet.add(b)
  for (const k of child.nonlinearInteractions) ann.nonlinearInteractions.add(k)
}

// ---------------------------------------------------------------------------
// Game-specific evaluation helpers
// ---------------------------------------------------------------------------

/** Genshin resistance transform formula. */
function resistanceValue(res: number): number {
  if (res < 0) return 1 - res / 2
  if (res < 0.75) return 1 - res
  return 1 / (4 * res + 1)
}
