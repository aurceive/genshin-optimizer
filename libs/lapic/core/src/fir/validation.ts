/**
 * F-IR graph validation.
 *
 * Checks structural invariants:
 * - Every referenced child ID exists in the graph
 * - The root node exists
 * - No cycles (the graph is a DAG)
 * - variableIds set matches actual Read nodes
 * - Operator-specific constraints (e.g. segments sorted, add ≥ 2 children)
 */

import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '../diagnostics'
import type { LapicDiagnostic, LapicValidationResult } from '../types'
import type { LapicFirGraph, LapicFirNode } from './types'
import { lapicFirNodeChildIds } from './types'

export function validateLapicFirGraph(
  graph: LapicFirGraph
): LapicValidationResult<LapicFirGraph> {
  const diagnostics: LapicDiagnostic[] = []

  // Root must exist
  if (!graph.nodes.has(graph.rootId)) {
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        `Root node ${graph.rootId} not found in graph`
      )
    )
    return createLapicFailureResult(diagnostics)
  }

  // Referential integrity: every child ID must exist, no self-references
  for (const [nodeId, node] of graph.nodes) {
    const children = lapicFirNodeChildIds(node)
    for (const childId of children) {
      if (childId === nodeId) {
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'InvariantViolation',
            `Node ${nodeId} references itself as a child`,
            ['nodes', nodeId]
          )
        )
      } else if (!graph.nodes.has(childId)) {
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            `Node ${nodeId} references missing child ${childId}`,
            ['nodes', nodeId]
          )
        )
      }
    }
  }

  // Operator-specific constraints
  for (const [nodeId, node] of graph.nodes) {
    const opDiags = validateOperatorConstraints(nodeId, node)
    diagnostics.push(...opDiags)
  }

  // Variable set accuracy: collect actual Read variables
  const actualVariables = new Set<string>()
  for (const node of graph.nodes.values()) {
    if (node.operator === 'read') {
      actualVariables.add(node.variableId)
    }
  }
  for (const v of actualVariables) {
    if (!graph.variableIds.has(v)) {
      diagnostics.push(
        createLapicDiagnostic(
          'warning',
          'InvariantViolation',
          `Variable ${v} found in Read nodes but missing from variableIds`
        )
      )
    }
  }
  for (const v of graph.variableIds) {
    if (!actualVariables.has(v)) {
      diagnostics.push(
        createLapicDiagnostic(
          'warning',
          'InvariantViolation',
          `Variable ${v} in variableIds but no Read node references it`
        )
      )
    }
  }

  // Acyclicity check via topological sort
  const acyclicDiags = checkAcyclicity(graph)
  diagnostics.push(...acyclicDiags)

  const hasErrors = diagnostics.some((d) => d.severity === 'error')
  if (hasErrors) {
    return createLapicFailureResult(diagnostics)
  }
  return createLapicSuccessResult(graph, diagnostics)
}

// ---------------------------------------------------------------------------
// Operator constraint checks
// ---------------------------------------------------------------------------

function validateOperatorConstraints(
  nodeId: string,
  node: LapicFirNode
): LapicDiagnostic[] {
  const diags: LapicDiagnostic[] = []
  const path = ['nodes', nodeId]

  switch (node.operator) {
    case 'add':
    case 'mul':
    case 'min':
    case 'max':
      if (node.childIds.length < 2) {
        diags.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            `${node.operator} node must have ≥ 2 children, got ${node.childIds.length}`,
            path
          )
        )
      }
      break
    case 'multilinearKernel':
      if (node.childIds.length < 2) {
        diags.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            `multilinearKernel must have ≥ 2 children, got ${node.childIds.length}`,
            path
          )
        )
      }
      break
    case 'affineForm':
      if (node.terms.length === 0 && node.bias === 0) {
        diags.push(
          createLapicDiagnostic(
            'warning',
            'InvariantViolation',
            'affineForm with zero bias and no terms is equivalent to constant(0)',
            path
          )
        )
      }
      break
    case 'piecewiseAffineKernel':
      if (node.segments.length === 0) {
        diags.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            'piecewiseAffineKernel must have ≥ 1 segment',
            path
          )
        )
      } else {
        for (let i = 1; i < node.segments.length; i++) {
          if (
            node.segments[i]!.breakpoint <= node.segments[i - 1]!.breakpoint
          ) {
            diags.push(
              createLapicDiagnostic(
                'error',
                'SchemaViolation',
                `piecewiseAffineKernel segments must have strictly increasing breakpoints`,
                path
              )
            )
            break
          }
        }
      }
      break
    case 'constant':
      if (!Number.isFinite(node.value)) {
        diags.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            `constant value must be finite, got ${node.value}`,
            path
          )
        )
      }
      break
    case 'saturatingKernel':
      if (!Number.isFinite(node.cap)) {
        diags.push(
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            `saturatingKernel cap must be finite, got ${node.cap}`,
            path
          )
        )
      }
      break
  }
  return diags
}

// ---------------------------------------------------------------------------
// Acyclicity
// ---------------------------------------------------------------------------

function checkAcyclicity(graph: LapicFirGraph): LapicDiagnostic[] {
  const diags: LapicDiagnostic[] = []
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) {
      diags.push(
        createLapicDiagnostic(
          'error',
          'InvariantViolation',
          `Cycle detected involving node ${nodeId}`
        )
      )
      return false
    }
    if (visited.has(nodeId)) return true
    inStack.add(nodeId)
    const node = graph.nodes.get(nodeId)
    if (node) {
      for (const childId of lapicFirNodeChildIds(node)) {
        if (!dfs(childId)) return false
      }
    }
    inStack.delete(nodeId)
    visited.add(nodeId)
    return true
  }

  dfs(graph.rootId)
  return diags
}
