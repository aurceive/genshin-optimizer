/**
 * Unit tests for frontier block construction and frontier-index creation.
 *
 * These validate that:
 * 1. Frontier blocks contain correct state signatures per candidate
 * 2. Frontier groups are built with correct exact-signature partitioning
 * 3. The frontier index aggregates blocks into a coherent structure
 * 4. Edge cases (single candidate, multiple domains) are handled
 */

import type {
  LapicCandidateDescriptor,
  LapicCanonicalProblem,
} from '@genshin-optimizer/lapic/core'
import {
  createFrontierBlockForDomain,
  createFrontierIndexForSolve,
} from './frontier'

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

function candidate(
  candidateId: string,
  domainId: string,
  slotId: string,
  exclusiveResourceClaims: LapicCandidateDescriptor['provenance']['exclusiveResourceClaims'] = []
): LapicCandidateDescriptor {
  return {
    candidateId,
    sourceRecordDigest: candidateId,
    domainId,
    slotId,
    additiveFeatureDigest: `feature:${candidateId}`,
    discreteCounters: [],
    categoricalSignatureDigest: `category:${candidateId}`,
    provenance: {
      slotId,
      sourceEntityId: 'inventory',
      sourceRecordDigests: [candidateId],
      exclusiveResourceClaims,
      concreteInventoryBacked: true,
      featureExtractionDigest: `feature:${candidateId}`,
    },
  }
}

function createProblem(config: {
  slotIds: string[]
  domains: Array<{ domainId: string; slotId: string; candidates: LapicCandidateDescriptor[] }>
}): LapicCanonicalProblem {
  return {
    problemId: 'frontier-test',
    problemDigest: 'frontier-digest',
    engineVersion: 'engine-version',
    arithmeticPolicyId: 'arith-policy',
    teamLayout: {
      teamKind: 'gi-single',
      slotCount: config.slotIds.length,
      slotIds: config.slotIds,
      slotRoleTaxonomy: config.slotIds.map(() => 'artifact'),
      slotRequirements: Object.fromEntries(
        config.slotIds.map((s) => [s, 'required' as const])
      ),
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: config.slotIds.map((slotId) => ({
      slotId,
      slotRole: `artifact-${slotId}`,
      participationMode: 'optimizedBuild' as const,
      occupantDomainId: config.domains.find((d) => d.slotId === slotId)!.domainId,
      equipmentOwnershipModel: 'hard-reserved-inventory' as const,
      contributesToObjective: true,
      contributesToConstraints: true,
      mayRemainEmpty: false,
    })),
    sharedTeamContext: {
      adapterSemanticMode: 'gi-legacy-validated',
      aggregateFacts: {},
      metadata: {},
    },
    frameAxis: [],
    itemDomains: config.domains,
    compatibilityRules: [],
    objective: {
      objectiveId: 'obj',
      objectiveKind: 'single-slot',
      expressionDigest: 'obj-digest',
      targetSlotIds: config.slotIds,
      frameIds: [],
    },
    constraints: [],
    topN: 1,
    orderingPolicy: {
      tieBreakDimensions: ['value'],
      canonicalCandidateOrdering: ['value'],
    },
    auxiliaryOutputs: [],
    adapterMetadata: {
      adapterKind: 'gi-wr',
      adapterVersion: '0.1.0-draft',
      sourceSnapshotDigests: ['snapshot-digest'],
      declaredUnsupportedFeatures: [],
      metadata: {},
    },
    provenance: {
      teamLayoutDigest: 'layout-digest',
      sharedTeamContextDigest: 'ctx-digest',
      crossSlotRuleDescriptorVersion: '0.1.0-draft',
      compatibilitySignatureSchemaVersion: '0.1.0-draft',
      slotProvenance: [],
    },
  }
}

// ---------------------------------------------------------------------------
// createFrontierBlockForDomain
// ---------------------------------------------------------------------------

describe('createFrontierBlockForDomain', () => {
  it('creates a frontier block with one row per candidate', () => {
    const domain = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [
        candidate('c1', 'd-flower', 'flower'),
        candidate('c2', 'd-flower', 'flower'),
        candidate('c3', 'd-flower', 'flower'),
      ],
    }
    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [domain, { domainId: 'd-plume', slotId: 'plume', candidates: [] }],
    })

    const block = createFrontierBlockForDomain(problem, domain)

    expect(block.rowCount).toBe(3)
    expect(block.rows).toHaveLength(3)
    expect(block.stateIds).toHaveLength(3)
    expect(block.blockId).toContain('frontier-digest')
    expect(block.blockId).toContain('flower')
  })

  it('assigns correct stateId format for each row', () => {
    const domain = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [candidate('c1', 'd-flower', 'flower')],
    }
    const problem = createProblem({
      slotIds: ['flower'],
      domains: [domain],
    })

    const block = createFrontierBlockForDomain(problem, domain)

    expect(block.rows[0]!.stateId).toBe('state:flower:c1')
    expect(block.rows[0]!.slotId).toBe('flower')
    expect(block.rows[0]!.candidateId).toBe('c1')
  })

  it('computes correct occupiedSlotMask for slot position', () => {
    const domain0 = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [candidate('c1', 'd-flower', 'flower')],
    }
    const domain1 = {
      domainId: 'd-plume',
      slotId: 'plume',
      candidates: [candidate('c2', 'd-plume', 'plume')],
    }
    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [domain0, domain1],
    })

    const block0 = createFrontierBlockForDomain(problem, domain0)
    const block1 = createFrontierBlockForDomain(problem, domain1)

    // flower is slot index 0 → mask 1, plume is slot index 1 → mask 2
    expect(block0.rows[0]!.exactSignatureGroupKey.occupiedSlotMask).toBe(1)
    expect(block1.rows[0]!.exactSignatureGroupKey.occupiedSlotMask).toBe(2)
  })

  it('throws when domain slotId is not in teamLayout', () => {
    const domain = {
      domainId: 'd-missing',
      slotId: 'missing-slot',
      candidates: [candidate('c1', 'd-missing', 'missing-slot')],
    }
    const problem = createProblem({
      slotIds: ['flower'],
      domains: [{ domainId: 'd-flower', slotId: 'flower', candidates: [] }],
    })

    expect(() => createFrontierBlockForDomain(problem, domain)).toThrow(
      /not present in teamLayout/
    )
  })

  it('sets layout with correct frame axis identity and slot ids', () => {
    const domain = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [candidate('c1', 'd-flower', 'flower')],
    }
    const problem = createProblem({
      slotIds: ['flower'],
      domains: [domain],
    })

    const block = createFrontierBlockForDomain(problem, domain)

    expect(block.layout.slotIds).toEqual(['flower'])
    expect(block.layout.frameAxisIdentity.axisKind).toBe('none')
    expect(block.layout.frameAxisIdentity.frameIds).toEqual([])
  })

  it('includes exclusive resource claims in compatibility signature', () => {
    const domain = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [
        candidate('c1', 'd-flower', 'flower', [
          { resourceKind: 'weapon', resourceId: 'w-1', claimedBySlotId: 'flower', reservationClass: 'hardReserved' },
        ]),
      ],
    }
    const problem = createProblem({
      slotIds: ['flower'],
      domains: [domain],
    })

    const block = createFrontierBlockForDomain(problem, domain)

    // The compatibility digest should contain the resource claim
    expect(block.rows[0]!.compatibilityDigest).toContain('weapon|w-1|flower')
  })

  it('produces deterministic row digests for the same candidate', () => {
    const domain = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [candidate('c1', 'd-flower', 'flower')],
    }
    const problem = createProblem({
      slotIds: ['flower'],
      domains: [domain],
    })

    const block1 = createFrontierBlockForDomain(problem, domain)
    const block2 = createFrontierBlockForDomain(problem, domain)

    expect(block1.rows[0]!.rowDigest).toBe(block2.rows[0]!.rowDigest)
    expect(block1.blockId).toBe(block2.blockId)
  })
})

// ---------------------------------------------------------------------------
// createFrontierIndexForSolve
// ---------------------------------------------------------------------------

describe('createFrontierIndexForSolve', () => {
  it('creates frontier index from multiple domain blocks', () => {
    const domainFlower = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [
        candidate('c1', 'd-flower', 'flower'),
        candidate('c2', 'd-flower', 'flower'),
      ],
    }
    const domainPlume = {
      domainId: 'd-plume',
      slotId: 'plume',
      candidates: [
        candidate('c3', 'd-plume', 'plume'),
      ],
    }
    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [domainFlower, domainPlume],
    })

    const blocks = [
      createFrontierBlockForDomain(problem, domainFlower),
      createFrontierBlockForDomain(problem, domainPlume),
    ]

    const index = createFrontierIndexForSolve(problem, blocks)

    expect(index.blockIds).toHaveLength(2)
    expect(index.exactSignatureGroups.length).toBeGreaterThan(0)
    expect(index.indexId).toContain('frontier-digest')
  })

  it('assigns each slot to its own exact signature group', () => {
    const domainFlower = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [candidate('c1', 'd-flower', 'flower')],
    }
    const domainPlume = {
      domainId: 'd-plume',
      slotId: 'plume',
      candidates: [candidate('c2', 'd-plume', 'plume')],
    }
    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [domainFlower, domainPlume],
    })

    const blocks = [
      createFrontierBlockForDomain(problem, domainFlower),
      createFrontierBlockForDomain(problem, domainPlume),
    ]

    const index = createFrontierIndexForSolve(problem, blocks)

    // Each slot should produce a distinct group
    const groupSlots = index.exactSignatureGroups.map((g) => g.slotIds)
    expect(groupSlots).toContainEqual(['flower'])
    expect(groupSlots).toContainEqual(['plume'])
  })

  it('groups candidates of the same slot under a single group', () => {
    const domain = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [
        candidate('c1', 'd-flower', 'flower'),
        candidate('c2', 'd-flower', 'flower'),
        candidate('c3', 'd-flower', 'flower'),
      ],
    }
    const problem = createProblem({
      slotIds: ['flower'],
      domains: [domain],
    })

    const blocks = [createFrontierBlockForDomain(problem, domain)]
    const index = createFrontierIndexForSolve(problem, blocks)

    // All 3 candidates should be in a single group
    expect(index.exactSignatureGroups).toHaveLength(1)
    expect(index.exactSignatureGroups[0]!.rowCount).toBe(3)
    expect(index.exactSignatureGroups[0]!.slotIds).toEqual(['flower'])
  })

  it('produces consistent compatibility digests across repeated calls', () => {
    const domain = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [candidate('c1', 'd-flower', 'flower')],
    }
    const problem = createProblem({
      slotIds: ['flower'],
      domains: [domain],
    })

    const blocks = [createFrontierBlockForDomain(problem, domain)]
    const index1 = createFrontierIndexForSolve(problem, blocks)
    const index2 = createFrontierIndexForSolve(problem, blocks)

    expect(index1.compatibilityDigest).toBe(index2.compatibilityDigest)
    expect(index1.indexId).toBe(index2.indexId)
  })
})
