import { describe, expect, it } from 'vitest'
import {
  extractBaeminOptionGroupRequestContext,
  parseBaeminOptionGroupPageResponse
} from '../../../src/main/platforms/baemin/option-parser'

describe('parseBaeminOptionGroupPageResponse', () => {
  it('extracts option groups, option items, and linked menus from the baemin option tab payload', () => {
    const page = parseBaeminOptionGroupPageResponse({
      data: {
        content: [
          {
            optionGroupId: 1255830208,
            optionGroupName: '사이즈 추가선택',
            minOrderQuantity: 1,
            maxOrderQuantity: 1,
            mappingMenusCount: 18,
            options: [
              {
                optionId: 1274793668,
                optionGroupId: 1255830208,
                optionName: 'M 사이즈',
                optionPrice: 0,
                itemStatus: 'ACTIVE',
                restockedAt: null
              },
              {
                optionId: 1274793669,
                optionGroupId: 1255830208,
                optionName: 'L 사이즈',
                optionPrice: 4000,
                itemStatus: 'ACTIVE',
                restockedAt: null
              }
            ],
            menus: [
              {
                menuId: 59707531,
                menuName: '(추천 )왕새우갈비',
                useShops: [
                  {
                    menuGroupName: '꾸버스 반반피자메뉴'
                  }
                ]
              },
              {
                menuId: 59707679,
                menuName: '쉬림프골드',
                useShops: [
                  {
                    menuGroupName: '선택에 실패 없는 알뜰피자'
                  }
                ]
              }
            ]
          }
        ],
        last: false,
        number: 1,
        size: 20,
        totalPages: 3
      }
    })

    expect(page).toEqual({
      items: [
        {
          optionGroupId: '1255830208',
          optionGroupName: '사이즈 추가선택',
          minOrderQuantity: 1,
          maxOrderQuantity: 1,
          mappingMenusCount: 18,
          options: [
            {
              optionId: '1274793668',
              optionName: 'M 사이즈',
              optionPrice: 0,
              itemStatus: 'ACTIVE',
              restockedAt: null
            },
            {
              optionId: '1274793669',
              optionName: 'L 사이즈',
              optionPrice: 4000,
              itemStatus: 'ACTIVE',
              restockedAt: null
            }
          ],
          menus: [
            {
              platformMenuId: '59707531',
              platformMenuName: '(추천 )왕새우갈비',
              platformMenuGroupName: '꾸버스 반반피자메뉴'
            },
            {
              platformMenuId: '59707679',
              platformMenuName: '쉬림프골드',
              platformMenuGroupName: '선택에 실패 없는 알뜰피자'
            }
          ]
        }
      ],
      last: false,
      page: 1,
      size: 20,
      totalPages: 3
    })
  })
})

describe('extractBaeminOptionGroupRequestContext', () => {
  it('reads owner, page, and size from the option group list url', () => {
    expect(
      extractBaeminOptionGroupRequestContext(
        'https://self-api.baemin.com/v1/menu-sys/core/v1/shop-owners/201806280156/option-groups?page=1&size=20'
      )
    ).toEqual({
      ownerId: '201806280156',
      page: 1,
      size: 20
    })
  })
})
