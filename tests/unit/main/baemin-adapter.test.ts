import { describe, expect, it, vi } from 'vitest'

const { launchPlaywrightChromium } = vi.hoisted(() => ({
  launchPlaywrightChromium: vi.fn()
}))

vi.mock('../../../src/main/services/playwright-runtime', () => ({
  launchPlaywrightChromium
}))

import { BaeminAdapter } from '../../../src/main/platforms/baemin/adapter'

const createMenuResponse = (pageNumber: number, totalPages: number, items: Array<[number, string, number]>) => ({
  json: async () => ({
    data: {
      content: items.map(([menuId, menuName, minMenuPrice]) => ({
        menuId,
        menuName,
        useShops: [{ menuGroupName: '대표 메뉴' }],
        menuStatusResponse: { status: 'NORMAL', displayYn: true },
        menuPrices: [{ minMenuPrice }]
      })),
      last: pageNumber === totalPages - 1,
      number: pageNumber,
      size: 20,
      totalPages
    }
  }),
  request: () => ({ method: () => 'GET' }),
  url: () =>
    `https://self-api.baemin.com/v1/menu-sys/core/v2/shop-owners/201806280156/menus/one-shop?shopId=10788244&page=${pageNumber}&size=20`
})

describe('BaeminAdapter', () => {
  it('waits until the detail modal reflects the updated values', async () => {
    const adapter = new BaeminAdapter({
      username: 'owner-id',
      password: 'secret'
    }) as any

    let reads = 0
    const modalLocator = {
      first: vi.fn().mockReturnThis(),
      innerText: vi.fn().mockImplementation(async () => {
        reads += 1
        if (reads === 1) {
          return '갈릭디핑 변경 1개 배달500원 픽업500원'
        }

        return '갈릭디핑 검증 변경 1개 배달700원 픽업700원'
      })
    }
    const fakePage = {
      locator: vi.fn().mockReturnValue(modalLocator),
      waitForTimeout: vi.fn().mockResolvedValue(undefined)
    }

    await expect(
      adapter.waitForDetailModalToReflectUpdate(fakePage, {
        nextName: '갈릭디핑 검증',
        nextPrice: 700
      })
    ).resolves.toBeUndefined()

    expect(fakePage.waitForTimeout).toHaveBeenCalled()
  })

  it('fails when the detail modal never reflects the updated values', async () => {
    const adapter = new BaeminAdapter({
      username: 'owner-id',
      password: 'secret'
    }) as any

    const modalLocator = {
      first: vi.fn().mockReturnThis(),
      innerText: vi.fn().mockResolvedValue('갈릭디핑 변경 1개 배달500원 픽업500원')
    }
    const fakePage = {
      locator: vi.fn().mockReturnValue(modalLocator),
      waitForTimeout: vi.fn().mockResolvedValue(undefined)
    }

    await expect(
      adapter.waitForDetailModalToReflectUpdate(fakePage, {
        nextName: '갈릭디핑 검증',
        nextPrice: 700,
        timeoutMs: 500
      })
    ).rejects.toThrow('baemin_menu_detail_verification_timeout')
  })

  it('fails fast when the visible name check guidance already rejects the menu name', async () => {
    const adapter = new BaeminAdapter({
      username: 'owner-id',
      password: 'secret'
    }) as any

    let now = 0
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const applyButton = {
      getAttribute: vi.fn().mockResolvedValue('true'),
      isDisabled: vi.fn().mockResolvedValue(true)
    }
    const fakePage = {
      locator: vi.fn().mockReturnValue({
        innerText: vi
          .fn()
          .mockResolvedValue("새 메뉴 추가 1 / 4 메뉴명을 입력해주세요. '배민'은(는) 입력할 수 없어요.")
      }),
      waitForTimeout: vi.fn().mockImplementation(async () => {
        now += 31_000
      })
    }

    await expect(
      adapter.waitForNameApplyReady(fakePage, applyButton, {
        accepted: null,
        message: null
      })
    ).rejects.toThrow("baemin_menu_name_rejected:'배민'은(는) 입력할 수 없어요.")

    dateNowSpy.mockRestore()
  })

  it('skips browser work when neither the name nor price changed', async () => {
    const adapter = new BaeminAdapter({
      username: 'owner-id',
      password: 'secret'
    })

    await expect(
      adapter.applyMenuUpdate({
        platformCode: 'baemin',
        menuId: 'menu-1',
        platformMenuId: 'platform-1',
        previousName: '갈릭디핑',
        previousPrice: 500,
        nextName: '갈릭디핑',
        nextPrice: 500
      })
    ).resolves.toBeUndefined()

    expect(launchPlaywrightChromium).not.toHaveBeenCalled()
  })

  it('attaches a page snapshot to baemin write failures before closing the browser', async () => {
    const adapter = new BaeminAdapter({
      username: 'owner-id',
      password: 'secret'
    }) as any

    const close = vi.fn().mockResolvedValue(undefined)
    const fakePage = {
      locator: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnThis(),
        innerText: vi
          .fn()
          .mockResolvedValue('메뉴 관리 검색 결과 가격 변경 검색 결과가 여러 개라 정확히 선택하지 못했습니다.')
      }),
      title: vi.fn().mockResolvedValue('배민 메뉴 관리'),
      url: vi.fn().mockReturnValue('https://self.baemin.com/menu')
    }

    adapter.createAuthenticatedSession = vi.fn().mockResolvedValue({
      browser: { close },
      page: fakePage
    })
    adapter.openMenuDetail = vi.fn().mockRejectedValue(new Error('baemin_menu_match_not_found'))

    await expect(
      adapter.applyMenuUpdate({
        platformCode: 'baemin',
        menuId: 'menu-1',
        platformMenuId: 'platform-1',
        previousName: '포테이토골드',
        previousPrice: 21000,
        nextName: '포테이토골드 테스트',
        nextPrice: 21000
      })
    ).rejects.toMatchObject({
      message: 'baemin_menu_match_not_found',
      syncFailureContext: expect.objectContaining({
        kind: 'platform_page_snapshot',
        status: 'captured',
        pageTitle: '배민 메뉴 관리',
        pageKind: 'menu_detail'
      })
    })

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('collects baemin menu pages from the live screen responses while scrolling', async () => {
    const responseListeners = new Set<(response: ReturnType<typeof createMenuResponse>) => void>()
    const queuedPages = [
      createMenuResponse(1, 3, [[2, '두 번째 메뉴', 22000]]),
      createMenuResponse(2, 3, [[3, '세 번째 메뉴', 33000]])
    ]

    const fakePage = {
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/menu')) {
          const firstPage = createMenuResponse(0, 3, [[1, '첫 번째 메뉴', 11000]])
          for (const listener of responseListeners) {
            await listener(firstPage)
          }
        }
      }),
      getByRole: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnThis(),
        isVisible: vi.fn().mockResolvedValue(false),
        click: vi.fn().mockResolvedValue(undefined)
      }),
      locator: vi.fn().mockReturnValue({
        innerText: vi.fn().mockResolvedValue(
          '메뉴 관리\n첫 번째 메뉴 11,000원\n두 번째 메뉴 22,000원\n세 번째 메뉴 33,000원'
        )
      }),
      mouse: {
        move: vi.fn().mockResolvedValue(undefined),
        wheel: vi.fn().mockImplementation(async () => {
          const nextPage = queuedPages.shift()
          if (!nextPage) {
            return
          }

          for (const listener of responseListeners) {
            await listener(nextPage)
          }
        })
      },
      off: vi.fn().mockImplementation((event: string, listener: (response: ReturnType<typeof createMenuResponse>) => void) => {
        if (event === 'response') {
          responseListeners.delete(listener)
        }
      }),
      on: vi.fn().mockImplementation((event: string, listener: (response: ReturnType<typeof createMenuResponse>) => void) => {
        if (event === 'response') {
          responseListeners.add(listener)
        }
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
      textContent: vi.fn().mockResolvedValue(null),
      title: vi.fn().mockResolvedValue('배민셀프서비스'),
      url: vi
        .fn()
        .mockReturnValueOnce('https://self.baemin.com/')
        .mockReturnValueOnce('https://self.baemin.com/')
        .mockReturnValue('https://self.baemin.com/menu'),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined)
    }

    const close = vi.fn().mockResolvedValue(undefined)
    launchPlaywrightChromium.mockResolvedValue({
      close,
      newPage: async () => fakePage
    })

    const adapter = new BaeminAdapter({
      username: 'owner-id',
      password: 'secret'
    })

    await expect(adapter.fetchMenusWithInspection()).resolves.toEqual(
      expect.objectContaining({
        menus: [
          expect.objectContaining({
            platformMenuId: '1',
            platformMenuName: '첫 번째 메뉴',
            currentPrice: 11000,
            platformMenuPriceCount: 1,
            platformMenuGroupName: '대표 메뉴',
            platformMenuStatus: '판매중',
            platformMenuPriceSummary: '배달 11,000원',
            platformMenuPriceVariants: [
              expect.objectContaining({
                channels: [
                  expect.objectContaining({
                    channelCode: 'delivery',
                    channelLabel: '배달',
                    amount: 11000,
                    amountText: '11,000원'
                  })
                ]
              })
            ]
          }),
          expect.objectContaining({
            platformMenuId: '2',
            platformMenuName: '두 번째 메뉴',
            currentPrice: 22000,
            platformMenuPriceCount: 1,
            platformMenuGroupName: '대표 메뉴',
            platformMenuStatus: '판매중',
            platformMenuPriceSummary: '배달 22,000원',
            platformMenuPriceVariants: [
              expect.objectContaining({
                channels: [
                  expect.objectContaining({
                    channelCode: 'delivery',
                    channelLabel: '배달',
                    amount: 22000,
                    amountText: '22,000원'
                  })
                ]
              })
            ]
          }),
          expect.objectContaining({
            platformMenuId: '3',
            platformMenuName: '세 번째 메뉴',
            currentPrice: 33000,
            platformMenuPriceCount: 1,
            platformMenuGroupName: '대표 메뉴',
            platformMenuStatus: '판매중',
            platformMenuPriceSummary: '배달 33,000원',
            platformMenuPriceVariants: [
              expect.objectContaining({
                channels: [
                  expect.objectContaining({
                    channelCode: 'delivery',
                    channelLabel: '배달',
                    amount: 33000,
                    amountText: '33,000원'
                  })
                ]
              })
            ]
          })
        ],
        inspection: expect.objectContaining({
          platformCode: 'baemin',
          steps: expect.arrayContaining([
            expect.objectContaining({
              kind: 'navigation',
              title: '로그인 페이지',
              pageTitle: '배민셀프서비스',
              screenshotDataUrl: expect.stringMatching(/^data:image\/png;base64,/)
            }),
            expect.objectContaining({
              kind: 'api',
              title: '메뉴 API 1페이지 감지'
            })
          ])
        })
      })
    )

    expect(fakePage.mouse.wheel).toHaveBeenCalledTimes(2)
    expect(close).toHaveBeenCalled()
  })

  it('dismisses blocking popup before scrolling so the last baemin menu page can load', async () => {
    const responseListeners = new Set<(response: ReturnType<typeof createMenuResponse>) => void>()
    const queuedPages = [
      createMenuResponse(1, 3, [[2, '두 번째 메뉴', 22000]]),
      createMenuResponse(2, 3, [[3, '세 번째 메뉴', 33000]])
    ]
    let popupDismissed = false

    const dismissButton = {
      first: vi.fn().mockReturnThis(),
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockImplementation(async () => {
        popupDismissed = true
      })
    }

    const hiddenButton = {
      first: vi.fn().mockReturnThis(),
      isVisible: vi.fn().mockResolvedValue(false),
      click: vi.fn().mockResolvedValue(undefined)
    }

    const fakePage = {
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/menu')) {
          const firstPage = createMenuResponse(0, 3, [[1, '첫 번째 메뉴', 11000]])
          for (const listener of responseListeners) {
            await listener(firstPage)
          }
        }
      }),
      getByRole: vi.fn().mockImplementation((_role: string, options?: { name?: RegExp | string }) => {
        const name = options?.name
        if (name instanceof RegExp && name.test('오늘 하루 보지 않기')) {
          return dismissButton
        }

        return hiddenButton
      }),
      locator: vi.fn().mockReturnValue({
        innerText: vi.fn().mockResolvedValue(
          '메뉴 관리\n첫 번째 메뉴 11,000원\n두 번째 메뉴 22,000원\n세 번째 메뉴 33,000원'
        )
      }),
      mouse: {
        move: vi.fn().mockResolvedValue(undefined),
        wheel: vi.fn().mockImplementation(async () => {
          const nextPage = queuedPages[0]
          if (!nextPage) {
            return
          }

          if (nextPage.url().includes('page=2') && !popupDismissed) {
            return
          }

          queuedPages.shift()
          for (const listener of responseListeners) {
            await listener(nextPage)
          }
        })
      },
      off: vi.fn().mockImplementation((event: string, listener: (response: ReturnType<typeof createMenuResponse>) => void) => {
        if (event === 'response') {
          responseListeners.delete(listener)
        }
      }),
      on: vi.fn().mockImplementation((event: string, listener: (response: ReturnType<typeof createMenuResponse>) => void) => {
        if (event === 'response') {
          responseListeners.add(listener)
        }
      }),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
      title: vi.fn().mockResolvedValue('배민셀프서비스'),
      url: vi
        .fn()
        .mockReturnValueOnce('https://self.baemin.com/')
        .mockReturnValueOnce('https://self.baemin.com/')
        .mockReturnValue('https://self.baemin.com/menu'),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined)
    }

    const close = vi.fn().mockResolvedValue(undefined)
    launchPlaywrightChromium.mockResolvedValue({
      close,
      newPage: async () => fakePage
    })

    const adapter = new BaeminAdapter({
      username: 'owner-id',
      password: 'secret'
    })

    await expect(adapter.fetchMenusWithInspection()).resolves.toEqual(
      expect.objectContaining({
        menus: expect.arrayContaining([
          expect.objectContaining({ platformMenuId: '3', platformMenuName: '세 번째 메뉴' })
        ])
      })
    )

    expect(dismissButton.click).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalled()
  })
})
