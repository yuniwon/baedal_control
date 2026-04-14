import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'

describe('BrowserInspectionSnapshotRepository', () => {
  let db: ReturnType<typeof createInMemoryConnection>

  beforeEach(() => {
    db = createInMemoryConnection()
    migrate(db)
  })

  it('stores latest browser inspection snapshots with parsed menu and api details', async () => {
    const tableRow = db
      .prepare(
        `
          select name
          from sqlite_master
          where type = 'table' and name = 'browser_inspection_snapshots'
        `
      )
      .get() as { name: string } | undefined

    expect(tableRow).toEqual({ name: 'browser_inspection_snapshots' })

    const module = await import(
      '../../../src/main/repositories/browser-inspection-snapshot-repository'
    ).catch(() => null)

    expect(module?.BrowserInspectionSnapshotRepository).toBeTypeOf('function')

    if (!module?.BrowserInspectionSnapshotRepository) {
      return
    }

    const repository = new module.BrowserInspectionSnapshotRepository(db)

    repository.save({
      snapshotId: 'snap-1',
      platformCode: 'coupangeats',
      source: 'browser_extension',
      pageUrl: 'https://store.coupangeats.com/merchant/menu',
      pageTitle: '메뉴 관리',
      pageKind: 'menu_list',
      captureMode: 'full_scroll',
      host: 'store.coupangeats.com',
      capturedAt: '2026-04-13T00:00:00.000Z',
      textSnippet: '왕새우갈비 23,900원 도우 선택',
      menuNames: ['왕새우갈비'],
      menuItems: [{ name: '왕새우갈비', priceText: '23,900원', categoryName: '추천메뉴' }],
      optionGroupNames: ['도우 선택'],
      buttonLabels: ['저장'],
      inputHints: ['메뉴명', '가격'],
      fields: [
        {
          name: 'menuName',
          value: '왕새우갈비',
          source: 'dom'
        }
      ],
      apiEvents: [
        {
          url: 'https://store.coupangeats.com/api/menus',
          method: 'GET',
          status: 200,
          capturedAt: '2026-04-13T00:00:00.000Z',
          responsePreview: '{"menus":[{"name":"왕새우갈비"}]}'
        }
      ],
      screenshotDataUrl: 'data:image/png;base64,ZmFrZQ=='
    })

    repository.save({
      snapshotId: 'snap-2',
      platformCode: 'coupangeats',
      source: 'browser_extension',
      pageUrl: 'https://store.coupangeats.com/merchant/menu',
      pageTitle: '메뉴 관리',
      pageKind: 'menu_list',
      captureMode: 'full_scroll',
      host: 'store.coupangeats.com',
      capturedAt: '2026-04-13T00:01:00.000Z',
      textSnippet: '핫소스 200원',
      menuNames: ['핫소스'],
      menuItems: [{ name: '핫소스', priceText: '200원', categoryName: '추천메뉴' }],
      optionGroupNames: [],
      buttonLabels: ['저장'],
      inputHints: ['가격'],
      fields: [],
      apiEvents: [],
      screenshotDataUrl: null
    })

    expect(repository.listLatest(2)).toEqual([
      expect.objectContaining({
        snapshotId: 'snap-2',
        platformCode: 'coupangeats',
        pageKind: 'menu_list',
        captureMode: 'full_scroll',
        menuNames: ['핫소스'],
        menuItems: [{ name: '핫소스', priceText: '200원', categoryName: '추천메뉴' }],
        optionGroupNames: [],
        buttonLabels: ['저장'],
        inputHints: ['가격'],
        apiEvents: []
      }),
      expect.objectContaining({
        snapshotId: 'snap-1',
        fields: [
          expect.objectContaining({
            name: 'menuName',
            value: '왕새우갈비',
            source: 'dom'
          })
        ],
        apiEvents: [
          expect.objectContaining({
            method: 'GET',
            status: 200
          })
        ]
      })
    ])
  })
})
