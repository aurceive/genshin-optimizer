/**
 * A-IR structural validation.
 *
 * Checks that A-IR annotations are internally consistent
 * and sound with respect to the underlying F-IR graph.
 */

import type { LapicDiagnostic, LapicValidationResult } from '../types'
import { createLapicDiagnostic, createLapicSuccessResult, createLapicFailureResult } from '../diagnostics'
import type { LapicFirGraph } from '../fir/types'
import type { LapicAirGraph, LapicAirNodeAnnotation } from './types'

/**
 * Validate an A-IR graph for structural consistency.
 *
 * Checks:
 * 1. Every annotation references an existing F-IR node
 * 2. Bounds are not inverted (lower ≤ upper)
 * 3. Required variables are subsets of the F-IR's variable set
 * 4. Branch control sets reference existing nodes
 * 5. Regions reference existing nodes
 * 6. Root annotation has requiredVariables
 */
export function validateLapicAirGraph(
  airGraph: LapicAirGraph
): LapicValidationResult<true> {
  const diagnostics: LapicDiagnostic[] = []
  const firGraph = airGraph.firGraph

  // Check 1: all annotated nodes exist in F-IR
  for (const [nodeId, ann] of airGraph.annotations) {
    if (!firGraph.nodes.has(nodeId)) {
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'ReferentialIntegrity',
          `A-IR annotation references non-existent F-IR node: ${nodeId}`,
          ['annotations', nodeId]
        )
      )
    }

    // Check 2: bounds not inverted
    if (ann.exactLower !== undefined && ann.exactUpper !== undefined) {
      if (ann.exactLower > ann.exactUpper) {
        diagnostics.push(
          createLapicDiagnostic(
            'error',
            'BoundsInversion',
            `A-IR node ${nodeId} has inverted bounds: [${ann.exactLower}, ${ann.exactUpper}]`,
            ['annotations', nodeId, 'bounds']
          )
        )
      }
    }

    // Check 3: required variables exist in F-IR
    validateRequiredVariables(ann, firGraph, diagnostics)

    // Check 4: branch control set references existing nodes
    if (ann.branchControlSet) {
      for (const branchId of ann.branchControlSet) {
        if (!firGraph.nodes.has(branchId)) {
          diagnostics.push(
            createLapicDiagnostic(
              'warning',
              'ReferentialIntegrity',
              `Branch control set references non-existent F-IR node: ${branchId}`,
              ['annotations', nodeId, 'branchControlSet']
            )
          )
        }
      }
    }
  }

  // Check 5: regions reference existing nodes
  for (const region of airGraph.regions) {
    for (const guardId of region.guardPredicates) {
      if (!firGraph.nodes.has(guardId)) {
        diagnostics.push(
          createLapicDiagnostic(
            'warning',
            'ReferentialIntegrity',
            `Region ${region.regionId} guard references non-existent node: ${guardId}`,
            ['regions', region.regionId, 'guardPredicates']
          )
        )
      }
    }
  }

  // Check 6: root annotation exists and has required variables
  const rootAnnotation = airGraph.annotations.get(firGraph.rootId)
  if (!rootAnnotation) {
    diagnostics.push(
      createLapicDiagnostic(
        'error',
        'MissingAnnotation',
        `Root node ${firGraph.rootId} has no A-IR annotation`,
        ['annotations', firGraph.rootId]
      )
    )
  }

  if (diagnostics.some((d) => d.severity === 'error')) {
    return createLapicFailureResult(diagnostics)
  }
  return createLapicSuccessResult(true, diagnostics)
}

function validateRequiredVariables(
  ann: LapicAirNodeAnnotation,
  firGraph: LapicFirGraph,
  diagnostics: LapicDiagnostic[]
): void {
  if (!ann.requiredVariables) return
  for (const varId of ann.requiredVariables) {
    if (!firGraph.variableIds.has(varId)) {
      diagnostics.push(
        createLapicDiagnostic(
          'error',
          'ReferentialIntegrity',
          `Required variable ${varId} not in F-IR variable set`,
          ['annotations', ann.firNodeId, 'requiredVariables']
        )
      )
    }
  }
}
