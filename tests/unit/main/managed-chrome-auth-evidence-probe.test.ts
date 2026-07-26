import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'

import {
  collectManagedChromeAuthEvidence,
  ManagedChromeAuthEvidenceProbe
} from '../../../src/main/services/managed-chrome-auth-evidence-probe'

const makeVisible = (dom: JSDOM) => {
  Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: 20,
      height: 20,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })
  })
}

describe('ManagedChromeAuthEvidenceProbe', () => {
  it('detects a visible root login form without reading input values', () => {
    const dom = new JSDOM(
      '<body><input type="password" value="must-not-be-read"><button>로그인</button></body>',
      { url: 'https://ceo.yogiyo.co.kr/' }
    )
    makeVisible(dom)

    expect(
      collectManagedChromeAuthEvidence(dom.window.document, dom.window.location.href)
    ).toEqual({
      visiblePasswordInputCount: 1,
      loginMarkerDetected: true,
      credentialRejectionMarkerDetected: false,
      logoutMarkerDetected: false,
      managementMarkerDetected: false
    })
  })

  it('detects an authenticated root management app', () => {
    const dom = new JSDOM(
      '<body><nav><button>로그아웃</button><a>메뉴관리</a></nav></body>',
      { url: 'https://boss.ddangyo.com/' }
    )
    makeVisible(dom)

    expect(
      collectManagedChromeAuthEvidence(dom.window.document, dom.window.location.href)
    ).toEqual({
      visiblePasswordInputCount: 0,
      loginMarkerDetected: false,
      credentialRejectionMarkerDetected: false,
      logoutMarkerDetected: true,
      managementMarkerDetected: true
    })
  })

  it('detects a generic login rejection without reading credential values', () => {
    const dom = new JSDOM(
      '<body><p>로그인 인증에 실패했습니다. 아이디와 비밀번호를 확인해 주세요.</p><input type="password"></body>',
      { url: 'https://partner.payco.kr/user/login/error' }
    )
    makeVisible(dom)

    expect(
      collectManagedChromeAuthEvidence(dom.window.document, dom.window.location.href)
    ).toMatchObject({
      loginMarkerDetected: true,
      credentialRejectionMarkerDetected: true
    })
  })

  it('runs the safe evidence expression in the selected managed tab', async () => {
    const evidence = {
      visiblePasswordInputCount: 0,
      loginMarkerDetected: false,
      credentialRejectionMarkerDetected: false,
      logoutMarkerDetected: true,
      managementMarkerDetected: true
    }
    const evaluateJson = vi.fn().mockResolvedValue(evidence)
    const probe = new ManagedChromeAuthEvidenceProbe({ evaluateJson })

    await expect(probe.inspect('tab-1')).resolves.toEqual(evidence)
    expect(evaluateJson).toHaveBeenCalledTimes(1)
    expect(evaluateJson.mock.calls[0]?.[0]).toBe('tab-1')
    expect(evaluateJson.mock.calls[0]?.[1]).not.toMatch(/\.value/)
  })
})
