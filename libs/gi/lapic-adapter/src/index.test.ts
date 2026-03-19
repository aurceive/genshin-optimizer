import type { MainStatKey } from '@genshin-optimizer/gi/consts'
import type { ICachedArtifact, OptConfig } from '@genshin-optimizer/gi/db'
import type { OptNode } from '@genshin-optimizer/gi/wr'
import type {
  LapicProblemNormalizationInput,
  LapicTeamProvenance,
} from '@genshin-optimizer/lapic/core'
import {
  buildGiLapicCanonicalExportFromRequest,
  createGiLapicAdapterMetadata,
  createGiLapicAuxiliaryOutputs,
  createGiLapicCandidateDomains,
  createGiLapicCanonicalProblem,
  createGiLapicProblemNormalizationInput,
  normalizeGiLapicAdapterRequest,
} from './index'

function createArtifact(
  overrides: Partial<ICachedArtifact> = {}
): ICachedArtifact {
  return {
    id: 'artifact-id',
    setKey: 'GladiatorsFinale',
    rarity: 5,
    level: 20,
    slotKey: 'flower',
    mainStatKey: 'hp',
    mainStatVal: 4780,
    substats: [],
    unactivatedSubstats: undefined,
    location: '',
    lock: false,
    ...overrides,
  } as ICachedArtifact
}

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
        artifacts: [createArtifact()],
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

const plotBaseNode: OptNode = {
  operation: 'const',
  operands: [],
  value: 1,
  type: 'number',
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

  it('creates GI adapter metadata from snapshot context', () => {
    const metadata = createGiLapicAdapterMetadata(createGiRequest())

    expect(metadata.sourceSnapshotDigests).toEqual([
      'artifact-snapshot-digest',
      'character-snapshot-digest',
      'weapon-snapshot-digest',
      'formula-snapshot-digest',
    ])
    expect(metadata.supportedPotentialSolveModes).toEqual(['current-only'])
  })

  it('creates candidate domains from filtered GI inventory', () => {
    const request = createGiRequest()
    request.giContext.inventorySnapshot.artifacts = [
      createArtifact({ id: 'flower-1', slotKey: 'flower' }),
      createArtifact({ id: 'plume-1', slotKey: 'plume', mainStatKey: 'atk' }),
      createArtifact({
        id: 'flower-excluded',
        slotKey: 'flower',
        location: 'CharA',
      }),
    ]
    request.giContext.inventorySnapshot.excludedLocations = ['CharA']

    const domains = createGiLapicCandidateDomains(request.giContext)

    expect(domains).toHaveLength(2)
    expect(domains.find((domain) => domain.slotId === 'flower')?.candidates).toHaveLength(1)
    expect(domains.find((domain) => domain.slotId === 'plume')?.candidates).toHaveLength(1)
  })

  it('maps plotBase into auxiliary outputs without changing ordering participation', () => {
    const request = createGiRequest()
    request.giContext.optimizationRequest.plotBase = plotBaseNode

    const outputs = createGiLapicAuxiliaryOutputs(request)

    expect(outputs).toHaveLength(1)
    expect(outputs[0]?.kind).toBe('gi-plot-base')
    expect(outputs[0]?.participatesInOrdering).toBe(false)
  })

  it('creates enriched normalization input from GI request context', () => {
    const request = createGiRequest()
    request.giContext.optimizationRequest.plotBase = plotBaseNode

    const result = createGiLapicProblemNormalizationInput(request)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.itemDomains).toHaveLength(1)
    expect(result.value.adapterMetadata.sourceSnapshotDigests).toContain(
      'artifact-snapshot-digest'
    )
    expect(result.value.auxiliaryOutputs).toHaveLength(1)
  })

  it('rejects mismatched topN between normalization input and GI request context', () => {
    const request = createGiRequest()
    request.giContext.optimizationRequest.topN = 3

    const result = normalizeGiLapicAdapterRequest(request)

    expect(result.ok).toBe(false)
  })
})
