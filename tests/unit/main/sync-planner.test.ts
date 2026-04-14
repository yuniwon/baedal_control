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

  it('skips dirty menus when the mapped platform values are already identical', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm2b', baseName: '갈릭디핑', basePrice: 500, isDirty: 1, isManaged: 1 }],
      platformMenus: [],
      mappings: [
        {
          mappingId: 'map-2b',
          menuId: 'm2b',
          platformCode: 'baemin',
          platformMenuId: 'p-2b',
          platformMenuName: '갈릭디핑',
          platformMenuCurrentPrice: 500,
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ]
    })

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([])
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

  it('marks ddangyo multi-price menus with a changed price as needsReview instead of scheduling a write', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm6b', baseName: '치즈바이트', basePrice: 29900, isDirty: 1, isManaged: 1 }],
      platformMenus: [],
      mappings: [
        {
          mappingId: 'map-6b',
          menuId: 'm6b',
          platformCode: 'ddangyo',
          platformMenuId: '10000021',
          platformMenuName: '치즈바이트',
          platformMenuCurrentPrice: 28900,
          platformMenuPriceCount: 2,
          platformMenuPriceSummary:
            'L · 배달 28,900원 · 포장 28,900원 / M · 배달 25,900원 · 포장 25,900원',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ]
    })

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([
      expect.objectContaining({
        menuId: 'm6b',
        platformCode: 'ddangyo',
        platformMenuId: '10000021',
        reason: 'price_variant_review'
      })
    ])
  })

  it('marks ddangyo multi-price menus with a changed name as needsReview instead of scheduling a write', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm6c', baseName: '칠성사이다 검증', basePrice: 1800, isDirty: 1, isManaged: 1 }],
      platformMenus: [],
      mappings: [
        {
          mappingId: 'map-6c',
          menuId: 'm6c',
          platformCode: 'ddangyo',
          platformMenuId: '10000039',
          platformMenuName: '칠성사이다',
          platformMenuCurrentPrice: 1800,
          platformMenuPriceCount: 2,
          platformMenuPriceSummary:
            '500ml · 배달 1,800원 · 포장 1,800원 · 매장식사 1,800원 / 1.25L · 배달 2,800원 · 포장 2,800원 · 매장식사 2,800원',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ]
    })

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([
      expect.objectContaining({
        menuId: 'm6c',
        platformCode: 'ddangyo',
        platformMenuId: '10000039',
        reason: 'price_variant_review'
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

  it('marks missing catalog rows as source-missing review after the platform has been imported', () => {
    const preview = buildSyncPreview({
      menus: [{ menuId: 'm7b', baseName: '포테이토골드', basePrice: 21000, isDirty: 1, isManaged: 1 }],
      platformMenus: [
        {
          platformCode: 'baemin',
          platformMenuId: 'p-other',
          platformMenuName: '다른메뉴',
          presenceStatus: 'present'
        }
      ],
      mappings: [
        {
          mappingId: 'map-7b',
          menuId: 'm7b',
          platformCode: 'baemin',
          platformMenuId: 'p-missing',
          platformMenuName: '포테이토골드',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ],
      platformImportRuns: [
        {
          importRunId: 'import-7b',
          platformCode: 'baemin',
          startedAt: '2026-04-14T01:00:00.000Z',
          finishedAt: '2026-04-14T01:05:00.000Z',
          status: 'completed',
          menuFetchCompleted: 10,
          optionFetchCompleted: 0,
          summaryJson: JSON.stringify({
            platformCode: 'baemin',
            fetchedCount: 10,
            createdMenuCount: 10,
            linkedMappingCount: 10,
            verifiedMappingCount: 10
          })
        }
      ]
    } as never)

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([
      expect.objectContaining({
        menuId: 'm7b',
        platformCode: 'baemin',
        platformMenuId: 'p-missing',
        reason: 'source_missing_review',
        detail: 'catalog_missing'
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

  it('schedules current-session imports as managed-browser execution items', () => {
    const preview = buildSyncPreview({
      menus: [
        { menuId: 'm10', baseName: '왕새우갈비 새이름', basePrice: 23900, isDirty: 1, isManaged: 1 }
      ],
      platformMenus: [],
      mappings: [
        {
          mappingId: 'map-10',
          menuId: 'm10',
          platformCode: 'coupangeats',
          platformMenuId: 'ce-10',
          platformMenuName: '왕새우갈비',
          platformMenuGroupName: '추천메뉴',
          platformMenuCurrentPrice: 23900,
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ],
      platformImportRuns: [
        {
          importRunId: 'import-10',
          platformCode: 'coupangeats',
          startedAt: '2026-04-13T04:00:00.000Z',
          finishedAt: '2026-04-13T04:01:00.000Z',
          status: 'completed',
          menuFetchCompleted: 1,
          optionFetchCompleted: 1,
          summaryJson: JSON.stringify({
            platformCode: 'coupangeats',
            fetchedCount: 35,
            fetchMode: 'managed_browser',
            createdMenuCount: 35,
            linkedMappingCount: 35,
            verifiedMappingCount: 0
          })
        }
      ],
      managedChromeSession: {
        endpointUrl: 'http://127.0.0.1:39482',
        connected: true,
        error: null,
        tabs: [
          {
            tabId: 'tab-1',
            title: '쿠팡이츠 메뉴 관리',
            url: 'https://store.coupangeats.com/merchant/management/menu/109935',
            type: 'page',
            host: 'store.coupangeats.com',
            platformCode: 'coupangeats',
            pageKind: 'menu_list'
          }
        ]
      }
    } as never)

    expect(preview.items).toEqual([
      expect.objectContaining({
        menuId: 'm10',
        platformCode: 'coupangeats',
        platformMenuId: 'ce-10',
        previousName: '왕새우갈비',
        previousPrice: 23900,
        nextName: '왕새우갈비 새이름',
        nextPrice: 23900,
        platformMenuGroupName: '추천메뉴',
        executionMode: 'managed_browser'
      })
    ])
    expect(preview.needsReview).toEqual([])
  })

  it('marks coupangeats menus as needsReview when the latest import is not a managed-browser session', () => {
    const preview = buildSyncPreview({
      menus: [
        { menuId: 'm11', baseName: '왕새우갈비 새이름', basePrice: 23900, isDirty: 1, isManaged: 1 }
      ],
      platformMenus: [],
      mappings: [
        {
          mappingId: 'map-11',
          menuId: 'm11',
          platformCode: 'coupangeats',
          platformMenuId: 'ce-11',
          platformMenuName: '왕새우갈비',
          platformMenuCurrentPrice: 23900,
          platformMenuGroupName: '추천메뉴',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ],
      platformImportRuns: [
        {
          importRunId: 'import-11',
          platformCode: 'coupangeats',
          startedAt: '2026-04-14T02:00:00.000Z',
          finishedAt: '2026-04-14T02:01:00.000Z',
          status: 'completed',
          menuFetchCompleted: 1,
          optionFetchCompleted: 0,
          summaryJson: JSON.stringify({
            platformCode: 'coupangeats',
            fetchedCount: 35,
            createdMenuCount: 0,
            linkedMappingCount: 0,
            verifiedMappingCount: 35
          })
        }
      ]
    } as never)

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([
      expect.objectContaining({
        menuId: 'm11',
        platformCode: 'coupangeats',
        platformMenuId: 'ce-11',
        reason: 'managed_session_write_review'
      })
    ])
  })

  it('marks coupangeats menus as needsReview when the managed-browser menu tab is unavailable', () => {
    const preview = buildSyncPreview({
      menus: [
        { menuId: 'm12', baseName: '왕새우갈비 새이름', basePrice: 23900, isDirty: 1, isManaged: 1 }
      ],
      platformMenus: [],
      mappings: [
        {
          mappingId: 'map-12',
          menuId: 'm12',
          platformCode: 'coupangeats',
          platformMenuId: 'ce-12',
          platformMenuName: '왕새우갈비',
          platformMenuCurrentPrice: 23900,
          platformMenuGroupName: '추천메뉴',
          matchedBy: 'manual',
          isConfirmed: 1
        }
      ],
      platformImportRuns: [
        {
          importRunId: 'import-12',
          platformCode: 'coupangeats',
          startedAt: '2026-04-14T03:00:00.000Z',
          finishedAt: '2026-04-14T03:01:00.000Z',
          status: 'completed',
          menuFetchCompleted: 1,
          optionFetchCompleted: 1,
          summaryJson: JSON.stringify({
            platformCode: 'coupangeats',
            fetchedCount: 35,
            fetchMode: 'managed_browser',
            createdMenuCount: 0,
            linkedMappingCount: 0,
            verifiedMappingCount: 35
          })
        }
      ],
      managedChromeSession: {
        endpointUrl: 'http://127.0.0.1:39482',
        connected: false,
        error: 'connection_refused',
        tabs: []
      }
    } as never)

    expect(preview.items).toEqual([])
    expect(preview.needsReview).toEqual([
      expect.objectContaining({
        menuId: 'm12',
        platformCode: 'coupangeats',
        platformMenuId: 'ce-12',
        reason: 'managed_session_write_review'
      })
    ])
  })
})
