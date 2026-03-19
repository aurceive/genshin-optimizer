import type { MainStatKey } from '@genshin-optimizer/gi/consts'
import type { ICachedArtifact, OptConfig } from '@genshin-optimizer/gi/db'
import type { OptNode } from '@genshin-optimizer/gi/wr'
import type {
  LapicProblemNormalizationInput,
  LapicTeamProvenance,
} from '@genshin-optimizer/lapic/core'
import {
  buildGiLapicCanonicalExportFromRequest,
  createGiLapicCanonicalProblem,
  normalizeGiLapicAdapterRequest,
} from './index'

function createNormalizationInput(): LapicProblemNormalizationInput {
  const provenance: LapicTeamProvenance = {
    teamLayoutDigest: 'team-layout-digest',
    sharedTeamContextDigest: 'shared-context-digest',
    crossSlotRuleDescriptorVersion: '0.1.0-draft',
    compatibilitySignatureSchemaVersion: '0.1.0-draft',
    slotProvenance: [],
  }

  return {
    teamLayout: {
      teamKind: 'gi-single',
      slotCount: 5,
      slotIds: ['flower', 'plume', 'sands', 'goblet', 'circlet'],
      slotRoleTaxonomy: ['artifact'],
      slotRequirements: {
        flower: 'required',
        plume: 'required',
        sands: 'required',
        goblet: 'required',
        circlet: 'required',
      },
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: [
      {
        slotId: 'flower',
        slotRole: 'artifact-flower',
        participationMode: 'optimizedBuild',
        occupantDomainId: 'artifact-domain',
        equipmentOwnershipModel: 'hard-reserved-inventory',
        contributesToObjective: true,
        contributesToConstraints: true,
        mayRemainEmpty: false,
      },
    ],
    sharedTeamContext: {
      adapterSemanticMode: 'gi-legacy-validated',
      aggregateFacts: {},
      metadata: {},
    },
    itemDomains: [
      {
        domainId: 'artifact-domain',
        slotId: 'flower',
        candidates: [],
      },
    ],
    compatibilityRules: [],
    objective: {
      objectiveId: 'objective',
      objectiveKind: 'single-slot',
      expressionDigest: 'objective-digest',
      targetSlotIds: ['flower'],
      frameIds: [],
    },
    constraints: [],
    topN: 5,
    orderingPolicy: {
      tieBreakDimensions: ['value'],
      canonicalCandidateOrdering: ['value'],
    },
    adapterMetadata: {
      adapterKind: 'gi-wr',
      adapterVersion: '0.1.0-draft',
      sourceSnapshotDigests: ['artifact-snapshot-digest'],
      declaredUnsupportedFeatures: [],
      metadata: {},
    },
    provenance,
  }
}

function createGiRequest() {
  const mainStatKeys: {
    sands: readonly MainStatKey[]
    goblet: readonly MainStatKey[]
    circlet: readonly MainStatKey[]
  } = {
    sands: ['atk_'],
    goblet: ['pyro_dmg_'],
    circlet: ['critRate_'],
  }

  return {
    adapterKind: 'gi' as const,
    normalizationInput: createNormalizationInput(),
    giContext: {
      sourceSnapshots: {
        artifactSnapshotDigest: 'artifact-snapshot-digest',
        characterSnapshotDigest: 'character-snapshot-digest',
        weaponSnapshotDigest: 'weapon-snapshot-digest',
        formulaSnapshotDigest: 'formula-snapshot-digest',
      },
      inventorySnapshot: {
        artifacts: [{} as ICachedArtifact],
        excludedArtifactIds: [],
        excludedLocations: [],
      },
      optConfig: {} as OptConfig,
      optimizationRequest: {
        optimizationTarget: {} as OptNode,
        constraints: [],
        exclusion: {},
        topN: 5,
        statFilters: {},
        mainStatKeys,
        allowPartial: false,
        useExcludedArts: false,
        useTeammateBuild: false,
        levelLow: 0,
        levelHigh: 20,
        upOptLevelLow: 0,
        upOptLevelHigh: 19,
        mainStatAssumptionLevel: 0,
      },
    },
    requestedPotentialSolveModes: ['current-only'] as const,
  }
}

describe('gi lapic adapter', () => {
  it('normalizes a valid GI request', () => {
    const result = normalizeGiLapicAdapterRequest(createGiRequest())

    expect(result.ok).toBe(true)
  })

  it('rejects unsupported potential solve modes', () => {
    const result = normalizeGiLapicAdapterRequest({
      ...createGiRequest(),
      requestedPotentialSolveModes: ['potential-aware-rerank'],
    })

    expect(result.ok).toBe(false)
  })

  it('creates a canonical problem from normalization input and identity', () => {
    const problem = createGiLapicCanonicalProblem(createNormalizationInput(), {
      problemId: 'problem-id',
      problemDigest: 'problem-digest',
      engineVersion: 'engine-version',
      arithmeticPolicyId: 'arithmetic-policy',
    })

    expect(problem.problemId).toBe('problem-id')
    expect(problem.problemDigest).toBe('problem-digest')
    expect(problem.adapterMetadata.adapterKind).toBe('gi-wr')
  })

  it('builds canonical export from request when canonical identity is provided', () => {
    const result = buildGiLapicCanonicalExportFromRequest({
      request: createGiRequest(),
      canonicalIdentity: {
        problemId: 'problem-id',
        problemDigest: 'problem-digest',
        engineVersion: 'engine-version',
        arithmeticPolicyId: 'arithmetic-policy',
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.problem.problemId).toBe('problem-id')
    expect(result.value.sourceSnapshotDigest).toBe('artifact-snapshot-digest')
  })

  it('rejects export-from-request when canonical identity is missing', () => {
    const result = buildGiLapicCanonicalExportFromRequest({
      request: createGiRequest(),
    })

    expect(result.ok).toBe(false)
  })
})
