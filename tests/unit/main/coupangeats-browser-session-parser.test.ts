import { describe, expect, it } from 'vitest'

import {
  parseCoupangEatsMenusFromBrowserSnapshot,
  parseCoupangEatsOptionGroupsFromBrowserSnapshot
} from '../../../src/main/platforms/coupangeats/browser-session-parser'
import { expandCoupangEatsOptionPayload } from '../../../src/main/platforms/coupangeats/managed-catalog'

describe('CoupangEats browser session parser', () => {
  it('expands representative option bindings with each option detail response', () => {
    const mappingDishes = Array.from({ length: 18 }, (_, index) => ({
      id: index + 1,
      name: `메뉴 ${index + 1}`
    }))
    const expanded = expandCoupangEatsOptionPayload(
      {
        data: [
          {
            optionId: 100,
            optionName: '사이즈',
            mappingDishCount: 17,
            mappingDishes: [{ id: 1, name: '대표 메뉴' }],
            optionItems: []
          }
        ],
        error: null,
        code: 'SUCCESS'
      },
      [{ data: { optionId: 100, mappingDishCount: 0, mappingDishes } }]
    ) as { data: Array<{ mappingDishCount: number; mappingDishes: unknown[] }> }

    expect(expanded.data[0]?.mappingDishCount).toBe(18)
    expect(expanded.data[0]?.mappingDishes).toHaveLength(18)
  })

  it('preserves the platform-reported binding count when only one representative menu is returned', () => {
    const optionGroups = parseCoupangEatsOptionGroupsFromBrowserSnapshot({
      snapshotId: 'snap-truncated-bindings',
      platformCode: 'coupangeats',
      source: 'manual_browser',
      pageUrl: 'https://store.coupangeats.com/merchant/management/menu/109935/options',
      pageTitle: '옵션 관리',
      pageKind: 'option_list',
      host: 'store.coupangeats.com',
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
          url: 'https://store.coupangeats.com/api/v1/merchant/web/stores/109935/all-options?fetchDish=true',
          method: 'GET',
          status: 200,
          capturedAt: '2026-07-21T00:00:00.000Z',
          responsePreview: JSON.stringify({
            data: [
              {
                optionId: 100,
                optionName: '사이즈',
                mappingDishCount: 17,
                mappingDishes: [{ id: 1, name: '대표 메뉴' }],
                optionItems: []
              }
            ]
          })
        }
      ],
      screenshotDataUrl: null
    })

    expect(optionGroups[0]).toEqual(
      expect.objectContaining({
        optionGroupId: '100',
        mappingMenusCount: 17,
        menus: [expect.objectContaining({ platformMenuId: '1' })]
      })
    )
  })

  it('parses menu ids, category names, prices, and statuses from the captured api preview', () => {
    const menus = parseCoupangEatsMenusFromBrowserSnapshot({
      snapshotId: 'snap-1',
      platformCode: 'coupangeats',
      source: 'manual_browser',
      pageUrl: 'https://store.coupangeats.com/merchant/management/menu/109935',
      pageTitle: '쿠팡이츠 사장님 포털',
      pageKind: 'menu_list',
      captureMode: 'full_scroll',
      host: 'store.coupangeats.com',
      capturedAt: '2026-04-13T14:30:00.000Z',
      textSnippet: null,
      menuNames: [],
      menuItems: [],
      optionGroupNames: [],
      buttonLabels: [],
      inputHints: [],
      fields: [],
      apiEvents: [
        {
          url: 'https://store.coupangeats.com/api/v1/merchant/web/stores/109935/all-menu-dishes',
          method: 'GET',
          status: 200,
          capturedAt: '2026-04-13T14:30:00.000Z',
          responsePreview: JSON.stringify({
            data: {
              menus: [
                {
                  menuId: 909523,
                  menuName: '추천메뉴',
                  exposeStatus: 'EXPOSE',
                  dishes: [
                    {
                      dishId: 5798617,
                      dishName: '왕새우갈비',
                      salePrice: 23900,
                      displayStatus: 'ON_SALE',
                      forceNotExpose: false
                    },
                    {
                      dishId: 5798618,
                      dishName: '숨김 메뉴',
                      salePrice: 1000,
                      displayStatus: 'ON_SALE',
                      forceNotExpose: true
                    },
                    {
                      dishId: 5798619,
                      dishName: '오늘만 품절 메뉴',
                      salePrice: 12000,
                      displayStatus: 'SOLD_OUT_TODAY',
                      forceNotExpose: false
                    },
                    {
                      dishId: 5798620,
                      dishName: '숨김 상태 메뉴',
                      salePrice: 9000,
                      displayStatus: 'NOT_EXPOSE',
                      forceNotExpose: false
                    }
                  ]
                }
              ]
            },
            error: null,
            code: 'SUCCESS'
          })
        }
      ],
      screenshotDataUrl: null
    })

    expect(menus).toEqual([
      expect.objectContaining({
        platformMenuId: '5798617',
        platformMenuName: '왕새우갈비',
        currentPrice: 23900,
        platformMenuPriceVariants: [
          {
            variantLabel: null,
            channels: [
              {
                channelCode: 'base',
                channelLabel: '기본가',
                amount: 23900,
                amountText: '23,900원'
              }
            ]
          }
        ],
        platformMenuGroupName: '추천메뉴',
        platformMenuStatus: '판매중',
        platformMenuPriceSummary: '23,900원'
      }),
      expect.objectContaining({
        platformMenuId: '5798618',
        platformMenuName: '숨김 메뉴',
        currentPrice: 1000,
        platformMenuStatus: '숨김'
      }),
      expect.objectContaining({
        platformMenuId: '5798619',
        platformMenuName: '오늘만 품절 메뉴',
        currentPrice: 12000,
        platformMenuStatus: '오늘만 품절'
      }),
      expect.objectContaining({
        platformMenuId: '5798620',
        platformMenuName: '숨김 상태 메뉴',
        currentPrice: 9000,
        platformMenuStatus: '숨김'
      })
    ])
  })

  it('parses option groups, linked menus, quantities, and option item prices from the captured api preview', () => {
    const optionGroups = parseCoupangEatsOptionGroupsFromBrowserSnapshot({
      snapshotId: 'snap-2',
      platformCode: 'coupangeats',
      source: 'manual_browser',
      pageUrl: 'https://store.coupangeats.com/merchant/management/menu/109935/options',
      pageTitle: '쿠팡이츠 사장님 포털',
      pageKind: 'option_list',
      captureMode: 'full_scroll',
      host: 'store.coupangeats.com',
      capturedAt: '2026-04-13T14:30:00.000Z',
      textSnippet: null,
      menuNames: [],
      menuItems: [],
      optionGroupNames: [],
      buttonLabels: [],
      inputHints: [],
      fields: [],
      apiEvents: [
        {
          url: '/api/v1/merchant/web/stores/109935/all-options?fetchDish=true',
          method: 'GET',
          status: 200,
          capturedAt: '2026-04-13T14:30:00.000Z',
          responsePreview:
            '{"data":[{"optionId":10711608,"optionName":"기본","optionItems":[{"optionItemId":58746513'
        },
        {
          url: 'https://store.coupangeats.com/api/v1/merchant/web/stores/109935/all-options?fetchDish=true',
          method: 'GET',
          status: 200,
          capturedAt: '2026-04-13T14:30:00.000Z',
          responsePreview: JSON.stringify({
            data: [
              {
                optionId: 10711608,
                optionName: '기본',
                minSelect: 1,
                maxSelect: 1,
                isMandatory: true,
                mappingDishCount: 0,
                mappingDishes: [
                  {
                    id: 63255695,
                    name: '꾸버스 패밀리피자'
                  }
                ],
                optionItems: [
                  {
                    optionItemId: 58746513,
                    optionItemName: '슈퍼슈프림피자',
                    salePrice: 0,
                    displayStatus: 'ON_SALE',
                    forceNotExpose: false
                  },
                  {
                    optionItemId: 58746599,
                    optionItemName: '숨김 쉬림프피자',
                    salePrice: 4000,
                    displayStatus: 'ON_SALE',
                    forceNotExpose: true
                  }
                ]
              },
              {
                optionId: 10711609,
                optionName: '추가선택',
                minSelect: 0,
                maxSelect: -1,
                isMandatory: false,
                mappingDishCount: 2,
                mappingDishes: [],
                optionItems: [
                  {
                    optionItemId: 58746773,
                    optionItemName: '올리브 추가',
                    salePrice: 1000,
                    displayStatus: 'ON_SALE',
                    forceNotExpose: false
                  },
                  {
                    optionItemId: 58746774,
                    optionItemName: '숨김 토핑',
                    salePrice: 1500,
                    displayStatus: 'NOT_EXPOSE',
                    forceNotExpose: false
                  }
                ]
              }
            ],
            error: null,
            code: 'SUCCESS'
          })
        }
      ],
      screenshotDataUrl: null
    })

    expect(optionGroups).toEqual([
      expect.objectContaining({
        optionGroupId: '10711608',
        optionGroupName: '기본',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        mappingMenusCount: 1,
        menus: [
          {
            platformMenuId: '63255695',
            platformMenuName: '꾸버스 패밀리피자',
            platformMenuGroupName: null
          }
        ],
        options: [
          expect.objectContaining({
            optionId: '58746513',
            optionName: '슈퍼슈프림피자',
            optionPrice: 0,
            itemStatus: '판매중'
          }),
          expect.objectContaining({
            optionId: '58746599',
            optionName: '숨김 쉬림프피자',
            optionPrice: 4000,
            itemStatus: '숨김'
          })
        ]
      }),
      expect.objectContaining({
        optionGroupId: '10711609',
        optionGroupName: '추가선택',
        minOrderQuantity: 0,
        maxOrderQuantity: null,
        mappingMenusCount: 2,
        options: [
          expect.objectContaining({
            optionId: '58746773',
            optionName: '올리브 추가',
            optionPrice: 1000,
            itemStatus: '판매중'
          }),
          expect.objectContaining({
            optionId: '58746774',
            optionName: '숨김 토핑',
            optionPrice: 1500,
            itemStatus: '숨김'
          })
        ]
      })
    ])
  })
})
