import type { ICachedArtifact, OptConfig } from '@genshin-optimizer/gi/db'
import type { OptNode } from '@genshin-optimizer/gi/wr'
import { createLapicMemoryArtifactStore } from '@genshin-optimizer/lapic/storage'
import { createGiLapicOrchestrationConfigFromUi } from './config-factory'
import type { GiLapicConfigFactoryInput } from './config-factory'
import type { GiLapicBoundedCurrentOnlyCombinationEvaluator } from './types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function createAllSlotArtifacts(): ICachedArtifact[] {
  const slots: Array<{ slotKey: string; mainStatKey: string }> = [
    { slotKey: 'flower', mainStatKey: 'hp' },
    { slotKey: 'plume', mainStatKey: 'atk' },
    { slotKey: 'sands', mainStatKey: 'atk_' },
    { slotKey: 'goblet', mainStatKey: 'pyro_dmg_' },
    { slotKey: 'circlet', mainStatKey: 'critRate_' },
  ]
  return slots.map((s) =>
    createArtifact({
      id: `artifact-${s.slotKey}`,
      slotKey: s.slotKey as any,
      mainStatKey: s.mainStatKey as any,
    })
  )
}

const dummyEvaluator: GiLapicBoundedCurrentOnlyCombinationEvaluator = (
  _combination,
  _canonicalExport
) => ({
  ok: true,
  value: {
    objectiveValue: '42',
    evidenceDigest: 'eval-evidence',
    orderingKey: ['42'],
  },
  diagnostics: [],
})

function createMinimalInput(
  overrides: Partial<GiLapicConfigFactoryInput> = {}
): GiLapicConfigFactoryInput {
  return {
    problemId: 'test-character:test-team',
    artifacts: createAllSlotArtifacts(),
    optimizationTarget: {} as OptNode,
    optConfig: { statFilters: {} } as OptConfig,
    evaluateCombination: dummyEvaluator,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createGiLapicOrchestrationConfigFromUi', () => {
  it('produces a valid config from minimal input', () => {
    const config = createGiLapicOrchestrationConfigFromUi(createMinimalInput())

    expect(config).toBeDefined()
    expect(config.request).toBeDefined()
    expect(config.canonicalIdentity).toBeDefined()
    expect(config.artifactStore).toBeDefined()
    expect(config.evaluateCombination).toBe(dummyEvaluator)
  })

  it('sets request.adapterKind to gi', () => {
    const config = createGiLapicOrchestrationConfigFromUi(createMinimalInput())
    expect(config.request.adapterKind).toBe('gi')
  })

  it('populates giContext from input artifacts and optConfig', () => {
    const artifacts = createAllSlotArtifacts()
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({ artifacts })
    )
    const ctx = config.request.giContext
    expect(ctx).toBeDefined()
    expect(ctx!.inventorySnapshot.artifacts).toBe(artifacts)
    expect(ctx!.inventorySnapshot.excludedArtifactIds).toEqual([])
    expect(ctx!.inventorySnapshot.excludedLocations).toEqual([])
  })

  it('respects excluded artifact IDs', () => {
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({ excludedArtifactIds: ['a1', 'a2'] })
    )
    expect(
      config.request.giContext!.inventorySnapshot.excludedArtifactIds
    ).toEqual(['a1', 'a2'])
  })

  it('respects excluded locations', () => {
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({ excludedLocations: ['Amber', 'Lisa'] })
    )
    expect(
      config.request.giContext!.inventorySnapshot.excludedLocations
    ).toEqual(['Amber', 'Lisa'])
  })

  it('builds optimization request with correct defaults', () => {
    const config = createGiLapicOrchestrationConfigFromUi(createMinimalInput())
    const opt = config.request.giContext!.optimizationRequest

    expect(opt.topN).toBe(5)
    expect(opt.allowPartial).toBe(false)
    expect(opt.useExcludedArts).toBe(false)
    expect(opt.useTeammateBuild).toBe(false)
    expect(opt.levelLow).toBe(0)
    expect(opt.levelHigh).toBe(20)
    expect(opt.mainStatAssumptionLevel).toBe(0)
  })

  it('overrides optimization request parameters', () => {
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({
        topN: 10,
        allowPartial: true,
        useExcludedArts: true,
        levelLow: 16,
        levelHigh: 20,
        mainStatAssumptionLevel: 20,
      })
    )
    const opt = config.request.giContext!.optimizationRequest

    expect(opt.topN).toBe(10)
    expect(opt.allowPartial).toBe(true)
    expect(opt.useExcludedArts).toBe(true)
    expect(opt.levelLow).toBe(16)
    expect(opt.levelHigh).toBe(20)
    expect(opt.mainStatAssumptionLevel).toBe(20)
  })

  it('passes artSetExclusion to optimization request', () => {
    const exclusion = { GladiatorsFinale: [2, 4] }
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({ artSetExclusion: exclusion })
    )
    expect(config.request.giContext!.optimizationRequest.exclusion).toBe(
      exclusion
    )
  })

  it('passes mainStatKeys to optimization request', () => {
    const mainStatKeys = {
      sands: ['atk_' as const],
      goblet: ['pyro_dmg_' as const],
      circlet: ['critRate_' as const],
    }
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({ mainStatKeys })
    )
    expect(config.request.giContext!.optimizationRequest.mainStatKeys).toBe(
      mainStatKeys
    )
  })

  // ---- Canonical identity ----

  it('builds canonical identity from problemId', () => {
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({ problemId: 'diluc:team-1' })
    )
    expect(config.canonicalIdentity.problemId).toBe('diluc:team-1')
    expect(config.canonicalIdentity.arithmeticPolicyId).toBe('ieee754-double')
    expect(config.canonicalIdentity.engineVersion).toBeDefined()
  })

  it('generates deterministic problem digest for same inputs', () => {
    const input = createMinimalInput()
    const config1 = createGiLapicOrchestrationConfigFromUi(input)
    const config2 = createGiLapicOrchestrationConfigFromUi(input)

    expect(config1.canonicalIdentity.problemDigest).toBe(
      config2.canonicalIdentity.problemDigest
    )
  })

  it('generates different problem digest for different artifact sets', () => {
    const config1 = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({
        artifacts: [createArtifact({ id: 'a1' })],
      })
    )
    const config2 = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({
        artifacts: [createArtifact({ id: 'a2' })],
      })
    )

    expect(config1.canonicalIdentity.problemDigest).not.toBe(
      config2.canonicalIdentity.problemDigest
    )
  })

  // ---- Source snapshot digests ----

  it('auto-generates artifact snapshot digest', () => {
    const config = createGiLapicOrchestrationConfigFromUi(createMinimalInput())
    const digest =
      config.request.giContext!.sourceSnapshots.artifactSnapshotDigest
    expect(digest).toMatch(/^gi-artifact-snapshot:/)
  })

  it('uses provided character/weapon/formula snapshot digests', () => {
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({
        characterSnapshotDigest: 'custom-char-digest',
        weaponSnapshotDigest: 'custom-weapon-digest',
        formulaSnapshotDigest: 'custom-formula-digest',
      })
    )
    const snaps = config.request.giContext!.sourceSnapshots
    expect(snaps.characterSnapshotDigest).toBe('custom-char-digest')
    expect(snaps.weaponSnapshotDigest).toBe('custom-weapon-digest')
    expect(snaps.formulaSnapshotDigest).toBe('custom-formula-digest')
  })

  it('defaults snapshot digests when not provided', () => {
    const config = createGiLapicOrchestrationConfigFromUi(createMinimalInput())
    const snaps = config.request.giContext!.sourceSnapshots
    expect(snaps.characterSnapshotDigest).toBe('gi-character-snapshot:default')
    expect(snaps.weaponSnapshotDigest).toBe('gi-weapon-snapshot:default')
    expect(snaps.formulaSnapshotDigest).toBe('gi-formula-snapshot:default')
  })

  // ---- Artifact store ----

  it('creates in-memory store by default', () => {
    const config = createGiLapicOrchestrationConfigFromUi(createMinimalInput())
    expect(config.artifactStore).toBeDefined()
    expect(config.artifactStore.capabilities).toBeDefined()
  })

  it('uses provided artifact store', () => {
    const customStore = createLapicMemoryArtifactStore()
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({ artifactStore: customStore })
    )
    expect(config.artifactStore).toBe(customStore)
  })

  // ---- Optional callbacks ----

  it('passes through optional evaluator callbacks', () => {
    const compare = () => 0 as const
    const feasibility = () => true
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({
        compareEvaluations: compare as any,
        isCombinationFeasible: feasibility as any,
        maxCombinationCount: 100_000,
      })
    )
    expect(config.compareEvaluations).toBe(compare)
    expect(config.isCombinationFeasible).toBe(feasibility)
    expect(config.maxCombinationCount).toBe(100_000)
  })

  // ---- Session ID ----

  it('passes through session ID', () => {
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({ sessionId: 'my-session' })
    )
    expect(config.sessionId).toBe('my-session')
  })

  it('leaves session ID undefined when not provided', () => {
    const config = createGiLapicOrchestrationConfigFromUi(createMinimalInput())
    expect(config.sessionId).toBeUndefined()
  })

  // ---- Pre-built normalization input ----

  it('uses pre-built normalization input when provided', () => {
    const customNorm = { topN: 99 } as any
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({ normalizationInput: customNorm })
    )
    expect(config.request.normalizationInput).toBe(customNorm)
  })

  // ---- Empty artifact set ----

  it('handles empty artifact set', () => {
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({ artifacts: [] })
    )
    expect(config.request.giContext!.inventorySnapshot.artifacts).toEqual([])
    expect(
      config.request.giContext!.sourceSnapshots.artifactSnapshotDigest
    ).toBe('gi-artifact-snapshot:empty')
  })

  // ---- Constraints ----

  it('maps constraints into normalization input', () => {
    const constraints = [
      { value: {} as OptNode, min: 1000 },
      { value: {} as OptNode, min: 50 },
    ]
    const config = createGiLapicOrchestrationConfigFromUi(
      createMinimalInput({ constraints })
    )

    expect(
      config.request.giContext!.optimizationRequest.constraints
    ).toHaveLength(2)
    expect(config.request.normalizationInput.constraints).toHaveLength(2)
  })

  // ---- Requested potential solve modes ----

  it('sets requestedPotentialSolveModes to current-only', () => {
    const config = createGiLapicOrchestrationConfigFromUi(createMinimalInput())
    expect(config.request.requestedPotentialSolveModes).toEqual([
      'current-only',
    ])
  })
})
