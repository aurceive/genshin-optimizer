/**
 * F-IR graph builder with content-hash–based deduplication.
 *
 * Builds a canonical formula DAG.  Two sub-expressions with identical
 * structure always share the same node ID — this is the hash-consing
 * invariant required by canonical-ir.md.
 */

import type {
  LapicFirAffineTerm,
  LapicFirGraph,
  LapicFirNode,
  LapicFirNodeId,
  LapicFirPiecewiseAffineSegment,
  LapicFirVariableId,
} from './types'

// ---------------------------------------------------------------------------
// Content hashing
// ---------------------------------------------------------------------------

/**
 * Deterministic content hash for a node descriptor.
 * Uses a simple string-based hash; production could upgrade to SHA-256.
 */
function contentHash(descriptor: string): LapicFirNodeId {
  let h = 0x811c9dc5
  for (let i = 0; i < descriptor.length; i++) {
    h ^= descriptor.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `fir:${(h >>> 0).toString(16).padStart(8, '0')}`
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class LapicFirGraphBuilder {
  private readonly nodeMap = new Map<LapicFirNodeId, LapicFirNode>()
  private readonly variables = new Set<LapicFirVariableId>()

  // -- Leaf nodes -----------------------------------------------------------

  constant(value: number): LapicFirNodeId {
    const desc = `constant:${value}`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, { nodeId, operator: 'constant', value })
    }
    return nodeId
  }

  read(variableId: LapicFirVariableId): LapicFirNodeId {
    const desc = `read:${variableId}`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, { nodeId, operator: 'read', variableId })
    }
    this.variables.add(variableId)
    return nodeId
  }

  // -- Pure arithmetic ------------------------------------------------------

  add(...childIds: LapicFirNodeId[]): LapicFirNodeId {
    const sorted = [...childIds].sort()
    const desc = `add:[${sorted.join(',')}]`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, { nodeId, operator: 'add', childIds: sorted })
    }
    return nodeId
  }

  mul(...childIds: LapicFirNodeId[]): LapicFirNodeId {
    const sorted = [...childIds].sort()
    const desc = `mul:[${sorted.join(',')}]`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, { nodeId, operator: 'mul', childIds: sorted })
    }
    return nodeId
  }

  min(...childIds: LapicFirNodeId[]): LapicFirNodeId {
    const sorted = [...childIds].sort()
    const desc = `min:[${sorted.join(',')}]`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, { nodeId, operator: 'min', childIds: sorted })
    }
    return nodeId
  }

  max(...childIds: LapicFirNodeId[]): LapicFirNodeId {
    const sorted = [...childIds].sort()
    const desc = `max:[${sorted.join(',')}]`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, { nodeId, operator: 'max', childIds: sorted })
    }
    return nodeId
  }

  neg(childId: LapicFirNodeId): LapicFirNodeId {
    const desc = `neg:${childId}`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, { nodeId, operator: 'neg', childId })
    }
    return nodeId
  }

  affineForm(bias: number, terms: readonly LapicFirAffineTerm[]): LapicFirNodeId {
    const sortedTerms = [...terms].sort((a, b) => a.childId.localeCompare(b.childId))
    const termsDesc = sortedTerms.map((t) => `${t.coeff}*${t.childId}`).join('+')
    const desc = `affineForm:${bias}+[${termsDesc}]`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, {
        nodeId,
        operator: 'affineForm',
        bias,
        terms: sortedTerms,
      })
    }
    return nodeId
  }

  // -- Branching ------------------------------------------------------------

  thresholdSelect(
    guardId: LapicFirNodeId,
    threshold: number,
    thenId: LapicFirNodeId,
    elseId: LapicFirNodeId
  ): LapicFirNodeId {
    const desc = `thresholdSelect:${guardId},${threshold},${thenId},${elseId}`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, {
        nodeId,
        operator: 'thresholdSelect',
        guardId,
        threshold,
        thenId,
        elseId,
      })
    }
    return nodeId
  }

  // -- Game kernels ---------------------------------------------------------

  resistanceTransform(resId: LapicFirNodeId): LapicFirNodeId {
    const desc = `resistanceTransform:${resId}`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, { nodeId, operator: 'resistanceTransform', resId })
    }
    return nodeId
  }

  piecewiseAffineKernel(
    childId: LapicFirNodeId,
    segments: readonly LapicFirPiecewiseAffineSegment[]
  ): LapicFirNodeId {
    const segDesc = segments
      .map((s) => `${s.breakpoint}:${s.slope}:${s.intercept}`)
      .join(';')
    const desc = `piecewiseAffineKernel:${childId},[${segDesc}]`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, {
        nodeId,
        operator: 'piecewiseAffineKernel',
        childId,
        segments,
      })
    }
    return nodeId
  }

  bilinearKernel(leftId: LapicFirNodeId, rightId: LapicFirNodeId): LapicFirNodeId {
    const [a, b] = [leftId, rightId].sort()
    const desc = `bilinearKernel:${a},${b}`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, {
        nodeId,
        operator: 'bilinearKernel',
        leftId: a,
        rightId: b,
      })
    }
    return nodeId
  }

  multilinearKernel(...childIds: LapicFirNodeId[]): LapicFirNodeId {
    const sorted = [...childIds].sort()
    const desc = `multilinearKernel:[${sorted.join(',')}]`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, {
        nodeId,
        operator: 'multilinearKernel',
        childIds: sorted,
      })
    }
    return nodeId
  }

  saturatingKernel(childId: LapicFirNodeId, cap: number): LapicFirNodeId {
    const desc = `saturatingKernel:${childId},${cap}`
    const nodeId = contentHash(desc)
    if (!this.nodeMap.has(nodeId)) {
      this.nodeMap.set(nodeId, {
        nodeId,
        operator: 'saturatingKernel',
        childId,
        cap,
      })
    }
    return nodeId
  }

  // -- Build ----------------------------------------------------------------

  build(rootId: LapicFirNodeId): LapicFirGraph {
    if (!this.nodeMap.has(rootId)) {
      throw new Error(`Root node ${rootId} not found in graph`)
    }
    return {
      rootId,
      nodes: new Map(this.nodeMap),
      variableIds: new Set(this.variables),
    }
  }
}