/**
 * Bridge between GI optimization UI data and the lapic orchestration config.
 *
 * Constructs a `GiLapicSolveOrchestrationConfig` from the same data
 * that TabOptimize already collects for the legacy GOSolver.
 *
 * The evaluator is currently a stub — it returns a fixed score for every
 * combination. The normalization input is a structural template that the
 * adapter enriches with actual candidate domains from the inventory.
 */

import type { ICachedArtifact, OptConfig } from '@genshin-optimizer/gi/db'
import type { GiLapicSolveOrchestrationConfig } from '@genshin-optimizer/gi/lapic-adapter'
import { createGiLapicOrchestrationConfigFromUi } from '@genshin-optimizer/gi/lapic-adapter'
import type { OptNode } from '@genshin-optimizer/gi/wr'

// ---------------------------------------------------------------------------
// Stub evaluator
// ---------------------------------------------------------------------------

/**
 * Placeholder evaluator that returns a fixed score.
 *
 * TODO: Replace with a proper GI stat evaluator that bridges
 * `LapicBoundedExactCandidateCombination` → GI NumNode evaluation.
 */
const stubEvaluator = (
  _combination: never,
  _canonicalExport: never
): {
  ok: true
  value: {
    objectiveValue: string
    evidenceDigest: string
    orderingKey: readonly string[]
  }
  diagnostics: readonly never[]
} => ({
  ok: true,
  value: {
    objectiveValue: '0',
    evidenceDigest: 'gi-stub-evaluator',
    orderingKey: ['0'],
  },
  diagnostics: [],
})

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
// Config builder
// ---------------------------------------------------------------------------

export interface LapicBridgeInput {
  readonly characterKey: string
  readonly teamId: string
  readonly artifacts: readonly ICachedArtifact[]
  readonly buildSetting: OptConfig
  readonly optimizationTarget: OptNode
  readonly maxBuildsToShow: number
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createGiLapicOrchestrationConfigFromUi({
      problemId: `${input.characterKey}:${input.teamId}`,
      artifacts: [...input.artifacts],
      optimizationTarget: input.optimizationTarget,
      optConfig: input.buildSetting,
      topN: input.maxBuildsToShow,
      // The adapter enriches this template with actual candidate domains
      normalizationInput: normalizationInput as never,
      // Stub evaluator — to be replaced with GI stat bridge
      evaluateCombination: stubEvaluator as never,
    })
  } catch {
    return null
  }
}
