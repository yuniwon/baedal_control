import { describe, expect, it, vi } from 'vitest'

import { YogiyoAdapter } from '../../../src/main/platforms/yogiyo/adapter'
import { buildYogiyoCatalogApiEvents } from '../../../src/main/platforms/yogiyo/managed-catalog'

describe('Yogiyo managed catalog normalization', () => {
  it('combines every cursor page and preserves menu, visibility, option, and binding data', async () => {
    const apiEvents = buildYogiyoCatalogApiEvents({
      capturedAt: '2026-07-21T14:00:00.000Z',
      menuUrl: 'https://ceo-api.yogiyo.co.kr/proxy/catalogyo/legacy/vendors/318300/products/',
      optionUrl: 'https://ceo-api.yogiyo.co.kr/proxy/catalogyo/legacy/vendors/318300/options/',
      menuPages: [
        {
          page: { cursor: 'menu-cursor-1', size: 2 },
          data: [
            {
              vendor_category_id: 10,
              name: '피자',
              products: [
                {
                  vendor_product_id: 101,
                  name: '킹쉬림프 M',
                  price: '25900',
                  invisible: false
                },
                {
                  vendor_product_id: 102,
                  name: '숨김 피자',
                  price: '19900',
                  invisible: true
                }
              ]
            }
          ]
        },
        {
          page: { cursor: 'menu-cursor-2', size: 2 },
          data: [
            {
              vendor_category_id: 11,
              name: '사이드',
              products: [
                {
                  vendor_product_id: 103,
                  name: '치즈볼',
                  price: '5000',
                  invisible: false
                }
              ]
            }
          ]
        },
        { page: { cursor: 'menu-cursor-2', size: 2 }, data: [] }
      ],
      optionPages: [
        {
          page: { cursor: 'option-cursor-1', size: 50 },
          data: [
            {
              vendor_option_section_id: 201,
              name: '도우 선택',
              mandatory: true,
              multiple: false,
              multiple_count: null,
              invisible: false,
              options: [
                {
                  vendor_option_id: 301,
                  name: '치즈 크러스트',
                  price: 3000,
                  invisible: false
                }
              ],
              products: [{ name: '킹쉬림프 M' }]
            }
          ]
        },
        {
          page: { cursor: 'option-cursor-2', size: 50 },
          data: [
            {
              vendor_option_section_id: 201,
              name: '도우 선택',
              mandatory: true,
              multiple: false,
              multiple_count: null,
              invisible: false,
              options: [
                {
                  vendor_option_id: 302,
                  name: '고구마 크러스트',
                  price: 3000,
                  invisible: false
                }
              ],
              products: [{ name: '킹쉬림프 M' }]
            }
          ]
        },
        { page: { cursor: 'option-cursor-2', size: 50 }, data: [] }
      ]
    })

    const adapter = new YogiyoAdapter(
      { username: '', password: '' },
      {
        captureManagedBrowserSnapshots: vi.fn().mockResolvedValue([
          {
            snapshotId: 'yogiyo-live',
            platformCode: 'yogiyo',
            source: 'manual_browser',
            pageUrl: 'https://ceo.yogiyo.co.kr/option/group',
            pageTitle: '요기요 사장님 사이트',
            pageKind: 'option_list',
            captureMode: 'full_scroll',
            host: 'ceo.yogiyo.co.kr',
            capturedAt: '2026-07-21T14:00:00.000Z',
            textSnippet: null,
            menuNames: [],
            menuItems: [],
            optionGroupNames: [],
            buttonLabels: [],
            inputHints: [],
            fields: [],
            apiEvents,
            screenshotDataUrl: null
          }
        ])
      }
    )

    const result = await adapter.fetchMenusWithInspection()

    expect(result.menus).toEqual([
      expect.objectContaining({
        platformMenuId: '101',
        platformMenuName: '킹쉬림프 M',
        currentPrice: 25900,
        platformMenuGroupName: '피자',
        platformMenuStatus: '판매중'
      }),
      expect.objectContaining({
        platformMenuId: '102',
        platformMenuName: '숨김 피자',
        platformMenuStatus: '숨김'
      }),
      expect.objectContaining({
        platformMenuId: '103',
        platformMenuName: '치즈볼',
        platformMenuGroupName: '사이드'
      })
    ])
    expect(result.optionGroups).toEqual([
      expect.objectContaining({
        optionGroupId: '201',
        optionGroupName: '도우 선택',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        mappingMenusCount: 1,
        menus: [expect.objectContaining({ platformMenuId: '101', platformMenuName: '킹쉬림프 M' })],
        options: [
          expect.objectContaining({
            optionId: '301',
            optionName: '치즈 크러스트',
            optionPrice: 3000,
            itemStatus: '판매중'
          }),
          expect.objectContaining({
            optionId: '302',
            optionName: '고구마 크러스트',
            optionPrice: 3000,
            itemStatus: '판매중'
          })
        ]
      })
    ])
    expect(result.completeness).toEqual(
      expect.objectContaining({
        menuCatalog: 'complete',
        optionCatalog: 'complete',
        optionBindings: 'complete',
        expectedMenuCount: 3,
        collectedMenuCount: 3,
        expectedOptionGroupCount: 1,
        collectedOptionGroupCount: 1
      })
    )
  })
})
