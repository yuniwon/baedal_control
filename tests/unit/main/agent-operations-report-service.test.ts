import { describe, expect, it } from 'vitest'
import type {
  ManagedChromeSessionStatus,
  MenuRecord,
  PlatformImportChangeRecord,
  PlatformImportRunRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord,
  PlatformOptionGroupRecord,
  SyncPreviewResult,
  SyncRunItemRecord,
  SyncRunRecord
} from '../../../src/shared/contracts'
import { AgentOperationsReportService } from '../../../src/main/services/agent-operations-report-service'

const menus: MenuRecord[] = [
  {
    menuId: 'menu-1',
    baseName: '왕새우갈비',
    basePrice: 23900,
    isDirty: 1,
    isManaged: 1
  },
  {
    menuId: 'menu-2',
    baseName: '쉬림프골드',
    basePrice: 21000,
    isDirty: 0,
    isManaged: 1
  },
  {
    menuId: 'menu-3',
    baseName: '레거시 메뉴',
    basePrice: 1000,
    isDirty: 0,
    isManaged: 0
  }
]

const mappings: PlatformMenuMappingRecord[] = [
  {
    mappingId: 'menu-1:baemin',
    menuId: 'menu-1',
    platformCode: 'baemin',
    platformMenuId: 'platform-1',
    platformMenuName: '왕새우갈비',
    platformMenuCurrentPrice: 23900,
    platformMenuPriceSummary: '배달 23,900원',
    matchedBy: 'manual',
    isConfirmed: 1
  },
  {
    mappingId: 'menu-1:coupangeats',
    menuId: 'menu-1',
    platformCode: 'coupangeats',
    platformMenuId: 'platform-c1',
    platformMenuName: '왕새우갈비',
    platformMenuCurrentPrice: 23900,
    platformMenuPriceSummary: '기본가 23,900원',
    matchedBy: 'manual',
    isConfirmed: 1
  },
  {
    mappingId: 'menu-2:ddangyo',
    menuId: 'menu-2',
    platformCode: 'ddangyo',
    platformMenuId: 'platform-d1',
    platformMenuName: '쉬림프골드',
    platformMenuCurrentPrice: 21000,
    platformMenuPriceSummary: '배달 21,000원',
    matchedBy: 'manual',
    isConfirmed: 1
  }
]

const platformMenus: PlatformMenuCatalogRecord[] = [
  {
    platformCode: 'baemin',
    platformMenuId: 'platform-1',
    platformMenuName: '왕새우갈비',
    platformMenuCurrentPrice: 23900,
    platformMenuPriceSummary: '배달 23,900원',
    platformMenuStatus: '판매중',
    presenceStatus: 'present',
    lastSeenAt: '2026-04-14T08:00:00.000Z'
  },
  {
    platformCode: 'baemin',
    platformMenuId: 'platform-2',
    platformMenuName: '숨김 메뉴',
    platformMenuCurrentPrice: 1000,
    platformMenuPriceSummary: '배달 1,000원',
    platformMenuStatus: '숨김',
    presenceStatus: 'missing_suspected',
    lastSeenAt: '2026-04-14T08:01:00.000Z'
  },
  {
    platformCode: 'coupangeats',
    platformMenuId: 'platform-c1',
    platformMenuName: '왕새우갈비',
    platformMenuCurrentPrice: 23900,
    platformMenuPriceSummary: '기본가 23,900원',
    platformMenuStatus: '판매중',
    presenceStatus: 'present',
    lastSeenAt: '2026-04-14T08:02:00.000Z'
  },
  {
    platformCode: 'ddangyo',
    platformMenuId: 'platform-d1',
    platformMenuName: '쉬림프골드',
    platformMenuCurrentPrice: 21000,
    platformMenuPriceSummary: '배달 21,000원',
    platformMenuStatus: '판매중',
    presenceStatus: 'present',
    lastSeenAt: '2026-04-14T08:03:00.000Z'
  }
]

const platformOptionGroups: PlatformOptionGroupRecord[] = [
  {
    platformCode: 'baemin',
    optionGroupId: 'og-1',
    optionGroupName: '피자 선택',
    minOrderQuantity: 1,
    maxOrderQuantity: 1,
    options: [
      { optionId: 'opt-1', optionName: '오리지널', optionPrice: 0 },
      { optionId: 'opt-2', optionName: '치즈바이트', optionPrice: 3000 }
    ],
    menus: [{ platformMenuId: 'platform-1', platformMenuName: '왕새우갈비' }],
    presenceStatus: 'present',
    lastSeenAt: '2026-04-14T08:04:00.000Z'
  },
  {
    platformCode: 'baemin',
    optionGroupId: 'og-2',
    optionGroupName: '피자 선택',
    minOrderQuantity: 1,
    maxOrderQuantity: 1,
    options: [
      { optionId: 'opt-3', optionName: '오리지널', optionPrice: 0 },
      { optionId: 'opt-4', optionName: '치즈바이트', optionPrice: 3000 }
    ],
    menus: [{ platformMenuId: 'platform-9', platformMenuName: '세트 전용 메뉴' }],
    presenceStatus: 'present',
    lastSeenAt: '2026-04-14T08:05:00.000Z'
  },
  {
    platformCode: 'ddangyo',
    optionGroupId: 'og-3',
    optionGroupName: '소스 선택',
    minOrderQuantity: 0,
    maxOrderQuantity: 2,
    options: [{ optionId: 'opt-5', optionName: '핫소스', optionPrice: 200 }],
    menus: [{ platformMenuId: 'platform-d1', platformMenuName: '쉬림프골드' }],
    presenceStatus: 'absent_confirmed',
    lastSeenAt: '2026-04-14T08:06:00.000Z'
  }
]

const importRuns: PlatformImportRunRecord[] = [
  {
    importRunId: 'import-baemin-1',
    platformCode: 'baemin',
    startedAt: '2026-04-14T09:00:00.000Z',
    finishedAt: '2026-04-14T09:03:00.000Z',
    status: 'completed',
    menuFetchCompleted: 2,
    optionFetchCompleted: 2,
    summaryJson: '{"fetchedCount":2}',
    errorMessage: null
  },
  {
    importRunId: 'import-coupang-1',
    platformCode: 'coupangeats',
    startedAt: '2026-04-14T08:30:00.000Z',
    finishedAt: '2026-04-14T08:33:00.000Z',
    status: 'completed',
    menuFetchCompleted: 1,
    optionFetchCompleted: 0,
    summaryJson: '{"fetchedCount":1}',
    errorMessage: null
  }
]

const importChanges: PlatformImportChangeRecord[] = [
  {
    changeId: 'change-1',
    importRunId: 'import-baemin-1',
    platformCode: 'baemin',
    entityType: 'menu',
    entityKey: 'platform-2',
    entityName: '숨김 메뉴',
    changeType: 'missing_suspected',
    presenceStatus: 'missing_suspected',
    createdAt: '2026-04-14T09:01:00.000Z'
  },
  {
    changeId: 'change-2',
    importRunId: 'import-baemin-1',
    platformCode: 'baemin',
    entityType: 'option_group',
    entityKey: 'og-1',
    entityName: '피자 선택',
    changeType: 'created',
    presenceStatus: 'present',
    createdAt: '2026-04-14T09:01:30.000Z'
  },
  {
    changeId: 'change-3',
    importRunId: 'import-coupang-1',
    platformCode: 'coupangeats',
    entityType: 'menu',
    entityKey: 'platform-c1',
    entityName: '왕새우갈비',
    changeType: 'price_changed',
    presenceStatus: 'present',
    createdAt: '2026-04-14T08:31:00.000Z'
  }
]

const syncRuns: SyncRunRecord[] = [
  {
    syncRunId: 'sync-1',
    startedAt: '2026-04-14T10:00:00.000Z',
    finishedAt: '2026-04-14T10:01:00.000Z',
    triggerType: 'manual',
    resultSummary: '성공 0건, 실패 1건'
  },
  {
    syncRunId: 'sync-2',
    startedAt: '2026-04-14T09:30:00.000Z',
    finishedAt: '2026-04-14T09:31:00.000Z',
    triggerType: 'manual',
    resultSummary: '성공 1건, 실패 0건'
  }
]

const syncRunItems: SyncRunItemRecord[] = [
  {
    syncRunItemId: 'sync-item-1',
    syncRunId: 'sync-1',
    platformCode: 'baemin',
    menuId: 'menu-1',
    fieldType: 'menu',
    beforeValue: '왕새우갈비',
    afterValue: '{"name":"왕새우갈비","price":23900}',
    status: 'failed',
    errorCode: 'baemin_menu_match_not_found',
    errorMessage: null,
    failureContext: null
  },
  {
    syncRunItemId: 'sync-item-2',
    syncRunId: 'sync-2',
    platformCode: 'ddangyo',
    menuId: 'menu-2',
    fieldType: 'menu',
    beforeValue: '쉬림프골드',
    afterValue: '{"name":"쉬림프골드","price":21000}',
    status: 'success',
    errorCode: null,
    errorMessage: null,
    failureContext: null
  }
]

const preview: SyncPreviewResult = {
  items: [
    {
      platformCode: 'baemin',
      menuId: 'menu-1',
      platformMenuId: 'platform-1',
      previousName: '왕새우갈비',
      previousPrice: 23900,
      nextName: '왕새우갈비',
      nextPrice: 23900
    },
    {
      platformCode: 'ddangyo',
      menuId: 'menu-2',
      platformMenuId: 'platform-d1',
      previousName: '쉬림프골드',
      previousPrice: 21000,
      nextName: '쉬림프골드',
      nextPrice: 22000
    }
  ],
  needsReview: [
    {
      menuId: 'menu-1',
      platformCode: 'baemin',
      platformMenuId: 'platform-2',
      reason: 'source_missing_review',
      detail: '플랫폼 원본 메뉴가 다시 확인될 때까지 보류합니다.'
    },
    {
      menuId: 'menu-1',
      platformCode: 'baemin',
      platformMenuId: 'platform-1',
      reason: 'binding_review',
      detail: '가게 연결 상태를 다시 확인해 주세요.'
    },
    {
      menuId: 'menu-2',
      platformCode: 'ddangyo',
      platformMenuId: 'platform-d1',
      reason: 'price_variant_review',
      detail: '다중 가격 메뉴'
    }
  ]
}

const managedChrome: ManagedChromeSessionStatus = {
  endpointUrl: 'http://127.0.0.1:39482',
  connected: true,
  error: null,
  tabs: [
    {
      tabId: 'tab-1',
      title: '배민 메뉴',
      url: 'https://self.baemin.com/menu',
      type: 'page',
      host: 'self.baemin.com',
      platformCode: 'baemin',
      pageKind: 'menu_list'
    },
    {
      tabId: 'tab-2',
      title: '쿠팡 옵션',
      url: 'https://store.coupangeats.com/merchant/management/menu/1/options',
      type: 'page',
      host: 'store.coupangeats.com',
      platformCode: 'coupangeats',
      pageKind: 'option_list'
    }
  ]
}

const createService = (overrides?: {
  preview?: SyncPreviewResult
  optionGroups?: PlatformOptionGroupRecord[]
  syncRuns?: SyncRunRecord[]
  syncRunItems?: SyncRunItemRecord[]
}) =>
  new AgentOperationsReportService({
    menuRepository: {
      list: () => menus,
      get: (menuId) => menus.find((menu) => menu.menuId === menuId) ?? null
    },
    mappingRepository: {
      listAll: () => mappings,
      listForMenu: (menuId) => mappings.filter((mapping) => mapping.menuId === menuId)
    },
    platformMenuRepository: {
      listAll: () => platformMenus
    },
    platformOptionGroupRepository: {
      listAll: () => overrides?.optionGroups ?? platformOptionGroups
    },
    platformImportRunRepository: {
      listLatest: (limit = 20) => importRuns.slice(0, limit)
    },
    platformImportChangeRepository: {
      listLatest: (limit = 50) => importChanges.slice(0, limit)
    },
    syncRunRepository: {
      list: () => overrides?.syncRuns ?? syncRuns
    },
    syncRunItemRepository: {
      listForRunIds: (syncRunIds) =>
        (overrides?.syncRunItems ?? syncRunItems).filter((item) =>
          syncRunIds.includes(item.syncRunId)
        )
    },
    getSyncPreview: async () => overrides?.preview ?? preview,
    getManagedChromeSession: async () => managedChrome
  })

describe('AgentOperationsReportService', () => {
  it('returns a typed overview envelope', async () => {
    const service = createService()

    const report = await service.getOverviewReport({})

    expect(report).toMatchObject({
      task: 'agent-report-overview',
      generatedAt: expect.any(String),
      summary: expect.any(String),
      data: {
        menuCounts: {
          total: 3,
          managed: 2,
          unmanaged: 1,
          dirty: 1
        }
      }
    })
  })

  it('summarizes menu counts, preview counts, imports, failures, and managed chrome state', async () => {
    const service = createService()

    const report = await service.getOverviewReport({ limit: 3 })

    expect(report.summary).toContain('관리 대상 메뉴')
    expect(report.data.previewCounts.byPlatform.baemin).toEqual({
      executable: 1,
      needsReview: 2
    })
    expect(report.data.latestImports).toHaveLength(2)
    expect(report.data.recentFailures[0]).toMatchObject({
      platformCode: 'baemin',
      errorCode: 'baemin_menu_match_not_found',
      action: expect.any(String),
      retryable: true
    })
    expect(report.data.managedChrome?.connected).toBe(true)
  })

  it('builds prioritized next actions from executable items, review queue items, option groups, and failures', async () => {
    const service = createService()

    const report = await service.getNextActionPlan({ limit: 10 })

    expect(report.task).toBe('agent-plan-next-actions')
    expect(report.summary).toContain('다음 작업')
    expect(report.data.items[0]).toMatchObject({
      kind: 'run_executable',
      priority: 'high',
      platformCode: 'baemin',
      menuId: 'menu-1',
      platformMenuId: 'platform-1'
    })
    expect(report.data.items[0].commands).toEqual([
      expect.objectContaining({
        task: 'sync-run-item'
      })
    ])
    expect(report.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'resolve_review',
          commands: [expect.objectContaining({ task: 'agent-report-menu' })]
        }),
        expect.objectContaining({
          kind: 'review_options',
          commands: [expect.objectContaining({ task: 'agent-report-options' })]
        }),
        expect.objectContaining({
          kind: 'inspect_failures',
          commands: [expect.objectContaining({ task: 'agent-report-platform' })]
        })
      ])
    )
  })

  it('returns a single idle action when there is no pending work', async () => {
    const service = createService({
      preview: { items: [], needsReview: [] },
      optionGroups: [],
      syncRuns: [],
      syncRunItems: []
    })

    const report = await service.getNextActionPlan({ limit: 5 })

    expect(report.data).toEqual({
      total: 1,
      byPriority: { high: 0, medium: 0, low: 1 },
      items: [
        expect.objectContaining({
          kind: 'idle',
          priority: 'low'
        })
      ]
    })
  })

  it('groups repeated failures into one platform-level inspection action', async () => {
    const service = createService({
      syncRuns: [
        {
          syncRunId: 'sync-failure-1',
          startedAt: '2026-04-14T11:00:00.000Z',
          finishedAt: '2026-04-14T11:01:00.000Z',
          triggerType: 'manual',
          resultSummary: '성공 0건, 실패 2건'
        },
        {
          syncRunId: 'sync-failure-2',
          startedAt: '2026-04-14T10:00:00.000Z',
          finishedAt: '2026-04-14T10:01:00.000Z',
          triggerType: 'manual',
          resultSummary: '성공 0건, 실패 1건'
        }
      ],
      syncRunItems: [
        {
          syncRunItemId: 'sync-item-f1',
          syncRunId: 'sync-failure-1',
          platformCode: 'baemin',
          menuId: 'menu-1',
          fieldType: 'menu',
          beforeValue: '왕새우갈비',
          afterValue: '{"name":"왕새우갈비","price":23900}',
          status: 'failed',
          errorCode: 'apply_failed',
          errorMessage: '검색 결과에서 메뉴를 다시 찾지 못했습니다.',
          failureContext: null
        },
        {
          syncRunItemId: 'sync-item-f2',
          syncRunId: 'sync-failure-1',
          platformCode: 'baemin',
          menuId: 'menu-2',
          fieldType: 'menu',
          beforeValue: '쉬림프골드',
          afterValue: '{"name":"쉬림프골드","price":21000}',
          status: 'failed',
          errorCode: 'apply_failed',
          errorMessage: '검색 결과에서 메뉴를 다시 찾지 못했습니다.',
          failureContext: null
        },
        {
          syncRunItemId: 'sync-item-f3',
          syncRunId: 'sync-failure-2',
          platformCode: 'baemin',
          menuId: 'menu-1',
          fieldType: 'menu',
          beforeValue: '왕새우갈비',
          afterValue: '{"name":"왕새우갈비","price":23900}',
          status: 'failed',
          errorCode: 'apply_failed',
          errorMessage: '입력창을 찾지 못했습니다.',
          failureContext: null
        }
      ]
    })

    const report = await service.getNextActionPlan({ platformCode: 'baemin', limit: 10 })

    const failureActions = report.data.items.filter((item) => item.kind === 'inspect_failures')

    expect(failureActions).toHaveLength(1)
    expect(failureActions[0]).toMatchObject({
      priority: 'medium',
      platformCode: 'baemin',
      title: '배민 최근 실패 점검'
    })
    expect(failureActions[0].detail).toContain('최근 실패 3건')
    expect(failureActions[0].evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining('검색 결과에서 메뉴를 다시 찾지 못했습니다. 2건'),
        expect.stringContaining('입력창을 찾지 못했습니다. 1건')
      ])
    )
  })

  it('groups repeated option structure reviews by platform and display name', async () => {
    const service = createService({
      preview: { items: [], needsReview: [] },
      syncRuns: [],
      syncRunItems: [],
      optionGroups: [
        {
          platformCode: 'baemin',
          optionGroupId: 'shape-1',
          optionGroupName: '도우 추가선택',
          minOrderQuantity: 0,
          maxOrderQuantity: 1,
          options: [
            { optionId: 'shape-1-opt-1', optionName: '씬도우', optionPrice: 1000 },
            { optionId: 'shape-1-opt-2', optionName: '치즈크러스트', optionPrice: 3000 }
          ],
          menus: [{ platformMenuId: 'shape-menu-1', platformMenuName: '왕새우갈비' }],
          presenceStatus: 'present',
          lastSeenAt: '2026-04-14T08:07:00.000Z'
        },
        {
          platformCode: 'baemin',
          optionGroupId: 'shape-2',
          optionGroupName: '도우 추가선택',
          minOrderQuantity: 0,
          maxOrderQuantity: 1,
          options: [
            { optionId: 'shape-2-opt-1', optionName: '씬도우', optionPrice: 1000 },
            { optionId: 'shape-2-opt-2', optionName: '리치골드', optionPrice: 5000 }
          ],
          menus: [{ platformMenuId: 'shape-menu-2', platformMenuName: '쉬림프골드' }],
          presenceStatus: 'present',
          lastSeenAt: '2026-04-14T08:08:00.000Z'
        }
      ]
    })

    const report = await service.getNextActionPlan({ platformCode: 'baemin', limit: 10 })

    const optionActions = report.data.items.filter((item) => item.kind === 'review_options')

    expect(optionActions).toHaveLength(1)
    expect(optionActions[0]).toMatchObject({
      priority: 'medium',
      platformCode: 'baemin',
      title: '도우 추가선택 옵션 구조 검토'
    })
    expect(optionActions[0].detail).toContain('구조 2개')
    expect(optionActions[0].evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining('원본 그룹 2개'),
        expect.stringContaining('연결 메뉴 2개')
      ])
    )
  })

  it('filters review queue items by platform, reason, menuId, and limit', async () => {
    const service = createService()

    const report = await service.getReviewQueueReport({
      platformCode: 'baemin',
      reason: 'source_missing_review',
      menuId: 'menu-1',
      limit: 1
    })

    expect(report.data.total).toBe(1)
    expect(report.data.items).toEqual([
      expect.objectContaining({
        menuId: 'menu-1',
        menuName: '왕새우갈비',
        platformCode: 'baemin',
        reason: 'source_missing_review'
      })
    ])
  })

  it('returns menu detail with mappings, preview subsets, logical option groups, and recent runs', async () => {
    const service = createService()

    const report = await service.getMenuReport('menu-1', { limit: 2 })

    expect(report.data.menu.baseName).toBe('왕새우갈비')
    expect(report.data.mappings).toHaveLength(2)
    expect(report.data.preview.executable).toHaveLength(1)
    expect(report.data.preview.needsReview).toHaveLength(2)
    expect(report.data.logicalOptionGroups[0].displayName).toBe('피자 선택')
    expect(report.data.recentRuns[0].items).toEqual(
      expect.arrayContaining([expect.objectContaining({ menuId: 'menu-1' })])
    )
  })

  it('summarizes logical option groups with status counts', async () => {
    const service = createService()

    const report = await service.getOptionsReport({ limit: 2 })

    expect(report.data.total).toBe(2)
    expect(report.data.byStatus.merge_candidate).toBe(1)
    expect(report.data.byStatus.absent_confirmed).toBe(1)
    expect(report.data.groups).toHaveLength(2)
  })

  it('returns platform detail with import history, review queue, failures, and managed chrome tabs', async () => {
    const service = createService()

    const report = await service.getPlatformReport('baemin', { limit: 3 })

    expect(report.data.platformCode).toBe('baemin')
    expect(report.data.menuCount).toBe(2)
    expect(report.data.optionGroupCount).toBe(2)
    expect(report.data.latestImport?.platformCode).toBe('baemin')
    expect(report.data.latestChanges.every((item) => item.platformCode === 'baemin')).toBe(true)
    expect(report.data.reviewQueue.every((item) => item.platformCode === 'baemin')).toBe(true)
    expect(report.data.recentFailures.every((item) => item.platformCode === 'baemin')).toBe(true)
    expect(report.data.managedChrome?.tabs).toEqual([
      expect.objectContaining({
        platformCode: 'baemin'
      })
    ])
  })
})
