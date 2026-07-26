import { describe, expect, it } from 'vitest'

import { parseBrowserCatalogApiEvents } from '../../../src/main/platforms/browser-catalog/api-event-parser'

describe('parseBrowserCatalogApiEvents', () => {
  it('extracts menu and option records from common authenticated API response shapes', () => {
    const result = parseBrowserCatalogApiEvents([
      {
        url: 'https://merchant.example/api/menus',
        method: 'GET',
        status: 200,
        capturedAt: '2026-07-21T00:00:00.000Z',
        responsePreview: JSON.stringify({
          data: {
            menus: [
              {
                menuId: 101,
                menuName: '킹쉬림프피자',
                salePrice: 25900,
                displayStatus: 'ON_SALE'
              }
            ]
          }
        })
      },
      {
        url: 'https://merchant.example/api/options',
        method: 'GET',
        status: 200,
        capturedAt: '2026-07-21T00:00:01.000Z',
        responsePreview: JSON.stringify({
          data: [
            {
              optionId: 201,
              optionName: '사이즈 선택',
              minSelect: 1,
              maxSelect: 1,
              mappingDishCount: 1,
              mappingDishes: [{ id: 101, name: '킹쉬림프피자' }],
              optionItems: [
                { optionItemId: 301, optionItemName: '미디움', salePrice: 0 },
                { optionItemId: 302, optionItemName: '라지', salePrice: 4000 }
              ]
            }
          ]
        })
      }
    ])

    expect(result.menus).toEqual([
      expect.objectContaining({
        platformMenuId: '101',
        platformMenuName: '킹쉬림프피자',
        currentPrice: 25900,
        platformMenuStatus: '판매중'
      })
    ])
    expect(result.optionGroups).toEqual([
      expect.objectContaining({
        optionGroupId: '201',
        optionGroupName: '사이즈 선택',
        mappingMenusCount: 1,
        options: [
          expect.objectContaining({ optionId: '301', optionName: '미디움', optionPrice: 0 }),
          expect.objectContaining({ optionId: '302', optionName: '라지', optionPrice: 4000 })
        ],
        menus: [expect.objectContaining({ platformMenuId: '101' })]
      })
    ])
    expect(result.issues).toEqual([])
  })

  it('reports a non-empty response preview that is truncated or invalid JSON', () => {
    const result = parseBrowserCatalogApiEvents([
      {
        url: 'https://merchant.example/api/menus',
        method: 'GET',
        status: 200,
        capturedAt: '2026-07-21T00:00:00.000Z',
        responsePreview: '{"data":{"menus":['
      }
    ])

    expect(result.menus).toEqual([])
    expect(result.issues).toEqual([
      'api_response_invalid_json:https://merchant.example/api/menus'
    ])
  })
})
