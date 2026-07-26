import { describe, expect, it, vi } from 'vitest'

import { ManagedChromeSnapshotCapturer } from '../../../src/main/services/managed-chrome-snapshot-capturer'

const createSnapshotScript = () => `
export const collectDomSnapshot = ({ href, pageTitle, capturedAt, apiEvents, screenshotDataUrl, captureMode }) => ({
  platformCode: 'coupangeats',
  pageUrl: href,
  pageTitle,
  pageKind: 'menu_list',
  captureMode,
  host: new URL(href).host,
  capturedAt,
  textSnippet: '왕새우갈비 23,900원',
  menuNames: ['왕새우갈비'],
  menuItems: [{ name: '왕새우갈비', priceText: '23,900원', categoryName: '대표 메뉴' }],
  optionGroupNames: [],
  buttonLabels: ['저장'],
  inputHints: ['메뉴명'],
  fields: [{ name: 'menu[0].name', value: '왕새우갈비', source: 'dom' }],
  apiEvents,
  screenshotDataUrl
})
export const mergeDomSnapshots = (snapshots) => snapshots[snapshots.length - 1] ?? null
`

class MockWebSocket {
  static instances: MockWebSocket[] = []

  readonly messages: string[] = []
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.onopen?.(new Event('open'))
    })
  }

  send(message: string) {
    this.messages.push(message)

    const payload = JSON.parse(message) as {
      id: number
      method: string
      params?: { expression?: string; url?: string }
    }

    if (payload.method === 'Page.navigate') {
      this.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ id: payload.id, result: {} })
        })
      )
      return
    }

    if (payload.method === 'Runtime.evaluate') {
      if (payload.params?.expression?.includes('coupangeats_catalog_page_ready')) {
        this.onmessage?.(
          new MessageEvent('message', {
            data: JSON.stringify({
              id: payload.id,
              result: { result: { type: 'string', value: 'coupangeats_catalog_page_ready' } }
            })
          })
        )
        return
      }
      this.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            id: payload.id,
            result: {
              result: {
                type: 'string',
                value: JSON.stringify({
                  platformCode: 'coupangeats',
                  pageUrl: 'https://store.coupangeats.com/merchant/management/menu/109935',
                  pageTitle: '쿠팡이츠 사장님 포털',
                  pageKind: 'menu_list',
                  captureMode: 'full_scroll',
                  host: 'store.coupangeats.com',
                  capturedAt: '2026-04-13T13:00:00.000Z',
                  textSnippet: '왕새우갈비 23,900원',
                  menuNames: ['왕새우갈비'],
                  menuItems: [
                    {
                      name: '왕새우갈비',
                      priceText: '23,900원',
                      categoryName: '대표 메뉴'
                    }
                  ],
                  optionGroupNames: [],
                  buttonLabels: ['저장'],
                  inputHints: ['메뉴명'],
                  fields: [
                    {
                      name: 'menu[0].name',
                      value: '왕새우갈비',
                      source: 'dom'
                    }
                  ],
                  apiEvents: []
                })
              }
            }
          })
        })
      )
      return
    }

    if (payload.method === 'Page.captureScreenshot') {
      this.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            id: payload.id,
            result: {
              data: 'ZmFrZQ=='
            }
          })
        })
      )
    }
  }

  close() {
    this.onclose?.(new Event('close') as CloseEvent)
  }
}

class HangingWebSocket {
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(_url: string) {
    queueMicrotask(() => {
      this.onopen?.(new Event('open'))
    })
  }

  send(_message: string) {}

  close() {
    this.onclose?.(new Event('close') as CloseEvent)
  }
}

class YogiyoWebSocket {
  static instances: YogiyoWebSocket[] = []

  readonly messages: string[] = []
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(_url: string) {
    YogiyoWebSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.(new Event('open')))
  }

  send(message: string) {
    this.messages.push(message)
    const payload = JSON.parse(message) as {
      id: number
      method: string
      params?: { expression?: string; url?: string }
    }

    if (payload.method === 'Page.navigate') {
      this.reply(payload.id, {})
      const isOption = payload.params?.url?.includes('/option')
      const collection = isOption ? 'options' : 'products'
      queueMicrotask(() => {
        this.onmessage?.(
          new MessageEvent('message', {
            data: JSON.stringify({
              method: 'Network.requestWillBeSent',
              params: {
                request: {
                  method: 'GET',
                  url: `https://ceo-api.yogiyo.co.kr/proxy/catalogyo/legacy/vendors/318300/${collection}/?company_number=255-13-00819`,
                  headers: { Authorization: 'Bearer test-token', Accept: 'application/json' }
                }
              }
            })
          })
        )
      })
      return
    }

    if (payload.method === 'Runtime.evaluate') {
      this.reply(payload.id, {
        result: {
          type: 'string',
          value: JSON.stringify({
            platformCode: 'yogiyo',
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
            apiEvents: []
          })
        }
      })
      return
    }

    if (payload.method === 'Page.captureScreenshot') {
      this.reply(payload.id, { data: 'ZmFrZQ==' })
      return
    }

    this.reply(payload.id, {})
  }

  close() {
    this.onclose?.(new Event('close') as CloseEvent)
  }

  private reply(id: number, result: Record<string, unknown>) {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ id, result })
      })
    )
  }
}

class DeliverySpecialWebSocket {
  static instances: DeliverySpecialWebSocket[] = []

  readonly messages: string[] = []
  readinessChecks = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(_url: string) {
    DeliverySpecialWebSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.(new Event('open')))
  }

  send(message: string) {
    this.messages.push(message)
    const payload = JSON.parse(message) as {
      id: number
      method: string
      params?: { expression?: string; url?: string }
    }

    if (payload.method === 'Page.navigate') {
      this.reply(payload.id, {})
      return
    }

    if (payload.method === 'Runtime.evaluate') {
      if (payload.params?.expression?.includes('deliveryspecial_catalog_page_ready')) {
        this.readinessChecks += 1
        this.reply(payload.id, {
          result: {
            type: 'string',
            value: this.readinessChecks >= 2 ? 'deliveryspecial_catalog_page_ready' : ''
          }
        })
        return
      }

      if (payload.params?.expression?.includes('deliveryspecial_shop_id_missing')) {
        this.reply(payload.id, {
          result: {
            type: 'string',
            value: JSON.stringify({
              saleMenus: [
                {
                  treeId: 'menu-1',
                  simpleName: 'Menu 1',
                  amount: 10_000,
                  saleStatus: 'SALE',
                  displayFlag: 'Y'
                }
              ],
              saleMenuTotal: 1,
              categories: [
                {
                  categoryId: 'category-1',
                  categoryName: 'Category 1',
                  ordinal: 1,
                  countOfSaleMenu: 1
                }
              ],
              categoryMenus: [
                {
                  categoryId: 'category-1',
                  categoryName: 'Category 1',
                  treeId: 'menu-1',
                  simpleName: 'Menu 1'
                }
              ],
              menuDetails: [
                {
                  levelType: 'MAIN',
                  menu: {
                    treeId: 'menu-1',
                    simpleName: 'Menu 1',
                    categoryName: 'Category 1'
                  },
                  options: []
                }
              ]
            })
          }
        })
        return
      }

      this.reply(payload.id, {
        result: {
          type: 'string',
          value: JSON.stringify({
            platformCode: 'deliveryspecial',
            pageUrl: 'https://partner.payco.kr/product/menuBoard/shop/detail',
            pageTitle: 'Delivery Special partner',
            pageKind: 'menu_list',
            captureMode: 'full_scroll',
            host: 'partner.payco.kr',
            capturedAt: '2026-07-21T15:00:00.000Z',
            textSnippet: null,
            menuNames: [],
            menuItems: [],
            optionGroupNames: [],
            buttonLabels: [],
            inputHints: [],
            fields: [],
            apiEvents: []
          })
        }
      })
      return
    }

    if (payload.method === 'Page.captureScreenshot') {
      this.reply(payload.id, { data: 'ZmFrZQ==' })
      return
    }

    this.reply(payload.id, {})
  }

  close() {
    this.onclose?.(new Event('close') as CloseEvent)
  }

  private reply(id: number, result: Record<string, unknown>) {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ id, result })
      })
    )
  }
}

describe('ManagedChromeSnapshotCapturer', () => {
  it('captures a managed chrome tab through the devtools websocket and returns a saved snapshot payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          id: 'tab-1',
          type: 'page',
          title: '쿠팡이츠 사장님 포털',
          url: 'https://store.coupangeats.com/merchant/management/menu/109935',
          webSocketDebuggerUrl: 'ws://127.0.0.1:39482/devtools/page/tab-1'
        }
      ])
    })

    const capturer = new ManagedChromeSnapshotCapturer({
      fetch: fetchMock as typeof fetch,
      WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
      loadSnapshotScript: async () => createSnapshotScript(),
      now: () => new Date('2026-04-13T13:05:00.000Z')
    })

    const snapshot = await capturer.captureTab('tab-1')

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:39482/json/list')
    expect(snapshot).toEqual(
      expect.objectContaining({
        snapshotId: 'managed-tab-1-2026-04-13T13:05:00.000Z',
        source: 'manual_browser',
        platformCode: 'coupangeats',
        pageKind: 'menu_list',
        captureMode: 'full_scroll',
        pageUrl: 'https://store.coupangeats.com/merchant/management/menu/109935',
        screenshotDataUrl: 'data:image/png;base64,ZmFrZQ=='
      })
    )
    expect(MockWebSocket.instances[0]?.url).toBe('ws://127.0.0.1:39482/devtools/page/tab-1')

    const runtimeMessage = MockWebSocket.instances[0]?.messages
      .map((message) => JSON.parse(message) as { method: string; params?: { expression?: string } })
      .find((payload) => payload.method === 'Runtime.evaluate')

    expect(runtimeMessage?.params?.expression).toContain('collectDomSnapshot')
    expect(runtimeMessage?.params?.expression).toContain('mergeDomSnapshots')
    expect(runtimeMessage?.params?.expression).toContain('injectApiHook')
    expect(runtimeMessage?.params?.expression).toContain('dismissSafeNoticeDialogsInDocument(document)')
    expect(runtimeMessage?.params?.expression).toContain('/all-menu-dishes')
    expect(runtimeMessage?.params?.expression).toContain('/all-options?fetchDish=true')
    expect(runtimeMessage?.params?.expression).not.toContain('.slice(0, 2000)')
    expect(runtimeMessage?.params?.expression).toContain('.slice(0, 500000)')
  })

  it('navigates a Coupang Eats management home tab to its menu catalog before capture', async () => {
    MockWebSocket.instances = []
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          id: 'coupang-home-tab',
          type: 'page',
          title: '쿠팡이츠 사장님 포털',
          url: 'https://store.coupangeats.com/merchant/management/home/109935',
          webSocketDebuggerUrl: 'ws://127.0.0.1:39482/devtools/page/coupang-home-tab'
        }
      ])
    })
    const capturer = new ManagedChromeSnapshotCapturer({
      fetch: fetchMock as typeof fetch,
      WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
      loadSnapshotScript: async () => createSnapshotScript(),
      sleep: async () => undefined
    })

    await capturer.captureTab('coupang-home-tab')

    const messages = MockWebSocket.instances[0]?.messages.map(
      (message) => JSON.parse(message) as { method: string; params?: { url?: string } }
    )
    expect(messages?.find((message) => message.method === 'Page.navigate')?.params?.url).toBe(
      'https://store.coupangeats.com/merchant/management/menu/109935'
    )
  })

  it('throws a clear error when the requested tab is not available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([])
    })

    const capturer = new ManagedChromeSnapshotCapturer({
      fetch: fetchMock as typeof fetch,
      WebSocketImpl: MockWebSocket as unknown as typeof WebSocket,
      loadSnapshotScript: async () => createSnapshotScript()
    })

    await expect(capturer.captureTab('missing-tab')).rejects.toThrow(
      'managed_chrome_tab_not_found:missing-tab'
    )
  })

  it('fails fast when the runtime evaluation never responds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          id: 'tab-1',
          type: 'page',
          title: '쿠팡이츠 사장님 포털',
          url: 'https://store.coupangeats.com/merchant/management/menu/109935',
          webSocketDebuggerUrl: 'ws://127.0.0.1:39482/devtools/page/tab-1'
        }
      ])
    })

    const capturer = new ManagedChromeSnapshotCapturer({
      fetch: fetchMock as typeof fetch,
      WebSocketImpl: HangingWebSocket as unknown as typeof WebSocket,
      loadSnapshotScript: async () => createSnapshotScript(),
      commandTimeoutMs: 10
    })

    await expect(capturer.captureTab('tab-1')).rejects.toThrow(
      'managed_chrome_command_timeout:Runtime.evaluate'
    )
  })

  it('navigates Yogiyo menu and option pages and follows each cursor until an empty page', async () => {
    YogiyoWebSocket.instances = []
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/json/list')) {
        return new Response(
          JSON.stringify([
            {
              id: 'yogiyo-tab',
              type: 'page',
              title: '요기요 사장님사이트',
              url: 'https://ceo.yogiyo.co.kr/',
              webSocketDebuggerUrl: 'ws://127.0.0.1:39482/devtools/page/yogiyo-tab'
            }
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      const parsedUrl = new URL(url)
      const cursor = parsedUrl.searchParams.get('cursor')
      if (parsedUrl.pathname.includes('/products/')) {
        return new Response(
          JSON.stringify(
            cursor
              ? { page: { cursor: 'menu-cursor', size: 50 }, data: [] }
              : {
                  page: { cursor: 'menu-cursor', size: 50 },
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
                        }
                      ]
                    }
                  ]
                }
          ),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify(
          cursor
            ? { page: { cursor: 'option-cursor', size: 50 }, data: [] }
            : {
                page: { cursor: 'option-cursor', size: 50 },
                data: [
                  {
                    vendor_option_section_id: 201,
                    name: '도우 선택',
                    mandatory: true,
                    multiple: false,
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
              }
        ),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })

    const capturer = new ManagedChromeSnapshotCapturer({
      fetch: fetchMock as typeof fetch,
      WebSocketImpl: YogiyoWebSocket as unknown as typeof WebSocket,
      loadSnapshotScript: async () => createSnapshotScript(),
      sleep: async () => undefined,
      now: () => new Date('2026-07-21T14:05:00.000Z')
    })

    const snapshot = await capturer.captureTab('yogiyo-tab')

    const commands = YogiyoWebSocket.instances[0]?.messages.map(
      (message) => JSON.parse(message) as { method: string; params?: { url?: string } }
    )
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'Network.enable' }),
        expect.objectContaining({
          method: 'Page.navigate',
          params: expect.objectContaining({ url: 'https://ceo.yogiyo.co.kr/menu/set' })
        }),
        expect.objectContaining({
          method: 'Page.navigate',
          params: expect.objectContaining({ url: 'https://ceo.yogiyo.co.kr/option/group' })
        })
      ])
    )
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes('/products/'))
    ).toHaveLength(2)
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes('/options/'))
    ).toHaveLength(2)
    expect(snapshot.apiEvents).toHaveLength(2)
    expect(JSON.parse(snapshot.apiEvents[0]?.responsePreview ?? '{}')).toEqual(
      expect.objectContaining({ totalCount: 1, collectionComplete: true })
    )
    expect(JSON.parse(snapshot.apiEvents[1]?.responsePreview ?? '{}')).toEqual(
      expect.objectContaining({ totalCount: 1, collectionComplete: true })
    )
  })

  it('navigates an authenticated Delivery Special tab and captures complete menu and option events', async () => {
    DeliverySpecialWebSocket.instances = []
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'deliveryspecial-tab',
            type: 'page',
            title: 'Delivery Special partner',
            url: 'https://partner.payco.kr/shop/main',
            webSocketDebuggerUrl:
              'ws://127.0.0.1:39482/devtools/page/deliveryspecial-tab'
          }
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    const capturer = new ManagedChromeSnapshotCapturer({
      fetch: fetchMock as typeof fetch,
      WebSocketImpl: DeliverySpecialWebSocket as unknown as typeof WebSocket,
      loadSnapshotScript: async () => createSnapshotScript(),
      sleep: async () => undefined,
      now: () => new Date('2026-07-21T15:05:00.000Z')
    })

    const snapshot = await capturer.captureTab('deliveryspecial-tab')
    const commands = DeliverySpecialWebSocket.instances[0]?.messages.map(
      (message) => JSON.parse(message) as { method: string; params?: { url?: string } }
    )

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'Page.navigate',
          params: expect.objectContaining({
            url: 'https://partner.payco.kr/product/menuBoard/shop/detail'
          })
        })
      ])
    )
    expect(DeliverySpecialWebSocket.instances[0]?.readinessChecks).toBe(2)
    expect(snapshot.apiEvents).toHaveLength(2)
    expect(JSON.parse(snapshot.apiEvents[0]?.responsePreview ?? '{}')).toEqual(
      expect.objectContaining({ totalCount: 1, collectionComplete: true })
    )
    expect(JSON.parse(snapshot.apiEvents[1]?.responsePreview ?? '{}')).toEqual(
      expect.objectContaining({ totalCount: 0, collectionComplete: true })
    )
  })
})
