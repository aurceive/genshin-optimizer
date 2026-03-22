/**
 * A-IR (Analyzed IR) type definitions.
 *
 * A-IR augments F-IR with structural analysis annotations
 * WITHOUT altering evaluation semantics. These annotations
 * enable state compression, search optimization, and
 * relaxation construction.
 *
 * Per spec §8.3: annotations must be monotone w.r.t. correctness.
 * If an analysis cannot prove a strong fact, it emits a weaker
 * fact or nothing. Unsound strengthening is forbidden.
 */

import type {
  LapicFirGraph,
  LapicFirNodeId,
  LapicFirVariableId,
} from '../fir/types'

// ---------------------------------------------------------------------------
// Monotonicity
// ---------------------------------------------------------------------------

/**
 * Monotonicity of a node w.r.t. a single input variable.
 *
 * - `increasing`: f(… x …) ≤ f(… x' …) when x ≤ x'
 * - `decreasing`: f(… x …) ≥ f(… x' …) when x ≤ x'
 * - `constant`:   output does not depend on this input
 * - `unknown`:    analysis could not determine monotonicity
 */
export type LapicAirMonotonicity =
  | 'increasing'
  | 'decreasing'
  | 'constant'
  | 'unknown'

// ---------------------------------------------------------------------------
// Curvature
// ---------------------------------------------------------------------------

/**
 * Curvature of a node w.r.t. its inputs.
 *
 * - `convex`:   second derivative ≥ 0 (bowl-shaped)
 * - `concave`:  second derivative ≤ 0 (dome-shaped)
 * - `affine`:   both convex and concave (linear)
 * - `unknown`:  analysis could not determine curvature
 */
export type LapicAirCurvature =
  | 'convex'
  | 'concave'
  | 'affine'
  | 'unknown'

// ---------------------------------------------------------------------------
// Node annotations
// ---------------------------------------------------------------------------

/**
 * Per-node annotation produced by the A-IR analysis engine.
 * All fields are optional — the engine only populates facts
 * it can soundly prove.
 */
export interface LapicAirNodeAnnotation {
  /** Reference to the annotated F-IR node. */
  readonly firNodeId: LapicFirNodeId

  // --- Family 1: Exact domain tightening ---

  /** Proven lower bound (tighter than F-IR's implicit domain). */
  readonly exactLower?: number
  /** Proven upper bound (tighter than F-IR's implicit domain). */
  readonly exactUpper?: number

  // --- Family 2: Monotonicity ---

  /**
   * Monotonicity of this node w.r.t. each input variable.
   * Keys are variable IDs; only variables this node depends on appear.
   */
  readonly monotonicityByVariable?: ReadonlyMap<LapicFirVariableId, LapicAirMonotonicity>

  // --- Family 3: Curvature ---

  /** Overall curvature classification of this node. */
  readonly curvature?: LapicAirCurvature

  // --- Family 5: Branch activation ---

  /**
   * Set of thresholdSelect node IDs whose branch outcomes
   * control the evaluation of this node.
   */
  readonly branchControlSet?: ReadonlySet<LapicFirNodeId>

  // --- Family 6: Sufficient statistics ---

  /**
   * Minimal set of variable IDs needed to evaluate this node.
   * For leaf `read` nodes this is {variableId}. For composite
   * nodes it's the union of children's required features.
   */
  readonly requiredVariables?: ReadonlySet<LapicFirVariableId>

  // --- Family 7: Variable interactions ---

  /**
   * Set of variable pairs that interact nonlinearly at this node.
   * Empty for additive nodes, populated for mul/bilinear/multilinear.
   */
  readonly nonlinearInteractions?: ReadonlySet<string>
}

// ---------------------------------------------------------------------------
// Region decomposition
// ---------------------------------------------------------------------------

/** Feasibility status of a region. */
export type LapicAirRegionFeasibility = 'feasible' | 'infeasible' | 'unknown'

/**
 * Face selection for a branching node within a region.
 * Determines which branch arm is active.
 */
export type LapicAirFaceSelection = 'then' | 'else' | 'both'

/**
 * A region in the A-IR region decomposition.
 *
 * Regions partition the variable space into subsets where
 * different branch arms are active. Each region carries its
 * own feasibility status and active operator faces.
 */
export interface LapicAirRegion {
  /** Unique region identifier. */
  readonly regionId: string
  /** Guard predicate node IDs (thresholdSelect guards). */
  readonly guardPredicates: readonly LapicFirNodeId[]
  /** Which face is active at each branching node. */
  readonly activeFaces: ReadonlyMap<LapicFirNodeId, LapicAirFaceSelection>
  /** Whether this region is known to be feasible. */
  readonly feasibilityStatus: LapicAirRegionFeasibility
  /** Parent region ID (if this is a refinement). */
  readonly parentRegionId?: string
  /** Child region IDs. */
  readonly childRegionIds: readonly string[]
}

// ---------------------------------------------------------------------------
// Annotated graph
// ---------------------------------------------------------------------------

/**
 * The complete A-IR graph: an F-IR graph augmented with
 * per-node annotations and region decomposition.
 */
export interface LapicAirGraph {
  /** The underlying F-IR graph (semantics-preserving). */
  readonly firGraph: LapicFirGraph
  /** Per-node annotations indexed by F-IR node ID. */
  readonly annotations: ReadonlyMap<LapicFirNodeId, LapicAirNodeAnnotation>
  /** Region decomposition (may be empty if no branches exist). */
  readonly regions: readonly LapicAirRegion[]
  /** Variable dependency summary for the root node. */
  readonly rootRequiredVariables: ReadonlySet<LapicFirVariableId>
}
