import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { CatalogImportOrchestrator } from '../../../src/main/services/catalog-import-orchestrator'
import { buildOptionSignature } from '../../../src/main/services/option-signature'
import { MappingRepository } from '../../../src/main/repositories/mapping-repository'
import { MenuRepository } from '../../../src/main/repositories/menu-repository'
import { PlatformImportChangeRepository } from '../../../src/main/repositories/platform-import-change-repository'
import { PlatformImportRunRepository } from '../../../src/main/repositories/platform-import-run-repository'
import { PlatformMenuRepository } from '../../../src/main/repositories/platform-menu-repository'
import { PlatformOptionGroupRepository } from '../../../src/main/repositories/platform-option-group-repository'
import { CatalogWorkspaceRepository } from '../../../src/main/repositories/catalog-workspace-repository'
import { CatalogReviewRepository } from '../../../src/main/repositories/catalog-review-repository'
import { CatalogIntentRuleRepository } from '../../../src/main/repositories/catalog-intent-rule-repository'

const createInspection = () => ({
  platformCode: 'baemin' as const,
  steps: [
    {
      kind: 'navigation' as const,
      title: '메뉴 페이지',
      recordedAt: '2026-04-13T00:00:00.000Z'
    }
  ]
})

describe('CatalogImportOrchestrator', () => {
  let db: ReturnType<typeof createInMemoryConnection>
  let menuRepository: MenuRepository
  let mappingRepository: MappingRepository
  let platformMenuRepository: PlatformMenuRepository
  let platformOptionGroupRepository: PlatformOptionGroupRepository
  let platformImportRunRepository: PlatformImportRunRepository
  let platformImportChangeRepository: PlatformImportChangeRepository
  let catalogWorkspaceRepository: CatalogWorkspaceRepository
  let catalogReviewRepository: CatalogReviewRepository
  let catalogIntentRuleRepository: CatalogIntentRuleRepository
  let adapter: {
    capabilities?: {
      optionCatalog?: boolean
    }
    fetchMenus: ReturnType<typeof vi.fn>
    fetchMenusWithInspection?: ReturnType<typeof vi.fn>
    fetchOptionGroups?: ReturnType<typeof vi.fn>
  }

  const createOrchestrator = () =>
    new CatalogImportOrchestrator({
      db,
      adapterRegistry: {
        getReader: () => ({
          fetchCatalog: async () => {
            const result = adapter.fetchMenusWithInspection
              ? await adapter.fetchMenusWithInspection()
              : { menus: await adapter.fetchMenus() }
            if (result.optionCatalogFetched === true || !adapter.fetchOptionGroups) {
              return result
            }
            return {
              ...result,
              optionGroups: await adapter.fetchOptionGroups(),
              optionCatalogFetched: true
            }
          }
        })
      },
      menuRepository,
      mappingRepository,
      platformMenuRepository,
      platformOptionGroupRepository,
      platformImportRunRepository,
      platformImportChangeRepository,
      catalogWorkspaceRepository,
      catalogReviewRepository,
      catalogIntentRuleRepository,
      createId: (() => {
        let next = 1
        return () => `run-${next++}`
      })()
    })

  beforeEach(() => {
    db = createInMemoryConnection()
    migrate(db)
    menuRepository = new MenuRepository(db)
    mappingRepository = new MappingRepository(db)
    platformMenuRepository = new PlatformMenuRepository(db)
    platformOptionGroupRepository = new PlatformOptionGroupRepository(db)
    platformImportRunRepository = new PlatformImportRunRepository(db)
    platformImportChangeRepository = new PlatformImportChangeRepository(db)
    catalogWorkspaceRepository = new CatalogWorkspaceRepository(db)
    catalogReviewRepository = new CatalogReviewRepository(db)
    catalogIntentRuleRepository = new CatalogIntentRuleRepository(db)
    adapter = {
      fetchMenus: vi.fn()
    }
  })

  const activateCatalog = () => {
    catalogWorkspaceRepository.save({
      ...catalogWorkspaceRepository.getDefault(),
      lifecycleState: 'active',
      seedMode: 'legacy',
      canonicalVersion: 1,
      activatedAt: '2026-07-25T00:00:00.000Z'
    })
  }

  it('stores complete source data without creating canonical menus while the workspace is collecting', async () => {
    adapter.fetchMenus.mockResolvedValue([
      {
        platformMenuId: 'platform-1',
        platformMenuName: '감자피자',
        currentPrice: 19900
      }
    ])

    const result = await createOrchestrator().importPlatform('baemin')

    expect(platformMenuRepository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        platformMenuId: 'platform-1',
        platformMenuName: '감자피자'
      })
    ])
    expect(menuRepository.list()).toEqual([])
    expect(mappingRepository.listAll()).toEqual([])
    expect(result.summary).toEqual({
      platformCode: 'baemin',
      fetchedCount: 1,
      createdMenuCount: 0,
      linkedMappingCount: 0,
      verifiedMappingCount: 0
    })
  })

  it('does not create or attach canonical menus for unmatched sources after activation', async () => {
    activateCatalog()
    adapter.fetchMenus.mockResolvedValue([
      {
        platformMenuId: 'platform-2',
        platformMenuName: '새로 발견된 메뉴',
        currentPrice: 22900
      }
    ])

    const result = await createOrchestrator().importPlatform('baemin')

    expect(platformMenuRepository.listAll()).toHaveLength(1)
    expect(menuRepository.list()).toEqual([])
    expect(mappingRepository.listAll()).toEqual([])
    expect(result.summary).toEqual({
      platformCode: 'baemin',
      fetchedCount: 1,
      createdMenuCount: 0,
      linkedMappingCount: 0,
      verifiedMappingCount: 0
    })
  })

  it('refreshes explainable review items after a complete active import', async () => {
    activateCatalog()
    menuRepository.upsert({
      menuId: 'menu-1',
      baseName: '킹쉬림프피자',
      basePrice: 25900,
      isDirty: 0,
      isManaged: 1
    })
    adapter.fetchMenus.mockResolvedValue([
      {
        platformMenuId: 'new-source',
        platformMenuName: '감자피자',
        currentPrice: 19900
      }
    ])

    await createOrchestrator().importPlatform('coupangeats')

    expect(catalogReviewRepository.listOpen('default')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'missing_on_platform',
          canonicalMenuId: 'menu-1',
          platformCode: 'coupangeats'
        }),
        expect.objectContaining({
          kind: 'unmatched_platform_menu',
          sourceEntityId: 'new-source',
          platformCode: 'coupangeats'
        })
      ])
    )
  })

  it('does not advance absence state when the menu catalog is explicitly incomplete', async () => {
    platformMenuRepository.upsertSeenBatch('coupangeats', 'run-prev', [
      {
        platformCode: 'coupangeats',
        platformMenuId: 'platform-1',
        platformMenuName: '킹쉬림프피자'
      }
    ])
    adapter.fetchMenusWithInspection = vi.fn().mockResolvedValue({
      menus: [],
      completeness: {
        menuCatalog: 'incomplete',
        optionCatalog: 'unknown',
        optionBindings: 'unknown',
        expectedMenuCount: 1,
        collectedMenuCount: 0,
        collectedOptionGroupCount: 0,
        issues: ['menu_count_mismatch:0/1']
      }
    })

    await expect(createOrchestrator().importPlatform('coupangeats')).rejects.toThrow(
      'platform_menu_catalog_incomplete:menu_count_mismatch:0/1'
    )

    expect(platformMenuRepository.listAll()).toEqual([
      expect.objectContaining({
        platformMenuId: 'platform-1',
        missingStreak: 0,
        presenceStatus: 'present'
      })
    ])
    expect(platformImportRunRepository.listLatest()).toEqual([
      expect.objectContaining({
        status: 'partial_failed',
        menuFetchCompleted: 0
      })
    ])
  })

  it('rejects an option catalog whose reported menu bindings are incomplete', async () => {
    adapter.fetchMenusWithInspection = vi.fn().mockResolvedValue({
      menus: [
        {
          platformMenuId: 'platform-1',
          platformMenuName: '킹쉬림프피자',
          currentPrice: 25900
        }
      ],
      optionGroups: [
        {
          optionGroupId: 'size',
          optionGroupName: '사이즈 선택',
          mappingMenusCount: 17,
          options: [],
          menus: [
            {
              platformMenuId: 'platform-1',
              platformMenuName: '킹쉬림프피자'
            }
          ]
        }
      ],
      optionCatalogFetched: true,
      completeness: {
        menuCatalog: 'complete',
        optionCatalog: 'complete',
        optionBindings: 'incomplete',
        expectedMenuCount: 1,
        collectedMenuCount: 1,
        expectedOptionGroupCount: 1,
        collectedOptionGroupCount: 1,
        issues: ['option_binding_count_mismatch:size:1/17']
      }
    })

    await expect(createOrchestrator().importPlatform('coupangeats')).rejects.toThrow(
      'platform_option_bindings_incomplete:option_binding_count_mismatch:size:1/17'
    )

    expect(platformMenuRepository.listAll()).toEqual([])
    expect(platformOptionGroupRepository.listAll()).toEqual([])
    expect(platformImportRunRepository.listLatest()).toEqual([
      expect.objectContaining({
        status: 'partial_failed',
        menuFetchCompleted: 0,
        optionFetchCompleted: 0
      })
    ])
  })

  it('marks the first miss as missing_suspected and keeps the mapping active', async () => {
    activateCatalog()
    menuRepository.upsert({
      menuId: 'menu-1',
      baseName: '감자피자',
      basePrice: 19900,
      isDirty: 0,
      isManaged: 1
    })
    mappingRepository.upsert({
      mappingId: 'menu-1:baemin',
      menuId: 'menu-1',
      platformCode: 'baemin',
      platformMenuId: 'platform-1',
      platformMenuName: '감자피자',
      matchedBy: 'manual',
      isConfirmed: 1
    })
    platformMenuRepository.upsertSeenBatch('baemin', 'run-prev', [
      {
        platformCode: 'baemin',
        platformMenuId: 'platform-1',
        platformMenuName: '감자피자'
      }
    ])

    adapter.fetchMenus.mockResolvedValue([])

    const orchestrator = createOrchestrator()
    await orchestrator.importPlatform('baemin')

    expect(platformMenuRepository.listAll()).toEqual([
      expect.objectContaining({
        platformMenuId: 'platform-1',
        missingStreak: 1,
        presenceStatus: 'missing_suspected'
      })
    ])
    expect(mappingRepository.listForMenu('menu-1')).toEqual([
      expect.objectContaining({
        mappingStatus: 'active'
      })
    ])
    expect(platformImportChangeRepository.listLatest()).toEqual([
      expect.objectContaining({
        changeType: 'missing_suspected',
        entityType: 'menu'
      })
    ])
  })

  it('marks the second miss as absent_confirmed and deactivates the mapping', async () => {
    activateCatalog()
    menuRepository.upsert({
      menuId: 'menu-1',
      baseName: '감자피자',
      basePrice: 19900,
      isDirty: 0,
      isManaged: 1
    })
    mappingRepository.upsert({
      mappingId: 'menu-1:baemin',
      menuId: 'menu-1',
      platformCode: 'baemin',
      platformMenuId: 'platform-1',
      platformMenuName: '예전 감자피자',
      matchedBy: 'manual',
      isConfirmed: 1
    })
    mappingRepository.upsert({
      mappingId: 'menu-1:baemin',
      menuId: 'menu-1',
      platformCode: 'baemin',
      platformMenuId: 'platform-1',
      platformMenuName: '감자피자',
      matchedBy: 'manual',
      isConfirmed: 1
    })
    platformMenuRepository.upsertSeenBatch('baemin', 'run-prev', [
      {
        platformCode: 'baemin',
        platformMenuId: 'platform-1',
        platformMenuName: '감자피자'
      }
    ])
    platformMenuRepository.applyPresenceUpdates([
      {
        platformCode: 'baemin',
        platformMenuId: 'platform-1',
        missingStreak: 1,
        presenceStatus: 'missing_suspected'
      }
    ])

    adapter.fetchMenus.mockResolvedValue([])

    const orchestrator = createOrchestrator()
    await orchestrator.importPlatform('baemin')

    expect(platformMenuRepository.listAll()).toEqual([
      expect.objectContaining({
        platformMenuId: 'platform-1',
        missingStreak: 2,
        presenceStatus: 'absent_confirmed'
      })
    ])
    expect(mappingRepository.listForMenu('menu-1')).toEqual([
      expect.objectContaining({
        mappingStatus: 'source_absent'
      })
    ])
    expect(menuRepository.list()).toEqual([
      expect.objectContaining({
        menuId: 'menu-1',
        isManaged: 0
      })
    ])
  })

  it('seeds legacy active mappings without catalog rows so the first miss becomes missing_suspected', async () => {
    activateCatalog()
    menuRepository.upsert({
      menuId: 'menu-legacy',
      baseName: '숨김 테스트 피자',
      basePrice: 19900,
      isDirty: 0,
      isManaged: 1
    })
    mappingRepository.upsert({
      mappingId: 'menu-legacy:baemin',
      menuId: 'menu-legacy',
      platformCode: 'baemin',
      platformMenuId: 'legacy-platform-1',
      platformMenuName: '숨김 테스트 피자',
      platformMenuGroupName: '예전 숨김 그룹',
      platformMenuStatus: '숨김',
      platformMenuPriceSummary: '배달 19,900원 · 픽업 19,900원',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    adapter.fetchMenus.mockResolvedValue([])

    const orchestrator = createOrchestrator()
    await orchestrator.importPlatform('baemin')

    expect(platformMenuRepository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        platformMenuId: 'legacy-platform-1',
        platformMenuName: '숨김 테스트 피자',
        platformMenuGroupName: '예전 숨김 그룹',
        platformMenuStatus: '숨김',
        missingStreak: 1,
        presenceStatus: 'missing_suspected'
      })
    ])
    expect(mappingRepository.listForMenu('menu-legacy')).toEqual([
      expect.objectContaining({
        mappingStatus: 'active'
      })
    ])
    expect(platformImportChangeRepository.listLatest()).toEqual([
      expect.objectContaining({
        entityType: 'menu',
        entityKey: 'legacy-platform-1',
        changeType: 'missing_suspected',
        entityName: '숨김 테스트 피자'
      })
    ])
  })

  it('promotes seeded legacy mappings to source_absent on the second consecutive miss', async () => {
    activateCatalog()
    menuRepository.upsert({
      menuId: 'menu-legacy',
      baseName: '숨김 테스트 피자',
      basePrice: 19900,
      isDirty: 0,
      isManaged: 1
    })
    mappingRepository.upsert({
      mappingId: 'menu-legacy:baemin',
      menuId: 'menu-legacy',
      platformCode: 'baemin',
      platformMenuId: 'legacy-platform-1',
      platformMenuName: '숨김 테스트 피자',
      platformMenuGroupName: '예전 숨김 그룹',
      platformMenuStatus: '숨김',
      platformMenuPriceSummary: '배달 19,900원 · 픽업 19,900원',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    adapter.fetchMenus.mockResolvedValue([])

    const orchestrator = createOrchestrator()
    await orchestrator.importPlatform('baemin')
    await orchestrator.importPlatform('baemin')

    expect(platformMenuRepository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        platformMenuId: 'legacy-platform-1',
        missingStreak: 2,
        presenceStatus: 'absent_confirmed'
      })
    ])
    expect(mappingRepository.listForMenu('menu-legacy')).toEqual([
      expect.objectContaining({
        mappingStatus: 'source_absent'
      })
    ])
    expect(menuRepository.list()).toEqual([
      expect.objectContaining({
        menuId: 'menu-legacy',
        isManaged: 0
      })
    ])
  })

  it('does not apply presence updates when option fetch fails partially', async () => {
    const fetchedMenus = [
      {
        platformMenuId: 'platform-1',
        platformMenuName: '감자피자',
        currentPrice: 19900
      }
    ]
    adapter.fetchMenus.mockResolvedValue(fetchedMenus)
    adapter.fetchMenusWithInspection = vi.fn().mockResolvedValue({
      menus: fetchedMenus,
      inspection: createInspection()
    })
    adapter.fetchOptionGroups = vi.fn().mockRejectedValue(new Error('timeout'))

    const orchestrator = createOrchestrator()

    await expect(orchestrator.importPlatform('baemin')).rejects.toThrow('timeout')
    expect(platformMenuRepository.listAll()).toEqual([])
    expect(platformOptionGroupRepository.listAll()).toEqual([])
    expect(platformImportChangeRepository.listLatest()).toEqual([])
    expect(platformImportRunRepository.listLatest()).toEqual([
      expect.objectContaining({
        status: 'partial_failed',
        errorMessage: 'timeout'
      })
    ])
  })

  it('skips option absence tracking when the platform only hints at option catalog support', async () => {
    platformOptionGroupRepository.upsertSeenBatch('baemin', 'run-prev', [
      {
        platformCode: 'baemin',
        optionGroupId: 'group-1',
        optionGroupName: '사이즈 추가',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        mappingMenusCount: 1,
        options: [
          {
            optionId: 'o-1',
            optionName: 'M',
            optionPrice: 0,
            itemStatus: 'ACTIVE',
            restockedAt: null
          }
        ],
        menus: [
          {
            platformMenuId: 'platform-1',
            platformMenuName: '감자피자',
            platformMenuGroupName: '대표 메뉴'
          }
        ],
        signatureKey: 'persisted-signature-should-not-matter'
      }
    ])

    adapter.capabilities = { optionCatalog: true }
    adapter.fetchMenus.mockResolvedValue([])

    const orchestrator = createOrchestrator()
    await orchestrator.importPlatform('baemin')

    expect(platformOptionGroupRepository.listAll()).toEqual([
      expect.objectContaining({
        optionGroupId: 'group-1',
        missingStreak: 0,
        presenceStatus: 'present'
      })
    ])
    expect(platformImportRunRepository.listLatest()).toEqual([
      expect.objectContaining({
        status: 'completed',
        optionFetchCompleted: 0
      })
    ])
  })

  it('deduplicates menus, preserves binding metadata, and stores option signatures', async () => {
    activateCatalog()
    menuRepository.upsert({
      menuId: 'menu-1',
      baseName: '감자피자',
      basePrice: 19900,
      isDirty: 0,
      isManaged: 1
    })
    mappingRepository.upsert({
      mappingId: 'menu-1:baemin',
      menuId: 'menu-1',
      platformCode: 'baemin',
      platformMenuId: 'platform-1',
      platformMenuName: '예전 감자피자',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    const fetchedMenus = [
      {
        platformMenuId: 'platform-1',
        platformMenuName: '감자피자',
        currentPrice: 19900,
        platformMenuGroupName: '대표 메뉴',
        platformMenuStatus: '판매중',
        platformMenuPriceSummary: '배달 19,900원',
        platformMenuBindingLabels: ['  본점  ']
      },
      {
        platformMenuId: 'platform-1',
        platformMenuName: '감자피자',
        currentPrice: 19900,
        platformMenuGroupName: '대표 메뉴',
        platformMenuStatus: '판매중',
        platformMenuPriceSummary: '배달 19,900원',
        platformMenuBindingLabels: ['본점', '  본점  ']
      },
      {
        platformMenuId: 'platform-2',
        platformMenuName: '치즈피자',
        currentPrice: 22900,
        platformMenuGroupName: '대표 메뉴',
        platformMenuStatus: '판매중',
        platformMenuPriceSummary: '배달 22,900원',
        platformMenuBindingLabels: []
      }
    ]
    adapter.fetchMenus = vi.fn().mockResolvedValue(fetchedMenus)
    adapter.fetchMenusWithInspection = vi.fn().mockResolvedValue({
      menus: fetchedMenus,
      inspection: createInspection()
    })
    adapter.fetchOptionGroups = vi.fn().mockResolvedValue([
      {
        optionGroupId: 'group-1',
        optionGroupName: '  사이즈   추가 ',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        mappingMenusCount: 2,
        options: [
          {
            optionId: 'o-2',
            optionName: 'L',
            optionPrice: 3000,
            itemStatus: 'ACTIVE',
            restockedAt: null
          },
          {
            optionId: 'o-1',
            optionName: 'M',
            optionPrice: 0,
            itemStatus: 'ACTIVE',
            restockedAt: null
          }
        ],
        menus: [
          {
            platformMenuId: 'platform-1',
            platformMenuName: '감자피자',
            platformMenuGroupName: '대표 메뉴'
          }
        ]
      }
    ])

    const orchestrator = createOrchestrator()
    const result = await orchestrator.importPlatform('baemin')

    expect(result.summary).toEqual({
      platformCode: 'baemin',
      fetchedCount: 2,
      optionGroupCount: 1,
      duplicateMenuCount: 1,
      createdMenuCount: 0,
      linkedMappingCount: 0,
      verifiedMappingCount: 1
    })
    expect(result.inspection).toEqual(
      expect.objectContaining({
        platformCode: 'baemin',
        steps: expect.arrayContaining([
          expect.objectContaining({
            kind: 'navigation',
            title: '메뉴 페이지'
          }),
          expect.objectContaining({
            kind: 'result',
            title: '가져오기 완료'
          })
        ])
      })
    )

    expect(platformMenuRepository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        platformMenuId: 'platform-1',
        platformMenuBindingStatus: '연결 정상',
        platformMenuBindingSummary: '본점'
      }),
      expect.objectContaining({
        platformCode: 'baemin',
        platformMenuId: 'platform-2',
        platformMenuBindingStatus: '가게 연결 없음',
        platformMenuBindingSummary: '연결 가게 없음'
      })
    ])
    expect(platformOptionGroupRepository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        optionGroupId: 'group-1',
        signatureKey: buildOptionSignature({
          optionGroupName: '  사이즈   추가 ',
          minOrderQuantity: 1,
          maxOrderQuantity: 1,
          options: [
            {
              optionId: 'o-2',
              optionName: 'L',
              optionPrice: 3000,
              itemStatus: 'ACTIVE',
              restockedAt: null
            },
            {
              optionId: 'o-1',
              optionName: 'M',
              optionPrice: 0,
              itemStatus: 'ACTIVE',
              restockedAt: null
            }
          ]
        })
      })
    ])
    expect(platformImportRunRepository.listLatest()).toEqual([
      expect.objectContaining({
        status: 'completed',
        summaryJson: JSON.stringify({
          platformCode: 'baemin',
          fetchedCount: 2,
          optionGroupCount: 1,
          duplicateMenuCount: 1,
          createdMenuCount: 0,
          linkedMappingCount: 0,
          verifiedMappingCount: 1
        })
      })
    ])
  })

  it('rolls back all post-fetch mutations when a late write fails', async () => {
    const fetchedMenus = [
      {
        platformMenuId: 'platform-1',
        platformMenuName: '감자피자',
        currentPrice: 19900
      }
    ]

    adapter.fetchMenus.mockResolvedValue(fetchedMenus)
    adapter.fetchOptionGroups = vi.fn().mockResolvedValue([
      {
        optionGroupId: 'group-1',
        optionGroupName: '사이즈 추가',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        mappingMenusCount: 1,
        options: [
          {
            optionId: 'o-1',
            optionName: 'M',
            optionPrice: 0,
            itemStatus: 'ACTIVE',
            restockedAt: null
          }
        ],
        menus: [
          {
            platformMenuId: 'platform-1',
            platformMenuName: '감자피자',
            platformMenuGroupName: '대표 메뉴'
          }
        ]
      }
    ])

    const originalReplaceForRun = platformImportChangeRepository.replaceForRun.bind(
      platformImportChangeRepository
    )
    vi.spyOn(platformImportChangeRepository, 'replaceForRun').mockImplementation((...args) => {
      originalReplaceForRun(...args)
      throw new Error('late write failure')
    })

    const orchestrator = createOrchestrator()

    await expect(orchestrator.importPlatform('baemin')).rejects.toThrow('late write failure')

    expect(menuRepository.list()).toEqual([])
    expect(mappingRepository.listAll()).toEqual([])
    expect(platformMenuRepository.listAll()).toEqual([])
    expect(platformOptionGroupRepository.listAll()).toEqual([])
    expect(platformImportChangeRepository.listLatest()).toEqual([])
    expect(platformImportRunRepository.listLatest()).toEqual([
      expect.objectContaining({
        status: 'partial_failed',
        menuFetchCompleted: 1,
        optionFetchCompleted: 1,
        errorMessage: 'late write failure'
      })
    ])
  })

  it('keeps source_absent mappings and does not auto-restore managed menus on resurfaced sources', async () => {
    activateCatalog()
    menuRepository.upsert({
      menuId: 'menu-1',
      baseName: '감자피자',
      basePrice: 19900,
      isDirty: 0,
      isManaged: 1
    })
    mappingRepository.upsert({
      mappingId: 'menu-1:baemin',
      menuId: 'menu-1',
      platformCode: 'baemin',
      platformMenuId: 'platform-1',
      platformMenuName: '감자피자',
      matchedBy: 'manual',
      isConfirmed: 1
    })
    platformMenuRepository.upsertSeenBatch('baemin', 'run-prev', [
      {
        platformCode: 'baemin',
        platformMenuId: 'platform-1',
        platformMenuName: '감자피자'
      }
    ])
    platformMenuRepository.applyPresenceUpdates([
      {
        platformCode: 'baemin',
        platformMenuId: 'platform-1',
        missingStreak: 1,
        presenceStatus: 'missing_suspected'
      }
    ])

    const orchestrator = createOrchestrator()
    adapter.fetchMenus.mockResolvedValue([])
    await orchestrator.importPlatform('baemin')

    adapter.fetchMenus.mockResolvedValue([
      {
        platformMenuId: 'platform-1',
        platformMenuName: '감자피자',
        currentPrice: 19900
      }
    ])

    await orchestrator.importPlatform('baemin')

    expect(platformMenuRepository.listAll()).toEqual([
      expect.objectContaining({
        platformMenuId: 'platform-1',
        presenceStatus: 'resurfaced'
      })
    ])
    expect(mappingRepository.listForMenu('menu-1')).toEqual([
      expect.objectContaining({
        mappingStatus: 'source_absent'
      })
    ])
    expect(menuRepository.list()).toEqual([
      expect.objectContaining({
        menuId: 'menu-1',
        isManaged: 0
      })
    ])
  })

  it('uses option groups returned together with fetchMenusWithInspection without calling a second option fetch', async () => {
    adapter.fetchMenusWithInspection = vi.fn().mockResolvedValue({
      menus: [
        {
          platformMenuId: 'dish-1',
          platformMenuName: '왕새우갈비',
          currentPrice: 23900
        },
        {
          platformMenuId: 'dish-1',
          platformMenuName: '왕새우갈비',
          currentPrice: 23900
        }
      ],
      optionGroups: [
        {
          optionGroupId: 'option-1',
          optionGroupName: '기본',
          minOrderQuantity: 1,
          maxOrderQuantity: 1,
          mappingMenusCount: 1,
          options: [
            {
              optionId: 'item-1',
              optionName: 'L',
              optionPrice: 4000,
              itemStatus: '판매중',
              restockedAt: null
            }
          ],
          menus: [
            {
              platformMenuId: 'dish-1',
              platformMenuName: '왕새우갈비',
              platformMenuGroupName: null
            }
          ]
        }
      ],
      rawMenuCount: 2,
      fetchMode: 'managed_browser',
      optionCatalogFetched: true,
      inspection: createInspection()
    })
    adapter.fetchOptionGroups = vi.fn().mockRejectedValue(new Error('should not be called'))

    const orchestrator = createOrchestrator()
    await orchestrator.importPlatform('coupangeats')

    expect(adapter.fetchOptionGroups).not.toHaveBeenCalled()
    expect(platformOptionGroupRepository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'coupangeats',
        optionGroupId: 'option-1',
        optionGroupName: '기본',
        mappingMenusCount: 1
      })
    ])
    const latestRun = platformImportRunRepository.listLatest()[0]
    expect(latestRun?.summaryJson ? JSON.parse(latestRun.summaryJson) : null).toEqual(
      expect.objectContaining({
        platformCode: 'coupangeats',
        fetchedCount: 1,
        optionGroupCount: 1,
        duplicateMenuCount: 1,
        fetchMode: 'managed_browser',
        createdMenuCount: 0,
        linkedMappingCount: 0,
        verifiedMappingCount: 0
      })
    )
    expect(platformImportRunRepository.listLatest()).toEqual([
      expect.objectContaining({
        platformCode: 'coupangeats',
        status: 'completed',
        optionFetchCompleted: 1
      })
    ])
  })

  it('preserves an existing source-id mapping even when names are no longer a safe automatic match', async () => {
    activateCatalog()
    menuRepository.upsert({
      menuId: 'menu-cola',
      baseName: '콜라',
      basePrice: 1800,
      isDirty: 0,
      isManaged: 1
    })
    mappingRepository.upsert({
      mappingId: 'menu-cola:coupangeats',
      menuId: 'menu-cola',
      platformCode: 'coupangeats',
      platformMenuId: 'set-3',
      platformMenuName: 'Set. 3(피자M 스파게티 훈제치킨 콜라)',
      matchedBy: 'auto',
      isConfirmed: 1
    })

    const fetchedMenus = [
      {
        platformMenuId: 'set-3',
        platformMenuName: 'Set. 3(피자M 스파게티 훈제치킨 콜라)',
        currentPrice: 40000,
        platformMenuGroupName: '가성비 최고의 알뜰세트',
        platformMenuStatus: '판매중',
        platformMenuPriceSummary: '40,000원'
      }
    ]
    adapter.fetchMenusWithInspection = vi.fn().mockResolvedValue({
      menus: fetchedMenus,
      inspection: createInspection()
    })
    adapter.fetchOptionGroups = vi.fn().mockResolvedValue([])

    const orchestrator = createOrchestrator()
    const result = await orchestrator.importPlatform('coupangeats')

    expect(result.summary).toEqual({
      platformCode: 'coupangeats',
      fetchedCount: 1,
      createdMenuCount: 0,
      linkedMappingCount: 0,
      verifiedMappingCount: 1
    })
    expect(menuRepository.list()).toEqual([
      expect.objectContaining({
        menuId: 'menu-cola',
        baseName: '콜라'
      })
    ])
    expect(mappingRepository.listAll()).toEqual([
      expect.objectContaining({
        menuId: 'menu-cola',
        platformCode: 'coupangeats',
        platformMenuId: 'set-3',
        platformMenuName: 'Set. 3(피자M 스파게티 훈제치킨 콜라)',
        matchedBy: 'auto'
      })
    ])
  })

  it('keeps existing auto mappings when names only differ by harmless trailing detail', async () => {
    activateCatalog()
    menuRepository.upsert({
      menuId: 'menu-set-1',
      baseName: 'Set 1',
      basePrice: 27000,
      isDirty: 0,
      isManaged: 1
    })
    mappingRepository.upsert({
      mappingId: 'menu-set-1:coupangeats',
      menuId: 'menu-set-1',
      platformCode: 'coupangeats',
      platformMenuId: 'set-1',
      platformMenuName: 'Set 1',
      matchedBy: 'auto',
      isConfirmed: 1
    })

    adapter.fetchMenusWithInspection = vi.fn().mockResolvedValue({
      menus: [
        {
          platformMenuId: 'set-1',
          platformMenuName: 'Set 1 (피자M 스파게티 콜라)',
          currentPrice: 27000,
          platformMenuGroupName: '가성비 최고의 알뜰세트',
          platformMenuStatus: '판매중',
          platformMenuPriceSummary: '27,000원'
        }
      ],
      inspection: createInspection()
    })
    adapter.fetchOptionGroups = vi.fn().mockResolvedValue([])

    const orchestrator = createOrchestrator()
    const result = await orchestrator.importPlatform('coupangeats')

    expect(result.summary).toEqual({
      platformCode: 'coupangeats',
      fetchedCount: 1,
      createdMenuCount: 0,
      linkedMappingCount: 0,
      verifiedMappingCount: 1
    })
    expect(mappingRepository.listForMenu('menu-set-1')).toEqual([
      expect.objectContaining({
        platformMenuId: 'set-1',
        platformMenuName: 'Set 1 (피자M 스파게티 콜라)',
        matchedBy: 'auto'
      })
    ])
  })

  it('does not force no-binding metadata when the platform never provides binding labels', async () => {
    activateCatalog()
    menuRepository.upsert({
      menuId: 'menu-dd-1',
      baseName: '갈릭디핑',
      basePrice: 500,
      isDirty: 0,
      isManaged: 1
    })
    mappingRepository.upsert({
      mappingId: 'menu-dd-1:ddangyo',
      menuId: 'menu-dd-1',
      platformCode: 'ddangyo',
      platformMenuId: '10000042',
      platformMenuName: '갈릭디핑',
      platformMenuBindingStatus: '가게 연결 없음',
      platformMenuBindingSummary: '연결 가게 없음',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    adapter.fetchMenusWithInspection = vi.fn().mockResolvedValue({
      menus: [
        {
          platformMenuId: '10000042',
          platformMenuName: '갈릭디핑',
          currentPrice: 500,
          platformMenuGroupName: '소스추가 6',
          platformMenuStatus: '대표메뉴 · 품절 · 배달숨김 · 포장숨김 · 매장숨김',
          platformMenuPriceSummary: '1개 · 배달 500원 · 포장 500원 · 매장식사 500원'
        }
      ],
      inspection: createInspection()
    })
    adapter.fetchOptionGroups = vi.fn().mockResolvedValue([])

    const orchestrator = createOrchestrator()
    await orchestrator.importPlatform('ddangyo')

    expect(platformMenuRepository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'ddangyo',
        platformMenuId: '10000042',
        platformMenuBindingStatus: null,
        platformMenuBindingSummary: null
      })
    ])
    expect(mappingRepository.listForMenu('menu-dd-1')).toEqual([
      expect.objectContaining({
        platformCode: 'ddangyo',
        platformMenuId: '10000042',
        platformMenuBindingStatus: null,
        platformMenuBindingSummary: null
      })
    ])
  })
})
