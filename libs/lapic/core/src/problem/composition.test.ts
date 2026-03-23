/**
 * Tests for Multi-Slot Objective Composition (§7.1)
 */

import {
  createFrameWeightedObjective,
  createLexicographicObjective,
  createSingleSlotObjective,
  createWeightedAggregateObjective,
} from './composition'

const SLOT_IDS = ['gi-slot-0', 'gi-slot-1', 'gi-slot-2', 'gi-slot-3']

// ---------------------------------------------------------------------------
// createSingleSlotObjective
// ---------------------------------------------------------------------------

describe('createSingleSlotObjective', () => {
  test('valid single-slot objective', () => {
    const result = createSingleSlotObjective(
      'obj-1',
      'expr-digest',
      'gi-slot-0',
      SLOT_IDS
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.objectiveKind).toBe('single-slot')
    expect(result.value.targetSlotIds).toEqual(['gi-slot-0'])
    expect(result.value.frameIds).toEqual([])
  })

  test('invalid slot reference → error', () => {
    const result = createSingleSlotObjective(
      'obj-1',
      'expr-digest',
      'nonexistent-slot',
      SLOT_IDS
    )

    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createWeightedAggregateObjective
// ---------------------------------------------------------------------------

describe('createWeightedAggregateObjective', () => {
  test('4 slots with equal weight', () => {
    const result = createWeightedAggregateObjective(
      'obj-wa',
      'expr-digest',
      SLOT_IDS.map((slotId) => ({ slotId, weight: 25 })),
      SLOT_IDS
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.objectiveKind).toBe('weighted-aggregate')
    expect(result.value.targetSlotIds).toEqual(SLOT_IDS)
  })

  test('1 slot 70% + 3 slots 10%', () => {
    const result = createWeightedAggregateObjective(
      'obj-wa-2',
      'expr-digest',
      [
        { slotId: 'gi-slot-0', weight: 70 },
        { slotId: 'gi-slot-1', weight: 10 },
        { slotId: 'gi-slot-2', weight: 10 },
        { slotId: 'gi-slot-3', weight: 10 },
      ],
      SLOT_IDS
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.targetSlotIds).toHaveLength(4)
  })

  test('invalid slot reference → error', () => {
    const result = createWeightedAggregateObjective(
      'obj-wa',
      'expr-digest',
      [{ slotId: 'bad-slot', weight: 100 }],
      SLOT_IDS
    )

    expect(result.ok).toBe(false)
  })

  test('empty weights → error', () => {
    const result = createWeightedAggregateObjective(
      'obj-wa',
      'expr-digest',
      [],
      SLOT_IDS
    )

    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createFrameWeightedObjective
// ---------------------------------------------------------------------------

describe('createFrameWeightedObjective', () => {
  const FRAME_IDS = ['frame-0', 'frame-1', 'frame-2']

  test('3 frames with different weights', () => {
    const result = createFrameWeightedObjective(
      'obj-fw',
      'expr-digest',
      SLOT_IDS,
      [
        { frameId: 'frame-0', weight: 50 },
        { frameId: 'frame-1', weight: 30 },
        { frameId: 'frame-2', weight: 20 },
      ],
      SLOT_IDS,
      FRAME_IDS
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.objectiveKind).toBe('frame-weighted')
    expect(result.value.frameIds).toEqual(FRAME_IDS)
    expect(result.value.targetSlotIds).toEqual(SLOT_IDS)
  })

  test('invalid slot reference → error', () => {
    const result = createFrameWeightedObjective(
      'obj-fw',
      'expr-digest',
      ['bad-slot'],
      [{ frameId: 'frame-0', weight: 100 }],
      SLOT_IDS,
      FRAME_IDS
    )

    expect(result.ok).toBe(false)
  })

  test('invalid frame reference → error', () => {
    const result = createFrameWeightedObjective(
      'obj-fw',
      'expr-digest',
      SLOT_IDS,
      [{ frameId: 'nonexistent-frame', weight: 100 }],
      SLOT_IDS,
      FRAME_IDS
    )

    expect(result.ok).toBe(false)
  })

  test('empty frame weights → error', () => {
    const result = createFrameWeightedObjective(
      'obj-fw',
      'expr-digest',
      SLOT_IDS,
      [],
      SLOT_IDS,
      FRAME_IDS
    )

    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createLexicographicObjective
// ---------------------------------------------------------------------------

describe('createLexicographicObjective', () => {
  test('primary DPS + secondary survivability', () => {
    const result = createLexicographicObjective(
      'obj-lex',
      'expr-digest',
      [
        {
          priority: 0,
          objectiveId: 'dps',
          expressionDigest: 'dps-digest',
          targetSlotIds: SLOT_IDS,
        },
        {
          priority: 1,
          objectiveId: 'survivability',
          expressionDigest: 'surv-digest',
          targetSlotIds: ['gi-slot-0'],
        },
      ],
      SLOT_IDS
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.objectiveKind).toBe('lexicographic-tuple')
    expect(result.value.targetSlotIds).toEqual(expect.arrayContaining(SLOT_IDS))
  })

  test('empty entries → error', () => {
    const result = createLexicographicObjective(
      'obj-lex',
      'expr-digest',
      [],
      SLOT_IDS
    )

    expect(result.ok).toBe(false)
  })

  test('invalid slot in entry → error', () => {
    const result = createLexicographicObjective(
      'obj-lex',
      'expr-digest',
      [
        {
          priority: 0,
          objectiveId: 'dps',
          expressionDigest: 'dps-digest',
          targetSlotIds: ['nonexistent-slot'],
        },
      ],
      SLOT_IDS
    )

    expect(result.ok).toBe(false)
  })

  test('target slot IDs are deduplicated', () => {
    const result = createLexicographicObjective(
      'obj-lex',
      'expr-digest',
      [
        {
          priority: 0,
          objectiveId: 'a',
          expressionDigest: 'a-digest',
          targetSlotIds: ['gi-slot-0', 'gi-slot-1'],
        },
        {
          priority: 1,
          objectiveId: 'b',
          expressionDigest: 'b-digest',
          targetSlotIds: ['gi-slot-0', 'gi-slot-2'],
        },
      ],
      SLOT_IDS
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Should have gi-slot-0, gi-slot-1, gi-slot-2 (deduplicated)
    expect(result.value.targetSlotIds).toHaveLength(3)
    expect(new Set(result.value.targetSlotIds).size).toBe(3)
  })
})
