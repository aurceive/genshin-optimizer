import type { ICachedArtifact } from '@genshin-optimizer/gi/db'
import type { OptNode } from '@genshin-optimizer/gi/wr'
import type {
  LapicAggregateCountFact,
  LapicDigest,
} from '@genshin-optimizer/lapic/core'

export function createGiOptNodeDigest(node: OptNode): LapicDigest {
  const operands = 'operands' in node ? node.operands : []
  const operandDigest = operands
    .map((operand) => createGiOptNodeDigest(operand as OptNode))
    .join(',')

  const localPayloadEntries = Object.entries(
    node as unknown as Record<string, unknown>
  )
    .filter(([key]) => key !== 'operands')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      )
        return `${key}=${String(value)}`

      if (value === null) return `${key}=null`
      if (value === undefined) return `${key}=undefined`
      if (Array.isArray(value))
        return `${key}=[${value.map((entry) => String(entry)).join(',')}]`

      return `${key}=[object]`
    })
    .join(';')

  if ('operation' in node)
    return `gi-opt-node:${node.operation}:${localPayloadEntries}:${operands.length}:${operandDigest}`

  return `gi-opt-node:unknown:${localPayloadEntries}:${operands.length}:${operandDigest}`
}

export function createGiArtifactFeatureDigest(
  artifact: ICachedArtifact
): LapicDigest {
  return [
    artifact.id,
    artifact.slotKey,
    artifact.setKey,
    artifact.mainStatKey,
    String(artifact.level),
    String(artifact.rarity),
  ].join('|')
}

export function createGiArtifactCategoricalSignatureDigest(
  artifact: ICachedArtifact
): LapicDigest {
  return [artifact.slotKey, artifact.setKey, artifact.mainStatKey].join('|')
}

export function createGiArtifactCounterFacts(
  artifact: ICachedArtifact
): readonly LapicAggregateCountFact[] {
  return [
    {
      counterId: `gi:artifact-level:${artifact.slotKey}`,
      value: artifact.level,
    },
    {
      counterId: `gi:artifact-rarity:${artifact.slotKey}`,
      value: artifact.rarity,
    },
  ]
}
