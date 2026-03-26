import { createLapicFinalOptimalitySummary } from '@genshin-optimizer/lapic/cert'
import {
  type LapicCandidateDescriptor,
  type LapicDiagnostic,
  analyzeLapicFirGraph,
  createCombinationStateId,
  createLapicDiagnostic,
  createLapicSuccessResult,
  hasExclusiveResourceConflict,
  inferForcedBranches,
} from '@genshin-optimizer/lapic/core'
import type { LapicFrontierBlock } from '@genshin-optimizer/lapic/storage'
import { LapicSessionFailureError } from '../session/completion'
import type { LapicSolveCompletionResult } from '../types'
import {
  createBoundPruneCertificate,
  createBranchReachabilityCertificate,
  createDominanceCertificate,
  createFinalOptimalityCertificate,
  createInfeasibilityCertificate,
} from './certificate'
import {
  createLapicSolveCheckpointState,
  createLapicSolveCursorPosition,
} from './checkpoint-state'
import {
  compareEvaluations,
  normalizeFeasibilityResult,
  sortDomains,
  validateSolveOptions,
} from './combination'
import {
  buildDangerZoneRecord,
  detectBoundPruneDangerZone,
  type LapicDangerZoneDetectionResult,
} from './danger-zone'
import {
  createFrontierBlockForDomain,
  createFrontierIndexForSolve,
} from './frontier'
import { createFrontierJoinPlan } from './join-plan'
import { persistArtifact } from './persistence'
import {
  computeSubtreeSize,
  createPruningStatistics,
  restorePruningStatistics,
  snapshotPruningStatistics,
} from './pruning'
import {
  buildCandidateIndex,
  createResumableTopNTracker,
  restoreResumableTopNTracker,
} from './resumable-tracker'
import type {
  LapicBoundedExactCandidateCombination,
  LapicBoundedExactCombinationEvaluation,
  LapicBoundedExactSolveOptions,
  LapicBoundedExactSolveOutcome,
  LapicPrebuiltJoinContext,
} from './types'

async function failSolve(
  options: LapicBoundedExactSolveOptions,
  message: string,
  diagnostics: readonly LapicDiagnostic[]
): Promise<never> {
  return options.controller.fail('workerFailure', message, diagnostics)
}

// ---------------------------------------------------------------------------
// Frontier construction
// ---------------------------------------------------------------------------

interface FrontierSetupResult {
  readonly frontierBlocks: LapicFrontierBlock[]
  readonly frontierBlockIds: string[]
  readonly frontierIndex: ReturnType<typeof createFrontierIndexForSolve>
}

async function buildFrontierFromScratch(
  options: LapicBoundedExactSolveOptions,
  orderedDomains: ReturnType<typeof sortDomains>
): Promise<FrontierSetupResult> {
  const frontierBlocks: LapicFrontierBlock[] = []
  const frontierBlockIds: string[] = []

  options.controller.activate('frontier-build')
  for (const [domainIndex, domain] of orderedDomains.entries()) {
    const domainVariableMap = options.domainVariableMaps?.find(
      (dvm) => dvm.domainId === domain.domainId
    )
    const block = createFrontierBlockForDomain(
      options.problem,
      domain,
      domainVariableMap
    )
    frontierBlocks.push(block)
    frontierBlockIds.push(block.blockId)
    await persistArtifact(
      options,
      'frontier-block',
      block.blockId,
      `payload:${block.blockId}`,
      block,
      [options.problem.problemDigest]
    )
    options.controller.publishProgress({
      phase: 'frontier-build',
      completedUnits: domainIndex + 1,
      totalUnits: orderedDomains.length,
    })
  }

  const frontierIndex = createFrontierIndexForSolve(
    options.problem,
    frontierBlocks
  )
  await persistArtifact(
    options,
    'frontier-index',
    frontierIndex.indexId,
    `payload:${frontierIndex.indexId}`,
    frontierIndex,
    [options.problem.problemDigest, ...frontierBlockIds]
  )

  return { frontierBlocks, frontierBlockIds, frontierIndex }
}

async function rebuildFrontierForResume(
  options: LapicBoundedExactSolveOptions,
  orderedDomains: ReturnType<typeof sortDomains>,
  totalCombinationCount: number
): Promise<FrontierSetupResult> {
  const ckpt = options.resumeCheckpointState!
  if (ckpt.problemDigest !== options.problem.problemDigest)
    return failSolve(
      options,
      'Checkpoint problemDigest does not match current problem.',
      [
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'Checkpoint problemDigest does not match current problem.',
          ['resumeCheckpointState', 'problemDigest']
        ),
      ]
    )
  if (ckpt.totalCombinationCount !== totalCombinationCount)
    return failSolve(options, 'Checkpoint totalCombinationCount diverged.', [
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'Checkpoint totalCombinationCount diverged.',
        ['resumeCheckpointState', 'totalCombinationCount']
      ),
    ])

  const frontierBlocks: LapicFrontierBlock[] = []
  const frontierBlockIds: string[] = []
  for (const domain of orderedDomains) {
    const block = createFrontierBlockForDomain(options.problem, domain)
    frontierBlocks.push(block)
    frontierBlockIds.push(block.blockId)
  }

  const frontierIndex = createFrontierIndexForSolve(
    options.problem,
    frontierBlocks
  )
  return { frontierBlocks, frontierBlockIds, frontierIndex }
}

// ---------------------------------------------------------------------------
// Tracker setup
// ---------------------------------------------------------------------------

interface TrackerSetup {
  readonly tracker: ReturnType<typeof createResumableTopNTracker>
  readonly resumeFlatIndex: number
  readonly processedCombinationCount: number
  readonly pruningStats: ReturnType<typeof createPruningStatistics>
  readonly restoredPruneCertificateIds: readonly string[]
  readonly restoredBranchReachabilityCertificateIds: readonly string[]
  readonly restoredDominanceCertificateIds: readonly string[]
}

function setupTracker(
  options: LapicBoundedExactSolveOptions,
  orderedDomains: ReturnType<typeof sortDomains>
): TrackerSetup {
  const isResuming = options.resumeCheckpointState !== undefined
  const candidateIndex = buildCandidateIndex(orderedDomains)

  const tracker = isResuming
    ? restoreResumableTopNTracker(
        options.resumeCheckpointState!.trackerSnapshot,
        candidateIndex,
        options.compareEvaluations
      )
    : createResumableTopNTracker(
        options.problem.topN,
        options.compareEvaluations
      )

  const resumeFlatIndex = isResuming
    ? options.resumeCheckpointState!.cursorPosition.flatIndex
    : 0
  const processedCombinationCount = isResuming
    ? options.resumeCheckpointState!.visitedCombinationCount
    : 0

  const pruningStats =
    isResuming && options.resumeCheckpointState!.pruningStatistics
      ? restorePruningStatistics(
          options.resumeCheckpointState!.pruningStatistics
        )
      : createPruningStatistics()

  const restoredPruneCertificateIds = isResuming
    ? (options.resumeCheckpointState!.pruneCertificateIds ?? [])
    : []

  const restoredBranchReachabilityCertificateIds = isResuming
    ? (options.resumeCheckpointState!.branchReachabilityCertificateIds ?? [])
    : []

  const restoredDominanceCertificateIds = isResuming
    ? (options.resumeCheckpointState!.dominanceCertificateIds ?? [])
    : []

  return {
    tracker,
    resumeFlatIndex,
    processedCombinationCount,
    pruningStats,
    restoredPruneCertificateIds,
    restoredBranchReachabilityCertificateIds,
    restoredDominanceCertificateIds,
  }
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

async function completeSolve(
  options: LapicBoundedExactSolveOptions,
  tracker: ReturnType<typeof createResumableTopNTracker>,
  frontierBlockIds: readonly string[],
  pruneCertificateIds: readonly string[] = [],
  branchReachabilityCertificateIds: readonly string[] = [],
  dominanceCertificateIds: readonly string[] = []
): Promise<LapicSolveCompletionResult> {
  options.controller.activate('resolve-residual')
  options.controller.publishProgress({
    phase: 'resolve-residual',
    completedUnits: 1,
    totalUnits: 1,
  })

  if (tracker.isEmpty()) {
    const infeasibilityCertificate = createInfeasibilityCertificate(
      options,
      frontierBlockIds
    )
    await persistArtifact(
      options,
      'certificate',
      infeasibilityCertificate.certId,
      infeasibilityCertificate.evidenceDigest,
      infeasibilityCertificate,
      frontierBlockIds
    )
    options.controller.emitCertificate(infeasibilityCertificate)
    return options.controller.complete()
  }

  const winners = tracker.results()
  const finalCertificate = createFinalOptimalityCertificate(
    options,
    winners,
    frontierBlockIds,
    pruneCertificateIds,
    branchReachabilityCertificateIds,
    dominanceCertificateIds
  )
  const finalOptimality = createLapicFinalOptimalitySummary(finalCertificate)
  if (!finalOptimality.ok)
    return failSolve(
      options,
      finalOptimality.diagnostics[0]?.message ??
        'Failed to summarize final optimality certificate.',
      finalOptimality.diagnostics
    )

  await persistArtifact(
    options,
    'certificate',
    finalCertificate.certId,
    finalCertificate.evidenceDigest,
    finalCertificate,
    frontierBlockIds
  )
  options.controller.emitCertificate(finalCertificate)
  return options.controller.complete(finalOptimality.value, winners)
}

// ---------------------------------------------------------------------------
// Main solver
// ---------------------------------------------------------------------------

export async function executeLapicBoundedExactSolve(
  options: LapicBoundedExactSolveOptions
): Promise<LapicBoundedExactSolveOutcome> {
  try {
    const orderedDomains = sortDomains(options.problem)
    const orderedCandidates = orderedDomains.map((domain) => domain.candidates)
    const validation = validateSolveOptions(options, orderedCandidates)
    if (!validation.ok)
      return failSolve(
        options,
        validation.diagnostics[0]?.message ?? 'Invalid bounded solve options.',
        validation.diagnostics
      )

    const isResuming = options.resumeCheckpointState !== undefined
    const hasPrebuiltContext = options.prebuiltJoinContext !== undefined

    options.controller.publishTrace(
      'InitSession',
      `solve:${options.problem.problemDigest}`
    )

    // --- Frontier setup ---
    let frontierBlockIds: string[]
    let joinPlan: ReturnType<typeof createFrontierJoinPlan>

    if (hasPrebuiltContext) {
      // Partition-scoped path: use pre-built join plan and frontier block IDs.
      // Skip frontier construction and join-plan creation entirely.
      const ctx = options.prebuiltJoinContext as LapicPrebuiltJoinContext
      frontierBlockIds = [...ctx.frontierBlockIds]
      joinPlan = createLapicSuccessResult(ctx.joinPlan)
    } else {
      const frontierSetup = isResuming
        ? await rebuildFrontierForResume(
            options,
            orderedDomains,
            validation.value
          )
        : await buildFrontierFromScratch(options, orderedDomains)

      frontierBlockIds = frontierSetup.frontierBlockIds

      joinPlan = createFrontierJoinPlan(
        options.problem,
        orderedDomains,
        frontierSetup.frontierBlocks,
        frontierSetup.frontierIndex
      )
    }
    if (!joinPlan.ok)
      return failSolve(
        options,
        joinPlan.diagnostics[0]?.message ??
          'Failed to build bounded frontier join plan from frontier-index summaries.',
        joinPlan.diagnostics
      )

    // The effective combination count comes from the join plan when using
    // a prebuilt context (partition), or from domain-level validation otherwise.
    const totalCombinationCount = hasPrebuiltContext
      ? joinPlan.value.totalCombinationCount
      : validation.value

    // Cardinality cross-check: only meaningful when the executor built
    // the join plan itself (not when using a partitioned prebuilt plan).
    if (
      !hasPrebuiltContext &&
      joinPlan.value.totalCombinationCount !== totalCombinationCount
    )
      return failSolve(
        options,
        'Frontier-index join plan cardinality diverged from the bounded domain cardinality.',
        [
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'Frontier-index join plan cardinality diverged from the bounded domain cardinality.',
            ['frontierIndex', 'exactSignatureGroups']
          ),
        ]
      )

    options.controller.activate('join')

    // --- Tracker setup ---
    const {
      tracker,
      resumeFlatIndex,
      processedCombinationCount: initialProcessed,
      pruningStats,
      restoredPruneCertificateIds,
      restoredBranchReachabilityCertificateIds,
      restoredDominanceCertificateIds,
    } = setupTracker(options, orderedDomains)

    let processedCombinationCount = initialProcessed
    let currentFlatIndex = 0
    let pauseDetected = false
    let pruneCertStepCounter = restoredPruneCertificateIds.length
    let dominanceCertStepCounter = restoredDominanceCertificateIds.length
    const pruneCertificateIds: string[] = [...restoredPruneCertificateIds]
    const branchReachabilityCertificateIds: string[] = [
      ...restoredBranchReachabilityCertificateIds,
    ]
    const dominanceCertificateIds: string[] = [
      ...restoredDominanceCertificateIds,
    ]

    // --- A-IR branch reachability inference (pre-solve static analysis) ---
    if (
      options.firGraph &&
      !isResuming &&
      !options.skipIntermediateCertificates
    ) {
      const airGraph = analyzeLapicFirGraph(options.firGraph)
      const forcedBranches = inferForcedBranches(airGraph)
      for (let i = 0; i < forcedBranches.length; i++) {
        const evidence = forcedBranches[i]!
        const branchCert = createBranchReachabilityCertificate(options, {
          branchNodeId: evidence.branchNodeId,
          guardNodeId: evidence.guardNodeId,
          forcedArm: evidence.forcedArm,
          ...(evidence.guardLower !== undefined
            ? { guardLower: evidence.guardLower }
            : {}),
          ...(evidence.guardUpper !== undefined
            ? { guardUpper: evidence.guardUpper }
            : {}),
          validityRegionId: evidence.parentRegionId,
          stepIndex: i + 1,
        })
        await persistArtifact(
          options,
          'certificate',
          branchCert.certId,
          branchCert.evidenceDigest,
          branchCert,
          frontierBlockIds
        )
        options.controller.emitCertificate(branchCert)
        branchReachabilityCertificateIds.push(branchCert.certId)
      }
    }

    // Build a comparator for bound-vs-threshold checks.
    const explicitComparator = options.compareEvaluations
    const isBoundBelowThreshold = (
      boundValue: string,
      thresholdValue: string
    ): boolean => {
      const boundEval: LapicBoundedExactCombinationEvaluation = {
        objectiveValue: boundValue,
        evidenceDigest: 'bound-check',
        orderingKey: [boundValue],
      }
      const thresholdEval: LapicBoundedExactCombinationEvaluation = {
        objectiveValue: thresholdValue,
        evidenceDigest: 'threshold-check',
        orderingKey: [thresholdValue],
      }
      const relation = compareEvaluations(
        boundEval,
        'bound',
        thresholdEval,
        'threshold',
        explicitComparator
      )
      return relation < 0
    }

    // -----------------------------------------------------------------------
    // Deferred persistence queue — certificates are created synchronously
    // at decision time (architecture §2.1), but serialization + I/O is
    // batched at safe-point boundaries for performance.
    // -----------------------------------------------------------------------
    const pendingPersistence: Array<() => Promise<void>> = []

    /**
     * Commit a bound-prune: skip the subtree, emit BoundPruneCert.
     * Certificate is created synchronously; persistence is deferred.
     */
    const commitPrune = (
      boundValue: string,
      boundEvidenceDigest: string,
      thresholdValue: string,
      domainIndex: number,
      detection?: LapicDangerZoneDetectionResult
    ): void => {
      const subtreeSize = computeSubtreeSize(joinPlan.value, domainIndex)
      currentFlatIndex += subtreeSize
      pruningStats.prunedCombinationCount += subtreeSize
      pruningStats.prunedSubtreeCount += 1

      // Report progress after pruning (large subtrees can skip millions)
      options.controller.publishProgress({
        phase: 'join',
        completedUnits:
          processedCombinationCount + pruningStats.prunedCombinationCount,
        totalUnits: totalCombinationCount,
        skippedUnits: pruningStats.prunedCombinationCount,
      })

      if (!options.skipIntermediateCertificates) {
        pruneCertStepCounter += 1
        const dangerZoneRecord = detection
          ? buildDangerZoneRecord(detection, false)
          : undefined
        const pruneCert = createBoundPruneCertificate(options, {
          boundValue,
          boundEvidenceDigest,
          thresholdValue,
          domainIndex,
          stepIndex: pruneCertStepCounter,
          frontierBlockIds,
          ...(dangerZoneRecord !== undefined ? { dangerZoneRecord } : {}),
        })
        pendingPersistence.push(async () => {
          await persistArtifact(
            options,
            'certificate',
            pruneCert.certId,
            pruneCert.evidenceDigest,
            pruneCert,
            frontierBlockIds
          )
        })
        options.controller.emitCertificate(pruneCert)
        pruneCertificateIds.push(pruneCert.certId)
      }
    }

    // -----------------------------------------------------------------------
    // Synchronous hot loop — the performance-critical inner enumeration.
    //
    // Key optimizations over the async predecessor:
    // 1. Fully synchronous recursion (no Promise allocation per node)
    // 2. Mutable candidate buffer (no array spread per recursion)
    // 3. Batched progress reporting (every SAFE_POINT_INTERVAL builds)
    // 4. Deferred certificate persistence (sync creation, async flush)
    // 5. No per-build session state inspection
    // -----------------------------------------------------------------------

    const SAFE_POINT_INTERVAL = 1 << 16 // 65536 builds between safe points
    const domainCount = joinPlan.value.entries.length
    const candidateBuffer: LapicCandidateDescriptor[] = new Array(domainCount)
    // Pre-compute the signature group key once (used for dominance certs)
    const signatureGroupKey = orderedDomains.map((d) => d.slotId).join('+')
    // Track failed evaluations to propagate after sync loop
    let failedSolveError: {
      message: string
      diagnostics: readonly LapicDiagnostic[]
    } | null = null

    const visitCombination = (domainIndex: number): void => {
      if (pauseDetected || failedSolveError) return

      if (domainIndex >= domainCount) {
        const thisFlatIndex = currentFlatIndex
        currentFlatIndex += 1

        // On resume, skip combinations that were already processed.
        if (thisFlatIndex < resumeFlatIndex) return

        processedCombinationCount += 1

        // Batched progress: report every SAFE_POINT_INTERVAL builds
        if (processedCombinationCount % SAFE_POINT_INTERVAL === 0) {
          options.controller.publishProgress({
            phase: 'join',
            completedUnits:
              processedCombinationCount + pruningStats.prunedCombinationCount,
            totalUnits: totalCombinationCount,
            skippedUnits: pruningStats.prunedCombinationCount,
          })

          // Cooperative pause: check at safe-point boundaries
          if (options.controller.isPauseRequested()) {
            pauseDetected = true
            return
          }
        }

        // Build a readonly view of the current buffer for evaluation
        const candidates = candidateBuffer.slice(
          0,
          domainCount
        ) as readonly LapicCandidateDescriptor[]

        if (hasExclusiveResourceConflict(candidates)) return

        const combination: LapicBoundedExactCandidateCombination = {
          problem: options.problem,
          candidates,
        }

        if (options.isCombinationFeasible) {
          const feasibility = normalizeFeasibilityResult(
            options.isCombinationFeasible(combination)
          )
          if (!feasibility.ok) {
            failedSolveError = {
              message:
                feasibility.diagnostics[0]?.message ??
                'Failed to evaluate bounded solve feasibility.',
              diagnostics: feasibility.diagnostics,
            }
            return
          }
          if (!feasibility.value) return
        }

        const evaluation = options.evaluateCombination(combination)
        if (!evaluation.ok) {
          failedSolveError = {
            message:
              evaluation.diagnostics[0]?.message ??
              'Failed to evaluate bounded solve combination.',
            diagnostics: evaluation.diagnostics,
          }
          return
        }

        const stateId = createCombinationStateId(options.problem, candidates)
        const insertResult = tracker.insertWithEviction({
          stateId,
          candidates: [...candidates],
          evaluation: evaluation.value,
        })

        // Emit DominanceCert when a candidate is evicted from the top-N tracker.
        if (
          insertResult.evicted &&
          !insertResult.insertedWasEvicted &&
          !options.skipIntermediateCertificates
        ) {
          dominanceCertStepCounter += 1
          const dominanceCert = createDominanceCertificate(options, {
            dominatingStateId: stateId,
            dominatedStateId: insertResult.evicted.stateId,
            dominatingEvidenceDigest: evaluation.value.evidenceDigest,
            dominatedEvidenceDigest:
              insertResult.evicted.evaluation.evidenceDigest,
            signatureGroupKey,
            stepIndex: dominanceCertStepCounter,
            frontierBlockIds,
          })
          pendingPersistence.push(async () => {
            await persistArtifact(
              options,
              'certificate',
              dominanceCert.certId,
              dominanceCert.evidenceDigest,
              dominanceCert,
              frontierBlockIds
            )
          })
          options.controller.emitCertificate(dominanceCert)
          dominanceCertificateIds.push(dominanceCert.certId)
        }

        return
      }

      // --- Branch-and-bound pruning at intermediate recursion levels ---
      const effectiveThreshold =
        tracker.currentThreshold() ?? options.initialIncumbentThreshold
      if (
        options.computeUpperBound &&
        effectiveThreshold !== undefined &&
        domainIndex > 0
      ) {
        pruningStats.boundEvaluationCount += 1
        const bound = options.computeUpperBound({
          problem: options.problem,
          assignedCandidates: candidateBuffer.slice(
            0,
            domainIndex
          ) as readonly LapicCandidateDescriptor[],
          assignedDomainCount: domainIndex,
          totalDomainCount: domainCount,
        })
        if (
          bound !== undefined &&
          isBoundBelowThreshold(bound.upperBoundValue, effectiveThreshold)
        ) {
          if (options.dangerZoneConfig) {
            const detection = detectBoundPruneDangerZone(
              bound.upperBoundValue,
              effectiveThreshold,
              options.dangerZoneConfig
            )
            if (detection.triggered) {
              pruningStats.dangerZoneDeclinedCount += 1
            } else {
              commitPrune(
                bound.upperBoundValue,
                bound.evidenceDigest,
                effectiveThreshold,
                domainIndex,
                detection
              )
              return
            }
          } else {
            commitPrune(
              bound.upperBoundValue,
              bound.evidenceDigest,
              effectiveThreshold,
              domainIndex
            )
            return
          }
        }
      }

      for (const plannedRow of joinPlan.value.entries[domainIndex]!.rows) {
        if (pauseDetected || failedSolveError) return
        candidateBuffer[domainIndex] = plannedRow.candidate
        visitCombination(domainIndex + 1)
      }
    }

    // -----------------------------------------------------------------------
    // Run the synchronous enumeration. The entire recursion tree is
    // traversed in a single call. Persistence is deferred to a queue
    // and flushed after completion. Cancel is handled by Worker
    // termination from the main thread.
    // -----------------------------------------------------------------------
    visitCombination(0)

    // Propagate fatal evaluation errors before flushing
    if (failedSolveError) {
      const err = failedSolveError as {
        message: string
        diagnostics: readonly LapicDiagnostic[]
      }
      return failSolve(options, err.message, err.diagnostics)
    }

    // Flush all deferred persistence
    if (pendingPersistence.length > 0) {
      await Promise.all(pendingPersistence.map((fn) => fn()))
      pendingPersistence.length = 0
    }

    // Final progress update
    options.controller.publishProgress({
      phase: 'join',
      completedUnits:
        processedCombinationCount + pruningStats.prunedCombinationCount,
      totalUnits: totalCombinationCount,
      skippedUnits: pruningStats.prunedCombinationCount,
    })

    // Detect pause requested during (or after) the sync hot loop.
    if (!pauseDetected && options.controller.isPauseRequested()) {
      pauseDetected = true
    }

    // If a pause was requested during the join phase, persist checkpoint and return.
    if (pauseDetected) {
      options.controller.reachPauseSafePoint()
      const checkpointState = createLapicSolveCheckpointState(
        options.problem.problemDigest,
        processedCombinationCount,
        totalCombinationCount,
        tracker.snapshot(),
        createLapicSolveCursorPosition(currentFlatIndex),
        frontierBlockIds,
        snapshotPruningStatistics(pruningStats),
        pruneCertificateIds,
        branchReachabilityCertificateIds,
        dominanceCertificateIds
      )
      const checkpointContentHash = `solve-checkpoint:${options.problem.problemDigest}:${currentFlatIndex}`
      await persistArtifact(
        options,
        'solve-checkpoint',
        checkpointContentHash,
        `payload:${checkpointContentHash}`,
        checkpointState,
        [options.problem.problemDigest, ...frontierBlockIds]
      )
      return { paused: true, checkpointState }
    }

    return completeSolve(
      options,
      tracker,
      frontierBlockIds,
      pruneCertificateIds,
      branchReachabilityCertificateIds,
      dominanceCertificateIds
    )
  } catch (error) {
    if (error instanceof LapicSessionFailureError) throw error
    const message =
      error instanceof Error ? error.message : 'Unknown bounded solve failure.'
    return failSolve(options, message, [
      createLapicDiagnostic('error', 'InternalBugDetected', message),
    ])
  }
}
