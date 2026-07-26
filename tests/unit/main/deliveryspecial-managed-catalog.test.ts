import { describe, expect, it } from 'vitest'

import {
  buildDeliverySpecialCatalogApiEvents,
  buildDeliverySpecialCatalogCaptureExpression,
  extractDeliverySpecialMainMenuFromHtml
} from '../../../src/main/platforms/deliveryspecial/managed-catalog'

const menu = (
  treeId: string,
  name: string,
  amount: number,
  saleStatus = 'SALE'
) => ({
  treeId,
  productId: `product-${treeId}`,
  simpleName: name,
  amount,
  saleAmount: 0,
  displayFlag: 'Y',
  posMenuCode: `POS-${treeId}`,
  saleStatus
})

const categoryMenu = (
  treeId: string,
  name: string,
  categoryId: string,
  categoryName: string
) => ({
  treeId,
  menuId: treeId,
  simpleName: name,
  categoryId,
  categoryName,
  amount: treeId === 'menu-a' ? 10_000 : 12_000,
  countOfOptionGroup: 1
})

const detail = (treeId: string, name: string, optionTreeId: string) => ({
  levelType: 'MAIN',
  menu: {
    ...menu(treeId, name, treeId === 'menu-a' ? 10_000 : 12_000),
    categoryName: 'Pizza'
  },
  options: [
    {
      levelType: 'GROUP',
      menu: {
        treeId: `group-${treeId}`,
        simpleName: 'Size',
        optionGroupCode: 'size-template',
        optionType: 'OPT1',
        minQuantity: 1,
        maxQuantity: 1,
        displayFlag: 'Y',
        useFlag: 'Y'
      },
      options: [
        {
          levelType: 'MENU',
          menu: {
            treeId: optionTreeId,
            productId: 'size-medium',
            simpleName: 'Medium',
            amount: 0,
            displayFlag: 'Y',
            useFlag: 'Y'
          }
        },
        {
          levelType: 'MENU',
          menu: {
            treeId: `${optionTreeId}-large`,
            productId: 'size-large',
            simpleName: 'Large',
            amount: 4_000,
            displayFlag: 'Y',
            useFlag: 'Y'
          }
        }
      ]
    }
  ]
})

const completePayload = () => ({
  saleMenus: [
    menu('menu-a', 'Menu A', 10_000),
    menu('closed-noise', 'Option', 0, 'CLOSE'),
    menu('menu-b', 'Menu B', 12_000)
  ],
  saleMenuTotal: 2,
  categories: [
    {
      categoryId: 'featured',
      categoryName: 'Featured',
      ordinal: 1,
      countOfSaleMenu: 1,
      eventType: 'ET04'
    },
    {
      categoryId: 'pizza',
      categoryName: 'Pizza',
      ordinal: 2,
      countOfSaleMenu: 2
    }
  ],
  categoryMenus: [
    categoryMenu('menu-a', 'Menu A', 'featured', 'Featured'),
    categoryMenu('menu-a', 'Menu A', 'pizza', 'Pizza'),
    categoryMenu('menu-b', 'Menu B', 'pizza', 'Pizza')
  ],
  menuDetails: [
    detail('menu-a', 'Menu A', 'option-a'),
    detail('menu-b', 'Menu B', 'option-b')
  ]
})

describe('deliveryspecial managed catalog', () => {
  it('extracts the balanced mainMenu JSON assignment from a detail document', () => {
    const html = `
      <script>
        var before = { ignored: true };
        var mainMenu = {"menu":{"treeId":"menu-a","simpleName":"A {quoted} menu"},"options":[]};
        var after = { ignored: true };
      </script>
    `

    expect(extractDeliverySpecialMainMenuFromHtml(html)).toEqual({
      menu: { treeId: 'menu-a', simpleName: 'A {quoted} menu' },
      options: []
    })
  })

  it('removes closed noise, deduplicates menu-board rows, and merges shared option templates', () => {
    const events = buildDeliverySpecialCatalogApiEvents({
      capturedAt: '2026-07-21T15:00:00.000Z',
      payload: completePayload()
    })

    expect(events).toHaveLength(2)
    expect(JSON.parse(events[0]?.responsePreview ?? '{}')).toEqual({
      menus: [
        {
          menuId: 'menu-a',
          menuName: 'Menu A',
          salePrice: 10_000,
          displayStatus: 'ACTIVE',
          menuGroupName: 'Pizza'
        },
        {
          menuId: 'menu-b',
          menuName: 'Menu B',
          salePrice: 12_000,
          displayStatus: 'ACTIVE',
          menuGroupName: 'Pizza'
        }
      ],
      totalCount: 2,
      collectionComplete: true,
      sourceSaleMenuCount: 2,
      sourceCategoryRowCount: 3
    })
    expect(JSON.parse(events[1]?.responsePreview ?? '{}')).toEqual({
      optionGroups: [
        {
          optionGroupId: 'size-template',
          optionGroupName: 'Size',
          minOrderQuantity: 1,
          maxOrderQuantity: 1,
          mappingMenusCount: 2,
          mappingMenus: [
            { menuId: 'menu-a', menuName: 'Menu A', menuGroupName: 'Pizza' },
            { menuId: 'menu-b', menuName: 'Menu B', menuGroupName: 'Pizza' }
          ],
          optionItems: [
            {
              optionItemId: 'size-medium',
              optionItemName: 'Medium',
              optionPrice: 0,
              displayStatus: 'ACTIVE'
            },
            {
              optionItemId: 'size-large',
              optionItemName: 'Large',
              optionPrice: 4_000,
              displayStatus: 'ACTIVE'
            }
          ]
        }
      ],
      totalCount: 1,
      collectionComplete: true,
      sourceDetailCount: 2
    })
  })

  it('rejects a menu collection whose active count does not match the server total', () => {
    const payload = completePayload()
    payload.saleMenuTotal = 3

    expect(() =>
      buildDeliverySpecialCatalogApiEvents({
        capturedAt: '2026-07-21T15:00:00.000Z',
        payload
      })
    ).toThrow('deliveryspecial_menu_collection_incomplete:2/3')
  })

  it('rejects option collection when a menu with option groups has no detail tree', () => {
    const payload = completePayload()
    payload.menuDetails = payload.menuDetails.slice(0, 1)

    expect(() =>
      buildDeliverySpecialCatalogApiEvents({
        capturedAt: '2026-07-21T15:00:00.000Z',
        payload
      })
    ).toThrow('deliveryspecial_option_detail_missing:menu-b')
  })

  it('builds a read-only capture expression for every complete catalog endpoint', () => {
    const expression = buildDeliverySpecialCatalogCaptureExpression()

    expect(expression).toContain('/api/menuBoard/categories')
    expect(expression).toContain('/api/menuBoard/menus')
    expect(expression).toContain('/api/saleMenu/list')
    expect(expression).toContain('/product/saleMenu/detail')
    expect(expression).toContain("saleStatus: 'SALE'")
    expect(expression).not.toContain('/user/login')
  })
})
