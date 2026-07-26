import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import { collectDomSnapshot } from '../../../browser-extension/delivery-menu-inspector/dom-snapshot.mjs'

describe('browser inspector platform detection', () => {
  it.each([
    ['https://ceo.yogiyo.co.kr/self-service/menu', 'yogiyo'],
    ['https://partner.payco.kr/menu', 'deliveryspecial'],
    ['https://new.smartplace.naver.com/bizes/123/order/menu', 'naverorder']
  ] as const)('maps %s to %s', (href, platformCode) => {
    const dom = new JSDOM('<main><h1>메뉴 관리</h1></main>', { url: href })

    const snapshot = collectDomSnapshot({
      document: dom.window.document,
      href,
      pageTitle: '메뉴 관리',
      capturedAt: '2026-07-21T00:00:00.000Z',
      apiEvents: [],
      screenshotDataUrl: null,
      captureMode: 'viewport'
    })

    expect(snapshot.platformCode).toBe(platformCode)
  })
})
