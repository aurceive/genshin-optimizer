import type {
  LapicAuxiliaryOutputDescriptor,
  LapicCandidateDescriptor,
  LapicCandidateDomain,
  LapicGraphAuxiliaryOutputDescriptor,
} from '@genshin-optimizer/lapic/core'
import {
  createGiArtifactCategoricalSignatureDigest,
  createGiArtifactCounterFacts,
  createGiArtifactFeatureDigest,
  createGiOptNodeDigest,
} from './digest'
import { createGiArtifactExclusiveResourceClaims } from './exclusivity'
import type { GiLapicAdapterContext, GiLapicAdapterRequest } from './types'

function shouldIncludeGiArtifact(
  artifact: GiLapicAdapterContext['inventorySnapshot']['artifacts'][number],
  context: GiLapicAdapterContext
): boolean {
  if (
    !context.optimizationRequest.useExcludedArts &&
    context.inventorySnapshot.excludedArtifactIds.includes(artifact.id)
  )
    return false

  if (
    !context.optimizationRequest.useTeammateBuild &&
    artifact.location &&
    context.inventorySnapshot.excludedLocations.includes(artifact.location)
  )
    return false

  return true
}

export function createGiLapicAuxiliaryOutputs(
  request: GiLapicAdapterRequest
): readonly LapicAuxiliaryOutputDescriptor[] {
  const baseOutputs = request.normalizationInput.auxiliaryOutputs ?? []
  const plotBase = request.giContext?.optimizationRequest.plotBase

  if (!plotBase) return baseOutputs

  const plotOutput: LapicGraphAuxiliaryOutputDescriptor = {
    kind: 'gi-plot-base',
    payloadDigest: createGiOptNodeDigest(plotBase),
    participatesInOrdering: false,
    xAxisKind: 'gi-plot-x',
    yAxisKind: 'gi-plot-y',
    graphExactness: 'exact',
  }

  return [...baseOutputs, plotOutput]
}

export function createGiLapicCandidateDescriptor(
  artifact: GiLapicAdapterContext['inventorySnapshot']['artifacts'][number]
): LapicCandidateDescriptor {
  return {
    candidateId: artifact.id,
    sourceRecordDigest: artifact.id,
    domainId: `gi:${artifact.slotKey}`,
    slotId: artifact.slotKey,
    additiveFeatureDigest: createGiArtifactFeatureDigest(artifact),
    discreteCounters: createGiArtifactCounterFacts(artifact),
    categoricalSignatureDigest:
      createGiArtifactCategoricalSignatureDigest(artifact),
    provenance: {
      slotId: artifact.slotKey,
      sourceEntityId: artifact.location || 'inventory',
      sourceRecordDigests: [artifact.id],
      exclusiveResourceClaims: createGiArtifactExclusiveResourceClaims(
        [artifact.id],
        artifact.slotKey
      ),
      concreteInventoryBacked: true,
      featureExtractionDigest: createGiArtifactFeatureDigest(artifact),
    },
  }
}

export function createGiLapicCandidateDomains(
  context: GiLapicAdapterContext
): readonly LapicCandidateDomain[] {
  const domainMap = new Map<string, LapicCandidateDescriptor[]>()

  context.inventorySnapshot.artifacts
    .filter((artifact) => shouldIncludeGiArtifact(artifact, context))
    .forEach((artifact) => {
      const domainId = `gi:${artifact.slotKey}`
      const candidates = domainMap.get(domainId) ?? []
      candidates.push(createGiLapicCandidateDescriptor(artifact))
      domainMap.set(domainId, candidates)
    })

  return Array.from(domainMap.entries()).map(([domainId, candidates]) => ({
    domainId,
    slotId: domainId.replace('gi:', ''),
    candidates,
  }))
}
