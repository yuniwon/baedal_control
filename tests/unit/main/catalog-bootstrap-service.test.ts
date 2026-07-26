import { beforeEach, describe, expect, it } from 'vitest'

import type { CatalogBootstrapActivationInput, PlatformCode } from '../../../src/shared/contracts'
import { createInMemoryConnection, type DatabaseConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { CatalogReviewRepository } from '../../../src/main/repositories/catalog-review-repository'
import { CatalogWorkspaceRepository } from '../../../src/main/repositories/catalog-workspace-repository'
import { MappingRepository } from '../../../src/main/repositories/mapping-repository'
import { MenuRepository } from '../../../src/main/repositories/menu-repository'
import { PlatformImportRunRepository } from '../../../src/main/repositories/platform-import-run-repository'
import { PlatformMenuRepository } from '../../../src/main/repositories/platform-menu-repository'
import { CatalogBootstrapService } from '../../../src/main/services/catalog-bootstrap-service'

describe('CatalogBootstrapService', () => {
  let db: DatabaseConnection
  let menuRepository: MenuRepository
  let mappingRepository: MappingRepository
  let platformMenuRepository: PlatformMenuRepository
  let importRunRepository: PlatformImportRunRepository
  let workspaceRepository: CatalogWorkspaceRepository
  let reviewRepository: CatalogReviewRepository
  let service: CatalogBootstrapService

  beforeEach(() => {
    db = createInMemoryConnection()
    migrate(db)
    menuRepository = new MenuRepository(db)
    mappingRepository = new MappingRepository(db)
    platformMenuRepository = new PlatformMenuRepository(db)
    importRunRepository = new PlatformImportRunRepository(db)
    workspaceRepository = new CatalogWorkspaceRepository(db)
    reviewRepository = new CatalogReviewRepository(db)
    service = new CatalogBootstrapService({
      db,
      menuRepository,
      mappingRepository,
      platformMenuRepository,
      platformImportRunRepository: importRunRepository,
      workspaceRepository,
      reviewRepository,
      now: () => '2026-07-25T10:00:00.000Z'
    })
  })

  const saveImport = (
    platformCode: PlatformCode,
    runId: string,
    status: 'completed' | 'partial_failed',
    menuFetchCompleted: number
  ) => {
    importRunRepository.start({ importRunId: runId, platformCode })
    importRunRepository.finish(runId, {
      status,
      menuFetchCompleted,
      optionFetchCompleted: 0,
      summaryJson: null,
      errorMessage: status === 'completed' ? null : 'incomplete'
    })
  }

  const saveSourceMenu = (
    platformCode: PlatformCode,
    platformMenuId: string,
    platformMenuName: string,
    price: number,
    importRunId: string
  ) => {
    platformMenuRepository.upsert({
      platformCode,
      platformMenuId,
      platformMenuName,
      platformMenuCurrentPrice: price,
      platformMenuPriceCount: 1,
      lastSeenImportId: importRunId,
      presenceStatus: 'present'
    })
  }

  it('rejects a seed platform whose latest import is incomplete', () => {
    saveImport('yogiyo', 'run-yogiyo', 'partial_failed', 0)
    saveSourceMenu('yogiyo', 'y-1', '고구마', 22900, 'run-yogiyo')

    expect(() => service.preview({
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'yogiyo'
    })).toThrow('seed_catalog_not_complete:yogiyo')
    expect(menuRepository.list()).toEqual([])
  })

  it('builds a deterministic side-effect-free draft and safe cross-platform suggestions', () => {
    saveImport('baemin', 'run-baemin', 'completed', 1)
    saveSourceMenu('baemin', 'b-2', '킹쉬림프', 25900, 'run-baemin')
    saveSourceMenu('baemin', 'b-1', '고구마', 22900, 'run-baemin')
    saveImport('yogiyo', 'run-yogiyo', 'completed', 1)
    saveSourceMenu('yogiyo', 'y-1', '고구마 (피자)', 22900, 'run-yogiyo')
    saveSourceMenu('yogiyo', 'y-2', '요기요 전용 세트', 27900, 'run-yogiyo')

    const first = service.preview({
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'baemin'
    })
    const second = service.preview({
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'baemin'
    })

    expect(first).toEqual(second)
    expect(first.draftMenus.map((item) => item.baseName)).toEqual(['고구마', '킹쉬림프'])
    expect(first.suggestedMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ platformCode: 'baemin', platformMenuId: 'b-1', isConfirmed: 1 }),
      expect.objectContaining({ platformCode: 'baemin', platformMenuId: 'b-2', isConfirmed: 1 }),
      expect.objectContaining({ platformCode: 'yogiyo', platformMenuId: 'y-1', isConfirmed: 0 })
    ]))
    expect(first.reviewItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'unmatched_platform_menu',
        platformCode: 'yogiyo',
        sourceEntityId: 'y-2',
        recommendation: 'add_to_canonical'
      })
    ]))
    expect(menuRepository.list()).toEqual([])
    expect(mappingRepository.listAll()).toEqual([])
  })

  it('activates the reviewed draft as canonical version one', () => {
    saveImport('baemin', 'run-baemin', 'completed', 1)
    saveSourceMenu('baemin', 'b-1', '고구마', 22900, 'run-baemin')
    const preview = service.preview({
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'baemin'
    })
    const activation: CatalogBootstrapActivationInput = {
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'baemin',
      previewFingerprint: preview.previewFingerprint,
      menus: preview.draftMenus.map((item) => ({
        menuId: item.menuId,
        baseName: item.baseName,
        basePrice: item.basePrice,
        basePriceVariants: item.basePriceVariants,
        isDirty: 0,
        isManaged: 1
      })),
      ignoredSourceEntityIds: [],
      confirmedMappings: preview.suggestedMappings,
      remainingReviewItems: preview.reviewItems
    }

    expect(service.activate(activation)).toMatchObject({
      lifecycleState: 'active',
      seedMode: 'platform',
      seedPlatformCode: 'baemin',
      canonicalVersion: 1,
      activatedAt: '2026-07-25T10:00:00.000Z'
    })
    expect(menuRepository.list()).toEqual([
      expect.objectContaining({ baseName: '고구마', basePrice: 22900 })
    ])
    expect(mappingRepository.listAll()).toEqual([
      expect.objectContaining({ platformCode: 'baemin', platformMenuId: 'b-1' })
    ])
  })

  it('rejects activation when the source changed after preview', () => {
    saveImport('baemin', 'run-baemin', 'completed', 1)
    saveSourceMenu('baemin', 'b-1', '고구마', 22900, 'run-baemin')
    const preview = service.preview({
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'baemin'
    })
    saveSourceMenu('baemin', 'b-1', '고구마', 23900, 'run-baemin')

    expect(() => service.activate({
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'baemin',
      previewFingerprint: preview.previewFingerprint,
      menus: preview.draftMenus.map((item) => ({
        menuId: item.menuId,
        baseName: item.baseName,
        basePrice: item.basePrice,
        basePriceVariants: item.basePriceVariants,
        isDirty: 0,
        isManaged: 1
      })),
      ignoredSourceEntityIds: [],
      confirmedMappings: preview.suggestedMappings,
      remainingReviewItems: preview.reviewItems
    })).toThrow('catalog_preview_stale')
    expect(menuRepository.list()).toEqual([])
  })

  it('supports starting from an empty canonical catalog', () => {
    const preview = service.preview({
      workspaceId: 'default',
      seedMode: 'blank',
      seedPlatformCode: null
    })

    expect(preview).toMatchObject({
      seedMode: 'blank',
      seedPlatformCode: null,
      draftMenus: [],
      suggestedMappings: [],
      reviewItems: []
    })
  })
})
