import { objPathValue } from '@genshin-optimizer/common/util'
import type { CharacterKey, GenderKey } from '@genshin-optimizer/gi/consts'
import type {
  ArtCharDatabase,
  ICachedArtifact,
  OptConfig,
} from '@genshin-optimizer/gi/db'
import type { ArtifactsBySlot } from '@genshin-optimizer/gi/solver'
import { compactArtifacts } from '@genshin-optimizer/gi/solver-tc'
import { getTeamData, statFilterToNumNode } from '@genshin-optimizer/gi/ui'
import { uiDataForTeam } from '@genshin-optimizer/gi/uidata'
import type { Data, NumNode } from '@genshin-optimizer/gi/wr'
import { dynamicData, mergeData } from '@genshin-optimizer/gi/wr'

/**
 * Shared optimization data produced by the common preparation step.
 *
 * Both legacy (GOSolver) and lapic engines consume this before
 * diverging into their engine-specific pipelines (e.g. adding
 * plotBase nodes, calling `optimize()`, etc.).
 */
export interface OptimizationPrepData {
  /** Compacted artifact data for the evaluator */
  readonly split: ArtifactsBySlot
  /** Worker-facing formula data root */
  readonly workerData: Data
  /** The unoptimized optimization target node */
  readonly targetNode: NumNode
  /** Stat-filter constraints with their minimum thresholds */
  readonly valueFilter: ReadonlyArray<{
    readonly value: NumNode
    readonly minimum: number
  }>
}

export interface OptimizationPrepInput {
  readonly buildSetting: OptConfig
  readonly characterKey: CharacterKey
  readonly filteredArts: ICachedArtifact[]
  readonly database: ArtCharDatabase
  readonly teamId: string
  readonly teamCharId: string
  readonly gender: GenderKey
  readonly activeCharKey: CharacterKey
}

/**
 * Prepare the shared optimization data consumed by both legacy and lapic solvers.
 *
 * Returns `undefined` when required data is missing (team/character not found,
 * no optimization target, etc.). Callers are responsible for building the
 * final node list (with optional plotBase) and calling `optimize()`.
 */
export function prepareOptimizationData(
  input: OptimizationPrepInput
): OptimizationPrepData | undefined {
  const {
    buildSetting,
    characterKey,
    filteredArts,
    database,
    teamId,
    teamCharId,
    gender,
    activeCharKey,
  } = input

  const {
    statFilters,
    optimizationTarget,
    mainStatAssumptionLevel,
    allowPartial,
  } = buildSetting

  if (!characterKey || !optimizationTarget) return undefined

  const split = compactArtifacts(
    filteredArts,
    mainStatAssumptionLevel,
    allowPartial
  )

  const teamData = getTeamData(
    database,
    teamId,
    teamCharId,
    mainStatAssumptionLevel,
    { [teamCharId]: { art: [] } }
  )
  if (!teamData) return undefined

  const workerData = uiDataForTeam(teamData.teamData, gender, activeCharKey)[
    characterKey
  ]?.target.data![0]
  if (!workerData) return undefined

  Object.assign(workerData, mergeData([workerData, dynamicData]))

  const targetNode = objPathValue(
    workerData.display ?? {},
    optimizationTarget
  ) as NumNode | undefined
  if (!targetNode) return undefined

  const valueFilter = statFilterToNumNode(workerData, statFilters)

  return {
    split,
    workerData,
    targetNode,
    valueFilter,
  }
}
