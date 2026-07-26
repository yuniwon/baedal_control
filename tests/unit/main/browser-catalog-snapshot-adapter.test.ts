import { describe, expect, it, vi } from 'vitest'

import { BrowserCatalogSnapshotAdapter } from '../../../src/main/platforms/browser-catalog/snapshot-adapter'

const baseSnapshot = {
  snapshotId: 'snapshot-1',
  platformCode: 'yogiyo' as const,
  source: 'manual_browser' as const,
  pageUrl: 'https://ceo.yogiyo.co.kr/menu',
  pageTitle: '메뉴 관리',
  pageKind: 'menu_list' as const,
  host: 'ceo.yogiyo.co.kr',
  capturedAt: '2026-07-21T00:00:00.000Z',
  textSnippet: null,
  menuNames: [],
  menuItems: [],
  optionGroupNames: [],
  buttonLabels: [],
  inputHints: [],
  fields: [],
  screenshotDataUrl: null
}

describe('BrowserCatalogSnapshotAdapter', () => {
  it('returns complete API catalogs only when configured full-collection endpoints are present', async () => {
    const captureSnapshots = vi.fn().mockResolvedValue([
      {
        ...baseSnapshot,
        apiEvents: [
          {
            url: 'https://ceo.yogiyo.co.kr/api/all-menus',
            method: 'GET',
            status: 200,
            capturedAt: baseSnapshot.capturedAt,
            responsePreview: JSON.stringify({
              menus: [{ menuId: 1, menuName: '피자', salePrice: 19000 }],
              totalCount: 1
            })
          },
          {
            url: 'https://ceo.yogiyo.co.kr/api/all-options',
            method: 'GET',
            status: 200,
            capturedAt: baseSnapshot.capturedAt,
            responsePreview: JSON.stringify({
              options: [
                {
                  optionId: 2,
                  optionName: '사이즈',
                  mappingDishCount: 1,
                  mappingDishes: [{ id: 1, name: '피자' }],
                  optionItems: [{ optionItemId: 3, optionItemName: 'L', salePrice: 4000 }]
                }
              ],
              totalCount: 1
            })
          },
          {
            url: 'https://ceo.yogiyo.co.kr/assets/telemetry',
            method: 'GET',
            status: 200,
            capturedAt: baseSnapshot.capturedAt,
            responsePreview: '<html>not catalog JSON</html>'
          }
        ]
      }
    ])
    const adapter = new BrowserCatalogSnapshotAdapter({
      platformCode: 'yogiyo',
      captureSnapshots,
      isFullMenuCollectionEvent: (event) => event.url.includes('/all-menus'),
      isFullOptionCollectionEvent: (event) => event.url.includes('/all-options')
    })

    await expect(adapter.fetchMenusWithInspection()).resolves.toEqual(
      expect.objectContaining({
        menus: [expect.objectContaining({ platformMenuId: '1', currentPrice: 19000 })],
        optionCatalogFetched: true,
        completeness: expect.objectContaining({
          menuCatalog: 'complete',
          optionCatalog: 'complete',
          optionBindings: 'complete'
        })
      })
    )
  })

  it('uses DOM menu items as evidence without falsely claiming a complete collection', async () => {
    const adapter = new BrowserCatalogSnapshotAdapter({
      platformCode: 'yogiyo',
      captureSnapshots: vi.fn().mockResolvedValue([
        {
          ...baseSnapshot,
          menuItems: [{ name: '피자', priceText: '19,000원', categoryName: '피자' }],
          apiEvents: []
        }
      ]),
      isFullMenuCollectionEvent: () => false,
      isFullOptionCollectionEvent: () => false
    })

    const result = await adapter.fetchMenusWithInspection()

    expect(result.menus).toEqual([
      expect.objectContaining({ platformMenuName: '피자', currentPrice: 19000 })
    ])
    expect(result.completeness).toEqual(
      expect.objectContaining({
        menuCatalog: 'unknown',
        optionCatalog: 'unknown',
        optionBindings: 'unknown'
      })
    )
  })
})
