import { describe, expect, it } from 'vitest'
import { buildSyncPreview } from '../../../src/main/services/sync-planner'

describe('buildSyncPreview', () => {
  it('creates one update item per changed mapped platform menu', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm1', baseName: '직화불고기', basePrice: 23900, isDirty: 1, isManaged: 1 }],
      platformMenus: [],
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
      menus: [{ menuId: 'm2', baseName: '페퍼로니', basePrice: 24900, isDirty: 1, isManaged: 1 }],
      platformMenus: [],
      mappings: []
    })

    expect(preview.needsReview).toEqual([
      expect.objectContaining({ menuId: 'm2', reason: 'missing_mapping' })
    ])
  })

  it('marks binding-review menus as needsReview instead of scheduling a write', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm3', baseName: '사이다', basePrice: 1800, isDirty: 1, isManaged: 1 }],
      platformMenus: [],
      mappings: [
        {
          mappingId: 'map-3',
          menuId: 'm3',
          platformCode: 'baemin',
          platformMenuId: 'p-3',
          platformMenuName: '사이다',
          platformMenuBindingStatus: '가게 연결 없음',
          platformMenuBindingSummary: '연결 가게 없음',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ]
    })

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([
      expect.objectContaining({
        menuId: 'm3',
        platformCode: 'baemin',
        platformMenuId: 'p-3',
        reason: 'binding_review',
        detail: '가게 연결 없음'
      })
    ])
  })

  it('skips excluded menus from sync preview', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm4', baseName: '콜라', basePrice: 2000, isDirty: 1, isManaged: 0 }],
      platformMenus: [],
      mappings: [
        {
          mappingId: 'map-4',
          menuId: 'm4',
          platformCode: 'baemin',
          platformMenuId: 'p-4',
          platformMenuName: '콜라',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ]
    })

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([])
  })

  it('marks baemin multi-price menus with a changed price as needsReview instead of scheduling a write', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm5', baseName: '쉬림프골드', basePrice: 22000, isDirty: 1, isManaged: 1 }],
      platformMenus: [],
      mappings: [
        {
          mappingId: 'map-5',
          menuId: 'm5',
          platformCode: 'baemin',
          platformMenuId: '59707679',
          platformMenuName: '쉬림프골드',
          platformMenuCurrentPrice: 21000,
          platformMenuPriceCount: 2,
          platformMenuPriceSummary:
            'L · 배달 25,000원 · 픽업 25,000원 / M · 배달 21,000원 · 픽업 21,000원',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ]
    })

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([
      expect.objectContaining({
        menuId: 'm5',
        platformCode: 'baemin',
        platformMenuId: '59707679',
        reason: 'price_variant_review'
      })
    ])
  })

  it('still schedules a baemin multi-price menu when only the name changed', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm6', baseName: '쉬림프골드 신메뉴명', basePrice: 21000, isDirty: 1, isManaged: 1 }],
      platformMenus: [],
      mappings: [
        {
          mappingId: 'map-6',
          menuId: 'm6',
          platformCode: 'baemin',
          platformMenuId: '59707679',
          platformMenuName: '쉬림프골드',
          platformMenuCurrentPrice: 21000,
          platformMenuPriceCount: 2,
          platformMenuPriceSummary:
            'L · 배달 25,000원 · 픽업 25,000원 / M · 배달 21,000원 · 픽업 21,000원',
          platformMenuBindingSummary: '[음식배달] 꾸버스피자 봉담점',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ]
    })

    expect(preview.needsReview).toEqual([])
    expect(preview.items).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        platformMenuId: '59707679',
        previousName: '쉬림프골드',
        previousPrice: 21000,
        nextName: '쉬림프골드 신메뉴명',
        nextPrice: 21000,
        platformMenuPriceCount: 2,
        platformMenuBindingSummary: '[음식배달] 꾸버스피자 봉담점'
      })
    ])
  })

  it('marks source-absent mappings and missing source platform menus as needsReview', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm7', baseName: '한정피자', basePrice: 25900, isDirty: 1, isManaged: 1 }],
      platformMenus: [
        {
          platformCode: 'baemin',
          platformMenuId: 'p-7',
          platformMenuName: '한정피자',
          presenceStatus: 'missing_suspected'
        }
      ],
      mappings: [
        {
          mappingId: 'map-7',
          menuId: 'm7',
          platformCode: 'baemin',
          platformMenuId: 'p-7',
          platformMenuName: '한정피자',
          matchedBy: 'manual',
          isConfirmed: 1
        },
        {
          mappingId: 'map-8',
          menuId: 'm7',
          platformCode: 'coupangeats',
          platformMenuId: 'p-8',
          platformMenuName: '한정피자',
          mappingStatus: 'source_absent',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ]
    })

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([
      expect.objectContaining({
        menuId: 'm7',
        platformCode: 'baemin',
        platformMenuId: 'p-7',
        reason: 'source_missing_review'
      }),
      expect.objectContaining({
        menuId: 'm7',
        platformCode: 'coupangeats',
        platformMenuId: 'p-8',
        reason: 'source_missing_review'
      })
    ])
  })

  it('prioritizes source-missing review over binding review', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm8', baseName: '테스트메뉴', basePrice: 12000, isDirty: 1, isManaged: 1 }],
      platformMenus: [
        {
          platformCode: 'baemin',
          platformMenuId: 'p-8',
          platformMenuName: '테스트메뉴',
          presenceStatus: 'missing_suspected'
        }
      ],
      mappings: [
        {
          mappingId: 'map-8',
          menuId: 'm8',
          platformCode: 'baemin',
          platformMenuId: 'p-8',
          platformMenuName: '테스트메뉴',
          platformMenuBindingStatus: '가게 연결 없음',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ]
    })

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([
      expect.objectContaining({
        menuId: 'm8',
        platformCode: 'baemin',
        platformMenuId: 'p-8',
        reason: 'source_missing_review'
      })
    ])
  })

  it('prioritizes source-missing review over baemin multi-price review', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm9', baseName: '테스트메뉴2', basePrice: 15000, isDirty: 1, isManaged: 1 }],
      platformMenus: [
        {
          platformCode: 'baemin',
          platformMenuId: 'p-9',
          platformMenuName: '테스트메뉴2',
          presenceStatus: 'absent_confirmed'
        }
      ],
      mappings: [
        {
          mappingId: 'map-9',
          menuId: 'm9',
          platformCode: 'baemin',
          platformMenuId: 'p-9',
          platformMenuName: '테스트메뉴2',
          platformMenuCurrentPrice: 11000,
          platformMenuPriceCount: 2,
          platformMenuPriceSummary: 'M 11,000 / L 13,000',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ]
    })

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([
      expect.objectContaining({
        menuId: 'm9',
        platformCode: 'baemin',
        platformMenuId: 'p-9',
        reason: 'source_missing_review'
      })
    ])
  })
})
