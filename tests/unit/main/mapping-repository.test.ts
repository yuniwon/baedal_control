import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { MappingRepository } from '../../../src/main/repositories/mapping-repository'
import { MenuRepository } from '../../../src/main/repositories/menu-repository'

describe('MappingRepository', () => {
  let repository: MappingRepository
  let menuRepository: MenuRepository

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    menuRepository = new MenuRepository(db)
    repository = new MappingRepository(db)
  })

  it('stores confirmed platform mappings', () => {
    menuRepository.upsert({ menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 })

    repository.upsert({
      mappingId: 'map-1',
      menuId: 'm1',
      platformCode: 'baemin',
      platformMenuId: 'p-11',
      platformMenuName: '콤비네이션',
      platformMenuGroupName: '대표 메뉴',
      platformMenuStatus: '판매중',
      platformMenuPriceSummary: '배달 22,900원',
      platformMenuPriceVariants: [
        {
          variantLabel: '기본',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 22900,
              amountText: '22,900원'
            }
          ]
        }
      ],
      platformMenuBindingSummary: '[음식배달] 꾸버스피자 봉담점',
      platformMenuBindingStatus: '연결 정상',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    expect(repository.listForMenu('m1')).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        mappingStatus: 'active',
        platformMenuGroupName: '대표 메뉴',
        platformMenuStatus: '판매중',
        platformMenuPriceSummary: '배달 22,900원',
        platformMenuPriceVariants: [
          {
            variantLabel: '기본',
            channels: [
              {
                channelCode: 'delivery',
                channelLabel: '배달',
                amount: 22900,
                amountText: '22,900원'
              }
            ]
          }
        ],
        platformMenuBindingSummary: '[음식배달] 꾸버스피자 봉담점',
        platformMenuBindingStatus: '연결 정상',
        isConfirmed: 1
      })
    ])
  })

  it('removes a stored mapping by id', () => {
    menuRepository.upsert({ menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 })

    repository.upsert({
      mappingId: 'map-1',
      menuId: 'm1',
      platformCode: 'baemin',
      platformMenuId: 'p-11',
      platformMenuName: '콤비네이션',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    repository.remove('map-1')

    expect(repository.listForMenu('m1')).toEqual([])
  })

  it('moves one platform source atomically instead of leaving it linked to two menus', () => {
    menuRepository.upsert({ menuId: 'm1', baseName: '기존 메뉴', basePrice: 22900, isDirty: 0 })
    menuRepository.upsert({ menuId: 'm2', baseName: '새 메뉴', basePrice: 22900, isDirty: 0 })
    repository.upsert({
      mappingId: 'map-old',
      menuId: 'm1',
      platformCode: 'yogiyo',
      platformMenuId: 'source-1',
      platformMenuName: '플랫폼 메뉴',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    repository.upsert({
      mappingId: 'map-new',
      menuId: 'm2',
      platformCode: 'yogiyo',
      platformMenuId: 'source-1',
      platformMenuName: '플랫폼 메뉴',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    expect(repository.listForMenu('m1')).toEqual([])
    expect(repository.listForMenu('m2')).toEqual([
      expect.objectContaining({ mappingId: 'map-new', platformMenuId: 'source-1' })
    ])
  })

  it('persists an explicit source_absent mapping status', () => {
    menuRepository.upsert({ menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 })

    repository.upsert({
      mappingId: 'map-1',
      menuId: 'm1',
      platformCode: 'baemin',
      platformMenuId: 'p-11',
      platformMenuName: '콤비네이션',
      mappingStatus: 'source_absent',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    expect(repository.listForMenu('m1')).toEqual([
      expect.objectContaining({
        mappingId: 'map-1',
        mappingStatus: 'source_absent'
      })
    ])
  })

  it('updates mapping status without rewriting the full mapping row', () => {
    menuRepository.upsert({ menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 })

    repository.upsert({
      mappingId: 'map-1',
      menuId: 'm1',
      platformCode: 'baemin',
      platformMenuId: 'p-11',
      platformMenuName: '콤비네이션',
      matchedBy: 'manual',
      isConfirmed: 1
    })

    repository.setMappingStatus('map-1', 'source_absent')

    expect(repository.listForMenu('m1')).toEqual([
      expect.objectContaining({
        mappingId: 'map-1',
        platformMenuName: '콤비네이션',
        mappingStatus: 'source_absent'
      })
    ])
  })
})
