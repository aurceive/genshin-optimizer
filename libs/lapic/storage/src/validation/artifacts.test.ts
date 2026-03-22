import { createLapicStateLayoutDescriptor } from '@genshin-optimizer/lapic/core'
import {
  validateLapicFrontierBlock,
  validateLapicFrontierIndex,
} from './artifacts'

function createFrontierBlock() {
  return {
    blockId: 'frontier:block',
    layout: createLapicStateLayoutDescriptor({
      layoutId: 'layout-id',
      teamLayoutDigest: 'team-layout-digest',
      slotIds: ['flower'],
      frameAxisIdentity: {
        axisKind: 'none',
        frameIds: [],
      },
      dominanceProjectionIds: ['dominance:flower'],
    }),
    stateIds: ['state:flower:flower-a'],
    rows: [
      {
        stateId: 'state:flower:flower-a',
        slotId: 'flower',
        candidateId: 'flower-a',
        candidateDigest: 'feature:flower-a',
        compatibilityDigest: 'compat:flower-a',
        exactSignatureGroupKey: {
          occupiedSlotMask: 1,
          actorIds: [],
          exclusiveResourceKeys: [],
          frameAxisIdentityDigest: 'frame-axis-digest',
          adapterSemanticMode: 'gi-legacy-validated',
          discreteTeamModeKey: 'flower',
        },
        rowDigest: 'row:flower-a',
      },
    ],
    rowCount: 1,
  } as const
}

describe('lapic storage artifact validation', () => {
  it('accepts frontier blocks with explicit bounded row metadata', () => {
    expect(validateLapicFrontierBlock(createFrontierBlock()).ok).toBe(true)
  })

  it('rejects frontier blocks when rows and stateIds drift', () => {
    const invalidBlock = {
      ...createFrontierBlock(),
      rows: [
        {
          ...createFrontierBlock().rows[0],
          stateId: 'state:flower:flower-b',
        },
      ],
    }

    expect(validateLapicFrontierBlock(invalidBlock).ok).toBe(false)
  })

  it('accepts frontier indexes with exact-signature group summaries', () => {
    expect(
      validateLapicFrontierIndex({
        indexId: 'frontier-index:problem-digest',
        blockIds: ['frontier:block'],
        compatibilityDigest: 'frontier-index:problem-digest:group-a',
        exactSignatureGroups: [
          {
            groupDigest: 'frontier-group:problem-digest:group-a',
            blockIds: ['frontier:block'],
            slotIds: ['flower'],
            rowDigests: ['row:flower-a'],
            rowCount: 1,
            occupiedSlotMask: 1,
            adapterSemanticMode: 'gi-legacy-validated',
            frameAxisIdentityDigest: 'frame-axis-digest',
            discreteTeamModeKey: 'flower',
          },
        ],
      }).ok
    ).toBe(true)
  })

  it('rejects frontier indexes when group row counts drift from row digests', () => {
    expect(
      validateLapicFrontierIndex({
        indexId: 'frontier-index:problem-digest',
        blockIds: ['frontier:block'],
        compatibilityDigest: 'frontier-index:problem-digest:group-a',
        exactSignatureGroups: [
          {
            groupDigest: 'frontier-group:problem-digest:group-a',
            blockIds: ['frontier:block'],
            slotIds: ['flower'],
            rowDigests: ['row:flower-a'],
            rowCount: 2,
            occupiedSlotMask: 1,
            adapterSemanticMode: 'gi-legacy-validated',
            frameAxisIdentityDigest: 'frame-axis-digest',
            discreteTeamModeKey: 'flower',
          },
        ],
      }).ok
    ).toBe(false)
  })
})
