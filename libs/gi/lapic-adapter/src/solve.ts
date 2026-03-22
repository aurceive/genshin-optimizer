import { executeLapicBoundedExactSolve } from '@genshin-optimizer/lapic/runtime'
import type { LapicBoundedExactCandidateCombination } from '@genshin-optimizer/lapic/runtime'
import {
  createLapicArtifactWriteRequest,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import { createGiLapicBuiltinBoundProvider } from './builtin-bound-provider'
import { buildGiLapicCanonicalExportFromRequest } from './canonical'
import { compileGiOptNodeToFir } from './compilation'
import type {
  GiLapicBoundedCurrentOnlySolveOptions,
  GiLapicBoundedCurrentOnlySolveResult,
  GiLapicCanonicalExport,
} from './types'

async function persistGiLapicCanonicalProblemArtifact(
  canonicalExport: GiLapicCanonicalExport,
  artifactStore: GiLapicBoundedCurrentOnlySolveOptions['artifactStore'],
  controller: GiLapicBoundedCurrentOnlySolveOptions['controller']
) {
  const serializedPayload = JSON.stringify(canonicalExport.problem)
  const commit = await artifactStore.write(
    createLapicArtifactWriteRequest(
      createLapicStorageEnvelope({
        artifactKind: 'canonical-problem',
        schemaVersion: '0.1.0-draft',
        payloadEncoding: 'json',
        payloadLength: serializedPayload.length,
        contentHash: canonicalExport.canonicalProblemDigest,
        checksum: {
          algorithm: 'sha256',
          checksum: canonicalExport.canonicalProblemDigest,
        },
        compressionCodec: 'none',
        creationEngineVersion: canonicalExport.problem.engineVersion,
        arithmeticPolicyId: canonicalExport.problem.arithmeticPolicyId,
        dependencyDigestSet: canonicalExport.sourceSnapshotDigestSet,
      }),
      canonicalExport.canonicalProblemDigest
    )
  )

  controller.publishArtifact(commit.artifactRef)
}

export async function executeGiLapicBoundedCurrentOnlySolve(
  options: GiLapicBoundedCurrentOnlySolveOptions
): Promise<GiLapicBoundedCurrentOnlySolveResult> {
  const canonicalExport = buildGiLapicCanonicalExportFromRequest({
    request: options.request,
    canonicalIdentity: options.canonicalIdentity,
  })

  if (!canonicalExport.ok)
    return options.controller
      .fail(
        'schemaCompatibilityFailure',
        canonicalExport.diagnostics[0]?.message ??
          'Failed to build GI canonical export for bounded current-only solve.',
        canonicalExport.diagnostics
      )
      .catch(() => {
        throw new Error(
          canonicalExport.diagnostics[0]?.message ??
            'Failed to build GI canonical export for bounded current-only solve.'
        )
      })

  await persistGiLapicCanonicalProblemArtifact(
    canonicalExport.value,
    options.artifactStore,
    options.controller
  )

  // Compile the optimization target OptNode to F-IR for static analysis.
  // This enables BranchReachabilityCert inference in the executor.
  // Compilation is best-effort: if the target is not available or compilation
  // fails, the solve proceeds without F-IR (no branch analysis).
  const optimizationTarget =
    options.request.giContext?.optimizationRequest.optimizationTarget
  const firCompilation = optimizationTarget
    ? compileGiOptNodeToFir(optimizationTarget)
    : undefined
  const firGraph = firCompilation?.ok ? firCompilation.result.graph : undefined

  // Auto-wire the FIR-bound provider when the caller supplies a variable
  // extractor but no explicit computeUpperBound. This combines the compiled
  // F-IR graph with domain variable maps to produce interval-based upper
  // bounds for branch-and-bound pruning.
  const computeUpperBound =
    options.computeUpperBound ??
    (firGraph && options.candidateVariableExtractor
      ? createGiLapicBuiltinBoundProvider({
          firGraph,
          canonicalExport: canonicalExport.value,
          extractVariables: options.candidateVariableExtractor,
        })
      : undefined)

  const outcome = await executeLapicBoundedExactSolve({
    problem: canonicalExport.value.problem,
    controller: options.controller,
    artifactStore: options.artifactStore,
    ...(firGraph !== undefined ? { firGraph } : {}),
    evaluateCombination(combination) {
      return options.evaluateCombination(combination, canonicalExport.value)
    },
    ...(options.compareEvaluations !== undefined
      ? { compareEvaluations: options.compareEvaluations }
      : {}),
    ...(options.isCombinationFeasible !== undefined
      ? {
          isCombinationFeasible: (combination: LapicBoundedExactCandidateCombination) =>
            options.isCombinationFeasible!(combination, canonicalExport.value),
        }
      : {}),
    ...(options.maxCombinationCount !== undefined
      ? { maxCombinationCount: options.maxCombinationCount }
      : {}),
    ...(computeUpperBound !== undefined ? { computeUpperBound } : {}),
  })

  if ('paused' in outcome)
    throw new Error(
      'Unexpected pause during GI bounded current-only solve (pause not requested).'
    )

  return {
    canonicalExport: canonicalExport.value,
    completion: outcome,
    ...(firGraph !== undefined ? { firGraph } : {}),
  }
}
