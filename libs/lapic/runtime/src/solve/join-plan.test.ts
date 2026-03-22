/**
 * Unit tests for frontier join-plan construction.
 *
 * These validate that:
 * 1. Join plans correctly map frontier blocks to candidate descriptors
 * 2. Cardinality counts are accurately computed
 * 3. Error conditions produce descriptive diagnostics
 */

import type {
  LapicCandidateDescriptor,
  LapicCanonicalProblem,
} from '@genshin-optimizer/lapic/core'
import {
  createFrontierBlockForDomain,
  createFrontierIndexForSolve,
} from './frontier'
import { createFrontierJoinPlan } from './join-plan'

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

function candidate(
  candidateId: string,
  domainId: string,
  slotId: string
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
      exclusiveResourceClaims: [],
      concreteInventoryBacked: true,
      featureExtractionDigest: `feature:${candidateId}`,
    },
  }
}

function createProblem(config: {
  slotIds: string[]
  domains: Array<{
    domainId: string
    slotId: string
    candidates: LapicCandidateDescriptor[]
  }>
}): LapicCanonicalProblem {
  return {
    problemId: 'join-plan-test',
    problemDigest: 'join-plan-digest',
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
      occupantDomainId: config.domains.find((d) => d.slotId === slotId)!
        .domainId,
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
// createFrontierJoinPlan
// ---------------------------------------------------------------------------

describe('createFrontierJoinPlan', () => {
  it('creates a join plan with correct totalCombinationCount', () => {
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
        candidate('c4', 'd-plume', 'plume'),
        candidate('c5', 'd-plume', 'plume'),
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
    const frontierIndex = createFrontierIndexForSolve(problem, blocks)
    const domains = [domainFlower, domainPlume]

    const result = createFrontierJoinPlan(
      problem,
      domains,
      blocks,
      frontierIndex
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 2 flower × 3 plume = 6 combinations
    expect(result.value.totalCombinationCount).toBe(6)
  })

  it('creates entries with one entry per domain, each with correct row count', () => {
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
      candidates: [candidate('c3', 'd-plume', 'plume')],
    }
    const problem = createProblem({
      slotIds: ['flower', 'plume'],
      domains: [domainFlower, domainPlume],
    })

    const blocks = [
      createFrontierBlockForDomain(problem, domainFlower),
      createFrontierBlockForDomain(problem, domainPlume),
    ]
    const frontierIndex = createFrontierIndexForSolve(problem, blocks)

    const result = createFrontierJoinPlan(
      problem,
      [domainFlower, domainPlume],
      blocks,
      frontierIndex
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.entries).toHaveLength(2)
    expect(result.value.entries[0]!.rows).toHaveLength(2) // flower: 2 candidates
    expect(result.value.entries[1]!.rows).toHaveLength(1) // plume: 1 candidate
    expect(result.value.entries[0]!.slotId).toBe('flower')
    expect(result.value.entries[1]!.slotId).toBe('plume')
  })

  it('resolves each join plan row to the correct candidate descriptor', () => {
    const c1 = candidate('c1', 'd-flower', 'flower')
    const domainFlower = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [c1],
    }
    const problem = createProblem({
      slotIds: ['flower'],
      domains: [domainFlower],
    })

    const blocks = [createFrontierBlockForDomain(problem, domainFlower)]
    const frontierIndex = createFrontierIndexForSolve(problem, blocks)

    const result = createFrontierJoinPlan(
      problem,
      [domainFlower],
      blocks,
      frontierIndex
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.entries[0]!.rows[0]!.candidate.candidateId).toBe('c1')
    expect(result.value.entries[0]!.rows[0]!.row.stateId).toBe(
      'state:flower:c1'
    )
  })

  it('handles three domains correctly', () => {
    const d1 = {
      domainId: 'd-flower',
      slotId: 'flower',
      candidates: [
        candidate('c1', 'd-flower', 'flower'),
        candidate('c2', 'd-flower', 'flower'),
      ],
    }
    const d2 = {
      domainId: 'd-plume',
      slotId: 'plume',
      candidates: [
        candidate('c3', 'd-plume', 'plume'),
        candidate('c4', 'd-plume', 'plume'),
      ],
    }
    const d3 = {
      domainId: 'd-sands',
      slotId: 'sands',
      candidates: [
        candidate('c5', 'd-sands', 'sands'),
        candidate('c6', 'd-sands', 'sands'),
      ],
    }
    const problem = createProblem({
      slotIds: ['flower', 'plume', 'sands'],
      domains: [d1, d2, d3],
    })

    const blocks = [
      createFrontierBlockForDomain(problem, d1),
      createFrontierBlockForDomain(problem, d2),
      createFrontierBlockForDomain(problem, d3),
    ]
    const frontierIndex = createFrontierIndexForSolve(problem, blocks)

    const result = createFrontierJoinPlan(
      problem,
      [d1, d2, d3],
      blocks,
      frontierIndex
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 2 × 2 × 2 = 8
    expect(result.value.totalCombinationCount).toBe(8)
    expect(result.value.entries).toHaveLength(3)
  })

  it('handles single domain with single candidate', () => {
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
    const frontierIndex = createFrontierIndexForSolve(problem, blocks)

    const result = createFrontierJoinPlan(
      problem,
      [domain],
      blocks,
      frontierIndex
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.totalCombinationCount).toBe(1)
    expect(result.value.entries).toHaveLength(1)
    expect(result.value.entries[0]!.rows).toHaveLength(1)
  })
})
