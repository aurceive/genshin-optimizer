import type {
  LapicCanonicalProblem,
  LapicProblemNormalizationInput,
  LapicValidationResult,
} from '@genshin-optimizer/lapic/core'
import { createGiLapicAdapterMetadata, uniqueStrings } from './metadata'
import { createGiLapicAuxiliaryOutputs, createGiLapicCandidateDomains } from './projection'
import type {
  GiLapicAdapterRequest,
  GiLapicCanonicalExport,
  GiLapicCanonicalExportFromRequestInput,
  GiLapicCanonicalExportInput,
  GiLapicCanonicalIdentity,
} from './types'
import { giLapicAdapterCapabilities, giLapicAdapterSchemaVersion } from './types'
import { giAdapterFailure, normalizeGiLapicAdapterRequest } from './validation'

export function createGiLapicCanonicalIdentity(
  input: GiLapicCanonicalIdentity
): GiLapicCanonicalIdentity {
  return {
    problemId: input.problemId,
    problemDigest: input.problemDigest,
    engineVersion: input.engineVersion,
    arithmeticPolicyId: input.arithmeticPolicyId,
  }
}

export function createGiLapicAdapterRequest(
  input: GiLapicAdapterRequest
): GiLapicAdapterRequest {
  return {
    adapterKind: input.adapterKind,
    normalizationInput: input.normalizationInput,
    giContext: input.giContext,
    requestedPotentialSolveModes: input.requestedPotentialSolveModes
      ? [...input.requestedPotentialSolveModes]
      : undefined,
  }
}

export function createGiLapicProblemNormalizationInput(
  request: GiLapicAdapterRequest
): LapicValidationResult<LapicProblemNormalizationInput> {
  const normalizedRequest = normalizeGiLapicAdapterRequest(request)
  if (!normalizedRequest.ok) return normalizedRequest

  if (!normalizedRequest.value.giContext)
    return {
      ok: true,
      value: normalizedRequest.value.normalizationInput,
      diagnostics: normalizedRequest.diagnostics,
    }

  const itemDomains = createGiLapicCandidateDomains(normalizedRequest.value.giContext)

  return {
    ok: true,
    value: {
      ...normalizedRequest.value.normalizationInput,
      itemDomains,
      auxiliaryOutputs: createGiLapicAuxiliaryOutputs(normalizedRequest.value),
      adapterMetadata: createGiLapicAdapterMetadata(normalizedRequest.value),
    },
    diagnostics: normalizedRequest.diagnostics,
  }
}

export function buildGiLapicCanonicalExport(
  input: GiLapicCanonicalExportInput
): LapicValidationResult<GiLapicCanonicalExport> {
  if (!input.sourceSnapshotDigest)
    return giAdapterFailure(
      'GI lapic canonical export requires an explicit source snapshot digest.',
      ['sourceSnapshotDigest']
    )

  if (!input.problem.adapterMetadata.adapterKind.startsWith('gi'))
    return giAdapterFailure(
      'GI lapic canonical export requires a GI-scoped canonical problem.',
      ['problem', 'adapterMetadata', 'adapterKind'],
      { adapterKind: input.problem.adapterMetadata.adapterKind }
    )

  return {
    ok: true,
    value: {
      adapterKind: 'gi',
      problem: input.problem,
      canonicalProblemDigest: input.problem.problemDigest,
      adapterVersion: giLapicAdapterSchemaVersion,
      sourceSnapshotDigest: input.sourceSnapshotDigest,
      sourceSnapshotDigestSet: input.problem.adapterMetadata.sourceSnapshotDigests,
      formulaCompilationMode:
        input.problem.adapterMetadata.metadata.formulaCompilationMode ??
        giLapicAdapterCapabilities.supportedFormulaCompilationModes[0],
      featureSchemaVersion: giLapicAdapterSchemaVersion,
      filterTransformationLog: uniqueStrings(
        (input.problem.adapterMetadata.metadata.filterTransformationLog ?? '')
          .split(',')
          .filter(Boolean)
      ),
      unsupportedFeatureList: uniqueStrings(
        input.problem.adapterMetadata.declaredUnsupportedFeatures
      ),
      replayReconstructionHints: uniqueStrings(
        (input.problem.adapterMetadata.metadata.replayReconstructionHints ?? '')
          .split(',')
          .filter(Boolean)
      ),
      supportedGraphOutputModes:
        giLapicAdapterCapabilities.supportedGraphOutputKinds,
      potentialSolveMode: input.problem.potentialConfiguration?.solveMode,
      potentialParticipationMode:
        input.problem.potentialConfiguration?.participationMode,
      upgradeFrontierDescriptorSet:
        input.problem.potentialConfiguration?.upgradeFrontiers,
      potentialSummarySchemaVersion: input.problem.potentialConfiguration
        ? giLapicAdapterSchemaVersion
        : undefined,
    },
    diagnostics: [],
  }
}

export function createGiLapicCanonicalProblem(
  normalizationInput: LapicProblemNormalizationInput,
  canonicalIdentity: GiLapicCanonicalIdentity
): LapicCanonicalProblem {
  return {
    problemId: canonicalIdentity.problemId,
    problemDigest: canonicalIdentity.problemDigest,
    engineVersion: canonicalIdentity.engineVersion,
    arithmeticPolicyId: canonicalIdentity.arithmeticPolicyId,
    teamLayout: normalizationInput.teamLayout,
    slotDescriptors: normalizationInput.slotDescriptors,
    sharedTeamContext: normalizationInput.sharedTeamContext,
    frameAxis: normalizationInput.frameAxis ?? [],
    itemDomains: normalizationInput.itemDomains,
    compatibilityRules: normalizationInput.compatibilityRules,
    objective: normalizationInput.objective,
    constraints: normalizationInput.constraints,
    topN: normalizationInput.topN,
    orderingPolicy: normalizationInput.orderingPolicy,
    potentialConfiguration: normalizationInput.potentialConfiguration,
    auxiliaryOutputs: normalizationInput.auxiliaryOutputs ?? [],
    adapterMetadata: normalizationInput.adapterMetadata,
    provenance: normalizationInput.provenance,
  }
}

export function buildGiLapicCanonicalExportFromRequest(
  input: GiLapicCanonicalExportFromRequestInput
): LapicValidationResult<GiLapicCanonicalExport> {
  const normalizedInput = createGiLapicProblemNormalizationInput(input.request)
  if (!normalizedInput.ok) return normalizedInput

  const sourceSnapshotDigest =
    input.sourceSnapshotDigest ??
    input.request.giContext?.sourceSnapshots.artifactSnapshotDigest

  if (!sourceSnapshotDigest)
    return giAdapterFailure(
      'GI lapic canonical export from request requires an explicit source snapshot digest or GI source snapshot context.',
      ['sourceSnapshotDigest']
    )

  if (!input.canonicalIdentity)
    return giAdapterFailure(
      'GI lapic canonical export from request requires explicit canonical identity fields for problem assembly.',
      ['canonicalIdentity']
    )

  return buildGiLapicCanonicalExport({
    problem: createGiLapicCanonicalProblem(
      normalizedInput.value,
      input.canonicalIdentity
    ),
    sourceSnapshotDigest,
  })
}
