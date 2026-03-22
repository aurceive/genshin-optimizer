/**
 * Branch reachability inference from A-IR analysis.
 *
 * Scans A-IR region decomposition and node annotations to
 * identify branches that are statically forced or unreachable.
 * Each result carries the evidence needed to construct a
 * BranchReachabilityCert without re-analyzing the graph.
 */

import type { LapicFirNodeId } from '../fir/types'
import type { LapicAirGraph, LapicAirRegion } from './types'

// ---------------------------------------------------------------------------
// Evidence record
// ---------------------------------------------------------------------------

/**
 * Evidence that a branch is statically forced.
 *
 * Extracted from A-IR region decomposition: when one child
 * region of a thresholdSelect is 'infeasible', the other
 * arm is forced.
 */
export interface LapicForcedBranchEvidence {
  /** The thresholdSelect F-IR node whose branch is forced. */
  readonly branchNodeId: LapicFirNodeId
  /** The guard predicate node ID. */
  readonly guardNodeId: LapicFirNodeId
  /** Which arm is proven to be the only reachable one. */
  readonly forcedArm: 'then' | 'else'
  /** Guard lower bound (evidence for the forcing). */
  readonly guardLower?: number
  /** Guard upper bound (evidence for the forcing). */
  readonly guardUpper?: number
  /** Parent region ID in the A-IR decomposition. */
  readonly parentRegionId: string
  /** Region ID for the forced (feasible) arm. */
  readonly feasibleRegionId: string
  /** Region ID for the unreachable (infeasible) arm. */
  readonly infeasibleRegionId: string
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

/**
 * Infer all statically forced branches from an A-IR graph.
 *
 * Scans the region decomposition for thresholdSelect parent
 * regions whose child regions have complementary feasibility
 * (one feasible, one infeasible). Each such pair produces a
 * forced-branch evidence record.
 */
export function inferForcedBranches(
  airGraph: LapicAirGraph
): readonly LapicForcedBranchEvidence[] {
  const results: LapicForcedBranchEvidence[] = []

  // Group regions by parent for efficient scanning
  const parentRegions = airGraph.regions.filter(
    (r) =>
      r.childRegionIds.length === 2 &&
      r.regionId.startsWith('region:threshold:')
  )

  for (const parent of parentRegions) {
    const children = parent.childRegionIds.map((id) =>
      airGraph.regions.find((r) => r.regionId === id)
    )
    if (children.length !== 2 || !children[0] || !children[1]) continue

    const [child0, child1] = children as [LapicAirRegion, LapicAirRegion]

    // Determine which child is then/else based on their active faces
    const thenChild = child0.regionId.endsWith(':then') ? child0 : child1
    const elseChild = child0.regionId.endsWith(':else') ? child0 : child1

    // Check if one branch is infeasible (the other is forced)
    let forcedArm: 'then' | 'else' | undefined
    let feasibleChild: LapicAirRegion
    let infeasibleChild: LapicAirRegion

    if (
      thenChild.feasibilityStatus === 'feasible' &&
      elseChild.feasibilityStatus === 'infeasible'
    ) {
      forcedArm = 'then'
      feasibleChild = thenChild
      infeasibleChild = elseChild
    } else if (
      elseChild.feasibilityStatus === 'feasible' &&
      thenChild.feasibilityStatus === 'infeasible'
    ) {
      forcedArm = 'else'
      feasibleChild = elseChild
      infeasibleChild = thenChild
    } else {
      continue // Both feasible or unknown — no forced branch
    }

    // Extract the branch node ID from the parent region ID
    // Format: "region:threshold:{nodeId}"
    const branchNodeId = parent.regionId.replace('region:threshold:', '')

    // Guard node is the first guard predicate
    const guardNodeId = parent.guardPredicates[0]
    if (!guardNodeId) continue

    // Get guard bounds from A-IR annotation (evidence for the forcing)
    const guardAnnotation = airGraph.annotations.get(guardNodeId)

    results.push({
      branchNodeId,
      guardNodeId,
      forcedArm,
      guardLower: guardAnnotation?.exactLower,
      guardUpper: guardAnnotation?.exactUpper,
      parentRegionId: parent.regionId,
      feasibleRegionId: feasibleChild.regionId,
      infeasibleRegionId: infeasibleChild.regionId,
    })
  }

  return results
}
