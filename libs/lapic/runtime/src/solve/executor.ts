import { createLapicFinalOptimalitySummary } from '@genshin-optimizer/lapic/cert'
import {
  type LapicCandidateDescriptor,
  type LapicDiagnostic,
  createCombinationStateId,
  createLapicDiagnostic,
  createLapicSuccessResult,
  rerankByPotential,
} from '@genshin-optimizer/lapic/core'
import type { LapicFrontierBlock } from '@genshin-optimizer/lapic/storage'
import { LapicSessionFailureError } from '../session/completion'
import type { LapicSolveCompletionResult } from '../types'
import {
  createFinalOptimalityCertificate,
  createInfeasibilityCertificate,
} from './certificate'
import {
  createCertifyingDominanceObserver,
  createCertifyingObserverState,
  createCertifyingPruneObserver,
  emitBranchReachabilityCertificates,
} from './certifying-observers'
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
  detectBoundPruneDangerZone,
  type LapicDangerZoneDetectionResult,
} from './danger-zone'
import {
  createFrontierBlockForDomain,
  createFrontierIndexForSolve,
} from './frontier'
import { createFrontierJoinPlan } from './join-plan'
import { createNullObservers } from './observers'
import type {
  LapicDominanceObserver,
  LapicObserverState,
  LapicPruneObserver,
} from './observers'
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
  observerState: LapicObserverState
): Promise<LapicSolveCompletionResult> {
  options.controller.activate('resolve-residual')
  options.controller.publishProgress({
    phase: 'resolve-residual',
    completedUnits: 1,
    totalUnits: 1,
  })

  if (tracker.isEmpty()) {
    if (!options.skipIntermediateCertificates) {
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
    }
    return options.controller.complete()
  }

  const winners = tracker.results()

  // §4.3 potential-aware-rerank: primary solve by current-value,
  // then rerank the top-N entries using the potential evaluator.
  const finalWinners =
    options.potentialRerankEvaluator &&
    options.problem.potentialConfiguration?.solveMode ===
      'potential-aware-rerank'
      ? rerankByPotential(winners, options.potentialRerankEvaluator).reranked
      : winners

  if (!options.skipIntermediateCertificates) {
    const certIds = observerState.getCertificateIds()
    const finalCertificate = createFinalOptimalityCertificate(
      options,
      finalWinners,
      frontierBlockIds,
      certIds.pruneCertificateIds,
      certIds.branchReachabilityCertificateIds,
      certIds.dominanceCertificateIds
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
    return options.controller.complete(finalOptimality.value, finalWinners)
  }

  // Production mode: lightweight completion without certificate creation
  return options.controller.complete(undefined, finalWinners)
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

    // --- Observer pattern: production vs audit mode ---
    // Production (skipIntermediateCertificates=true): zero-overhead null observers.
    // Audit (skipIntermediateCertificates=false): certifying observers that
    // create certificates synchronously and defer persistence to a queue.
    let pruneObserver: LapicPruneObserver
    let dominanceObserver: LapicDominanceObserver
    let observerState: LapicObserverState

    if (options.skipIntermediateCertificates) {
      const nullObs = createNullObservers()
      pruneObserver = nullObs.pruneObserver
      dominanceObserver = nullObs.dominanceObserver
      observerState = nullObs.observerState
    } else {
      const certPrune = createCertifyingPruneObserver(
        options,
        frontierBlockIds,
        restoredPruneCertificateIds
      )
      const certDominance = createCertifyingDominanceObserver(
        options,
        frontierBlockIds,
        restoredDominanceCertificateIds
      )
      pruneObserver = certPrune
      dominanceObserver = certDominance

      // --- A-IR branch reachability inference (pre-solve static analysis) ---
      let branchIds: readonly string[] =
        restoredBranchReachabilityCertificateIds
      if (options.firGraph && !isResuming) {
        const branchResult = await emitBranchReachabilityCertificates(
          options,
          frontierBlockIds
        )
        branchIds = branchResult.branchReachabilityCertificateIds
      }

      observerState = createCertifyingObserverState(
        certPrune,
        certDominance,
        branchIds
      )
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

    /**
     * Commit a bound-prune: skip the subtree, notify observer.
     * In production mode, observer is a no-op. In audit mode,
     * observer creates BoundPruneCert and defers persistence.
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

      pruneObserver.onPrune({
        boundValue,
        boundEvidenceDigest,
        thresholdValue,
        domainIndex,
        dangerZoneDetection: detection,
      })
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
    // Incremental exclusive resource conflict tracking.  Each candidate's
    // resource claims are added to the set before recursion and removed
    // after, so conflicts are detected as soon as the conflicting
    // candidate is assigned — pruning entire subtrees early.
    const seenResourceClaims = new Set<string>()
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

          // Cross-partition incumbent sharing: adopt external threshold
          // if it improves our local pruning ability
          if (options.getExternalIncumbentThreshold) {
            const ext = options.getExternalIncumbentThreshold()
            if (ext !== undefined) {
              tracker.adoptExternalThreshold(ext)
            }
          }
        }

        // Build a readonly view of the current buffer for evaluation
        const candidates = candidateBuffer.slice(
          0,
          domainCount
        ) as readonly LapicCandidateDescriptor[]

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
        if (insertResult.evicted && !insertResult.insertedWasEvicted) {
          dominanceObserver.onEviction({
            dominatingStateId: stateId,
            dominatedStateId: insertResult.evicted.stateId,
            dominatingEvidenceDigest: evaluation.value.evidenceDigest,
            dominatedEvidenceDigest:
              insertResult.evicted.evaluation.evidenceDigest,
            signatureGroupKey,
          })
        }

        // Notify coordinated solve when the local threshold improves,
        // enabling other partitions to adopt it for tighter pruning.
        if (options.onIncumbentImproved && insertResult.evicted) {
          const threshold = tracker.currentThreshold()
          if (threshold !== undefined) {
            options.onIncumbentImproved(threshold)
          }
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
        const candidate = plannedRow.candidate
        const claims = candidate.provenance.exclusiveResourceClaims

        // Incremental conflict check: if this candidate shares a resource
        // with a previously assigned candidate, prune the entire subtree.
        let conflict = false
        for (const claim of claims) {
          const key = `${claim.resourceKind}|${claim.resourceId}`
          if (seenResourceClaims.has(key)) {
            conflict = true
            break
          }
        }
        if (conflict) continue

        // Add claims, recurse, then remove
        for (const claim of claims) {
          seenResourceClaims.add(`${claim.resourceKind}|${claim.resourceId}`)
        }
        candidateBuffer[domainIndex] = candidate
        visitCombination(domainIndex + 1)
        for (const claim of claims) {
          seenResourceClaims.delete(`${claim.resourceKind}|${claim.resourceId}`)
        }
      }
    }

    // -----------------------------------------------------------------------
    // Run the synchronous enumeration. The entire recursion tree is
    // traversed in a single call (or chunked with yields in cooperative
    // mode). Persistence is deferred to a queue and flushed after
    // completion. Cancel is handled by Worker termination from the main
    // thread.
    // -----------------------------------------------------------------------
    if (options.cooperativeYield && domainCount > 0) {
      // Cooperative yielding: split the top-level domain loop so that
      // the event loop can process incoming port messages (e.g. progress
      // from remote workers) between subtrees.  Each top-level candidate
      // subtree runs synchronously; a macrotask yield (setTimeout(0))
      // follows each subtree.
      const topLevelEntries = joinPlan.value.entries[0]!.rows
      for (const topRow of topLevelEntries) {
        if (pauseDetected || failedSolveError) break
        const candidate = topRow.candidate
        const claims = candidate.provenance.exclusiveResourceClaims
        for (const claim of claims) {
          seenResourceClaims.add(`${claim.resourceKind}|${claim.resourceId}`)
        }
        candidateBuffer[0] = candidate
        visitCombination(1)
        for (const claim of claims) {
          seenResourceClaims.delete(`${claim.resourceKind}|${claim.resourceId}`)
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    } else {
      visitCombination(0)
    }

    // Propagate fatal evaluation errors before flushing
    if (failedSolveError) {
      const err = failedSolveError as {
        message: string
        diagnostics: readonly LapicDiagnostic[]
      }
      return failSolve(options, err.message, err.diagnostics)
    }

    // Flush all deferred persistence (no-op in production mode)
    await observerState.flush()

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
      const certIds = observerState.getCertificateIds()
      const checkpointState = createLapicSolveCheckpointState(
        options.problem.problemDigest,
        processedCombinationCount,
        totalCombinationCount,
        tracker.snapshot(),
        createLapicSolveCursorPosition(currentFlatIndex),
        frontierBlockIds,
        snapshotPruningStatistics(pruningStats),
        certIds.pruneCertificateIds,
        certIds.branchReachabilityCertificateIds,
        certIds.dominanceCertificateIds
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

    return completeSolve(options, tracker, frontierBlockIds, observerState)
  } catch (error) {
    if (error instanceof LapicSessionFailureError) throw error
    const message =
      error instanceof Error ? error.message : 'Unknown bounded solve failure.'
    return failSolve(options, message, [
      createLapicDiagnostic('error', 'InternalBugDetected', message),
    ])
  }
}
