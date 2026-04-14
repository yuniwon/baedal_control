import { describe, expect, it, vi } from 'vitest'
import {
  ManagedBrowserFailureContextHandler,
  SyncFailureContextCollector
} from '../../../src/main/services/sync-failure-context'

describe('ManagedBrowserFailureContextHandler', () => {
  it('captures and saves a managed-browser snapshot for matching sync failures', async () => {
    const save = vi.fn()
    const handler = new ManagedBrowserFailureContextHandler({
      platformCode: 'coupangeats',
      managedChromeSessionProbe: {
        inspect: vi.fn().mockResolvedValue({
          endpointUrl: 'http://127.0.0.1:39482',
          connected: true,
          tabs: [
            {
              tabId: 'tab-1',
              title: '쿠팡이츠 메뉴 관리',
              url: 'https://store.coupangeats.com/merchant/management/menu/109935',
              type: 'page',
              host: 'store.coupangeats.com',
              platformCode: 'coupangeats',
              pageKind: 'menu_list'
            }
          ]
        })
      },
      managedChromeSnapshotCapturer: {
        captureTab: vi.fn().mockResolvedValue({
          snapshotId: 'managed-tab-1',
          platformCode: 'coupangeats',
          source: 'manual_browser',
          pageUrl: 'https://store.coupangeats.com/merchant/management/menu/109935',
          pageTitle: '쿠팡이츠 메뉴 관리',
          pageKind: 'menu_list',
          captureMode: 'full_scroll',
          host: 'store.coupangeats.com',
          capturedAt: '2026-04-14T01:25:00.000Z',
          textSnippet: null,
          menuNames: ['왕새우갈비', '불고기피자'],
          menuItems: [
            { name: '왕새우갈비', priceText: '23,900원', categoryName: '추천메뉴' },
            { name: '불고기피자', priceText: '19,900원', categoryName: '추천메뉴' }
          ],
          optionGroupNames: ['기본'],
          buttonLabels: ['저장'],
          inputHints: ['예: 치즈버거'],
          fields: [],
          apiEvents: [],
          screenshotDataUrl: null
        })
      },
      browserInspectionSnapshotRepository: {
        save
      },
      now: () => new Date('2026-04-14T01:26:00.000Z')
    })

    const context = await handler.capture(
      {
        platformCode: 'coupangeats',
        menuId: 'm1',
        platformMenuId: 'ce-1',
        previousName: '왕새우갈비',
        nextName: '왕새우갈비 수정',
        nextPrice: 24900,
        executionMode: 'managed_browser'
      },
      new Error('coupangeats_managed_update_failed:editor_not_opened:menu_editor_controls_not_found')
    )

    expect(context).toEqual(
      expect.objectContaining({
        kind: 'managed_browser_snapshot',
        status: 'captured',
        snapshotId: 'managed-tab-1',
        pageTitle: '쿠팡이츠 메뉴 관리',
        menuCount: 2,
        optionGroupCount: 1
      })
    )
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('reports tab_not_found when there is no matching managed browser tab', async () => {
    const collector = new SyncFailureContextCollector([
      new ManagedBrowserFailureContextHandler({
        platformCode: 'coupangeats',
        managedChromeSessionProbe: {
          inspect: vi.fn().mockResolvedValue({
            endpointUrl: 'http://127.0.0.1:39482',
            connected: true,
            tabs: []
          })
        },
        managedChromeSnapshotCapturer: {
          captureTab: vi.fn()
        },
        now: () => new Date('2026-04-14T01:26:00.000Z')
      })
    ])

    const context = await collector.capture(
      {
        platformCode: 'coupangeats',
        menuId: 'm1',
        platformMenuId: 'ce-1',
        previousName: '왕새우갈비',
        nextName: '왕새우갈비 수정',
        nextPrice: 24900,
        executionMode: 'managed_browser'
      },
      new Error('coupangeats_managed_update_failed:target_not_found:matching_menu_row_not_found')
    )

    expect(context).toEqual(
      expect.objectContaining({
        kind: 'managed_browser_snapshot',
        status: 'tab_not_found',
        detail: 'managed_chrome_menu_tab_not_found'
      })
    )
  })
})
