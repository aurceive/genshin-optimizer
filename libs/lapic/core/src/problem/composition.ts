/**
 * Multi-Slot Objective Composition (§7.1)
 *
 * Four canonical objective forms for team-level optimization:
 * - single-slot: optimize one slot in isolation
 * - weighted-aggregate: weighted sum of per-slot contributions
 * - frame-weighted: per-frame weighted contribution
 * - lexicographic-tuple: priority-ordered comparison tuple
 *
 * Factory functions produce `LapicCanonicalObjective` instances with
 * validated slot/frame references and composition metadata.
 */

import {
  createLapicDiagnostic,
  createLapicFailureResult,
  createLapicSuccessResult,
} from '../diagnostics'
import type {
  LapicDigest,
  LapicFrameId,
  LapicObjectiveId,
  LapicSlotId,
} from '../identity'
import type { LapicCanonicalObjective, LapicValidationResult } from '../types'

// ---------------------------------------------------------------------------
// Weight descriptor
// ---------------------------------------------------------------------------

/** Per-slot weight for weighted-aggregate objectives. */
export interface LapicSlotWeight {
  readonly slotId: LapicSlotId
  /** Weight as an integer or rational number (not floating-point). */
  readonly weight: number
}

/** Per-frame weight for frame-weighted objectives. */
export interface LapicFrameWeight {
  readonly frameId: LapicFrameId
  /** Weight as an integer or rational number. */
  readonly weight: number
}

/** Sub-objective in a lexicographic tuple. */
export interface LapicLexicographicEntry {
  readonly priority: number
  readonly objectiveId: LapicObjectiveId
  readonly expressionDigest: LapicDigest
  readonly targetSlotIds: readonly LapicSlotId[]
}

// ---------------------------------------------------------------------------
// Factory: single-slot
// ---------------------------------------------------------------------------

/**
 * Create a single-slot objective targeting exactly one slot.
 */
export function createSingleSlotObjective(
  objectiveId: LapicObjectiveId,
  expressionDigest: LapicDigest,
  slotId: LapicSlotId,
  availableSlotIds: readonly LapicSlotId[]
): LapicValidationResult<LapicCanonicalObjective> {
  if (!availableSlotIds.includes(slotId)) {
    return createLapicFailureResult([
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        `Objective references slot '${slotId}' which is not in the team layout.`,
        ['objective', 'targetSlotIds']
      ),
    ])
  }

  return createLapicSuccessResult({
    objectiveId,
    objectiveKind: 'single-slot',
    expressionDigest,
    targetSlotIds: [slotId],
    frameIds: [],
  })
}

// ---------------------------------------------------------------------------
// Factory: weighted-aggregate
// ---------------------------------------------------------------------------

/**
 * Create a weighted-aggregate objective that sums per-slot contributions.
 */
export function createWeightedAggregateObjective(
  objectiveId: LapicObjectiveId,
  expressionDigest: LapicDigest,
  slotWeights: readonly LapicSlotWeight[],
  availableSlotIds: readonly LapicSlotId[]
): LapicValidationResult<LapicCanonicalObjective> {
  const availableSet = new Set(availableSlotIds)

  for (const sw of slotWeights) {
    if (!availableSet.has(sw.slotId)) {
      return createLapicFailureResult([
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          `Weighted-aggregate objective references slot '${sw.slotId}' which is not in the team layout.`,
          ['objective', 'targetSlotIds']
        ),
      ])
    }
  }

  if (slotWeights.length === 0) {
    return createLapicFailureResult([
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'Weighted-aggregate objective requires at least one slot weight.',
        ['objective', 'slotWeights']
      ),
    ])
  }

  return createLapicSuccessResult({
    objectiveId,
    objectiveKind: 'weighted-aggregate',
    expressionDigest,
    targetSlotIds: slotWeights.map((sw) => sw.slotId),
    frameIds: [],
  })
}

// ---------------------------------------------------------------------------
// Factory: frame-weighted
// ---------------------------------------------------------------------------

/**
 * Create a frame-weighted objective that sums per-frame contributions.
 */
export function createFrameWeightedObjective(
  objectiveId: LapicObjectiveId,
  expressionDigest: LapicDigest,
  targetSlotIds: readonly LapicSlotId[],
  frameWeights: readonly LapicFrameWeight[],
  availableSlotIds: readonly LapicSlotId[],
  availableFrameIds: readonly LapicFrameId[]
): LapicValidationResult<LapicCanonicalObjective> {
  const availableSlotSet = new Set(availableSlotIds)
  const availableFrameSet = new Set(availableFrameIds)

  for (const slotId of targetSlotIds) {
    if (!availableSlotSet.has(slotId)) {
      return createLapicFailureResult([
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          `Frame-weighted objective references slot '${slotId}' which is not in the team layout.`,
          ['objective', 'targetSlotIds']
        ),
      ])
    }
  }

  for (const fw of frameWeights) {
    if (!availableFrameSet.has(fw.frameId)) {
      return createLapicFailureResult([
        createLapicDiagnostic(
          'error',
          'SchemaViolation',
          `Frame-weighted objective references frame '${fw.frameId}' which is not in the frame axis.`,
          ['objective', 'frameIds']
        ),
      ])
    }
  }

  if (frameWeights.length === 0) {
    return createLapicFailureResult([
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'Frame-weighted objective requires at least one frame weight.',
        ['objective', 'frameWeights']
      ),
    ])
  }

  return createLapicSuccessResult({
    objectiveId,
    objectiveKind: 'frame-weighted',
    expressionDigest,
    targetSlotIds,
    frameIds: frameWeights.map((fw) => fw.frameId),
  })
}

// ---------------------------------------------------------------------------
// Factory: lexicographic-tuple
// ---------------------------------------------------------------------------

/**
 * Create a lexicographic-tuple objective with priority-ordered sub-objectives.
 * Lower priority number = higher importance (compared first).
 */
export function createLexicographicObjective(
  objectiveId: LapicObjectiveId,
  expressionDigest: LapicDigest,
  entries: readonly LapicLexicographicEntry[],
  availableSlotIds: readonly LapicSlotId[]
): LapicValidationResult<LapicCanonicalObjective> {
  const availableSet = new Set(availableSlotIds)

  if (entries.length === 0) {
    return createLapicFailureResult([
      createLapicDiagnostic(
        'error',
        'SchemaViolation',
        'Lexicographic objective requires at least one entry.',
        ['objective', 'entries']
      ),
    ])
  }

  const allSlotIds = new Set<LapicSlotId>()

  for (const entry of entries) {
    for (const slotId of entry.targetSlotIds) {
      if (!availableSet.has(slotId)) {
        return createLapicFailureResult([
          createLapicDiagnostic(
            'error',
            'SchemaViolation',
            `Lexicographic entry '${entry.objectiveId}' references slot '${slotId}' which is not in the team layout.`,
            ['objective', 'entries', entry.objectiveId, 'targetSlotIds']
          ),
        ])
      }
      allSlotIds.add(slotId)
    }
  }

  return createLapicSuccessResult({
    objectiveId,
    objectiveKind: 'lexicographic-tuple',
    expressionDigest,
    targetSlotIds: [...allSlotIds],
    frameIds: [],
  })
}
