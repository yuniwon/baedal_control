import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { PlatformMenuRepository } from '../../../src/main/repositories/platform-menu-repository'

describe('PlatformMenuRepository', () => {
  let db: ReturnType<typeof createInMemoryConnection>
  let repository: PlatformMenuRepository

  beforeEach(() => {
    db = createInMemoryConnection()
    migrate(db)
    repository = new PlatformMenuRepository(db)
  })

  it('replaces the saved platform menu catalog per platform', () => {
    repository.replaceForPlatform('baemin', [
      {
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        platformMenuName: '콤비네이션피자',
        platformMenuStatus: '판매중',
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
        ]
      },
      {
        platformCode: 'baemin',
        platformMenuId: 'p-22',
        platformMenuName: '콤비네이션 라지',
        platformMenuStatus: '숨김'
      }
    ])

    repository.replaceForPlatform('coupangeats', [
      {
        platformCode: 'coupangeats',
        platformMenuId: 'c-11',
        platformMenuName: '콤비네이션'
      }
    ])

    repository.replaceForPlatform('baemin', [
      {
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        platformMenuName: '콤비네이션피자',
        platformMenuStatus: '판매중',
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
        ]
      }
    ])

    expect(repository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        platformMenuName: '콤비네이션피자',
        platformMenuStatus: '판매중',
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
        ]
      }),
      expect.objectContaining({
        platformCode: 'coupangeats',
        platformMenuId: 'c-11',
        platformMenuName: '콤비네이션'
      })
    ])
    expect(
      repository.listAll().find((record) => record.platformCode === 'baemin' && record.platformMenuId === 'p-22')
    ).toBeUndefined()
  })

  it('keeps existing platform menus when upsertSeenBatch receives a later partial batch', () => {
    repository.upsertSeenBatch('baemin', 'run-1', [
      {
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        platformMenuName: '콤비네이션피자',
        platformMenuStatus: '판매중'
      }
    ])

    repository.upsertSeenBatch('baemin', 'run-2', [
      {
        platformCode: 'baemin',
        platformMenuId: 'p-22',
        platformMenuName: '포테이토피자',
        platformMenuStatus: '품절'
      }
    ])

    expect(repository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        platformMenuName: '콤비네이션피자',
        lastSeenImportId: 'run-1',
        missingStreak: 0,
        presenceStatus: 'present',
        presenceChangedAt: null
      }),
      expect.objectContaining({
        platformCode: 'baemin',
        platformMenuId: 'p-22',
        platformMenuName: '포테이토피자',
        lastSeenImportId: 'run-2',
        missingStreak: 0,
        presenceStatus: 'present',
        presenceChangedAt: null
      })
    ])
  })

  it('applies presence updates without replacing the menu row', () => {
    repository.upsertSeenBatch('baemin', 'run-1', [
      {
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        platformMenuName: '콤비네이션피자'
      }
    ])

    repository.applyPresenceUpdates([
      {
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        missingStreak: 2,
        presenceStatus: 'missing_suspected'
      }
    ])

    expect(repository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        missingStreak: 2,
        presenceStatus: 'missing_suspected',
        presenceChangedAt: expect.any(String)
      })
    ])
  })

  it('resets stale absence state when a menu is seen again', () => {
    repository.upsertSeenBatch('baemin', 'run-1', [
      {
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        platformMenuName: '콤비네이션피자'
      }
    ])

    db.prepare(`
      update platform_menus
      set
        missing_streak = 4,
        presence_status = 'absent_confirmed',
        presence_changed_at = '2026-01-01T00:00:00.000Z'
      where platform_code = 'baemin' and platform_menu_id = 'p-11'
    `).run()

    repository.upsertSeenBatch('baemin', 'run-2', [
      {
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        platformMenuName: '콤비네이션피자'
      }
    ])

    expect(repository.listAll()).toEqual([
      expect.objectContaining({
        platformMenuId: 'p-11',
        lastSeenImportId: 'run-2',
        missingStreak: 0,
        presenceStatus: 'present',
        presenceChangedAt: expect.any(String)
      })
    ])
    expect(repository.listAll()[0]?.presenceChangedAt).not.toBe('2026-01-01T00:00:00.000Z')
  })

  it('preserves presence_changed_at when applyPresenceUpdates keeps the same status', () => {
    repository.upsertSeenBatch('baemin', 'run-1', [
      {
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        platformMenuName: '콤비네이션피자'
      }
    ])

    db.prepare(`
      update platform_menus
      set
        missing_streak = 1,
        presence_status = 'missing_suspected',
        presence_changed_at = '2026-01-02T00:00:00.000Z'
      where platform_code = 'baemin' and platform_menu_id = 'p-11'
    `).run()

    repository.applyPresenceUpdates([
      {
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        missingStreak: 2,
        presenceStatus: 'missing_suspected'
      }
    ])

    expect(repository.listAll()).toEqual([
      expect.objectContaining({
        platformMenuId: 'p-11',
        missingStreak: 2,
        presenceStatus: 'missing_suspected',
        presenceChangedAt: '2026-01-02T00:00:00.000Z'
      })
    ])
  })
})
