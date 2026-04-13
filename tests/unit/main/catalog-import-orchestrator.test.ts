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
        get: () => adapter as never
      },
      menuRepository,
      mappingRepository,
      platformMenuRepository,
      platformOptionGroupRepository,
      platformImportRunRepository,
      platformImportChangeRepository,
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
    adapter = {
      fetchMenus: vi.fn()
    }
  })

  it('marks the first miss as missing_suspected and keeps the mapping active', async () => {
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
        status: 'partial_failed'
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
      createdMenuCount: 1,
      linkedMappingCount: 1,
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
          createdMenuCount: 1,
          linkedMappingCount: 1,
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
        optionFetchCompleted: 1
      })
    ])
  })

  it('keeps source_absent mappings and does not auto-restore managed menus on resurfaced sources', async () => {
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
})
