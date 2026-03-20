import { createLapicStateLayoutDescriptor } from '@genshin-optimizer/lapic/core'

function createLayout() {
  return createLapicStateLayoutDescriptor({
    layoutId: 'layout-id',
    teamLayoutDigest: 'team-layout-digest',
    slotIds: ['flower'],
    frameAxisIdentity: {
      axisKind: 'none',
      frameIds: [],
    },
    dominanceProjectionIds: ['projection-id'],
  })
}

describe('lapic storage type interop', () => {
  it('keeps layout-compatible frontier payloads usable with core descriptors', () => {
    const layout = createLayout()

    expect(layout.layoutId).toBe('layout-id')
    expect(layout.slotIds).toEqual(['flower'])
  })
})
