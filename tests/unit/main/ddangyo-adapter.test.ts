import { describe, expect, it, vi } from 'vitest'

const { launchPlaywrightChromium } = vi.hoisted(() => ({
  launchPlaywrightChromium: vi.fn()
}))

vi.mock('../../../src/main/services/playwright-runtime', () => ({
  launchPlaywrightChromium
}))

import { DdangyoAdapter } from '../../../src/main/platforms/ddangyo/adapter'
import { ddangyoSelectors } from '../../../src/main/platforms/ddangyo/selectors'

describe('DdangyoAdapter', () => {
  it('skips browser work when neither the name nor price changed', async () => {
    const adapter = new DdangyoAdapter({
      username: 'owner-id',
      password: 'secret'
    })

    await expect(
      adapter.applyMenuUpdate({
        platformCode: 'ddangyo',
        menuId: 'menu-1',
        platformMenuId: '10000042',
        previousName: '갈릭디핑',
        previousPrice: 500,
        nextName: '갈릭디핑',
        nextPrice: 500
      })
    ).resolves.toBeUndefined()

    expect(launchPlaywrightChromium).not.toHaveBeenCalled()
  })

  it('requires review for ddangyo menus with multiple price variants', async () => {
    const adapter = new DdangyoAdapter({
      username: 'owner-id',
      password: 'secret'
    })

    await expect(
      adapter.applyMenuUpdate({
        platformCode: 'ddangyo',
        menuId: 'menu-1',
        platformMenuId: '10000021',
        previousName: '치즈바이트',
        previousPrice: 28900,
        nextName: '치즈바이트 검증',
        nextPrice: 29900,
        platformMenuPriceCount: 2
      })
    ).rejects.toThrow('ddangyo_multi_price_menu_requires_review')

    expect(launchPlaywrightChromium).not.toHaveBeenCalled()
  })

  it('allows name-only updates on ddangyo menus with multiple price variants without rewriting prices', async () => {
    const state = {
      currentGroupIndex: -1
    }
    const groups = [
      {
        name: '음료',
        menus: [{ platformMenuId: '10000039' }]
      }
    ]

    const fill = vi.fn().mockResolvedValue(undefined)
    const click = vi.fn().mockResolvedValue(undefined)
    const waitForSelector = vi.fn().mockResolvedValue(undefined)
    const waitForFunction = vi.fn().mockResolvedValue(undefined)
    const waitForLoadState = vi.fn().mockResolvedValue(undefined)
    const waitForTimeout = vi.fn().mockResolvedValue(undefined)
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce([
        'mf_wfm_contents_wfm_tabcontents_SMWME01T120P40_wframe_gen_menuPrc_0_ibx_menuPrc1',
        'mf_wfm_contents_wfm_tabcontents_SMWME01T120P40_wframe_gen_menuPrc_1_ibx_menuPrc1'
      ])
      .mockResolvedValueOnce({
        menuName: '칠성사이다 검증',
        priceRowCount: 2
      })

    const fakePage = {
      goto: vi.fn().mockResolvedValue(undefined),
      fill,
      click,
      waitForSelector,
      waitForFunction,
      waitForLoadState,
      waitForTimeout,
      evaluate,
      getByText: vi.fn().mockImplementation((text: string) => ({
        first: vi.fn().mockReturnThis(),
        click: vi.fn().mockImplementation(async () => {
          if (text === '메뉴관리') {
            state.currentGroupIndex = -1
          }
        })
      })),
      locator: vi.fn().mockImplementation((selector: string) => {
        if (selector === ddangyoSelectors.groupLink) {
          return {
            count: vi.fn().mockResolvedValue(groups.length),
            nth: vi.fn().mockImplementation((index: number) => ({
              innerText: vi.fn().mockResolvedValue(groups[index]?.name ?? ''),
              click: vi.fn().mockImplementation(async () => {
                state.currentGroupIndex = index
              })
            }))
          }
        }

        if (selector === ddangyoSelectors.menuList) {
          const currentMenus =
            state.currentGroupIndex >= 0 ? groups[state.currentGroupIndex].menus : []

          return {
            count: vi.fn().mockResolvedValue(currentMenus.length),
            nth: vi.fn().mockImplementation((index: number) => {
              const menu = currentMenus[index]
              return {
                locator: vi.fn().mockImplementation((nestedSelector: string) => {
                  if (nestedSelector === ddangyoSelectors.menuId) {
                    return {
                      innerText: vi.fn().mockResolvedValue(menu?.platformMenuId ?? '')
                    }
                  }

                  if (nestedSelector === ddangyoSelectors.menuManageButton) {
                    return {
                      click: vi.fn().mockResolvedValue(undefined)
                    }
                  }

                  return {
                    innerText: vi.fn().mockResolvedValue(''),
                    click: vi.fn().mockResolvedValue(undefined)
                  }
                })
              }
            })
          }
        }

        return {
          count: vi.fn().mockResolvedValue(0),
          nth: vi.fn()
        }
      })
    }

    const close = vi.fn().mockResolvedValue(undefined)
    launchPlaywrightChromium.mockResolvedValue({
      close,
      newPage: async () => fakePage
    })

    const adapter = new DdangyoAdapter({
      username: 'owner-id',
      password: 'secret'
    })

    await expect(
      adapter.applyMenuUpdate({
        platformCode: 'ddangyo',
        menuId: 'menu-2',
        platformMenuId: '10000039',
        previousName: '칠성사이다',
        previousPrice: 1800,
        nextName: '칠성사이다 검증',
        nextPrice: 1800,
        platformMenuPriceCount: 2
      })
    ).resolves.toBeUndefined()

    expect(launchPlaywrightChromium).toHaveBeenCalledTimes(1)
    expect(evaluate).toHaveBeenCalledTimes(2)
    expect(evaluate.mock.calls[1]?.[1]).toMatchObject({
      nextName: '칠성사이다 검증',
      nextPrice: 1800,
      applyPriceChange: false
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('updates ddangyo menu info after locating the menu row by platform menu id', async () => {
    const state = {
      currentGroupIndex: -1
    }
    const groups = [
      {
        name: '사이드메뉴',
        menus: [{ platformMenuId: '10000035' }]
      },
      {
        name: '소스추가',
        menus: [{ platformMenuId: '10000042' }]
      }
    ]

    const fill = vi.fn().mockResolvedValue(undefined)
    const click = vi.fn().mockImplementation(async (selector: string) => {
      if (selector === ddangyoSelectors.groupListBackButton) {
        state.currentGroupIndex = -1
      }
    })
    const waitForSelector = vi.fn().mockResolvedValue(undefined)
    const waitForFunction = vi.fn().mockResolvedValue(undefined)
    const waitForLoadState = vi.fn().mockResolvedValue(undefined)
    const waitForTimeout = vi.fn().mockResolvedValue(undefined)
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce([
        'mf_wfm_contents_wfm_tabcontents_SMWME01T120P40_wframe_gen_menuPrc_0_ibx_menuPrc1',
        'mf_wfm_contents_wfm_tabcontents_SMWME01T120P40_wframe_gen_menuPrc_0_ibx_menuPrc2'
      ])
      .mockResolvedValueOnce({
        menuName: '갈릭디핑 검증',
        priceRowCount: 1
      })

    const fakePage = {
      goto: vi.fn().mockResolvedValue(undefined),
      fill,
      click,
      waitForSelector,
      waitForFunction,
      waitForLoadState,
      waitForTimeout,
      evaluate,
      getByText: vi.fn().mockImplementation((text: string) => ({
        first: vi.fn().mockReturnThis(),
        click: vi.fn().mockImplementation(async () => {
          if (text === '메뉴관리') {
            state.currentGroupIndex = -1
          }
        })
      })),
      locator: vi.fn().mockImplementation((selector: string) => {
        if (selector === ddangyoSelectors.groupLink) {
          return {
            count: vi.fn().mockResolvedValue(groups.length),
            nth: vi.fn().mockImplementation((index: number) => ({
              innerText: vi.fn().mockResolvedValue(groups[index]?.name ?? ''),
              click: vi.fn().mockImplementation(async () => {
                state.currentGroupIndex = index
              })
            }))
          }
        }

        if (selector === ddangyoSelectors.menuList) {
          const currentMenus =
            state.currentGroupIndex >= 0 ? groups[state.currentGroupIndex].menus : []

          return {
            count: vi.fn().mockResolvedValue(currentMenus.length),
            nth: vi.fn().mockImplementation((index: number) => {
              const menu = currentMenus[index]
              return {
                locator: vi.fn().mockImplementation((nestedSelector: string) => {
                  if (nestedSelector === ddangyoSelectors.menuId) {
                    return {
                      innerText: vi.fn().mockResolvedValue(menu?.platformMenuId ?? '')
                    }
                  }

                  if (nestedSelector === ddangyoSelectors.menuManageButton) {
                    return {
                      click: vi.fn().mockResolvedValue(undefined)
                    }
                  }

                  return {
                    innerText: vi.fn().mockResolvedValue(''),
                    click: vi.fn().mockResolvedValue(undefined)
                  }
                })
              }
            })
          }
        }

        return {
          count: vi.fn().mockResolvedValue(0),
          nth: vi.fn()
        }
      })
    }

    const close = vi.fn().mockResolvedValue(undefined)
    launchPlaywrightChromium.mockResolvedValue({
      close,
      newPage: async () => fakePage
    })

    const adapter = new DdangyoAdapter({
      username: 'owner-id',
      password: 'secret'
    })

    await expect(
      adapter.applyMenuUpdate({
        platformCode: 'ddangyo',
        menuId: 'menu-1',
        platformMenuId: '10000042',
        previousName: '갈릭디핑',
        previousPrice: 500,
        nextName: '갈릭디핑 검증',
        nextPrice: 700
      })
    ).resolves.toBeUndefined()

    expect(fill).toHaveBeenCalledWith(ddangyoSelectors.username, 'owner-id')
    expect(fill).toHaveBeenCalledWith(ddangyoSelectors.password, 'secret')
    expect(fill).toHaveBeenCalledTimes(2)
    expect(click).toHaveBeenCalledWith(ddangyoSelectors.groupListBackButton)
    expect(click).toHaveBeenCalledWith(ddangyoSelectors.menuInfoApplyButton)
    expect(evaluate).toHaveBeenCalledTimes(2)
    expect(waitForFunction).toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
