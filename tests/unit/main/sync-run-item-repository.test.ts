import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { SyncRunItemRepository } from '../../../src/main/repositories/sync-run-item-repository'

describe('SyncRunItemRepository', () => {
  let repository: SyncRunItemRepository

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    repository = new SyncRunItemRepository(db)
  })

  it('lists run items for selected sync runs in reverse insertion order', () => {
    repository.addItem({
      syncRunItemId: 'item-1',
      syncRunId: 'run-1',
      platformCode: 'baemin',
      menuId: 'menu-1',
      fieldType: 'menu',
      beforeValue: '포테이토골드',
      afterValue: '{"name":"포테이토골드피자","price":21000}',
      status: 'failed',
      errorCode: 'apply_failed',
      errorMessage: '금칙어',
      failureContext: {
        kind: 'managed_browser_snapshot',
        status: 'captured',
        capturedAt: '2026-04-14T01:25:00.000Z',
        snapshotId: 'managed-tab-1',
        pageTitle: '쿠팡이츠 메뉴 관리',
        pageUrl: 'https://store.coupangeats.com/merchant/management/menu/109935',
        pageKind: 'menu_list',
        menuCount: 35,
        optionGroupCount: 26,
        detail: null
      }
    })
    repository.addItem({
      syncRunItemId: 'item-2',
      syncRunId: 'run-2',
      platformCode: 'baemin',
      menuId: 'menu-2',
      fieldType: 'menu',
      beforeValue: '왕새우갈비',
      afterValue: '{"name":"왕새우갈비","price":23900}',
      status: 'success',
      errorCode: null,
      errorMessage: null,
      failureContext: null
    })

    expect(repository.listForRunIds(['run-1', 'run-2'])).toEqual([
      expect.objectContaining({
        syncRunItemId: 'item-2',
        syncRunId: 'run-2',
        status: 'success'
      }),
      expect.objectContaining({
        syncRunItemId: 'item-1',
        syncRunId: 'run-1',
        errorMessage: '금칙어',
        failureContext: expect.objectContaining({
          snapshotId: 'managed-tab-1',
          menuCount: 35,
          optionGroupCount: 26
        })
      })
    ])
  })
})
