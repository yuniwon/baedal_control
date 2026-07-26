import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createConnection, createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { PlatformAdapterRegistry } from '../../../src/main/platforms/base/registry'
import type { PlatformAdapter, PlatformMenuSnapshot } from '../../../src/main/platforms/base/types'
import { CatalogIntentRuleRepository } from '../../../src/main/repositories/catalog-intent-rule-repository'
import { CatalogReviewRepository } from '../../../src/main/repositories/catalog-review-repository'
import { CatalogWorkspaceRepository } from '../../../src/main/repositories/catalog-workspace-repository'
import { MappingRepository } from '../../../src/main/repositories/mapping-repository'
import { MenuRepository } from '../../../src/main/repositories/menu-repository'
import { PlatformImportChangeRepository } from '../../../src/main/repositories/platform-import-change-repository'
import { PlatformImportRunRepository } from '../../../src/main/repositories/platform-import-run-repository'
import { PlatformMenuRepository } from '../../../src/main/repositories/platform-menu-repository'
import { PlatformOptionGroupRepository } from '../../../src/main/repositories/platform-option-group-repository'
import { CatalogBootstrapService } from '../../../src/main/services/catalog-bootstrap-service'
import { CatalogImportOrchestrator } from '../../../src/main/services/catalog-import-orchestrator'
import type { PlatformCode } from '../../../src/shared/contracts'

const createFakeAdapter = (
  platformCode: PlatformCode,
  readMenus: () => PlatformMenuSnapshot[],
  applyMenuUpdate: ReturnType<typeof vi.fn>
): PlatformAdapter => ({
  platformCode,
  fetchMenus: async () => readMenus(),
  applyMenuUpdate
})

describe('fresh catalog onboarding integration', () => {
  const tempDirectories: string[] = []

  afterEach(() => {
    while (tempDirectories.length > 0) {
      const directory = tempDirectories.pop()
      if (directory) rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps imports as source data until activation and sends later unmatched rows to review', async () => {
    const db = createInMemoryConnection()
    migrate(db)

    const menuRepository = new MenuRepository(db)
    const mappingRepository = new MappingRepository(db)
    const platformMenuRepository = new PlatformMenuRepository(db)
    const platformOptionGroupRepository = new PlatformOptionGroupRepository(db)
    const platformImportRunRepository = new PlatformImportRunRepository(db)
    const platformImportChangeRepository = new PlatformImportChangeRepository(db)
    const workspaceRepository = new CatalogWorkspaceRepository(db)
    const reviewRepository = new CatalogReviewRepository(db)
    const intentRuleRepository = new CatalogIntentRuleRepository(db)
    const adapterRegistry = new PlatformAdapterRegistry()
    const applyMenuUpdate = vi.fn()

    const baeminMenus: PlatformMenuSnapshot[] = [
      { platformMenuId: 'baemin-potato', platformMenuName: '고구마피자', currentPrice: 22900 },
      { platformMenuId: 'baemin-shrimp', platformMenuName: '킹쉬림프피자', currentPrice: 25900 }
    ]
    const coupangMenus: PlatformMenuSnapshot[] = [
      { platformMenuId: 'coupang-shrimp', platformMenuName: '킹쉬림프피자', currentPrice: 25900 },
      { platformMenuId: 'coupang-special', platformMenuName: '쿠팡 전용 세트', currentPrice: 28900 }
    ]

    adapterRegistry.register(
      'baemin',
      createFakeAdapter('baemin', () => baeminMenus, applyMenuUpdate)
    )
    adapterRegistry.register(
      'coupangeats',
      createFakeAdapter('coupangeats', () => coupangMenus, applyMenuUpdate)
    )

    let nextRunId = 1
    const importOrchestrator = new CatalogImportOrchestrator({
      db,
      adapterRegistry,
      menuRepository,
      mappingRepository,
      platformMenuRepository,
      platformOptionGroupRepository,
      platformImportRunRepository,
      platformImportChangeRepository,
      catalogWorkspaceRepository: workspaceRepository,
      catalogReviewRepository: reviewRepository,
      catalogIntentRuleRepository: intentRuleRepository,
      createId: () => `integration-run-${nextRunId++}`
    })
    const bootstrapService = new CatalogBootstrapService({
      db,
      menuRepository,
      mappingRepository,
      platformMenuRepository,
      platformImportRunRepository,
      workspaceRepository,
      reviewRepository,
      now: () => '2026-07-25T12:00:00.000Z'
    })

    await importOrchestrator.importPlatform('baemin')
    await importOrchestrator.importPlatform('coupangeats')

    expect(platformMenuRepository.listAll()).toHaveLength(4)
    expect(menuRepository.list()).toEqual([])
    expect(mappingRepository.listAll()).toEqual([])

    const preview = bootstrapService.preview({
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'baemin'
    })
    const confirmedMappings = preview.suggestedMappings.map((mapping) => ({
      ...mapping,
      isConfirmed: 1
    }))

    bootstrapService.activate({
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'baemin',
      previewFingerprint: preview.previewFingerprint,
      menus: preview.draftMenus.map(({ sourcePlatformCode: _platform, sourcePlatformMenuId: _source, disposition: _disposition, ...menu }) => ({
        ...menu,
        isDirty: 0,
        isManaged: 1
      })),
      ignoredSourceEntityIds: [],
      confirmedMappings,
      remainingReviewItems: []
    })

    expect(workspaceRepository.getDefault()).toMatchObject({
      lifecycleState: 'active',
      canonicalVersion: 1,
      seedPlatformCode: 'baemin'
    })
    expect(menuRepository.list()).toHaveLength(2)
    expect(reviewRepository.listOpen('default')).toEqual([])

    await importOrchestrator.importPlatform('coupangeats')

    expect(menuRepository.list()).toHaveLength(2)
    expect(reviewRepository.listOpen('default')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'unmatched_platform_menu',
        platformCode: 'coupangeats',
        sourceEntityId: 'coupang-special'
      })
    ]))
    expect(applyMenuUpdate).not.toHaveBeenCalled()
  })

  it('persists the active catalog and remembered intent across a file-backed reopen', () => {
    const userDataDirectory = mkdtempSync(join(tmpdir(), 'delivery-menu-sync-onboarding-'))
    tempDirectories.push(userDataDirectory)
    const databasePath = join(userDataDirectory, 'delivery-menu-sync.db')
    const firstConnection = createConnection(databasePath)
    migrate(firstConnection)

    const firstMenuRepository = new MenuRepository(firstConnection)
    const firstMappingRepository = new MappingRepository(firstConnection)
    const firstPlatformMenuRepository = new PlatformMenuRepository(firstConnection)
    const firstImportRunRepository = new PlatformImportRunRepository(firstConnection)
    const firstWorkspaceRepository = new CatalogWorkspaceRepository(firstConnection)
    const firstReviewRepository = new CatalogReviewRepository(firstConnection)
    const firstIntentRepository = new CatalogIntentRuleRepository(firstConnection)

    firstImportRunRepository.start({ importRunId: 'persisted-import', platformCode: 'baemin' })
    firstPlatformMenuRepository.upsertSeenBatch('baemin', 'persisted-import', [
      {
        platformCode: 'baemin',
        platformMenuId: 'persisted-menu',
        platformMenuName: '킹쉬림프피자',
        platformMenuCurrentPrice: 25900
      }
    ])
    firstImportRunRepository.finish('persisted-import', {
      status: 'completed',
      menuFetchCompleted: 1,
      optionFetchCompleted: 0
    })

    const bootstrapService = new CatalogBootstrapService({
      db: firstConnection,
      menuRepository: firstMenuRepository,
      mappingRepository: firstMappingRepository,
      platformMenuRepository: firstPlatformMenuRepository,
      platformImportRunRepository: firstImportRunRepository,
      workspaceRepository: firstWorkspaceRepository,
      reviewRepository: firstReviewRepository,
      now: () => '2026-07-25T12:00:00.000Z'
    })
    const preview = bootstrapService.preview({
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'baemin'
    })
    bootstrapService.activate({
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'baemin',
      previewFingerprint: preview.previewFingerprint,
      menus: preview.draftMenus.map(({ sourcePlatformCode: _platform, sourcePlatformMenuId: _source, disposition: _disposition, ...menu }) => ({
        ...menu,
        isDirty: 0,
        isManaged: 1
      })),
      ignoredSourceEntityIds: [],
      confirmedMappings: preview.suggestedMappings,
      remainingReviewItems: []
    })
    firstIntentRepository.upsert({
      intentRuleId: 'persisted-intent',
      workspaceId: 'default',
      kind: 'missing_on_platform',
      scope: 'platform',
      resolution: 'exclude_platform',
      platformCode: 'coupangeats',
      canonicalMenuId: null,
      sourceEntityId: null,
      fieldKey: null,
      categoryKey: null,
      reason: '이 플랫폼에는 의도적으로 판매하지 않음',
      expiresAt: null,
      isActive: 1
    })
    firstConnection.close()

    const reopenedConnection = createConnection(databasePath)
    migrate(reopenedConnection)
    expect(new CatalogWorkspaceRepository(reopenedConnection).getDefault()).toMatchObject({
      lifecycleState: 'active',
      canonicalVersion: 1,
      seedPlatformCode: 'baemin'
    })
    expect(new MenuRepository(reopenedConnection).list()).toEqual([
      expect.objectContaining({ baseName: '킹쉬림프피자', basePrice: 25900 })
    ])
    expect(new CatalogIntentRuleRepository(reopenedConnection).listActive(
      'default',
      '2026-07-25T12:00:01.000Z'
    )).toEqual([
      expect.objectContaining({
        intentRuleId: 'persisted-intent',
        resolution: 'exclude_platform'
      })
    ])
    reopenedConnection.close()
  })
})
