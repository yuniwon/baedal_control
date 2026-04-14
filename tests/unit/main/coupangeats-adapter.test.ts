import { describe, expect, it, vi } from 'vitest'

const { launchPlaywrightChromium } = vi.hoisted(() => ({
  launchPlaywrightChromium: vi.fn()
}))

vi.mock('../../../src/main/services/playwright-runtime', () => ({
  launchPlaywrightChromium
}))

import { CoupangEatsAdapter } from '../../../src/main/platforms/coupangeats/adapter'

describe('CoupangEatsAdapter', () => {
  it('delegates managed-browser execution items to the managed browser updater', async () => {
    const applyManagedBrowserUpdate = vi.fn().mockResolvedValue(undefined)
    const adapter = new CoupangEatsAdapter(
      {
        username: 'owner-id',
        password: 'secret'
      },
      'https://store.coupangeats.com/',
      {
        applyManagedBrowserUpdate
      }
    )

    const item = {
      platformCode: 'coupangeats',
      menuId: 'm1',
      platformMenuId: 'ce-1',
      previousName: '왕새우갈비',
      previousPrice: 23900,
      nextName: '왕새우갈비 수정',
      nextPrice: 24900,
      executionMode: 'managed_browser'
    } as const

    await expect(adapter.applyMenuUpdate(item)).resolves.toBeUndefined()
    expect(applyManagedBrowserUpdate).toHaveBeenCalledWith(item)
  })

  it('attaches inspection and closes the browser when the login form never appears', async () => {
    const fakePage = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({
        innerText: vi.fn().mockResolvedValue('쿠팡이츠 로그인')
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
      title: vi.fn().mockResolvedValue('쿠팡이츠 로그인'),
      url: vi.fn().mockReturnValue('https://store.coupangeats.com/merchant/login'),
      waitForSelector: vi
        .fn()
        .mockRejectedValue(new Error('page.waitForSelector: Timeout 30000ms exceeded. waiting for locator(\'#loginId\')'))
    }

    const close = vi.fn().mockResolvedValue(undefined)
    launchPlaywrightChromium.mockResolvedValue({
      close,
      newPage: async () => fakePage
    })

    const adapter = new CoupangEatsAdapter({
      username: 'owner-id',
      password: 'secret'
    })

    await expect(adapter.fetchMenusWithInspection()).rejects.toMatchObject({
      message: expect.stringContaining('page.waitForSelector: Timeout'),
      inspection: expect.objectContaining({
        platformCode: 'coupangeats',
        steps: expect.arrayContaining([
          expect.objectContaining({
            kind: 'navigation',
            title: '로그인 페이지',
            pageTitle: '쿠팡이츠 로그인'
          })
        ])
      })
    })

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('falls back to the managed browser snapshot path when login is denied and returns menu and option data', async () => {
    let responseListener:
      | ((response: { url: () => string; status: () => number }) => void)
      | undefined

    const fakePage = {
      goto: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockImplementation(async () => {
        responseListener?.({
          url: () => 'https://store.coupangeats.com/api/v1/merchant/login',
          status: () => 403
        })
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue({
          isVisible: vi.fn().mockResolvedValue(true)
        }),
        innerText: vi.fn().mockResolvedValue('쿠팡이츠 로그인')
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
      title: vi.fn().mockResolvedValue('쿠팡이츠 로그인'),
      url: vi.fn().mockReturnValue('https://store.coupangeats.com/merchant/login'),
      on: vi.fn().mockImplementation((_event: string, listener: typeof responseListener) => {
        responseListener = listener
      }),
      off: vi.fn().mockImplementation(() => {
        responseListener = undefined
      })
    }

    const close = vi.fn().mockResolvedValue(undefined)
    launchPlaywrightChromium.mockResolvedValue({
      close,
      newPage: async () => fakePage
    })

    const adapter = new CoupangEatsAdapter(
      {
        username: 'owner-id',
        password: 'secret'
      },
      'https://store.coupangeats.com/',
      {
        captureManagedBrowserSnapshots: vi.fn().mockResolvedValue([
          {
            snapshotId: 'menu-snap',
            platformCode: 'coupangeats',
            source: 'manual_browser',
            pageUrl: 'https://store.coupangeats.com/merchant/management/menu/109935',
            pageTitle: '쿠팡이츠 사장님 포털',
            pageKind: 'menu_list',
            captureMode: 'full_scroll',
            host: 'store.coupangeats.com',
            capturedAt: '2026-04-13T14:35:00.000Z',
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
                capturedAt: '2026-04-13T14:35:00.000Z',
                responsePreview: JSON.stringify({
                  data: {
                    menus: [
                      {
                        menuId: 909523,
                        menuName: '추천메뉴',
                        dishes: [
                          {
                            dishId: 5798617,
                            dishName: '왕새우갈비',
                            salePrice: 23900,
                            displayStatus: 'ON_SALE',
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
          },
          {
            snapshotId: 'option-snap',
            platformCode: 'coupangeats',
            source: 'manual_browser',
            pageUrl: 'https://store.coupangeats.com/merchant/management/menu/109935/options',
            pageTitle: '쿠팡이츠 사장님 포털',
            pageKind: 'option_list',
            captureMode: 'full_scroll',
            host: 'store.coupangeats.com',
            capturedAt: '2026-04-13T14:35:01.000Z',
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
                capturedAt: '2026-04-13T14:35:01.000Z',
                responsePreview: JSON.stringify({
                  data: {
                    options: [
                      {
                        optionId: 10711608,
                        optionName: '기본',
                        minSelect: 1,
                        maxSelect: 1,
                        isMandatory: true,
                        mappingDishCount: 0,
                        mappingDishes: [{ id: 5798617, name: '왕새우갈비' }],
                        optionItems: [
                          {
                            optionItemId: 58746513,
                            optionItemName: 'L',
                            salePrice: 4000,
                            displayStatus: 'ON_SALE',
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
          }
        ])
      }
    )

    await expect(adapter.fetchMenusWithInspection()).resolves.toEqual(
      expect.objectContaining({
        menus: [
          expect.objectContaining({
            platformMenuId: '5798617',
            platformMenuName: '왕새우갈비',
            currentPrice: 23900
          })
        ],
        rawMenuCount: 1,
        fetchMode: 'managed_browser',
        optionCatalogFetched: true,
        optionGroups: [
          expect.objectContaining({
            optionGroupId: '10711608',
            optionGroupName: '기본'
          })
        ],
        inspection: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({
              kind: 'result',
              title: '브라우저 세션 복구'
            })
          ])
        })
      })
    )

    expect(close).toHaveBeenCalledTimes(1)
  })
})
