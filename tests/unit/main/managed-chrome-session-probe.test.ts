import { describe, expect, it, vi } from 'vitest'
import { ManagedChromeSessionProbe } from '../../../src/main/services/managed-chrome-session-probe'

describe('ManagedChromeSessionProbe', () => {
  it('reads page tabs from the remote debugging endpoint and infers platform hints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'tab-1',
          type: 'page',
          title: '쿠팡이츠 메뉴 관리',
          url: 'https://store.coupangeats.com/merchant/management/menu/109935'
        },
        {
          id: 'tab-2',
          type: 'page',
          title: '쿠팡이츠 옵션 관리',
          url: 'https://store.coupangeats.com/merchant/management/menu/109935/options'
        },
        {
          id: 'tab-3',
          type: 'service_worker',
          title: 'Extension worker',
          url: 'chrome-extension://abc/background.js'
        }
      ]
    })

    const probe = new ManagedChromeSessionProbe({
      endpointUrl: 'http://127.0.0.1:39482',
      fetch: fetchMock as never
    })

    await expect(probe.inspect()).resolves.toEqual({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: true,
      error: null,
      tabs: [
        {
          tabId: 'tab-1',
          title: '쿠팡이츠 메뉴 관리',
          url: 'https://store.coupangeats.com/merchant/management/menu/109935',
          type: 'page',
          host: 'store.coupangeats.com',
          platformCode: 'coupangeats',
          pageKind: 'menu_list'
        },
        {
          tabId: 'tab-2',
          title: '쿠팡이츠 옵션 관리',
          url: 'https://store.coupangeats.com/merchant/management/menu/109935/options',
          type: 'page',
          host: 'store.coupangeats.com',
          platformCode: 'coupangeats',
          pageKind: 'option_list'
        }
      ]
    })
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:39482/json/list')
  })

  it('returns a disconnected session status when the endpoint cannot be reached', async () => {
    const probe = new ManagedChromeSessionProbe({
      endpointUrl: 'http://127.0.0.1:39482',
      fetch: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:39482')) as never
    })

    await expect(probe.inspect()).resolves.toEqual({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: false,
      error: 'connect ECONNREFUSED 127.0.0.1:39482',
      tabs: []
    })
  })

  it('recognizes Yogiyo, Delivery Special, and Naver Order management tabs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'yogiyo-tab',
          type: 'page',
          title: '요기요 메뉴 관리',
          url: 'https://ceo.yogiyo.co.kr/self-service/menu'
        },
        {
          id: 'deliveryspecial-tab',
          type: 'page',
          title: '배달특급 메뉴 관리',
          url: 'https://partner.payco.kr/menu'
        },
        {
          id: 'naver-tab',
          type: 'page',
          title: '네이버주문 메뉴 관리',
          url: 'https://new.smartplace.naver.com/bizes/123/order/menu'
        }
      ]
    })

    const tabs = await new ManagedChromeSessionProbe({
      fetch: fetchMock as never
    }).inspect().then((session) => session.tabs)

    expect(tabs.map(({ platformCode, pageKind }) => ({ platformCode, pageKind }))).toEqual([
      { platformCode: 'yogiyo', pageKind: 'menu_list' },
      { platformCode: 'deliveryspecial', pageKind: 'menu_list' },
      { platformCode: 'naverorder', pageKind: 'menu_list' }
    ])
  })
})
