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
      params?: { expression?: string }
    }

    if (payload.method === 'Runtime.evaluate') {
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
    this.onclose?.(new CloseEvent('close'))
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
    this.onclose?.(new CloseEvent('close'))
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
    expect(runtimeMessage?.params?.expression).toContain('/all-menu-dishes')
    expect(runtimeMessage?.params?.expression).toContain('/all-options?fetchDish=true')
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
})
