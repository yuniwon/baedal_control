import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { MappingRepository } from '../../../src/main/repositories/mapping-repository'
import { MenuRepository } from '../../../src/main/repositories/menu-repository'
import { PlatformMenuRepository } from '../../../src/main/repositories/platform-menu-repository'
import { SyncSuccessReconciler } from '../../../src/main/services/sync-success-reconciler'

describe('SyncSuccessReconciler', () => {
  let menuRepository: MenuRepository
  let mappingRepository: MappingRepository
  let platformMenuRepository: PlatformMenuRepository

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    menuRepository = new MenuRepository(db)
    mappingRepository = new MappingRepository(db)
    platformMenuRepository = new PlatformMenuRepository(db)
  })

  it('clears dirty after optimistic variant updates leave no remaining sync work', async () => {
    menuRepository.upsert({
      menuId: 'menu-1',
      baseName: '칠성사이다',
      basePrice: 1800,
      isDirty: 1,
      isManaged: 1,
      basePriceVariants: [
        {
          variantLabel: '500ml',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 1800,
              amountText: '1,800원'
            }
          ]
        },
        {
          variantLabel: '1.25L',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 3000,
              amountText: '3,000원'
            }
          ]
        }
      ]
    })

    mappingRepository.upsert({
      mappingId: 'map-1',
      menuId: 'menu-1',
      platformCode: 'ddangyo',
      platformMenuId: '10000039',
      platformMenuName: '칠성사이다',
      platformMenuCurrentPrice: 1800,
      platformMenuPriceCount: 2,
      platformMenuPriceSummary: '500ml · 배달 1,800원 / 1.25L · 배달 2,900원',
      platformMenuPriceVariants: [
        {
          variantLabel: '500ml',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 1800,
              amountText: '1,800원'
            }
          ]
        },
        {
          variantLabel: '1.25L',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 2900,
              amountText: '2,900원'
            }
          ]
        }
      ],
      matchedBy: 'manual',
      isConfirmed: 1
    })

    platformMenuRepository.upsert({
      platformCode: 'ddangyo',
      platformMenuId: '10000039',
      platformMenuName: '칠성사이다',
      platformMenuCurrentPrice: 1800,
      platformMenuPriceCount: 2,
      platformMenuPriceSummary: '500ml · 배달 1,800원 / 1.25L · 배달 2,900원',
      platformMenuPriceVariants: [
        {
          variantLabel: '500ml',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 1800,
              amountText: '1,800원'
            }
          ]
        },
        {
          variantLabel: '1.25L',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 2900,
              amountText: '2,900원'
            }
          ]
        }
      ],
      presenceStatus: 'present',
      missingStreak: 0
    })

    const reconciler = new SyncSuccessReconciler({
      menuRepository,
      mappingRepository,
      platformMenuRepository
    })

    await reconciler.reconcile({
      platformCode: 'ddangyo',
      menuId: 'menu-1',
      platformMenuId: '10000039',
      previousName: '칠성사이다',
      previousPrice: 1800,
      previousPriceVariants: [
        {
          variantLabel: '500ml',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 1800,
              amountText: '1,800원'
            }
          ]
        },
        {
          variantLabel: '1.25L',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 2900,
              amountText: '2,900원'
            }
          ]
        }
      ],
      nextName: '칠성사이다',
      nextPrice: 1800,
      nextPriceVariants: [
        {
          variantLabel: '500ml',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 1800,
              amountText: '1,800원'
            }
          ]
        },
        {
          variantLabel: '1.25L',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 3000,
              amountText: '3,000원'
            }
          ]
        }
      ]
    })

    expect(menuRepository.get('menu-1')).toEqual(
      expect.objectContaining({
        menuId: 'menu-1',
        isDirty: 0
      })
    )
    expect(mappingRepository.listForMenu('menu-1')).toEqual([
      expect.objectContaining({
        platformMenuId: '10000039',
        platformMenuPriceSummary: '500ml · 배달 1,800원 / 1.25L · 배달 3,000원',
        platformMenuPriceVariants: [
          expect.objectContaining({ variantLabel: '500ml' }),
          expect.objectContaining({ variantLabel: '1.25L' })
        ]
      })
    ])
    expect(platformMenuRepository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'ddangyo',
        platformMenuId: '10000039',
        platformMenuPriceSummary: '500ml · 배달 1,800원 / 1.25L · 배달 3,000원'
      })
    ])
  })

  it('keeps dirty when another mapped platform still needs to be updated', async () => {
    menuRepository.upsert({
      menuId: 'menu-2',
      baseName: '왕새우갈비 새이름',
      basePrice: 23900,
      isDirty: 1,
      isManaged: 1
    })

    mappingRepository.upsert({
      mappingId: 'map-baemin',
      menuId: 'menu-2',
      platformCode: 'baemin',
      platformMenuId: '59707531',
      platformMenuName: '왕새우갈비',
      platformMenuCurrentPrice: 23900,
      matchedBy: 'manual',
      isConfirmed: 1
    })

    mappingRepository.upsert({
      mappingId: 'map-ddangyo',
      menuId: 'menu-2',
      platformCode: 'ddangyo',
      platformMenuId: '10000005',
      platformMenuName: '왕새우갈비',
      platformMenuCurrentPrice: 23900,
      matchedBy: 'manual',
      isConfirmed: 1
    })

    const reconciler = new SyncSuccessReconciler({
      menuRepository,
      mappingRepository,
      platformMenuRepository
    })

    await reconciler.reconcile({
      platformCode: 'baemin',
      menuId: 'menu-2',
      platformMenuId: '59707531',
      previousName: '왕새우갈비',
      previousPrice: 23900,
      nextName: '왕새우갈비 새이름',
      nextPrice: 23900
    })

    expect(menuRepository.get('menu-2')).toEqual(
      expect.objectContaining({
        menuId: 'menu-2',
        isDirty: 1
      })
    )
  })
})
