/**
 * Serializable transport format for F-IR bound data.
 *
 * Converts between the Map-based internal format used by the
 * bound provider and a plain-object format suitable for efficient
 * structured clone across MessagePort boundaries.
 *
 * Nested Maps are notoriously expensive to structured-clone
 * (each Map spawns a complex internal reference during the clone
 * algorithm). Plain arrays of tuples clone in linear time with
 * minimal overhead.
 */

import type { LapicFirVariableId } from '@genshin-optimizer/lapic/core'
import type { LapicFirDomainVariableMap } from './types'

// ---------------------------------------------------------------------------
// Serializable types
// ---------------------------------------------------------------------------

/**
 * Structured-clone-friendly representation of F-IR bound data.
 *
 * Sent once during worker initialization (not per-dispatch) so
 * remote workers can reconstruct a full `LapicFirBoundProvider`
 * with per-candidate precision — identical pruning quality to
 * the primary worker's in-process bound provider.
 */
export interface LapicFirSerializableBoundData {
  readonly domains: readonly LapicFirSerializableDomainEntry[]
  readonly globalConstants?: readonly [string, number][] | undefined
}

interface LapicFirSerializableDomainEntry {
  readonly domainId: string
  readonly candidates: readonly LapicFirSerializableCandidateEntry[]
}

interface LapicFirSerializableCandidateEntry {
  readonly id: string
  readonly vars: readonly [string, number][]
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serialize domain variable maps and global constants into a
 * structured-clone-friendly format.
 *
 * Converts `ReadonlyMap<string, ReadonlyMap<…>>` nesting into
 * flat arrays of `[key, value]` tuples.  The resulting object
 * contains only strings, numbers, and plain arrays — all of
 * which structured-clone handles in O(n) time.
 */
export function serializeBoundData(
  domainVariableMaps: readonly LapicFirDomainVariableMap[],
  globalConstants?: ReadonlyMap<LapicFirVariableId, number>
): LapicFirSerializableBoundData {
  return {
    domains: domainVariableMaps.map((dvm) => ({
      domainId: dvm.domainId,
      candidates: Array.from(dvm.candidateVariables, ([id, vars]) => ({
        id,
        vars: Array.from(vars) as [string, number][],
      })),
    })),
    ...(globalConstants !== undefined
      ? { globalConstants: Array.from(globalConstants) as [string, number][] }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// Deserialization
// ---------------------------------------------------------------------------

/**
 * Reconstruct domain variable maps and global constants from
 * the serialized transport format.
 *
 * Rebuilds the `ReadonlyMap` nesting expected by
 * `createLapicFirBoundProvider`.
 */
export function deserializeBoundData(data: LapicFirSerializableBoundData): {
  domainVariableMaps: LapicFirDomainVariableMap[]
  globalConstants: ReadonlyMap<LapicFirVariableId, number> | undefined
} {
  return {
    domainVariableMaps: data.domains.map((d) => ({
      domainId: d.domainId,
      candidateVariables: new Map(
        d.candidates.map((c) => [c.id, new Map(c.vars)] as const)
      ),
    })),
    globalConstants:
      data.globalConstants !== undefined
        ? new Map(data.globalConstants)
        : undefined,
  }
}
