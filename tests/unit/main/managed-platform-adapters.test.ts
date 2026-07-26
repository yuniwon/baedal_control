import { describe, expect, it, vi } from 'vitest'

import { DeliverySpecialAdapter } from '../../../src/main/platforms/deliveryspecial/adapter'
import { NaverOrderAdapter } from '../../../src/main/platforms/naverorder/adapter'
import { YogiyoAdapter } from '../../../src/main/platforms/yogiyo/adapter'

const credentials = { username: 'owner', password: 'secret' }

describe.each([
  ['yogiyo', YogiyoAdapter, 'ceo.yogiyo.co.kr'],
  ['deliveryspecial', DeliverySpecialAdapter, 'partner.payco.kr'],
  ['naverorder', NaverOrderAdapter, 'new.smartplace.naver.com']
] as const)('%s managed catalog adapter', (platformCode, Adapter, host) => {
  it('reuses the authenticated managed browser and returns proven API catalog data', async () => {
    const captureManagedBrowserSnapshots = vi.fn().mockResolvedValue([
      {
        snapshotId: `${platformCode}-snapshot`,
        platformCode,
        source: 'manual_browser',
        pageUrl: `https://${host}/menu`,
        pageTitle: '메뉴 관리',
        pageKind: 'menu_list',
        host,
        capturedAt: '2026-07-21T00:00:00.000Z',
        textSnippet: null,
        menuNames: [],
        menuItems: [],
        optionGroupNames: [],
        buttonLabels: [],
        inputHints: [],
        fields: [],
        apiEvents: [
          {
            url: `https://${host}/api/menu/list`,
            method: 'GET',
            status: 200,
            capturedAt: '2026-07-21T00:00:00.000Z',
            responsePreview: JSON.stringify({
              menus: [{ menuId: 10, menuName: '피자', salePrice: 19000 }],
              totalCount: 1
            })
          },
          {
            url: `https://${host}/api/option/list`,
            method: 'GET',
            status: 200,
            capturedAt: '2026-07-21T00:00:00.000Z',
            responsePreview: JSON.stringify({
              optionGroups: [
                {
                  optionGroupId: 20,
                  optionGroupName: '사이즈',
                  mappingMenusCount: 1,
                  mappingMenus: [{ menuId: 10, menuName: '피자' }],
                  optionItems: [{ optionItemId: 30, optionItemName: 'L', price: 4000 }]
                }
              ],
              totalCount: 1
            })
          }
        ],
        screenshotDataUrl: null
      }
    ])
    const adapter = new Adapter(credentials, { captureManagedBrowserSnapshots })

    const result = await adapter.fetchMenusWithInspection()

    expect(captureManagedBrowserSnapshots).toHaveBeenCalledTimes(1)
    expect(result.menus).toEqual([
      expect.objectContaining({ platformMenuId: '10', platformMenuName: '피자' })
    ])
    expect(result.optionGroups).toEqual([
      expect.objectContaining({ optionGroupId: '20', optionGroupName: '사이즈' })
    ])
    expect(result.completeness).toEqual(
      expect.objectContaining({
        menuCatalog: 'complete',
        optionCatalog: 'complete',
        optionBindings: 'complete'
      })
    )
  })
})

describe('NaverOrderAdapter session behavior', () => {
  it('does not require credential submission when an authenticated SmartPlace tab exists', async () => {
    const captureManagedBrowserSnapshots = vi.fn().mockResolvedValue([])
    const adapter = new NaverOrderAdapter({ username: '', password: '' }, {
      captureManagedBrowserSnapshots
    })

    await expect(adapter.fetchMenusWithInspection()).rejects.toThrow(
      'naverorder_managed_session_snapshot_missing'
    )
    expect(captureManagedBrowserSnapshots).toHaveBeenCalledTimes(1)
  })
})
