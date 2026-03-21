import { executeLapicBoundedExactSolve } from '@genshin-optimizer/lapic/runtime'
import {
  createLapicArtifactWriteRequest,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import { buildGiLapicCanonicalExportFromRequest } from './canonical'
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

  const outcome = await executeLapicBoundedExactSolve({
    problem: canonicalExport.value.problem,
    controller: options.controller,
    artifactStore: options.artifactStore,
    evaluateCombination(combination) {
      return options.evaluateCombination(combination, canonicalExport.value)
    },
    compareEvaluations: options.compareEvaluations,
    isCombinationFeasible: options.isCombinationFeasible
      ? (combination) =>
          options.isCombinationFeasible!(combination, canonicalExport.value)
      : undefined,
    maxCombinationCount: options.maxCombinationCount,
  })

  if ('paused' in outcome)
    throw new Error(
      'Unexpected pause during GI bounded current-only solve (pause not requested).'
    )

  return {
    canonicalExport: canonicalExport.value,
    completion: outcome,
  }
}
