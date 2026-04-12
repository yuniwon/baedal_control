import { describe, expect, it } from 'vitest'
import type { MenuRecord, PlatformMenuMappingRecord } from '../../../src/shared/contracts'
import { PlatformMenuImporter } from '../../../src/main/services/platform-menu-importer'

const createMenuRepository = (initial: MenuRecord[] = []) => {
  const records = [...initial]

  return {
    records,
    list: () => [...records],
    upsert: (payload: MenuRecord) => {
      const index = records.findIndex((record) => record.menuId === payload.menuId)
      if (index >= 0) {
        records[index] = payload
        return
      }

      records.push(payload)
    }
  }
}

const createMappingRepository = (initial: PlatformMenuMappingRecord[] = []) => {
  const records = [...initial]

  return {
    records,
    listAll: () => [...records],
    upsert: (payload: PlatformMenuMappingRecord) => {
      const index = records.findIndex((record) => record.mappingId === payload.mappingId)
      if (index >= 0) {
        records[index] = payload
        return
      }

      records.push(payload)
    }
  }
}

describe('PlatformMenuImporter', () => {
  it('creates local menus from the first imported platform menu list', async () => {
    const menuRepository = createMenuRepository()
    const mappingRepository = createMappingRepository()
    const createdIds = ['m1', 'm2']
    const importer = new PlatformMenuImporter(
      menuRepository,
      mappingRepository,
      {
        get: () => ({
          platformCode: 'baemin',
          fetchMenus: () =>
            Promise.resolve([
              { platformMenuId: 'p1', platformMenuName: '콤비네이션', currentPrice: 22900 },
              { platformMenuId: 'p2', platformMenuName: '페퍼로니', currentPrice: 23900 }
            ]),
          applyMenuUpdate: () => Promise.resolve()
        })
      },
      () => createdIds.shift() ?? 'fallback-id'
    )

    const summary = await importer.importPlatform('baemin')

    expect(summary).toEqual({
      platformCode: 'baemin',
      fetchedCount: 2,
      createdMenuCount: 2,
      linkedMappingCount: 2
    })

    expect(menuRepository.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 }),
        expect.objectContaining({ menuId: 'm2', baseName: '페퍼로니', basePrice: 23900, isDirty: 0 })
      ])
    )

    expect(mappingRepository.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mappingId: 'm1:baemin',
          menuId: 'm1',
          platformCode: 'baemin',
          platformMenuId: 'p1',
          platformMenuName: '콤비네이션',
          matchedBy: 'auto',
          isConfirmed: 1
        }),
        expect.objectContaining({
          mappingId: 'm2:baemin',
          menuId: 'm2',
          platformCode: 'baemin',
          platformMenuId: 'p2',
          platformMenuName: '페퍼로니',
          matchedBy: 'auto',
          isConfirmed: 1
        })
      ])
    )
  })

  it('reuses close existing menus and only creates new rows for unmatched platform menus', async () => {
    const menuRepository = createMenuRepository([
      { menuId: 'm1', baseName: '콤비네이션 피자', basePrice: 22900, isDirty: 0 }
    ])
    const mappingRepository = createMappingRepository()
    const createdIds = ['m2']
    const importer = new PlatformMenuImporter(
      menuRepository,
      mappingRepository,
      {
        get: () => ({
          platformCode: 'coupangeats',
          fetchMenus: () =>
            Promise.resolve([
              { platformMenuId: 'p1', platformMenuName: '콤비네이션피자', currentPrice: 22900 },
              { platformMenuId: 'p2', platformMenuName: '치즈크러스트', currentPrice: 25900 }
            ]),
          applyMenuUpdate: () => Promise.resolve()
        })
      },
      () => createdIds.shift() ?? 'fallback-id'
    )

    const summary = await importer.importPlatform('coupangeats')

    expect(summary).toEqual({
      platformCode: 'coupangeats',
      fetchedCount: 2,
      createdMenuCount: 1,
      linkedMappingCount: 2
    })

    expect(mappingRepository.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mappingId: 'm1:coupangeats',
          menuId: 'm1',
          platformMenuId: 'p1',
          platformMenuName: '콤비네이션피자'
        }),
        expect.objectContaining({
          mappingId: 'm2:coupangeats',
          menuId: 'm2',
          platformMenuId: 'p2',
          platformMenuName: '치즈크러스트'
        })
      ])
    )

    expect(menuRepository.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ menuId: 'm1', baseName: '콤비네이션 피자' }),
        expect.objectContaining({ menuId: 'm2', baseName: '치즈크러스트', basePrice: 25900, isDirty: 0 })
      ])
    )
  })
})
