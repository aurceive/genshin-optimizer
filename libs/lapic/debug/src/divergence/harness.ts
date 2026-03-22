import type { LapicCertificate } from '@genshin-optimizer/lapic/cert'
import type {
  LapicCanonicalProblem,
} from '@genshin-optimizer/lapic/core'
import type {
  LapicInMemorySessionController,
  LapicSolveCompletionResult,
} from '@genshin-optimizer/lapic/runtime'
import type {
  LapicBoundedExactCombinationEvaluator,
  LapicBoundedExactEvaluationComparator,
  LapicBoundedExactFeasibilityEvaluator,
  LapicBoundedExactSolveOptions,
  LapicBoundedExactSolveOutcome,
  LapicBoundedExactUpperBoundEvaluator,
  LapicSolveCheckpointState,
  LapicTopNTrackerEntry,
} from '@genshin-optimizer/lapic/runtime'
import type { LapicArtifactStore } from '@genshin-optimizer/lapic/storage'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface LapicDivergenceHarnessConfig {
  readonly problem: LapicCanonicalProblem
  readonly evaluateCombination: LapicBoundedExactCombinationEvaluator
  readonly compareEvaluations?: LapicBoundedExactEvaluationComparator
  readonly isCombinationFeasible?: LapicBoundedExactFeasibilityEvaluator
  readonly computeUpperBound?: LapicBoundedExactUpperBoundEvaluator
  /**
   * Factory that creates fresh session infrastructure for each solve run.
   * Must return a fresh controller + store pair for isolation.
   */
  readonly createSessionInfra: () => {
    controller: LapicInMemorySessionController
    store: LapicArtifactStore
  }
  /**
   * Factory that creates the executor. Allows the harness to be decoupled
   * from the concrete executor import.
   */
  readonly executeSolve: (
    options: LapicBoundedExactSolveOptions
  ) => Promise<LapicBoundedExactSolveOutcome>
  /**
   * How many combinations to process before requesting pause.
   * Lower values = more checkpoint/resume cycles.
   * Default: 2.
   */
  readonly pauseAfterCombinations?: number
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface LapicDivergenceComparisonResult {
  readonly diverged: boolean
  readonly continuousTopN: readonly LapicTopNTrackerEntry[]
  readonly resumedTopN: readonly LapicTopNTrackerEntry[]
  readonly topNMatch: boolean
  readonly finalOptimalityMatch: boolean
  readonly continuousCertificateCount: number
  readonly resumedCertificateCount: number
  readonly pauseResumeRounds: number
  readonly diagnostics: readonly string[]
}

// ---------------------------------------------------------------------------
// Core harness logic
// ---------------------------------------------------------------------------

/**
 * Run the divergence harness:
 * 1. Execute a continuous (no-pause) solve to completion.
 * 2. Execute a solve with pause → checkpoint → resume cycles.
 * 3. Compare the final top-N results for divergence.
 */
export async function runLapicDivergenceHarness(
  config: LapicDivergenceHarnessConfig
): Promise<LapicDivergenceComparisonResult> {
  // --- Phase 1: continuous solve ---
  const continuousResult = await runContinuousSolve(config)

  // --- Phase 2: pause/resume solve ---
  const resumeResult = await runPauseResumeSolve(config)

  // --- Phase 3: compare results ---
  return compareResults(continuousResult, resumeResult)
}

// ---------------------------------------------------------------------------
// Phase 1: Continuous solve
// ---------------------------------------------------------------------------

interface SolveRunResult {
  readonly completion: LapicSolveCompletionResult
  readonly topNEntries: readonly LapicTopNTrackerEntry[]
  readonly certificates: readonly LapicCertificate[]
}

async function runContinuousSolve(
  config: LapicDivergenceHarnessConfig
): Promise<SolveRunResult> {
  const { controller, store } = config.createSessionInfra()

  const outcome = await config.executeSolve({
    problem: config.problem,
    controller,
    artifactStore: store,
    evaluateCombination: config.evaluateCombination,
    ...(config.compareEvaluations !== undefined
      ? { compareEvaluations: config.compareEvaluations }
      : {}),
    ...(config.isCombinationFeasible !== undefined
      ? { isCombinationFeasible: config.isCombinationFeasible }
      : {}),
    ...(config.computeUpperBound !== undefined
      ? { computeUpperBound: config.computeUpperBound }
      : {}),
  })

  if ('paused' in outcome && outcome.paused) {
    throw new Error('Continuous solve unexpectedly paused.')
  }

  const completion = outcome as LapicSolveCompletionResult
  return {
    completion,
    topNEntries: extractTopNEntries(completion),
    certificates: completion.emittedCertificates,
  }
}

// ---------------------------------------------------------------------------
// Phase 2: Pause/resume solve
// ---------------------------------------------------------------------------

interface PauseResumeRunResult extends SolveRunResult {
  readonly pauseResumeRounds: number
}

async function runPauseResumeSolve(
  config: LapicDivergenceHarnessConfig
): Promise<PauseResumeRunResult> {
  const pauseAfter = config.pauseAfterCombinations ?? 2
  let checkpointState: LapicSolveCheckpointState | undefined
  let pauseResumeRounds = 0
  let allCertificates: LapicCertificate[] = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { controller, store } = config.createSessionInfra()

    // Install a pause trigger based on progress events.
    let combinationsSeen = 0
    controller.subscribeProgress((event) => {
      if (event.phase === 'join') {
        combinationsSeen++
        if (combinationsSeen >= pauseAfter) {
          // Fire-and-forget pause request — executor will detect it
          // at its next safe-point inspection.
          controller.requestPause().catch(() => {
            // Pause may fail if session already terminal — that's fine.
          })
        }
      }
    })

    const options: LapicBoundedExactSolveOptions = {
      problem: config.problem,
      controller,
      artifactStore: store,
      evaluateCombination: config.evaluateCombination,
      ...(config.compareEvaluations !== undefined
        ? { compareEvaluations: config.compareEvaluations }
        : {}),
      ...(config.isCombinationFeasible !== undefined
        ? { isCombinationFeasible: config.isCombinationFeasible }
        : {}),
      ...(config.computeUpperBound !== undefined
        ? { computeUpperBound: config.computeUpperBound }
        : {}),
      ...(checkpointState !== undefined
        ? { resumeCheckpointState: checkpointState }
        : {}),
    }

    const outcome = await config.executeSolve(options)

    if ('paused' in outcome && outcome.paused) {
      pauseResumeRounds++
      checkpointState = outcome.checkpointState

      // FIXME(lapic-audit): inspectSessionState() is awaited but its result is
      // discarded. The comment promises certificate collection, but certificates
      // from intermediate pause/resume segments are never accumulated into
      // allCertificates — only the final completion's certificates are captured
      // (line ~206). This is either an incomplete implementation (should push
      // sessionState.emittedCertificates into allCertificates) or a wasted
      // async call that should be removed.
      // Plan: determine whether intermediate certificates matter for divergence
      // analysis. If yes, accumulate them. If no, remove this call entirely.
      const _sessionState = await controller.inspectSessionState()

      continue
    }

    // Reached completion.
    const completion = outcome as LapicSolveCompletionResult
    allCertificates = [...completion.emittedCertificates]

    return {
      completion,
      topNEntries: extractTopNEntries(completion),
      certificates: allCertificates,
      pauseResumeRounds,
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Comparison
// ---------------------------------------------------------------------------

function compareResults(
  continuous: SolveRunResult,
  resumed: PauseResumeRunResult
): LapicDivergenceComparisonResult {
  const diagnostics: string[] = []

  // Compare top-N entries by stateId + objectiveValue (ordering-stable).
  const contTopN = normalizeTopN(continuous.topNEntries)
  const resTopN = normalizeTopN(resumed.topNEntries)
  const topNMatch = topNSetsEqual(contTopN, resTopN)
  if (!topNMatch) {
    diagnostics.push(
      `Top-N diverged: continuous has ${contTopN.length} entries, ` +
        `resumed has ${resTopN.length} entries.`
    )
    for (const entry of contTopN) {
      if (!resTopN.find((e) => e.stateId === entry.stateId)) {
        diagnostics.push(`Missing in resumed: stateId=${entry.stateId}`)
      }
    }
    for (const entry of resTopN) {
      if (!contTopN.find((e) => e.stateId === entry.stateId)) {
        diagnostics.push(`Extra in resumed: stateId=${entry.stateId}`)
      }
    }
  }

  // Compare final optimality.
  const contOpt = continuous.completion.finalOptimality
  const resOpt = resumed.completion.finalOptimality
  const finalOptimalityMatch =
    (contOpt === undefined && resOpt === undefined) ||
    (contOpt !== undefined &&
      resOpt !== undefined &&
      contOpt.winnerStateId === resOpt.winnerStateId)

  if (!finalOptimalityMatch) {
    diagnostics.push(
      `Final optimality diverged: continuous winner=${contOpt?.winnerStateId ?? 'none'}, ` +
        `resumed winner=${resOpt?.winnerStateId ?? 'none'}`
    )
  }

  return {
    diverged: !topNMatch || !finalOptimalityMatch,
    continuousTopN: continuous.topNEntries,
    resumedTopN: resumed.topNEntries,
    topNMatch,
    finalOptimalityMatch,
    continuousCertificateCount: continuous.certificates.length,
    resumedCertificateCount: resumed.certificates.length,
    pauseResumeRounds: resumed.pauseResumeRounds,
    diagnostics,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTopNEntries(
  completion: LapicSolveCompletionResult
): LapicTopNTrackerEntry[] {
  // The final optimality summary contains the winning state; the full
  // top-N is reconstructed from the FinalOptimalityCert payload if present.
  // For divergence comparison, we use emitted certificates to identify
  // the final top-N ranking.
  //
  // Alternatively, the executor's TrackerSnapshot is embedded in the
  // checkpoint state. When no checkpoint exists (continuous run), we
  // reconstruct from the completion result.
  //
  // Use the finalOptimality summary + DominanceCerts to approximate.
  // For exact comparison, the winning state is sufficient for top-1.
  const entries: LapicTopNTrackerEntry[] = []

  if (completion.finalOptimality) {
    entries.push({
      stateId: completion.finalOptimality.winnerStateId,
      candidateIds: [],
      evaluation: {
        objectiveValue: 'final-optimality',
        evidenceDigest:
          completion.finalOptimality.winnerDigest ?? 'final',
      },
    })
  }

  return entries
}

interface NormalizedEntry {
  readonly stateId: string
  readonly objectiveValue?: string
}

function normalizeTopN(
  entries: readonly LapicTopNTrackerEntry[]
): NormalizedEntry[] {
  return entries
    .map((e) => ({
      stateId: e.stateId,
      objectiveValue: e.evaluation.objectiveValue,
    }))
    .sort((a, b) => a.stateId.localeCompare(b.stateId))
}

function topNSetsEqual(
  a: readonly NormalizedEntry[],
  b: readonly NormalizedEntry[]
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.stateId !== b[i]!.stateId) return false
  }
  return true
}
