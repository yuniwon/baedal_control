import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { PlatformOptionGroupRepository } from '../../../src/main/repositories/platform-option-group-repository'

describe('PlatformOptionGroupRepository', () => {
  let db: ReturnType<typeof createInMemoryConnection>
  let repository: PlatformOptionGroupRepository

  beforeEach(() => {
    db = createInMemoryConnection()
    migrate(db)
    repository = new PlatformOptionGroupRepository(db)
  })

  it('replaces the saved option group catalog per platform with nested options and menus', () => {
    repository.replaceForPlatform('baemin', [
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 추가선택',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        mappingMenusCount: 18,
        options: [
          {
            optionId: 'o-1',
            optionName: 'M 사이즈',
            optionPrice: 0,
            itemStatus: 'ACTIVE',
            restockedAt: null
          }
        ],
        menus: [
          {
            platformMenuId: 'p-1',
            platformMenuName: '왕새우갈비',
            platformMenuGroupName: '대표 메뉴'
          }
        ]
      }
    ])

    repository.replaceForPlatform('coupangeats', [
      {
        platformCode: 'coupangeats',
        optionGroupId: 'cg-1',
        optionGroupName: '토핑 추가',
        minOrderQuantity: 0,
        maxOrderQuantity: 3,
        mappingMenusCount: 5,
        options: [],
        menus: []
      }
    ])

    repository.replaceForPlatform('baemin', [
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 추가선택',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        mappingMenusCount: 18,
        options: [
          {
            optionId: 'o-1',
            optionName: 'M 사이즈',
            optionPrice: 0,
            itemStatus: 'ACTIVE',
            restockedAt: null
          },
          {
            optionId: 'o-2',
            optionName: 'L 사이즈',
            optionPrice: 4000,
            itemStatus: 'ACTIVE',
            restockedAt: null
          }
        ],
        menus: [
          {
            platformMenuId: 'p-1',
            platformMenuName: '왕새우갈비',
            platformMenuGroupName: '대표 메뉴'
          }
        ]
      }
    ])

    expect(repository.listAll()).toEqual([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 추가선택',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        mappingMenusCount: 18,
        options: [
          {
            optionId: 'o-1',
            optionName: 'M 사이즈',
            optionPrice: 0,
            itemStatus: 'ACTIVE',
            restockedAt: null
          },
          {
            optionId: 'o-2',
            optionName: 'L 사이즈',
            optionPrice: 4000,
            itemStatus: 'ACTIVE',
            restockedAt: null
          }
        ],
        menus: [
          {
            platformMenuId: 'p-1',
            platformMenuName: '왕새우갈비',
            platformMenuGroupName: '대표 메뉴'
          }
        ],
        signatureKey: null,
        lastSeenImportId: null,
        lastSeenAt: expect.any(String),
        missingStreak: 0,
        presenceStatus: 'present',
        presenceChangedAt: null
      },
      {
        platformCode: 'coupangeats',
        optionGroupId: 'cg-1',
        optionGroupName: '토핑 추가',
        minOrderQuantity: 0,
        maxOrderQuantity: 3,
        mappingMenusCount: 5,
        options: [],
        menus: [],
        signatureKey: null,
        lastSeenImportId: null,
        lastSeenAt: expect.any(String),
        missingStreak: 0,
        presenceStatus: 'present',
        presenceChangedAt: null
      }
    ])
  })

  it('keeps existing option groups when upsertSeenBatch receives a later partial batch', () => {
    repository.upsertSeenBatch('baemin', 'run-1', [
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 추가선택',
        signatureKey: 'sig-1',
        options: [],
        menus: []
      }
    ])

    repository.upsertSeenBatch('baemin', 'run-2', [
      {
        platformCode: 'baemin',
        optionGroupId: 'g-2',
        optionGroupName: '토핑 추가',
        signatureKey: 'sig-2',
        options: [],
        menus: []
      }
    ])

    expect(repository.listAll()).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        signatureKey: 'sig-1',
        lastSeenImportId: 'run-1',
        missingStreak: 0,
        presenceStatus: 'present',
        presenceChangedAt: null
      }),
      expect.objectContaining({
        platformCode: 'baemin',
        optionGroupId: 'g-2',
        signatureKey: 'sig-2',
        lastSeenImportId: 'run-2',
        missingStreak: 0,
        presenceStatus: 'present',
        presenceChangedAt: null
      })
    ])
  })

  it('applies presence updates to an option group', () => {
    repository.upsertSeenBatch('baemin', 'run-1', [
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 추가선택',
        signatureKey: 'sig-1',
        options: [],
        menus: []
      }
    ])

    repository.applyPresenceUpdates([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        missingStreak: 3,
        presenceStatus: 'absent_confirmed'
      }
    ])

    expect(repository.listAll()).toEqual([
      expect.objectContaining({
        optionGroupId: 'g-1',
        signatureKey: 'sig-1',
        missingStreak: 3,
        presenceStatus: 'absent_confirmed',
        presenceChangedAt: expect.any(String)
      })
    ])
  })

  it('resets stale absence state when an option group is seen again', () => {
    repository.upsertSeenBatch('baemin', 'run-1', [
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 추가선택',
        signatureKey: 'sig-1',
        options: [],
        menus: []
      }
    ])

    db.prepare(`
      update platform_option_groups
      set
        missing_streak = 5,
        presence_status = 'absent_confirmed',
        presence_changed_at = '2026-01-03T00:00:00.000Z'
      where platform_code = 'baemin' and option_group_id = 'g-1'
    `).run()

    repository.upsertSeenBatch('baemin', 'run-2', [
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 추가선택',
        signatureKey: 'sig-1',
        options: [],
        menus: []
      }
    ])

    expect(repository.listAll()).toEqual([
      expect.objectContaining({
        optionGroupId: 'g-1',
        lastSeenImportId: 'run-2',
        missingStreak: 0,
        presenceStatus: 'present',
        presenceChangedAt: expect.any(String)
      })
    ])
    expect(repository.listAll()[0]?.presenceChangedAt).not.toBe('2026-01-03T00:00:00.000Z')
  })

  it('preserves presence_changed_at when applyPresenceUpdates keeps the same status', () => {
    repository.upsertSeenBatch('baemin', 'run-1', [
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 추가선택',
        signatureKey: 'sig-1',
        options: [],
        menus: []
      }
    ])

    db.prepare(`
      update platform_option_groups
      set
        missing_streak = 1,
        presence_status = 'missing_suspected',
        presence_changed_at = '2026-01-04T00:00:00.000Z'
      where platform_code = 'baemin' and option_group_id = 'g-1'
    `).run()

    repository.applyPresenceUpdates([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        missingStreak: 2,
        presenceStatus: 'missing_suspected'
      }
    ])

    expect(repository.listAll()).toEqual([
      expect.objectContaining({
        optionGroupId: 'g-1',
        missingStreak: 2,
        presenceStatus: 'missing_suspected',
        presenceChangedAt: '2026-01-04T00:00:00.000Z'
      })
    ])
  })
})
