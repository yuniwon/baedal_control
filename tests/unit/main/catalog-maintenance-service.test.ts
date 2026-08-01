import { describe, expect, it, vi } from 'vitest'

import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { MappingRepository } from '../../../src/main/repositories/mapping-repository'
import { MenuRepository } from '../../../src/main/repositories/menu-repository'
import { PlatformMenuRepository } from '../../../src/main/repositories/platform-menu-repository'
import { CatalogMaintenanceService } from '../../../src/main/services/catalog-maintenance-service'

const setup = () => {
  const db = createInMemoryConnection()
  migrate(db)
  const menus = new MenuRepository(db)
  const mappings = new MappingRepository(db)
  const platformMenus = new PlatformMenuRepository(db)
  db.prepare("update catalog_workspaces set lifecycle_state='active', canonical_version=1 where workspace_id='default'").run()

  menus.upsert({ menuId: 'cheese', baseName: '치즈피자', basePrice: 6000, isDirty: 0, isManaged: 1 })
  menus.upsert({ menuId: 'cheese-y-m', baseName: '치즈 피자 M', basePrice: 6000, isDirty: 0, isManaged: 1 })
  menus.upsert({ menuId: 'hidden-y', baseName: '슈퍼불고기 피자 M（하프앤하프）', basePrice: 18000, isDirty: 0, isManaged: 1 })
  menus.upsert({ menuId: 'unique-y', baseName: '로제 오븐 스파게티', basePrice: 10000, isDirty: 0, isManaged: 1 })

  platformMenus.upsert({ platformCode: 'baemin', platformMenuId: 'b-cheese', platformMenuName: '치즈피자', platformMenuCurrentPrice: 7000, platformMenuGroupName: '피자', platformMenuStatus: '판매중' })
  platformMenus.upsert({ platformCode: 'yogiyo', platformMenuId: 'y-cheese-m', platformMenuName: '치즈 피자 M', platformMenuCurrentPrice: 6000, platformMenuGroupName: '일반피자 M 메뉴', platformMenuStatus: '판매중' })
  platformMenus.upsert({ platformCode: 'yogiyo', platformMenuId: 'y-hidden', platformMenuName: '슈퍼불고기 피자 M（하프앤하프）', platformMenuCurrentPrice: 18000, platformMenuGroupName: '프리미엄 피자 M 메뉴', platformMenuStatus: '숨김' })
  platformMenus.upsert({ platformCode: 'yogiyo', platformMenuId: 'y-unique', platformMenuName: '로제 오븐 스파게티', platformMenuCurrentPrice: 10000, platformMenuGroupName: '사이드 스파게티그룹', platformMenuStatus: '판매중' })
  platformMenus.upsert({ platformCode: 'ddangyo', platformMenuId: 'd-cheese', platformMenuName: '치즈피자', platformMenuCurrentPrice: 7000, platformMenuGroupName: '선택에 실패 없는 알뜰피자15성인식권아이콘메뉴할인아이콘', platformMenuStatus: '판매중' })

  mappings.upsert({ mappingId: 'map-b', menuId: 'cheese', platformCode: 'baemin', platformMenuId: 'b-cheese', platformMenuName: '치즈피자', platformMenuCurrentPrice: 7000, platformMenuGroupName: '피자', matchedBy: 'auto', isConfirmed: 1 })
  mappings.upsert({ mappingId: 'map-d', menuId: 'cheese', platformCode: 'ddangyo', platformMenuId: 'd-cheese', platformMenuName: '치즈피자', platformMenuCurrentPrice: 7000, platformMenuGroupName: '선택에 실패 없는 알뜰피자15성인식권아이콘메뉴할인아이콘', matchedBy: 'auto', isConfirmed: 1 })
  mappings.upsert({ mappingId: 'map-y-m', menuId: 'cheese-y-m', platformCode: 'yogiyo', platformMenuId: 'y-cheese-m', platformMenuName: '치즈 피자 M', platformMenuCurrentPrice: 6000, platformMenuGroupName: '일반피자 M 메뉴', matchedBy: 'auto', isConfirmed: 1 })
  mappings.upsert({ mappingId: 'map-hidden', menuId: 'hidden-y', platformCode: 'yogiyo', platformMenuId: 'y-hidden', platformMenuName: '슈퍼불고기 피자 M（하프앤하프）', matchedBy: 'auto', isConfirmed: 1 })
  mappings.upsert({ mappingId: 'map-unique', menuId: 'unique-y', platformCode: 'yogiyo', platformMenuId: 'y-unique', platformMenuName: '로제 오븐 스파게티', matchedBy: 'auto', isConfirmed: 1 })

  return { db, menus, mappings, platformMenus }
}

describe('CatalogMaintenanceService', () => {
  it('previews only unambiguous aliases and hidden-only noise', () => {
    const { db } = setup()
    const service = new CatalogMaintenanceService({ db })

    const preview = service.preview('baemin')

    expect(preview.safeMerges).toEqual([
      expect.objectContaining({ sourceMenuId: 'cheese-y-m', targetMenuId: 'cheese' })
    ])
    expect(preview.hiddenMenuIds).toEqual(['hidden-y'])
    expect(preview.safeMerges.some((candidate) => candidate.sourceMenuId === 'unique-y')).toBe(false)
  })

  it('previews explicitly confirmed store aliases without enabling fuzzy merges', () => {
    const { db, menus, mappings, platformMenus } = setup()
    menus.upsert({ menuId: 'yogurt', baseName: '요거트소스', basePrice: 500, isDirty: 1, isManaged: 1 })
    menus.upsert({ menuId: 'homemade-yogurt', baseName: '수제요거트소스', basePrice: 500, isDirty: 0, isManaged: 1 })
    platformMenus.upsert({ platformCode: 'baemin', platformMenuId: 'b-yogurt', platformMenuName: '요거트소스', platformMenuCurrentPrice: 500, platformMenuStatus: '판매중' })
    platformMenus.upsert({ platformCode: 'ddangyo', platformMenuId: 'd-yogurt', platformMenuName: '수제요거트소스', platformMenuCurrentPrice: 500, platformMenuStatus: '판매중' })
    mappings.upsert({ mappingId: 'map-b-yogurt', menuId: 'yogurt', platformCode: 'baemin', platformMenuId: 'b-yogurt', platformMenuName: '요거트소스', platformMenuCurrentPrice: 500, matchedBy: 'auto', isConfirmed: 1 })
    mappings.upsert({ mappingId: 'map-d-yogurt', menuId: 'homemade-yogurt', platformCode: 'ddangyo', platformMenuId: 'd-yogurt', platformMenuName: '수제요거트소스', platformMenuCurrentPrice: 500, matchedBy: 'auto', isConfirmed: 1 })

    const preview = new CatalogMaintenanceService({ db }).preview('baemin')

    expect(preview.safeMerges).toContainEqual(expect.objectContaining({
      sourceMenuId: 'homemade-yogurt',
      targetMenuId: 'yogurt'
    }))
  })

  it('backs up, merges mappings, cleans categories, refreshes the reference price, and rebuilds reviews atomically', () => {
    const { db, menus, mappings, platformMenus } = setup()
    const backupDatabase = vi.fn(() => 'backup.db')
    const refreshReviews = vi.fn()
    const service = new CatalogMaintenanceService({ db, backupDatabase, refreshReviews })
    const preview = service.preview('baemin')

    const result = service.apply({
      referencePlatformCode: 'baemin',
      acceptedCandidateIds: preview.safeMerges.map((candidate) => candidate.candidateId),
      excludeHiddenOnlyMenus: true
    })

    expect(result).toMatchObject({ backupPath: 'backup.db', mergedMenuCount: 1, excludedMenuCount: 1 })
    expect(service.preview('baemin').hiddenMenuIds).toEqual([])
    expect(backupDatabase).toHaveBeenCalledTimes(1)
    expect(refreshReviews).toHaveBeenCalledTimes(1)
    expect(menus.get('cheese-y-m')).toBeNull()
    expect(mappings.listForMenu('cheese').map((mapping) => mapping.mappingId).sort())
      .toEqual(['map-b', 'map-d', 'map-y-m'])
    expect(menus.get('cheese')).toMatchObject({ basePrice: 7000, isDirty: 0 })
    expect(menus.get('hidden-y')).toMatchObject({ isManaged: 0 })
    expect(platformMenus.listAll().find((menu) => menu.platformMenuId === 'd-cheese'))
      .toMatchObject({ platformMenuGroupName: '선택에 실패 없는 알뜰피자' })
    expect(mappings.listForMenu('cheese').find((mapping) => mapping.mappingId === 'map-d'))
      .toMatchObject({ platformMenuGroupName: '선택에 실패 없는 알뜰피자' })
    expect(db.prepare("select seed_mode seedMode, seed_platform_code seedPlatformCode, canonical_version canonicalVersion from catalog_workspaces where workspace_id='default'").get())
      .toMatchObject({ seedMode: 'platform', seedPlatformCode: 'baemin', canonicalVersion: 2 })
  })

  it('consolidates active M and L siblings even when the reference platform has no menu', () => {
    const { db, menus, mappings, platformMenus } = setup()
    menus.upsert({ menuId: 'yam-m', baseName: '고구마 피자 M', basePrice: 19900, isDirty: 0, isManaged: 1 })
    menus.upsert({ menuId: 'yam-l', baseName: '고구마 피자 L', basePrice: 23900, isDirty: 0, isManaged: 1 })
    platformMenus.upsert({ platformCode: 'yogiyo', platformMenuId: 'yam-source-m', platformMenuName: '고구마 피자 M', platformMenuCurrentPrice: 19900, platformMenuStatus: '판매중' })
    platformMenus.upsert({ platformCode: 'yogiyo', platformMenuId: 'yam-source-l', platformMenuName: '고구마 피자 L', platformMenuCurrentPrice: 23900, platformMenuStatus: '판매중' })
    mappings.upsert({ mappingId: 'yam-map-m', menuId: 'yam-m', platformCode: 'yogiyo', platformMenuId: 'yam-source-m', platformMenuName: '고구마 피자 M', matchedBy: 'auto', isConfirmed: 1 })
    mappings.upsert({ mappingId: 'yam-map-l', menuId: 'yam-l', platformCode: 'yogiyo', platformMenuId: 'yam-source-l', platformMenuName: '고구마 피자 L', matchedBy: 'auto', isConfirmed: 1 })
    const service = new CatalogMaintenanceService({ db })
    const candidate = service.preview('baemin').safeMerges.find((item) => item.mergeKind === 'size_sibling')

    expect(candidate).toMatchObject({ sourceMenuId: 'yam-l', targetMenuId: 'yam-m', targetName: '고구마 피자' })

    service.apply({ referencePlatformCode: 'baemin', acceptedCandidateIds: [candidate!.candidateId], excludeHiddenOnlyMenus: false })
    expect(menus.get('yam-l')).toBeNull()
    expect(menus.get('yam-m')).toMatchObject({ baseName: '고구마 피자', basePrice: 19900 })
    expect(menus.get('yam-m')?.basePriceVariants).toEqual([
      expect.objectContaining({ variantLabel: 'M', channels: [expect.objectContaining({ amount: 19900 })] }),
      expect.objectContaining({ variantLabel: 'L', channels: [expect.objectContaining({ amount: 23900 })] })
    ])
  })

  it('rolls the database changes back if review rebuilding fails', () => {
    const { db, menus } = setup()
    const service = new CatalogMaintenanceService({
      db,
      backupDatabase: () => 'backup.db',
      refreshReviews: () => { throw new Error('review_failed') }
    })
    const preview = service.preview('baemin')

    expect(() => service.apply({
      referencePlatformCode: 'baemin',
      acceptedCandidateIds: preview.safeMerges.map((candidate) => candidate.candidateId),
      excludeHiddenOnlyMenus: true
    })).toThrow('review_failed')
    expect(menus.get('cheese-y-m')).not.toBeNull()
    expect(menus.get('cheese')).toMatchObject({ basePrice: 6000 })
  })
})
