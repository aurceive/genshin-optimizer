import {
  type LapicCandidateDescriptor,
  type LapicCanonicalProblem,
  createLapicSuccessResult,
} from '@genshin-optimizer/lapic/core'
import {
  createLapicArtifactWriteRequest,
  createLapicMemoryArtifactStore,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import {
  createLapicSessionIdentity,
  createLapicSolveRequest,
} from '../builders'
import { createLapicInMemorySessionController } from '../session'
import type {
  LapicSolveCompletionResult,
  LapicTopNCandidateEntry,
} from '../types'
import { executeLapicBoundedExactSolve } from '../solve/executor'
import {
  executeCoordinatedBoundedExactSolve,
  mergeAndTruncateCandidates,
  computeIncumbentThreshold,
} from './coordinated-solve'

// ---------------------------------------------------------------------------
// Helpers
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
    categoricalSignatureDigest: `cat:${candidateId}`,
    provenance: {
      slotId,
      sourceEntityId: 'test',
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
  topN?: number
}): LapicCanonicalProblem {
  return {
    problemId: 'coord-test',
    problemDigest: 'coord-digest',
    engineVersion: 'engine-version',
    arithmeticPolicyId: 'arith-policy',
    teamLayout: {
      teamKind: 'gi-single',
      slotCount: config.slotIds.length,
      slotIds: config.slotIds,
      slotRoleTaxonomy: config.slotIds.map(() => 'artifact'),
      slotRequirements: Object.fromEntries(
        config.slotIds.map((s) => [s, 'required'])
      ),
      slotOrderSemantics: 'semantic',
      frameAxisKind: 'none',
    },
    slotDescriptors: config.slotIds.map((slotId) => ({
      slotId,
      slotRole: `artifact-${slotId}`,
      participationMode: 'optimizedBuild',
      occupantDomainId: config.domains.find((d) => d.slotId === slotId)!
        .domainId,
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
    frameAxis: [],
    itemDomains: config.domains,
    compatibilityRules: [],
    objective: {
      objectiveId: 'objective-id',
      objectiveKind: 'single-slot',
      expressionDigest: 'objective-digest',
      targetSlotIds: config.slotIds,
      frameIds: [],
    },
    constraints: [],
    topN: config.topN ?? 1,
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
      teamLayoutDigest: 'team-layout-digest',
      sharedTeamContextDigest: 'shared-context-digest',
      crossSlotRuleDescriptorVersion: '0.1.0-draft',
      compatibilitySignatureSchemaVersion: '0.1.0-draft',
      slotProvenance: [],
    },
  }
}

function createTestInfra() {
  const store = createLapicMemoryArtifactStore({
    entries: [
      createLapicArtifactWriteRequest(
        createLapicStorageEnvelope({
          artifactKind: 'canonical-problem',
          schemaVersion: '0.1.0-draft',
          payloadEncoding: 'json',
          payloadLength: 64,
          contentHash: 'coord-digest',
          checksum: { algorithm: 'sha256', checksum: 'coord-digest' },
          compressionCodec: 'none',
          creationEngineVersion: 'engine-version',
          arithmeticPolicyId: 'arith-policy',
          dependencyDigestSet: [],
        }),
        'coord-digest'
      ),
    ],
  })
  const controller = createLapicInMemorySessionController({
    identity: createLapicSessionIdentity({
      sessionId: 'coord-session',
      problemDigest: 'coord-digest',
      engineVersion: 'engine-version',
      arithmeticPolicyId: 'arith-policy',
      runtimeProtocolVersion: '0.1.0-draft',
      createdAtLogicalTimestamp: 'ts-1',
    }),
    solveRequest: createLapicSolveRequest('coord-digest'),
    artifactStore: store,
  })
  return { store, controller }
}

/**
 * Sum-of-indices evaluator: cand-X-2 + cand-Y-3 → 5, formatted as "0000005.0000".
 */
function numericEvaluator(combination: {
  candidates: readonly LapicCandidateDescriptor[]
}) {
  let sum = 0
  for (const c of combination.candidates) {
    const parts = c.candidateId.split('-')
    sum += parseInt(parts[parts.length - 1]!, 10)
  }
  const formatted = sum.toFixed(4).padStart(12, '0')
  return createLapicSuccessResult({
    objectiveValue: formatted,
    evidenceDigest: `eval:${formatted}`,
    orderingKey: [formatted],
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeCoordinatedBoundedExactSolve', () => {
  const slotIds = ['slot-0', 'slot-1']
  const domains = slotIds.map((slotId, i) => ({
    domainId: `domain-${i}`,
    slotId,
    candidates: Array.from({ length: 4 }, (_, j) =>
      candidate(`cand-${i}-${j}`, `domain-${i}`, slotId)
    ),
  }))

  describe('single-partition fast path (workerCount = 1)', () => {
    it('delegates to executor and produces correct result', async () => {
      const problem = createProblem({ slotIds, domains, topN: 1 })
      const { store, controller } = createTestInfra()

      const outcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller,
        artifactStore: store,
        evaluateCombination: numericEvaluator,
        workerCount: 1,
      })

      const completion = outcome as LapicSolveCompletionResult
      expect(completion.summary.solveState).toBe('completed')
      expect(completion.finalOptimality).toBeDefined()
      // Best: cand-0-3 + cand-1-3 = 6
      expect(completion.finalOptimality!.winnerStateId).toBeDefined()
    })

    it('produces same result as direct executor call', async () => {
      const problem = createProblem({ slotIds, domains, topN: 1 })

      // Direct executor
      const infra1 = createTestInfra()
      const directOutcome = await executeLapicBoundedExactSolve({
        problem,
        controller: infra1.controller,
        artifactStore: infra1.store,
        evaluateCombination: numericEvaluator,
      })
      const directCompletion = directOutcome as LapicSolveCompletionResult

      // Coordinated with workerCount=1
      const infra2 = createTestInfra()
      const coordOutcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller: infra2.controller,
        artifactStore: infra2.store,
        evaluateCombination: numericEvaluator,
        workerCount: 1,
      })
      const coordCompletion = coordOutcome as LapicSolveCompletionResult

      // Both should find the same winner
      expect(coordCompletion.finalOptimality!.winnerStateId).toBe(
        directCompletion.finalOptimality!.winnerStateId
      )
    })
  })

  describe('multi-partition solve (workerCount > 1)', () => {
    it('produces correct result with workerCount=2', async () => {
      const problem = createProblem({ slotIds, domains, topN: 1 })
      const { store, controller } = createTestInfra()

      const outcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller,
        artifactStore: store,
        evaluateCombination: numericEvaluator,
        workerCount: 2,
      })

      const completion = outcome as LapicSolveCompletionResult
      expect(completion.summary.solveState).toBe('completed')
      expect(completion.finalOptimality).toBeDefined()
    })

    it('finds the global optimum across partitions', async () => {
      const problem = createProblem({ slotIds, domains, topN: 1 })

      // Get the reference answer from single-partition
      const infra1 = createTestInfra()
      const singleOutcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller: infra1.controller,
        artifactStore: infra1.store,
        evaluateCombination: numericEvaluator,
        workerCount: 1,
      })
      const singleCompletion = singleOutcome as LapicSolveCompletionResult

      // Multi-partition should find the same global optimum
      const infra2 = createTestInfra()
      const multiOutcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller: infra2.controller,
        artifactStore: infra2.store,
        evaluateCombination: numericEvaluator,
        workerCount: 2,
      })
      const multiCompletion = multiOutcome as LapicSolveCompletionResult

      expect(multiCompletion.finalOptimality!.winnerStateId).toBe(
        singleCompletion.finalOptimality!.winnerStateId
      )
    })

    it('finds the global optimum with 3 domains and 4 partitions', async () => {
      const slotIds3 = ['s0', 's1', 's2']
      const domains3 = slotIds3.map((slotId, i) => ({
        domainId: `d-${i}`,
        slotId,
        candidates: Array.from({ length: 3 }, (_, j) =>
          candidate(`c-${i}-${j}`, `d-${i}`, slotId)
        ),
      }))
      const problem = createProblem({
        slotIds: slotIds3,
        domains: domains3,
        topN: 1,
      })

      const infra1 = createTestInfra()
      const singleOutcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller: infra1.controller,
        artifactStore: infra1.store,
        evaluateCombination: numericEvaluator,
        workerCount: 1,
      })
      const singleCompletion = singleOutcome as LapicSolveCompletionResult

      // With more workers than first-domain rows, effective count is clamped
      const infra2 = createTestInfra()
      const multiOutcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller: infra2.controller,
        artifactStore: infra2.store,
        evaluateCombination: numericEvaluator,
        workerCount: 4,
      })
      const multiCompletion = multiOutcome as LapicSolveCompletionResult

      expect(multiCompletion.finalOptimality!.winnerStateId).toBe(
        singleCompletion.finalOptimality!.winnerStateId
      )
    })

    it('calls onPartitionComplete for each partition', async () => {
      const problem = createProblem({ slotIds, domains, topN: 1 })
      const { store, controller } = createTestInfra()
      const calls: Array<[number, number]> = []

      await executeCoordinatedBoundedExactSolve({
        problem,
        controller,
        artifactStore: store,
        evaluateCombination: numericEvaluator,
        workerCount: 2,
        onPartitionComplete: (idx, total) => calls.push([idx, total]),
      })

      expect(calls).toHaveLength(2)
      expect(calls.map(([idx]) => idx)).toEqual([0, 1])
      for (const [, total] of calls) {
        expect(total).toBe(2)
      }
    })
  })

  describe('certificate forwarding', () => {
    it('emits certificates from all partitions on parent controller', async () => {
      const problem = createProblem({ slotIds, domains, topN: 1 })
      const { store, controller } = createTestInfra()

      const outcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller,
        artifactStore: store,
        evaluateCombination: numericEvaluator,
        workerCount: 2,
      })

      const completion = outcome as LapicSolveCompletionResult
      // Parent controller should have received certificates
      expect(completion.emittedCertificates.length).toBeGreaterThan(0)

      // Should have at least one FinalOptimality cert (from the best partition)
      const finalCerts = completion.emittedCertificates.filter(
        (c) => c.certKind === 'FinalOptimalityCert'
      )
      expect(finalCerts.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('cross-partition top-N merge', () => {
    it('correctly merges top-3 candidates across 2 partitions', async () => {
      const problem = createProblem({ slotIds, domains, topN: 3 })

      // Single-partition reference: executor finds global top-3
      const infra1 = createTestInfra()
      const singleOutcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller: infra1.controller,
        artifactStore: infra1.store,
        evaluateCombination: numericEvaluator,
        workerCount: 1,
      })
      const singleCompletion = singleOutcome as LapicSolveCompletionResult
      expect(singleCompletion.topNCandidates).toBeDefined()
      expect(singleCompletion.topNCandidates!.length).toBe(3)

      // Multi-partition: should produce the same global top-3
      const infra2 = createTestInfra()
      const multiOutcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller: infra2.controller,
        artifactStore: infra2.store,
        evaluateCombination: numericEvaluator,
        workerCount: 2,
      })
      const multiCompletion = multiOutcome as LapicSolveCompletionResult
      expect(multiCompletion.topNCandidates).toBeDefined()
      expect(multiCompletion.topNCandidates!.length).toBe(3)

      // The global top-3 should be the same regardless of partition count
      const singleValues = singleCompletion
        .topNCandidates!.map((c) => c.evaluation.objectiveValue)
        .sort()
      const multiValues = multiCompletion
        .topNCandidates!.map((c) => c.evaluation.objectiveValue)
        .sort()
      expect(multiValues).toEqual(singleValues)
    })

    it('populates topNCandidates on single-partition path', async () => {
      const problem = createProblem({ slotIds, domains, topN: 2 })
      const { store, controller } = createTestInfra()

      const outcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller,
        artifactStore: store,
        evaluateCombination: numericEvaluator,
        workerCount: 1,
      })
      const completion = outcome as LapicSolveCompletionResult
      expect(completion.topNCandidates).toBeDefined()
      expect(completion.topNCandidates!.length).toBe(2)
      // Best candidate should be first
      const values = completion.topNCandidates!.map(
        (c) => c.evaluation.objectiveValue
      )
      expect(Number(values[0])).toBeGreaterThanOrEqual(Number(values[1]!))
    })
  })

  describe('incumbent sharing', () => {
    /**
     * Upper-bound evaluator: for a partial assignment, returns
     * the current sum + maximum possible value from remaining domains.
     * This gives a tight upper bound that enables B&B pruning.
     */
    function makeUpperBoundEvaluator(
      domains: Array<{ candidates: LapicCandidateDescriptor[] }>
    ) {
      // Pre-compute max candidate index per domain
      const maxPerDomain = domains.map((d) => {
        let max = 0
        for (const c of d.candidates) {
          const parts = c.candidateId.split('-')
          const val = parseInt(parts[parts.length - 1]!, 10)
          if (val > max) max = val
        }
        return max
      })

      return (partial: {
        assignedCandidates: readonly LapicCandidateDescriptor[]
        assignedDomainCount: number
        totalDomainCount: number
      }) => {
        let sum = 0
        for (const c of partial.assignedCandidates) {
          const parts = c.candidateId.split('-')
          sum += parseInt(parts[parts.length - 1]!, 10)
        }
        // Add max possible from remaining domains
        for (
          let i = partial.assignedDomainCount;
          i < partial.totalDomainCount;
          i++
        ) {
          sum += maxPerDomain[i] ?? 0
        }
        const formatted = sum.toFixed(4).padStart(12, '0')
        return {
          upperBoundValue: formatted,
          evidenceDigest: `bound:${formatted}`,
        }
      }
    }

    it('finds the same global optimum with incumbent sharing active', async () => {
      const problem = createProblem({ slotIds, domains, topN: 1 })
      const upperBound = makeUpperBoundEvaluator(domains)

      // Single-partition reference (with upper bound)
      const infra1 = createTestInfra()
      const singleOutcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller: infra1.controller,
        artifactStore: infra1.store,
        evaluateCombination: numericEvaluator,
        computeUpperBound: upperBound,
        workerCount: 1,
      })
      const singleCompletion = singleOutcome as LapicSolveCompletionResult

      // Multi-partition with incumbent sharing via upper bound
      const infra2 = createTestInfra()
      const multiOutcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller: infra2.controller,
        artifactStore: infra2.store,
        evaluateCombination: numericEvaluator,
        computeUpperBound: upperBound,
        workerCount: 2,
      })
      const multiCompletion = multiOutcome as LapicSolveCompletionResult

      expect(multiCompletion.finalOptimality!.winnerStateId).toBe(
        singleCompletion.finalOptimality!.winnerStateId
      )
    })

    it('emits BoundPruneCerts when incumbent sharing enables pruning', async () => {
      // 3 domains: small first domain (partitioned), large inner domains
      // where depth-2 pruning occurs thanks to incumbent sharing.
      // Domain 0: 4 candidates (values 0-3) — outermost, smallest
      // Domain 1: 10 candidates (values 0-9) — depth-2 pruning target
      // Domain 2: 10 candidates (values 0-9) — innermost
      const threeSlots = ['s0', 's1', 's2']
      const threeDomains = [
        {
          domainId: 'td-0',
          slotId: 's0',
          candidates: Array.from({ length: 4 }, (_, j) =>
            candidate(`t-0-${j}`, 'td-0', 's0')
          ),
        },
        {
          domainId: 'td-1',
          slotId: 's1',
          candidates: Array.from({ length: 10 }, (_, j) =>
            candidate(`t-1-${j}`, 'td-1', 's1')
          ),
        },
        {
          domainId: 'td-2',
          slotId: 's2',
          candidates: Array.from({ length: 10 }, (_, j) =>
            candidate(`t-2-${j}`, 'td-2', 's2')
          ),
        },
      ]
      const problem = createProblem({
        slotIds: threeSlots,
        domains: threeDomains,
        topN: 1,
      })
      const upperBound = makeUpperBoundEvaluator(threeDomains)

      const { store, controller } = createTestInfra()
      const outcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller,
        artifactStore: store,
        evaluateCombination: numericEvaluator,
        computeUpperBound: upperBound,
        workerCount: 2,
      })

      const completion = outcome as LapicSolveCompletionResult
      expect(completion.summary.solveState).toBe('completed')
      // Partition 0 finds best=1+9+9=19 as threshold.
      // Partition 1 at depth 2 prunes subtrees where
      // partial_sum + max_remaining < 19.
      const pruneCerts = completion.emittedCertificates.filter(
        (c) => c.certKind === 'BoundPruneCert'
      )
      expect(pruneCerts.length).toBeGreaterThan(0)
    })

    it('produces correct top-N with incumbent sharing and multiple partitions', async () => {
      const problem = createProblem({ slotIds, domains, topN: 3 })
      const upperBound = makeUpperBoundEvaluator(domains)

      // Reference without upper bound
      const infra1 = createTestInfra()
      const refOutcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller: infra1.controller,
        artifactStore: infra1.store,
        evaluateCombination: numericEvaluator,
        workerCount: 1,
      })
      const refCompletion = refOutcome as LapicSolveCompletionResult

      // With upper bound + incumbent sharing
      const infra2 = createTestInfra()
      const prunedOutcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller: infra2.controller,
        artifactStore: infra2.store,
        evaluateCombination: numericEvaluator,
        computeUpperBound: upperBound,
        workerCount: 2,
      })
      const prunedCompletion = prunedOutcome as LapicSolveCompletionResult

      // Same top-3 objective values regardless of pruning
      const refValues = refCompletion
        .topNCandidates!.map((c) => c.evaluation.objectiveValue)
        .sort()
      const prunedValues = prunedCompletion
        .topNCandidates!.map((c) => c.evaluation.objectiveValue)
        .sort()
      expect(prunedValues).toEqual(refValues)
    })
  })

  describe('scheduler lifecycle', () => {
    it('dispatches all partitions through the scheduler and tracks completion', async () => {
      // With 6 candidates in domain-0, workerCount=3 produces 3 partitions.
      // The scheduler should dispatch all 3 in index order.
      const slotIds3 = ['s0', 's1']
      const domains3 = [
        {
          domainId: 'd-0',
          slotId: 's0',
          candidates: Array.from({ length: 6 }, (_, j) =>
            candidate(`c-0-${j}`, 'd-0', 's0')
          ),
        },
        {
          domainId: 'd-1',
          slotId: 's1',
          candidates: Array.from({ length: 3 }, (_, j) =>
            candidate(`c-1-${j}`, 'd-1', 's1')
          ),
        },
      ]
      const problem = createProblem({
        slotIds: slotIds3,
        domains: domains3,
        topN: 1,
      })
      const { store, controller } = createTestInfra()
      const calls: Array<[number, number]> = []

      const outcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller,
        artifactStore: store,
        evaluateCombination: numericEvaluator,
        workerCount: 3,
        onPartitionComplete: (idx, total) => calls.push([idx, total]),
      })

      const completion = outcome as LapicSolveCompletionResult
      expect(completion.summary.solveState).toBe('completed')
      // All 3 partitions should have completed in order
      expect(calls).toHaveLength(3)
      expect(calls.map(([idx]) => idx)).toEqual([0, 1, 2])
      for (const [, total] of calls) {
        expect(total).toBe(3)
      }
    })

    it('propagates executor errors and cancels remaining partitions', async () => {
      const problem = createProblem({ slotIds, domains, topN: 1 })
      const { store, controller } = createTestInfra()

      // Make the evaluator throw for candidates in the second partition.
      // With 4 candidates in domain-0 and workerCount=2:
      // partition 0 gets rows [0,1], partition 1 gets rows [2,3].
      const throwOnSecondPartition = (combination: {
        candidates: readonly LapicCandidateDescriptor[]
      }) => {
        for (const c of combination.candidates) {
          if (c.candidateId === 'cand-0-2' || c.candidateId === 'cand-0-3') {
            throw new Error('Simulated failure in partition 1')
          }
        }
        return numericEvaluator(combination)
      }

      const completedPartitions: number[] = []
      await expect(
        executeCoordinatedBoundedExactSolve({
          problem,
          controller,
          artifactStore: store,
          evaluateCombination: throwOnSecondPartition,
          workerCount: 2,
          onPartitionComplete: (idx) => completedPartitions.push(idx),
        })
      ).rejects.toThrow(/Partition 1\/2 failed/)

      // Only partition 0 should have completed before the error
      expect(completedPartitions).toEqual([0])
    })
  })

  describe('infeasible problems', () => {
    it('completes without optimality when all feasibility checks fail', async () => {
      const problem = createProblem({ slotIds, domains, topN: 1 })
      const { store, controller } = createTestInfra()

      const outcome = await executeCoordinatedBoundedExactSolve({
        problem,
        controller,
        artifactStore: store,
        evaluateCombination: numericEvaluator,
        isCombinationFeasible: () => false,
        workerCount: 2,
      })

      const completion = outcome as LapicSolveCompletionResult
      expect(completion.summary.solveState).toBe('completed')
      // No final optimality when all combinations are infeasible
      expect(completion.finalOptimality).toBeUndefined()
    })
  })
})

describe('domain-partitioner', () => {
  it('correctly splits first domain rows', async () => {
    // 6 candidates in first domain, 2 in second, workerCount=3
    // → 3 partitions with 2 rows each → each covers 2*2=4 combos
    const slotIds2 = ['s0', 's1']
    const domains2 = [
      {
        domainId: 'd-0',
        slotId: 's0',
        candidates: Array.from({ length: 6 }, (_, j) =>
          candidate(`c-0-${j}`, 'd-0', 's0')
        ),
      },
      {
        domainId: 'd-1',
        slotId: 's1',
        candidates: Array.from({ length: 2 }, (_, j) =>
          candidate(`c-1-${j}`, 'd-1', 's1')
        ),
      },
    ]
    const problem = createProblem({
      slotIds: slotIds2,
      domains: domains2,
      topN: 1,
    })

    // Run with 1 worker to get reference answer
    const infra1 = createTestInfra()
    const singleOutcome = await executeCoordinatedBoundedExactSolve({
      problem,
      controller: infra1.controller,
      artifactStore: infra1.store,
      evaluateCombination: numericEvaluator,
      workerCount: 1,
    })
    const singleCompletion = singleOutcome as LapicSolveCompletionResult

    // Run with 3 workers — should split 6 rows into 3 partitions of 2
    const infra2 = createTestInfra()
    const multiOutcome = await executeCoordinatedBoundedExactSolve({
      problem,
      controller: infra2.controller,
      artifactStore: infra2.store,
      evaluateCombination: numericEvaluator,
      workerCount: 3,
    })
    const multiCompletion = multiOutcome as LapicSolveCompletionResult

    expect(multiCompletion.finalOptimality!.winnerStateId).toBe(
      singleCompletion.finalOptimality!.winnerStateId
    )
  })
})

// ---------------------------------------------------------------------------
// Unit tests for merge helpers
// ---------------------------------------------------------------------------

function entry(
  stateId: string,
  objectiveValue: string
): LapicTopNCandidateEntry {
  return {
    stateId,
    candidates: [],
    evaluation: {
      objectiveValue,
      evidenceDigest: `eval:${objectiveValue}`,
      orderingKey: [objectiveValue],
    },
  }
}

describe('mergeAndTruncateCandidates', () => {
  it('merges two sets and keeps top N', () => {
    const a = [entry('a1', '0000003.0000'), entry('a2', '0000001.0000')]
    const b = [entry('b1', '0000004.0000'), entry('b2', '0000002.0000')]
    const result = mergeAndTruncateCandidates(a, b, 3)
    expect(result.map((e) => e.stateId)).toEqual(['b1', 'a1', 'b2'])
  })

  it('returns empty when both inputs are empty', () => {
    expect(mergeAndTruncateCandidates([], [], 5)).toEqual([])
  })

  it('handles topN larger than total candidates', () => {
    const a = [entry('a1', '0000002.0000')]
    const result = mergeAndTruncateCandidates(a, [], 10)
    expect(result).toHaveLength(1)
    expect(result[0]!.stateId).toBe('a1')
  })

  it('truncates to exactly topN', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry(`e${i}`, String(i).padStart(12, '0'))
    )
    const result = mergeAndTruncateCandidates(entries, [], 3)
    expect(result).toHaveLength(3)
  })

  it('handles duplicate objective values stably', () => {
    const a = [entry('a1', '0000005.0000'), entry('a2', '0000005.0000')]
    const b = [entry('b1', '0000005.0000')]
    const result = mergeAndTruncateCandidates(a, b, 2)
    expect(result).toHaveLength(2)
  })

  it('uses custom comparator when provided', () => {
    const a = [entry('a1', '0000001.0000')]
    const b = [entry('b1', '0000002.0000')]
    // Reverse comparator: lower objective value is better
    const reverseComparator = (
      leftEval: { objectiveValue: string },
      rightEval: { objectiveValue: string }
    ): -1 | 0 | 1 => {
      const l = Number(leftEval.objectiveValue)
      const r = Number(rightEval.objectiveValue)
      if (l < r) return 1
      if (l > r) return -1
      return 0
    }
    const result = mergeAndTruncateCandidates(a, b, 2, reverseComparator)
    expect(result[0]!.stateId).toBe('a1')
    expect(result[1]!.stateId).toBe('b1')
  })
})

describe('computeIncumbentThreshold', () => {
  it('returns undefined when fewer candidates than topN', () => {
    const candidates = [entry('a', '0000010.0000')]
    expect(computeIncumbentThreshold(candidates, 3)).toBeUndefined()
  })

  it('returns undefined for empty candidates', () => {
    expect(computeIncumbentThreshold([], 1)).toBeUndefined()
  })

  it('returns worst candidate value when count equals topN', () => {
    const candidates = [
      entry('a', '0000010.0000'),
      entry('b', '0000005.0000'),
      entry('c', '0000001.0000'),
    ]
    expect(computeIncumbentThreshold(candidates, 3)).toBe('0000001.0000')
  })

  it('returns worst candidate value when count exceeds topN', () => {
    const candidates = [
      entry('a', '0000010.0000'),
      entry('b', '0000005.0000'),
      entry('c', '0000003.0000'),
      entry('d', '0000001.0000'),
    ]
    expect(computeIncumbentThreshold(candidates, 3)).toBe('0000001.0000')
  })
})

// ---------------------------------------------------------------------------
// A-8: Progress forwarding from partitions to parent
// ---------------------------------------------------------------------------

describe('coordinated solve — progress forwarding', () => {
  const slotIds = ['slot-0', 'slot-1']
  const domains = slotIds.map((slotId, i) => ({
    domainId: `domain-${i}`,
    slotId,
    candidates: Array.from({ length: 4 }, (_, j) =>
      candidate(`cand-${i}-${j}`, `domain-${i}`, slotId)
    ),
  }))

  it('forwards partition progress events to parent controller', async () => {
    const problem = createProblem({ slotIds, domains, topN: 1 })
    const { store, controller } = createTestInfra()

    const progressPhases: string[] = []
    controller.subscribeProgress((event) => {
      progressPhases.push(event.phase)
    })

    await executeCoordinatedBoundedExactSolve({
      problem,
      controller,
      artifactStore: store,
      evaluateCombination: numericEvaluator,
      workerCount: 2,
    })

    // Should have received join progress events (from partition executor)
    expect(progressPhases).toContain('join')
  })

  it('aggregated progress covers all combinations across partitions', async () => {
    const problem = createProblem({ slotIds, domains, topN: 1 })
    const { store, controller } = createTestInfra()

    let maxCompleted = 0
    controller.subscribeProgress((event) => {
      if (event.phase === 'join' && event.completedUnits > maxCompleted) {
        maxCompleted = event.completedUnits
      }
    })

    await executeCoordinatedBoundedExactSolve({
      problem,
      controller,
      artifactStore: store,
      evaluateCombination: numericEvaluator,
      workerCount: 2,
    })

    // Total combinations: 4 × 4 = 16. Aggregated progress should reach 16.
    expect(maxCompleted).toBe(16)
  })
})
