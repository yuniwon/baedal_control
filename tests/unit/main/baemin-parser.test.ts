import { describe, expect, it } from 'vitest'
import {
  extractBaeminMenuRequestContext,
  parseBaeminMenuPageResponse
} from '../../../src/main/platforms/baemin/parser'

describe('parseBaeminMenuPageResponse', () => {
  it('extracts menu ids, names, representative prices, and distinguishing metadata from the baemin menu api payload', () => {
    const page = parseBaeminMenuPageResponse({
      data: {
        content: [
          {
            menuId: 59707517,
            menuName: "콰트로피자 15''",
            useShops: [
              {
                menuGroupName: '피자 메뉴',
                serviceTypeName: '음식배달',
                shopName: '꾸버스피자 봉담점'
              }
            ],
            menuStatusResponse: {
              status: 'NORMAL',
              displayYn: true
            },
            menuPrices: [
              {
                menuPriceName: 'F 사이즈',
                minMenuPrice: 32900,
                maxMenuPrice: 32900,
                pickupMenuPrice: 32900
              }
            ]
          },
          {
            menuId: 59707679,
            menuName: '쉬림프골드',
            useShops: [{ menuGroupName: '숨김 메뉴' }],
            menuStatusResponse: {
              status: 'SOLD_OUT',
              displayYn: false
            },
            menuPrices: [
              {
                menuPriceName: 'L',
                minMenuPrice: 25000,
                maxMenuPrice: 25000,
                pickupMenuPrice: 25000
              },
              {
                menuPriceName: 'M',
                minMenuPrice: 21000,
                maxMenuPrice: 21000,
                pickupMenuPrice: 21000
              }
            ]
          }
        ],
        last: false,
        number: 0,
        size: 20,
        totalPages: 2
      }
    })

    expect(page).toEqual({
      items: [
        {
          platformMenuId: '59707517',
          platformMenuName: "콰트로피자 15''",
          currentPrice: 32900,
          platformMenuPriceCount: 1,
          platformMenuPriceVariants: [
            {
              variantLabel: 'F 사이즈',
              channels: [
                {
                  channelCode: 'delivery',
                  channelLabel: '배달',
                  amount: 32900,
                  amountText: '32,900원'
                },
                {
                  channelCode: 'pickup',
                  channelLabel: '픽업',
                  amount: 32900,
                  amountText: '32,900원'
                }
              ]
            }
          ],
          platformMenuGroupName: '피자 메뉴',
          platformMenuBindingLabels: ['[음식배달] 꾸버스피자 봉담점'],
          platformMenuStatus: '판매중',
          platformMenuPriceSummary: 'F 사이즈 · 배달 32,900원 · 픽업 32,900원'
        },
        {
          platformMenuId: '59707679',
          platformMenuName: '쉬림프골드',
          currentPrice: 21000,
          platformMenuPriceCount: 2,
          platformMenuPriceVariants: [
            {
              variantLabel: 'L',
              channels: [
                {
                  channelCode: 'delivery',
                  channelLabel: '배달',
                  amount: 25000,
                  amountText: '25,000원'
                },
                {
                  channelCode: 'pickup',
                  channelLabel: '픽업',
                  amount: 25000,
                  amountText: '25,000원'
                }
              ]
            },
            {
              variantLabel: 'M',
              channels: [
                {
                  channelCode: 'delivery',
                  channelLabel: '배달',
                  amount: 21000,
                  amountText: '21,000원'
                },
                {
                  channelCode: 'pickup',
                  channelLabel: '픽업',
                  amount: 21000,
                  amountText: '21,000원'
                }
              ]
            }
          ],
          platformMenuGroupName: '숨김 메뉴',
          platformMenuStatus: '숨김 · 품절',
          platformMenuPriceSummary:
            'L · 배달 25,000원 · 픽업 25,000원 / M · 배달 21,000원 · 픽업 21,000원'
        }
      ],
      last: false,
      page: 0,
      size: 20,
      totalPages: 2
    })
  })
})

describe('extractBaeminMenuRequestContext', () => {
  it('reads owner, shop, page, and size from the menu api request url', () => {
    expect(
      extractBaeminMenuRequestContext(
        'https://self-api.baemin.com/v1/menu-sys/core/v2/shop-owners/201806280156/menus/one-shop?shopId=10788244&page=1&size=20'
      )
    ).toEqual({
      ownerId: '201806280156',
      page: 1,
      shopId: '10788244',
      size: 20
    })
  })
})
