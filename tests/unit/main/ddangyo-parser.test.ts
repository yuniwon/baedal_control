import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDdangyoMenus } from '../../../src/main/platforms/ddangyo/parser'

describe('parseDdangyoMenus', () => {
  it('extracts menu cards, status badges, and grouped prices from the fixture', () => {
    const html = readFileSync('tests/fixtures/platforms/ddangyo/menu-list.html', 'utf8')
    const menus = parseDdangyoMenus(html, '피자 메뉴')

    expect(menus).toEqual([
      {
        platformMenuId: '10000001',
        platformMenuName: "콰트로피자 15''",
        currentPrice: 32900,
        platformMenuPriceCount: 1,
        platformMenuPriceVariants: [
          {
            variantLabel: 'F사이즈',
            channels: [
              {
                channelCode: 'delivery',
                channelLabel: '배달',
                amount: 32900,
                amountText: '32,900원'
              },
              {
                channelCode: 'pickup',
                channelLabel: '포장',
                amount: 32900,
                amountText: '32,900원'
              },
              {
                channelCode: 'dine_in',
                channelLabel: '매장식사',
                amount: 32900,
                amountText: '32,900원'
              }
            ]
          }
        ],
        platformMenuGroupName: '피자 메뉴',
        platformMenuStatus: '판매중',
        platformMenuPriceSummary:
          'F사이즈 · 배달 32,900원 · 포장 32,900원 · 매장식사 32,900원'
      },
      {
        platformMenuId: '10000002',
        platformMenuName: '사이다',
        currentPrice: 1800,
        platformMenuPriceCount: 2,
        platformMenuPriceVariants: [
          {
            variantLabel: '500ml',
            channels: [
              {
                channelCode: 'delivery',
                channelLabel: '배달',
                amount: 1800,
                amountText: '1,800원'
              },
              {
                channelCode: 'pickup',
                channelLabel: '포장',
                amount: 1800,
                amountText: '1,800원'
              }
            ]
          },
          {
            variantLabel: '1.25L',
            channels: [
              {
                channelCode: 'delivery',
                channelLabel: '배달',
                amount: 2800,
                amountText: '2,800원'
              },
              {
                channelCode: 'pickup',
                channelLabel: '포장',
                amount: 2800,
                amountText: '2,800원'
              }
            ]
          }
        ],
        platformMenuGroupName: '피자 메뉴',
        platformMenuStatus: '판매중',
        platformMenuPriceSummary:
          '500ml · 배달 1,800원 · 포장 1,800원 / 1.25L · 배달 2,800원 · 포장 2,800원'
      }
    ])
  })

  it('does not concatenate action labels into the actual sale status', () => {
    const html = `
      <ul id="mf_wfm_contents_wfm_tabcontents_gen_menu">
        <li data-menu-status="HIDDEN">
          <span id="row_spa_menuId">42</span>
          <span id="row_tbx_menuNm">숨김 메뉴</span>
          <div class="actions">대표메뉴 · 품절 · 배달숨김 · 포장숨김</div>
          <div id="row_gen_menuPrc"><div>배달 : 19,000원</div></div>
        </li>
      </ul>`

    expect(parseDdangyoMenus(html)[0]).toEqual(
      expect.objectContaining({ platformMenuStatus: '숨김' })
    )
  })
})
