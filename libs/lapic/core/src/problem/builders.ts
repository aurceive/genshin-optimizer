import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '../diagnostics'
import type {
  LapicCanonicalProblem,
  LapicCanonicalProblemIdentity,
  LapicDiagnostic,
  LapicProblemNormalizationInput,
} from '../types'

export function createLapicCanonicalProblem(
  normalizationInput: LapicProblemNormalizationInput,
  identity: LapicCanonicalProblemIdentity
): LapicCanonicalProblem {
  return {
    problemId: identity.problemId,
    problemDigest: identity.problemDigest,
    engineVersion: identity.engineVersion,
    arithmeticPolicyId: identity.arithmeticPolicyId,
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
    ...(normalizationInput.potentialConfiguration !== undefined
      ? { potentialConfiguration: normalizationInput.potentialConfiguration }
      : {}),
    auxiliaryOutputs: normalizationInput.auxiliaryOutputs ?? [],
    adapterMetadata: normalizationInput.adapterMetadata,
    provenance: normalizationInput.provenance,
  }
}

export function validateLapicProblemNormalizationInput(
  normalizationInput: LapicProblemNormalizationInput
) {
  const diagnostics: LapicDiagnostic[] = []
  const slotIdSet = new Set(normalizationInput.teamLayout.slotIds)

  if (
    normalizationInput.teamLayout.slotCount !==
    normalizationInput.teamLayout.slotIds.length
  )
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'teamLayout.slotCount must match the number of declared slotIds.',
        ['teamLayout', 'slotCount'],
        {
          slotCount: normalizationInput.teamLayout.slotCount,
          slotIdsLength: normalizationInput.teamLayout.slotIds.length,
        }
      )
    )

  if (normalizationInput.topN < 1)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'topN must be at least 1.',
        ['topN'],
        { topN: normalizationInput.topN }
      )
    )

  if (!normalizationInput.adapterMetadata.sourceSnapshotDigests.length)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'adapterMetadata.sourceSnapshotDigests must not be empty.',
        ['adapterMetadata', 'sourceSnapshotDigests']
      )
    )

  normalizationInput.slotDescriptors.forEach((slotDescriptor, index) => {
    if (!slotIdSet.has(slotDescriptor.slotId))
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'slotDescriptors must reference only slotIds declared in teamLayout.',
          ['slotDescriptors', String(index), 'slotId'],
          { slotId: slotDescriptor.slotId }
        )
      )
  })

  normalizationInput.objective.targetSlotIds.forEach((slotId, index) => {
    if (!slotIdSet.has(slotId))
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'objective.targetSlotIds must reference declared slotIds.',
          ['objective', 'targetSlotIds', String(index)],
          { slotId }
        )
      )
  })

  normalizationInput.itemDomains.forEach((domain, domainIndex) => {
    if (!slotIdSet.has(domain.slotId))
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          'itemDomains must reference declared slotIds.',
          ['itemDomains', String(domainIndex), 'slotId'],
          { slotId: domain.slotId }
        )
      )

    domain.candidates.forEach((candidate, candidateIndex) => {
      if (candidate.slotId !== domain.slotId)
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'candidate slotId must match its parent domain slotId.',
            [
              'itemDomains',
              String(domainIndex),
              'candidates',
              String(candidateIndex),
              'slotId',
            ],
            {
              candidateSlotId: candidate.slotId,
              domainSlotId: domain.slotId,
            }
          )
        )

      if (candidate.domainId !== domain.domainId)
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'candidate domainId must match its parent domainId.',
            [
              'itemDomains',
              String(domainIndex),
              'candidates',
              String(candidateIndex),
              'domainId',
            ],
            {
              candidateDomainId: candidate.domainId,
              domainId: domain.domainId,
            }
          )
        )
    })
  })

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(normalizationInput)
}

export function validateLapicCanonicalProblem(problem: LapicCanonicalProblem) {
  const normalizationValidation = validateLapicProblemNormalizationInput({
    teamLayout: problem.teamLayout,
    slotDescriptors: problem.slotDescriptors,
    sharedTeamContext: problem.sharedTeamContext,
    frameAxis: problem.frameAxis,
    itemDomains: problem.itemDomains,
    compatibilityRules: problem.compatibilityRules,
    objective: problem.objective,
    constraints: problem.constraints,
    topN: problem.topN,
    orderingPolicy: problem.orderingPolicy,
    ...(problem.potentialConfiguration !== undefined
      ? { potentialConfiguration: problem.potentialConfiguration }
      : {}),
    auxiliaryOutputs: problem.auxiliaryOutputs,
    adapterMetadata: problem.adapterMetadata,
    provenance: problem.provenance,
  })

  if (!normalizationValidation.ok) return normalizationValidation

  const diagnostics: LapicDiagnostic[] = []

  if (!problem.problemId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'problemId must not be empty.',
        ['problemId']
      )
    )

  if (!problem.problemDigest)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'problemDigest must not be empty.',
        ['problemDigest']
      )
    )

  if (!problem.engineVersion)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'engineVersion must not be empty.',
        ['engineVersion']
      )
    )

  if (!problem.arithmeticPolicyId)
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'arithmeticPolicyId must not be empty.',
        ['arithmeticPolicyId']
      )
    )

  if (diagnostics.length) return createLapicFailureResult(diagnostics)

  return createLapicSuccessResult(problem)
}
