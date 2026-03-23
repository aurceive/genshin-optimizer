/**
 * Bridge between GI optimization UI data and the lapic orchestration config.
 *
 * Constructs a `GiLapicSolveOrchestrationConfig` from the same data
 * that TabOptimize already collects for the legacy GOSolver, and provides
 * a real evaluator that uses precomputed OptNode evaluation.
 */

import type { ICachedArtifact, OptConfig } from '@genshin-optimizer/gi/db'
import type { GiLapicSolveOrchestrationConfig } from '@genshin-optimizer/gi/lapic-adapter'
import { createGiLapicOrchestrationConfigFromUi } from '@genshin-optimizer/gi/lapic-adapter'
import type { ArtifactBuildData, DynStat } from '@genshin-optimizer/gi/solver'
import type { OptNode } from '@genshin-optimizer/gi/wr'

// ---------------------------------------------------------------------------
// Evaluator factory
// ---------------------------------------------------------------------------

/**
 * Precomputed data needed by the evaluator, produced outside the bridge
 * (in TabOptimize) using the same `optimize()` + `precompute()` pipeline
 * as the legacy GOSolver.
 */
export interface LapicEvalPrepData {
  /** Compiled evaluation function: artifacts → [objective, ...constraints] */
  readonly evalFn: (
    slots: readonly { readonly values: Readonly<Record<string, number>> }[]
  ) => number[]
  /** Map from artifact ID → compacted stat values */
  readonly artifactLookup: ReadonlyMap<
    string,
    { readonly values: Readonly<Record<string, number>> }
  >
  /** Minimum thresholds for constraint nodes (same order as evalFn output after index 0) */
  readonly constraintMinimums: readonly number[]
  /** Base stats dictionary from compactArtifacts */
  readonly base: DynStat
}

const EMPTY_ART: { readonly values: Record<string, number> } = { values: {} }

/**
 * Creates a real GI evaluator for the lapic solver.
 *
 * The returned function looks up each candidate's artifact stats and
 * evaluates the precomputed optimization target formula.
 */
function createGiLapicEvaluator(prep: LapicEvalPrepData) {
  return (
    combination: {
      readonly candidates: readonly { readonly candidateId: string }[]
    },
    _canonicalExport: unknown
  ) => {
    // Build slot array from combination candidates
    const slots = combination.candidates.map((c) => {
      const art = prep.artifactLookup.get(c.candidateId)
      return art ?? EMPTY_ART
    })

    try {
      const results = prep.evalFn(slots)
      const objectiveValue = results[0]

      // Check constraints (indices 1..N correspond to constraint nodes)
      for (let i = 0; i < prep.constraintMinimums.length; i++) {
        if (results[i + 1] < prep.constraintMinimums[i]) {
          // Infeasible — return a very low score so the solver deprioritizes
          return {
            ok: true as const,
            value: {
              objectiveValue: '-Infinity',
              evidenceDigest: 'gi-evaluator:constraint-violated',
              orderingKey: ['-Infinity'],
            },
            diagnostics: [],
          }
        }
      }

      const scoreStr = objectiveValue.toString()
      return {
        ok: true as const,
        value: {
          objectiveValue: scoreStr,
          evidenceDigest: 'gi-evaluator:v1',
          orderingKey: [scoreStr],
        },
        diagnostics: [],
      }
    } catch {
      return {
        ok: true as const,
        value: {
          objectiveValue: '-Infinity',
          evidenceDigest: 'gi-evaluator:error',
          orderingKey: ['-Infinity'],
        },
        diagnostics: [],
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Normalization input template
// ---------------------------------------------------------------------------

const GI_SLOT_IDS = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const

/**
 * Minimal normalization input template for GI 5-slot artifact optimization.
 *
 * The adapter's `buildGiLapicCanonicalExportFromRequest` enriches this with
 * actual candidate domains from the inventory snapshot in `giContext`.
 */
function createNormalizationInputTemplate(topN: number) {
  return {
    teamLayout: {
      teamKind: 'gi-single',
      slotCount: 5,
      slotIds: [...GI_SLOT_IDS],
      slotRoleTaxonomy: ['artifact'],
      slotRequirements: Object.fromEntries(
        GI_SLOT_IDS.map((id) => [id, 'required'])
      ),
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: GI_SLOT_IDS.map((slotId) => ({
      slotId,
      slotRole: `artifact-${slotId}`,
      participationMode: 'optimizedBuild',
      occupantDomainId: `artifact-domain-${slotId}`,
      equipmentOwnershipModel: 'hard-reserved-inventory',
      contributesToObjective: true,
      contributesToConstraints: true,
      mayRemainEmpty: false,
    })),
    sharedTeamContext: {
      adapterSemanticMode: 'gi-legacy-validated',
      aggregateFacts: {},
      metadata: {},
    },
    itemDomains: GI_SLOT_IDS.map((slotId) => ({
      domainId: `artifact-domain-${slotId}`,
      slotId,
      candidates: [],
    })),
    compatibilityRules: [],
    objective: {
      objectiveId: 'gi-optimization-target',
      objectiveKind: 'single-slot',
      expressionDigest: 'gi-opt-target-digest',
      targetSlotIds: [...GI_SLOT_IDS],
      frameIds: [],
    },
    constraints: [],
    topN,
    orderingPolicy: {
      tieBreakDimensions: ['value'],
      canonicalCandidateOrdering: ['value'],
    },
    adapterMetadata: {
      adapterKind: 'gi-wr',
      adapterVersion: '0.1.0-draft',
      sourceSnapshotDigests: [],
      declaredUnsupportedFeatures: [],
      metadata: {},
    },
    provenance: {
      teamLayoutDigest: 'gi-5-slot-team',
      sharedTeamContextDigest: 'gi-shared-context',
      crossSlotRuleDescriptorVersion: '0.1.0-draft',
      compatibilitySignatureSchemaVersion: '0.1.0-draft',
      slotProvenance: [],
    },
  }
}

// ---------------------------------------------------------------------------
// Artifact lookup builder
// ---------------------------------------------------------------------------

/**
 * Builds the artifact lookup map from compacted artifacts.
 *
 * Maps artifact ID → `{values: Record<string, number>}` for fast
 * stat retrieval in the evaluator.
 */
export function buildArtifactLookup(
  compactedBySlot: Record<string, readonly ArtifactBuildData[]>
): Map<string, { readonly values: Readonly<Record<string, number>> }> {
  const lookup = new Map<
    string,
    { readonly values: Readonly<Record<string, number>> }
  >()
  for (const slotArts of Object.values(compactedBySlot)) {
    for (const art of slotArts) {
      if (art.id) lookup.set(art.id, art)
    }
  }
  return lookup
}

// ---------------------------------------------------------------------------
// Config builder
// ---------------------------------------------------------------------------

export interface LapicBridgeInput {
  readonly characterKey: string
  readonly teamId: string
  readonly artifacts: readonly ICachedArtifact[]
  readonly buildSetting: OptConfig
  readonly optimizationTarget: OptNode
  readonly maxBuildsToShow: number
  /** Precomputed evaluation data; if absent, uses stub evaluator */
  readonly prepData?: LapicEvalPrepData
}

/**
 * Builds a `GiLapicSolveOrchestrationConfig` from the same UI data that
 * the legacy `generateBuilds` callback collects.
 *
 * Returns `null` if the config cannot be built (e.g. missing data).
 */
export function buildLapicSolveConfig(
  input: LapicBridgeInput
): GiLapicSolveOrchestrationConfig | null {
  try {
    const normalizationInput = createNormalizationInputTemplate(
      input.maxBuildsToShow
    )

    const evaluator = input.prepData
      ? createGiLapicEvaluator(input.prepData)
      : // Fallback stub evaluator
        () => ({
          ok: true as const,
          value: {
            objectiveValue: '0',
            evidenceDigest: 'gi-stub-evaluator',
            orderingKey: ['0'],
          },
          diagnostics: [],
        })

    return createGiLapicOrchestrationConfigFromUi({
      problemId: `${input.characterKey}:${input.teamId}`,
      artifacts: [...input.artifacts],
      optimizationTarget: input.optimizationTarget,
      optConfig: input.buildSetting,
      topN: input.maxBuildsToShow,
      normalizationInput: normalizationInput as never,
      evaluateCombination: evaluator as never,
    })
  } catch {
    return null
  }
}
