/**
 * Config factory for bridging UI-level optimization inputs to
 * `GiLapicSolveOrchestrationConfig`.
 *
 * The factory:
 * 1. Builds a `GiLapicAdapterRequest` from UI parameters
 * 2. Generates a `GiLapicCanonicalIdentity` with stable digests
 * 3. Assembles the full orchestration config
 *
 * Evaluator callbacks are supplied by the caller since they require
 * access to the GI calculation engine (OptNode evaluation, stat computation).
 */

import type {
  ArtSetExclusion,
  ICachedArtifact,
  OptConfig,
} from '@genshin-optimizer/gi/db'
import type { OptNode } from '@genshin-optimizer/gi/wr'
import type {
  LapicDigest,
  LapicProblemNormalizationInput,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicBoundedExactEvaluationComparator,
  LapicBoundedExactUpperBoundEvaluator,
} from '@genshin-optimizer/lapic/runtime'
import type { LapicArtifactStore } from '@genshin-optimizer/lapic/storage'
import { createLapicMemoryArtifactStore } from '@genshin-optimizer/lapic/storage'
import type { GiLapicCandidateVariableExtractor } from './bound-maps'
import { createGiArtifactFeatureDigest, createGiOptNodeDigest } from './digest'
import type { GiLapicSolveOrchestrationConfig } from './orchestrate'
import type {
  GiLapicAdapterRequest,
  GiLapicBoundedCurrentOnlyCombinationEvaluator,
  GiLapicBoundedCurrentOnlyFeasibilityEvaluator,
  GiLapicCanonicalIdentity,
  GiLapicConstraintInput,
  GiLapicInventorySnapshot,
  GiLapicMainStatKeySelection,
  GiLapicOptimizationRequest,
  GiLapicSourceSnapshotDescriptor,
} from './types'
import { giLapicAdapterSchemaVersion } from './types'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * High-level UI inputs for building an orchestration config.
 *
 * This is the surface the React integration layer uses. It maps
 * directly to the data available in `TabOptimize`.
 */
export interface GiLapicConfigFactoryInput {
  // ---- Problem identity ----
  /** Stable identifier for this optimization problem (e.g., "characterKey:teamId"). */
  readonly problemId: string

  // ---- Inventory ----
  /** All artifacts available for optimization. */
  readonly artifacts: readonly ICachedArtifact[]
  /** Artifact IDs to exclude. */
  readonly excludedArtifactIds?: readonly string[]
  /** Character locations to exclude artifacts from. */
  readonly excludedLocations?: readonly string[]

  // ---- Optimization target ----
  /** The node to maximize. */
  readonly optimizationTarget: OptNode
  /** Stat constraints (minimum thresholds). */
  readonly constraints?: readonly GiLapicConstraintInput[]
  /** Artifact set exclusions. */
  readonly artSetExclusion?: ArtSetExclusion
  /** Number of top builds to return. */
  readonly topN?: number
  /** Optional secondary stat for plotting. */
  readonly plotBase?: OptNode

  // ---- Filter settings ----
  /** OptConfig from the database. */
  readonly optConfig: OptConfig
  /** Main stat key selections per slot. */
  readonly mainStatKeys?: GiLapicMainStatKeySelection
  /** Whether to allow partial builds (empty slots). */
  readonly allowPartial?: boolean
  /** Whether to include excluded artifacts. */
  readonly useExcludedArts?: boolean
  /** Whether to include teammate builds. */
  readonly useTeammateBuild?: boolean
  /** Artifact level range. */
  readonly levelLow?: number
  readonly levelHigh?: number
  /** Up-optimization level range. */
  readonly upOptLevelLow?: number
  readonly upOptLevelHigh?: number
  /** Main stat assumption level. */
  readonly mainStatAssumptionLevel?: number

  // ---- Normalization input (pre-built) ----
  /** Pre-built normalization input from `createGiLapicProblemNormalizationInput()`. */
  readonly normalizationInput: LapicProblemNormalizationInput

  // ---- Evaluators (required) ----
  /** Evaluator that scores a candidate combination. */
  readonly evaluateCombination: GiLapicBoundedCurrentOnlyCombinationEvaluator

  // ---- Evaluators (optional) ----
  /** Comparator for ranking evaluations. */
  readonly compareEvaluations?: LapicBoundedExactEvaluationComparator
  /** Feasibility filter for combinations. */
  readonly isCombinationFeasible?: GiLapicBoundedCurrentOnlyFeasibilityEvaluator
  /** Maximum combinations to evaluate. */
  readonly maxCombinationCount?: number
  /** Upper bound evaluator for branch-and-bound pruning. */
  readonly computeUpperBound?: LapicBoundedExactUpperBoundEvaluator
  /** Variable extractor for FIR-based bound computation. */
  readonly candidateVariableExtractor?: GiLapicCandidateVariableExtractor
  /**
   * Global constants for FIR interval evaluation (e.g., `arts.base`
   * after `pruneAll` + `reaffine`). Keys use `dyn:{statKey}` format.
   */
  readonly globalConstants?: ReadonlyMap<string, number>

  // ---- Infrastructure (optional) ----
  /** Artifact store. Defaults to in-memory store. */
  readonly artifactStore?: LapicArtifactStore
  /** Explicit session ID. */
  readonly sessionId?: string

  // ---- Snapshot digests (optional, auto-generated if absent) ----
  /** Character snapshot digest for change tracking. */
  readonly characterSnapshotDigest?: LapicDigest
  /** Weapon snapshot digest for change tracking. */
  readonly weaponSnapshotDigest?: LapicDigest
  /** Formula snapshot digest for change tracking. */
  readonly formulaSnapshotDigest?: LapicDigest
}

// ---------------------------------------------------------------------------
// Digest helpers
// ---------------------------------------------------------------------------

function computeArtifactSnapshotDigest(
  artifacts: readonly ICachedArtifact[]
): LapicDigest {
  if (artifacts.length === 0) return 'gi-artifact-snapshot:empty'
  const featureDigests = artifacts.map(createGiArtifactFeatureDigest).sort()
  return `gi-artifact-snapshot:${featureDigests.length}:${featureDigests.join(',')}`
}

function computeOptTargetDigest(target: OptNode): LapicDigest {
  return `gi-opt-target:${createGiOptNodeDigest(target)}`
}

function computeProblemDigest(
  problemId: string,
  artifactDigest: LapicDigest,
  targetDigest: LapicDigest,
  constraintCount: number,
  topN: number
): LapicDigest {
  return `gi-problem:${problemId}:${artifactDigest}:${targetDigest}:c${constraintCount}:n${topN}`
}

// ---------------------------------------------------------------------------
// Numeric evaluation comparator
// ---------------------------------------------------------------------------

/**
 * Compares two evaluations numerically by `objectiveValue`.
 *
 * The default lapic comparator uses lexicographic `localeCompare` on string
 * ordering keys.  For GI's float-valued objectives this is incorrect:
 * `"173007".localeCompare("73686")` yields negative ("1" < "7") even though
 * 173 007 > 73 686 numerically.  This causes B&B to prune branches whose
 * upper bounds are actually above the incumbent, silently discarding the
 * optimal build.
 *
 * This comparator parses `objectiveValue` as a float and compares
 * numerically, which is always correct for GI optimisation targets.
 */
export const giNumericEvaluationComparator: LapicBoundedExactEvaluationComparator =
  (left, right) => {
    const lv = parseFloat(left.objectiveValue)
    const rv = parseFloat(right.objectiveValue)
    // NaN sorts to the bottom (worse than any valid value)
    if (Number.isNaN(lv)) return Number.isNaN(rv) ? 0 : -1
    if (Number.isNaN(rv)) return 1
    if (lv < rv) return -1
    if (lv > rv) return 1
    return 0
  }

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a `GiLapicSolveOrchestrationConfig` from high-level UI inputs.
 *
 * This is the recommended entry point for React integration:
 *
 * ```ts
 * const config = createGiLapicOrchestrationConfigFromUi({
 *   problemId: `${characterKey}:${teamId}`,
 *   artifacts: filteredArtifacts,
 *   optimizationTarget: targetNode,
 *   constraints: constraintInputs,
 *   optConfig,
 *   evaluateCombination: myEvaluator,
 * })
 *
 * const orch = createGiLapicSolveOrchestration(config)
 * ```
 */
export function createGiLapicOrchestrationConfigFromUi(
  input: GiLapicConfigFactoryInput
): GiLapicSolveOrchestrationConfig {
  const constraints = input.constraints ?? []
  const topN = input.topN ?? 5
  const artSetExclusion = input.artSetExclusion ?? {}

  // ---- Build snapshot digests ----
  const artifactSnapshotDigest = computeArtifactSnapshotDigest(input.artifacts)
  const targetDigest = computeOptTargetDigest(input.optimizationTarget)

  const sourceSnapshots: GiLapicSourceSnapshotDescriptor = {
    artifactSnapshotDigest,
    characterSnapshotDigest:
      input.characterSnapshotDigest ?? 'gi-character-snapshot:default',
    weaponSnapshotDigest:
      input.weaponSnapshotDigest ?? 'gi-weapon-snapshot:default',
    formulaSnapshotDigest:
      input.formulaSnapshotDigest ?? 'gi-formula-snapshot:default',
  }

  // ---- Build inventory snapshot ----
  const inventorySnapshot: GiLapicInventorySnapshot = {
    artifacts: input.artifacts,
    excludedArtifactIds: input.excludedArtifactIds ?? [],
    excludedLocations: input.excludedLocations ?? [],
  }

  // ---- Build optimization request ----
  const optimizationRequest: GiLapicOptimizationRequest = {
    optimizationTarget: input.optimizationTarget,
    constraints,
    exclusion: artSetExclusion,
    topN,
    ...(input.plotBase !== undefined ? { plotBase: input.plotBase } : {}),
    statFilters: input.optConfig.statFilters,
    mainStatKeys: input.mainStatKeys ?? {
      sands: [],
      goblet: [],
      circlet: [],
    },
    allowPartial: input.allowPartial ?? false,
    useExcludedArts: input.useExcludedArts ?? false,
    useTeammateBuild: input.useTeammateBuild ?? false,
    levelLow: input.levelLow ?? 0,
    levelHigh: input.levelHigh ?? 20,
    upOptLevelLow: input.upOptLevelLow ?? 0,
    upOptLevelHigh: input.upOptLevelHigh ?? 20,
    mainStatAssumptionLevel: input.mainStatAssumptionLevel ?? 0,
  }

  // ---- Build normalization input ----
  const normalizationInput = input.normalizationInput

  // ---- Build adapter request ----
  const request: GiLapicAdapterRequest = {
    adapterKind: 'gi',
    normalizationInput,
    giContext: {
      sourceSnapshots,
      inventorySnapshot,
      optConfig: input.optConfig,
      optimizationRequest,
    },
    requestedPotentialSolveModes: ['current-only'],
  }

  // ---- Build canonical identity ----
  const canonicalIdentity: GiLapicCanonicalIdentity = {
    problemId: input.problemId,
    problemDigest: computeProblemDigest(
      input.problemId,
      artifactSnapshotDigest,
      targetDigest,
      constraints.length,
      topN
    ),
    engineVersion: giLapicAdapterSchemaVersion,
    arithmeticPolicyId: 'ieee754-double',
  }

  // ---- Assemble config ----
  return {
    request,
    canonicalIdentity,
    artifactStore: input.artifactStore ?? createLapicMemoryArtifactStore(),
    evaluateCombination: input.evaluateCombination,
    compareEvaluations:
      input.compareEvaluations ?? giNumericEvaluationComparator,
    ...(input.isCombinationFeasible !== undefined && {
      isCombinationFeasible: input.isCombinationFeasible,
    }),
    ...(input.maxCombinationCount !== undefined && {
      maxCombinationCount: input.maxCombinationCount,
    }),
    ...(input.computeUpperBound !== undefined && {
      computeUpperBound: input.computeUpperBound,
    }),
    ...(input.candidateVariableExtractor !== undefined && {
      candidateVariableExtractor: input.candidateVariableExtractor,
    }),
    ...(input.globalConstants !== undefined && {
      globalConstants: input.globalConstants,
    }),
    ...(input.sessionId !== undefined && { sessionId: input.sessionId }),
  } satisfies GiLapicSolveOrchestrationConfig
}
