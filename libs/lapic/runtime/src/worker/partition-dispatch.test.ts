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
import { MessageChannel } from 'worker_threads'
import {
  createLapicSessionIdentity,
  createLapicSolveRequest,
} from '../builders'
import { createLapicInMemorySessionController } from '../session'
import type { LapicPartitionDispatcher } from './partition-dispatch'
import { createInProcessPartitionDispatcher } from './partition-dispatch'
import {
  createBoundedExactWorkerEntryHandler,
  createMessagePortPartitionDispatcher,
} from './message-port'
import {
  createFrontierBlockForDomain,
  createFrontierIndexForSolve,
} from '../solve/frontier'
import { createFrontierJoinPlan } from '../solve/join-plan'
import { sortDomains } from '../solve/combination'

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
    problemId: 'dispatch-test',
    problemDigest: 'dispatch-digest',
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
          contentHash: 'dispatch-digest',
          checksum: { algorithm: 'sha256', checksum: 'dispatch-digest' },
          compressionCodec: 'none',
          creationEngineVersion: 'engine-version',
          arithmeticPolicyId: 'arith-policy',
          dependencyDigestSet: [],
        }),
        'dispatch-digest'
      ),
    ],
  })
  const controller = createLapicInMemorySessionController({
    identity: createLapicSessionIdentity({
      sessionId: 'dispatch-session',
      problemDigest: 'dispatch-digest',
      engineVersion: 'engine-version',
      arithmeticPolicyId: 'arith-policy',
      runtimeProtocolVersion: '0.1.0-draft',
      createdAtLogicalTimestamp: 'ts-1',
    }),
    solveRequest: createLapicSolveRequest('dispatch-digest'),
    artifactStore: store,
  })
  return { store, controller }
}

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

/** Build a join plan from a problem for use in dispatch tests. */
function buildJoinPlanForProblem(problem: LapicCanonicalProblem) {
  const orderedDomains = sortDomains(problem)
  const frontierBlocks = orderedDomains.map((domain) =>
    createFrontierBlockForDomain(problem, domain)
  )
  const frontierBlockIds = frontierBlocks.map((b) => b.blockId)
  const frontierIndex = createFrontierIndexForSolve(problem, frontierBlocks)
  const joinPlanResult = createFrontierJoinPlan(
    problem,
    orderedDomains,
    frontierBlocks,
    frontierIndex
  )
  if (!joinPlanResult.ok) throw new Error('Failed to create join plan')
  return { joinPlan: joinPlanResult.value, frontierBlockIds }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LapicPartitionDispatcher', () => {
  const slotIds = ['slot-0', 'slot-1']
  const domains = slotIds.map((slotId, i) => ({
    domainId: `domain-${i}`,
    slotId,
    candidates: Array.from({ length: 4 }, (_, j) =>
      candidate(`cand-${i}-${j}`, `domain-${i}`, slotId)
    ),
  }))

  describe('createInProcessPartitionDispatcher', () => {
    it('completes a partition and returns topNCandidates + certificates', async () => {
      const problem = createProblem({ slotIds, domains, topN: 2 })
      const { store } = createTestInfra()
      const { joinPlan, frontierBlockIds } = buildJoinPlanForProblem(problem)

      const dispatcher = createInProcessPartitionDispatcher({
        problem,
        artifactStore: store,
        evaluateCombination: numericEvaluator,
      })

      // Create a controller for this partition
      const partitionController = createLapicInMemorySessionController({
        identity: createLapicSessionIdentity({
          sessionId: 'partition-0',
          problemDigest: 'dispatch-digest',
          engineVersion: 'engine-version',
          arithmeticPolicyId: 'arith-policy',
          runtimeProtocolVersion: '0.1.0-draft',
          createdAtLogicalTimestamp: 'ts-p0',
        }),
        solveRequest: createLapicSolveRequest('dispatch-digest'),
        artifactStore: store,
      })
      partitionController.awaitCompletion().catch(() => {})

      const response = await dispatcher.dispatch({
        partitionIndex: 0,
        controller: partitionController,
        joinPlan,
        frontierBlockIds,
      })

      expect(response.kind).toBe('completed')
      expect(response).toHaveProperty('topNCandidates')
      if (response.kind === 'completed') {
        expect(response.topNCandidates).toHaveLength(2)
        expect(response.emittedCertificates.length).toBeGreaterThan(0)
        // Should include FinalOptimalityCert from the executor
        const finalCerts = response.emittedCertificates.filter(
          (c) => c.certKind === 'FinalOptimalityCert'
        )
        expect(finalCerts).toHaveLength(1)
      }

      await dispatcher.shutdown()
    })

    it('shutdown is idempotent', async () => {
      const problem = createProblem({ slotIds, domains })
      const { store } = createTestInfra()

      const dispatcher = createInProcessPartitionDispatcher({
        problem,
        artifactStore: store,
        evaluateCombination: numericEvaluator,
      })

      await dispatcher.shutdown()
      await dispatcher.shutdown() // second call should not throw
    })

    it('passes initialIncumbentThreshold to the executor', async () => {
      const problem = createProblem({ slotIds, domains, topN: 1 })
      const { store } = createTestInfra()
      const { joinPlan, frontierBlockIds } = buildJoinPlanForProblem(problem)

      const dispatcher = createInProcessPartitionDispatcher({
        problem,
        artifactStore: store,
        evaluateCombination: numericEvaluator,
      })

      const partitionController = createLapicInMemorySessionController({
        identity: createLapicSessionIdentity({
          sessionId: 'partition-threshold',
          problemDigest: 'dispatch-digest',
          engineVersion: 'engine-version',
          arithmeticPolicyId: 'arith-policy',
          runtimeProtocolVersion: '0.1.0-draft',
          createdAtLogicalTimestamp: 'ts-pt',
        }),
        solveRequest: createLapicSolveRequest('dispatch-digest'),
        artifactStore: store,
      })
      partitionController.awaitCompletion().catch(() => {})

      // Set a high threshold — should still find the best candidate
      const response = await dispatcher.dispatch({
        partitionIndex: 0,
        controller: partitionController,
        joinPlan,
        frontierBlockIds,
        initialIncumbentThreshold: '0099.0000',
      })

      expect(response.kind).toBe('completed')
      await dispatcher.shutdown()
    })

    it('satisfies the LapicPartitionDispatcher contract', () => {
      const problem = createProblem({ slotIds, domains })
      const { store } = createTestInfra()

      const dispatcher: LapicPartitionDispatcher =
        createInProcessPartitionDispatcher({
          problem,
          artifactStore: store,
          evaluateCombination: numericEvaluator,
        })

      // Verify the dispatcher has the required interface methods
      expect(typeof dispatcher.dispatch).toBe('function')
      expect(typeof dispatcher.shutdown).toBe('function')
    })
  })

  describe('MessagePort partition dispatcher', () => {
    it('dispatches partition via MessagePort and receives correct result', async () => {
      const problem = createProblem({ slotIds, domains, topN: 2 })
      const { store } = createTestInfra()
      const { joinPlan, frontierBlockIds } = buildJoinPlanForProblem(problem)

      const channel = new MessageChannel()

      // Set up the worker entry handler
      let partitionSeq = 0
      const cleanup = createBoundedExactWorkerEntryHandler({
        port: channel.port2,
        dispatchConfig: {
          problem,
          artifactStore: store,
          evaluateCombination: numericEvaluator,
        },
        createController: (partitionIndex) =>
          createLapicInMemorySessionController({
            identity: createLapicSessionIdentity({
              sessionId: `worker-partition-${partitionIndex}`,
              problemDigest: 'dispatch-digest',
              engineVersion: 'engine-version',
              arithmeticPolicyId: 'arith-policy',
              runtimeProtocolVersion: '0.1.0-draft',
              createdAtLogicalTimestamp: `ts-wp-${++partitionSeq}`,
            }),
            solveRequest: createLapicSolveRequest('dispatch-digest'),
            artifactStore: store,
          }),
        deserializeJoinPlan: (payload) => JSON.parse(payload),
      })

      // Create the coordinator-side dispatcher
      const dispatcher = createMessagePortPartitionDispatcher({
        port: channel.port1,
      })

      // Create a controller for the request (not used by MessagePort dispatcher
      // but required by the interface)
      const requestController = createLapicInMemorySessionController({
        identity: createLapicSessionIdentity({
          sessionId: 'req-ctrl',
          problemDigest: 'dispatch-digest',
          engineVersion: 'engine-version',
          arithmeticPolicyId: 'arith-policy',
          runtimeProtocolVersion: '0.1.0-draft',
          createdAtLogicalTimestamp: 'ts-req',
        }),
        solveRequest: createLapicSolveRequest('dispatch-digest'),
        artifactStore: store,
      })
      requestController.awaitCompletion().catch(() => {})

      const response = await dispatcher.dispatch({
        partitionIndex: 0,
        controller: requestController,
        joinPlan,
        frontierBlockIds,
      })

      expect(response.kind).toBe('completed')
      if (response.kind === 'completed') {
        expect(response.topNCandidates).toHaveLength(2)
        expect(response.emittedCertificates.length).toBeGreaterThan(0)
      }

      await dispatcher.shutdown()
      cleanup()
      channel.port1.close()
      channel.port2.close()
    })

    it('handles errors from the worker gracefully', async () => {
      const problem = createProblem({ slotIds, domains })
      const { store } = createTestInfra()
      const { joinPlan, frontierBlockIds } = buildJoinPlanForProblem(problem)

      const channel = new MessageChannel()

      // Set up a worker that throws on dispatch
      const cleanup = createBoundedExactWorkerEntryHandler({
        port: channel.port2,
        dispatchConfig: {
          problem,
          artifactStore: store,
          evaluateCombination: () => {
            throw new Error('Intentional evaluator failure')
          },
        },
        createController: (partitionIndex) =>
          createLapicInMemorySessionController({
            identity: createLapicSessionIdentity({
              sessionId: `err-partition-${partitionIndex}`,
              problemDigest: 'dispatch-digest',
              engineVersion: 'engine-version',
              arithmeticPolicyId: 'arith-policy',
              runtimeProtocolVersion: '0.1.0-draft',
              createdAtLogicalTimestamp: `ts-err-${partitionIndex}`,
            }),
            solveRequest: createLapicSolveRequest('dispatch-digest'),
            artifactStore: store,
          }),
        deserializeJoinPlan: (payload) => JSON.parse(payload),
      })

      const dispatcher = createMessagePortPartitionDispatcher({
        port: channel.port1,
      })

      const requestController = createLapicInMemorySessionController({
        identity: createLapicSessionIdentity({
          sessionId: 'err-req',
          problemDigest: 'dispatch-digest',
          engineVersion: 'engine-version',
          arithmeticPolicyId: 'arith-policy',
          runtimeProtocolVersion: '0.1.0-draft',
          createdAtLogicalTimestamp: 'ts-err-req',
        }),
        solveRequest: createLapicSolveRequest('dispatch-digest'),
        artifactStore: store,
      })
      requestController.awaitCompletion().catch(() => {})

      await expect(
        dispatcher.dispatch({
          partitionIndex: 0,
          controller: requestController,
          joinPlan,
          frontierBlockIds,
        })
      ).rejects.toThrow()

      cleanup()
      channel.port1.close()
      channel.port2.close()
    })

    it('rejects dispatch after shutdown', async () => {
      const channel = new MessageChannel()

      const dispatcher = createMessagePortPartitionDispatcher({
        port: channel.port1,
      })

      await dispatcher.shutdown()

      const { store } = createTestInfra()
      const dummyController = createLapicInMemorySessionController({
        identity: createLapicSessionIdentity({
          sessionId: 'after-shutdown',
          problemDigest: 'dispatch-digest',
          engineVersion: 'engine-version',
          arithmeticPolicyId: 'arith-policy',
          runtimeProtocolVersion: '0.1.0-draft',
          createdAtLogicalTimestamp: 'ts-as',
        }),
        solveRequest: createLapicSolveRequest('dispatch-digest'),
        artifactStore: store,
      })
      dummyController.awaitCompletion().catch(() => {})

      await expect(
        dispatcher.dispatch({
          partitionIndex: 0,
          controller: dummyController,
          joinPlan: { totalCombinationCount: 0, entries: [] },
          frontierBlockIds: [],
        })
      ).rejects.toThrow('terminated')

      channel.port2.close()
    })

    it('satisfies the same LapicPartitionDispatcher contract as in-process', () => {
      const channel = new MessageChannel()

      const dispatcher: LapicPartitionDispatcher =
        createMessagePortPartitionDispatcher({
          port: channel.port1,
        })

      expect(typeof dispatcher.dispatch).toBe('function')
      expect(typeof dispatcher.shutdown).toBe('function')

      channel.port1.close()
      channel.port2.close()
    })
  })
})
