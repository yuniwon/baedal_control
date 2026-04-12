import { describe, expect, it } from 'vitest'
import { buildSyncPreview } from '../../../src/main/services/sync-planner'

describe('buildSyncPreview', () => {
  it('creates one update item per changed mapped platform menu', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm1', baseName: '직화불고기', basePrice: 23900, isDirty: 1 }],
      mappings: [{
        mappingId: 'map-1',
        menuId: 'm1',
        platformCode: 'baemin',
        platformMenuId: 'p-1',
        platformMenuName: '불고기피자',
        matchedBy: 'manual',
        isConfirmed: 1
      }]
    })

    expect(preview.items).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        menuId: 'm1',
        nextName: '직화불고기',
        nextPrice: 23900
      })
    ])
  })

  it('marks unmapped menus as needsReview instead of scheduling a write', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm2', baseName: '페퍼로니', basePrice: 24900, isDirty: 1 }],
      mappings: []
    })

    expect(preview.needsReview).toEqual([
      expect.objectContaining({ menuId: 'm2', reason: 'missing_mapping' })
    ])
  })
})
