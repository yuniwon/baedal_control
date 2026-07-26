import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'

import { coupangEatsPasswordManagerLoginDescriptor } from '../../../src/main/platforms/coupangeats/password-manager-login-descriptor'
import {
  collectManagedChromeLoginPageEvidence,
  ManagedChromeLoginPageProbe
} from '../../../src/main/services/managed-chrome-login-page-probe'

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

const inspectHtml = (html: string, url = 'https://store.coupangeats.com/merchant/login') => {
  const dom = new JSDOM(`<body>${html}</body>`, { url })
  makeVisible(dom)
  return collectManagedChromeLoginPageEvidence(
    dom.window.document,
    dom.window.location.href,
    coupangEatsPasswordManagerLoginDescriptor
  )
}

describe('ManagedChromeLoginPageProbe', () => {
  it('returns only presence booleans when Chrome has filled both fields', () => {
    const evidence = inspectHtml(`
      <input id="loginId" value="merchant-owner" />
      <input id="password" type="password" value="secret-value" />
      <button type="submit">로그인</button>
    `)

    expect(evidence).toMatchObject({
      loginFormVisible: true,
      usernameFilled: true,
      passwordFilled: true,
      submitVisible: true,
      submitEnabled: true,
      blocker: null
    })
    expect(JSON.stringify(evidence)).not.toMatch(/merchant-owner|secret-value/)
    expect(Object.keys(evidence)).not.toContain('username')
    expect(Object.keys(evidence)).not.toContain('password')
  })

  it.each([
    {
      label: 'login error',
      url: 'https://store.coupangeats.com/merchant/login/error',
      html: '<p>로그인에 실패했습니다. 아이디와 비밀번호를 확인해 주세요.</p>',
      blocker: 'login_error'
    },
    {
      label: 'captcha',
      html: '<iframe src="https://captcha.example/challenge"></iframe><div>보안문자</div>',
      blocker: 'captcha'
    },
    {
      label: 'otp',
      html: '<p>인증번호를 입력하세요</p><input autocomplete="one-time-code">',
      blocker: 'otp'
    },
    {
      label: 'account selection',
      html: '<button>로그인할 계정 선택</button>',
      blocker: 'account_selection'
    }
  ])('blocks clicking for $label evidence', ({ html, url, blocker }) => {
    const evidence = inspectHtml(`
      <input id="loginId" value="filled" />
      <input id="password" type="password" value="filled" />
      <button type="submit">로그인</button>
      ${html}
    `, url)

    expect(evidence.blocker).toBe(blocker)
    expect(evidence.submitEnabled).toBe(true)
  })

  it('detects management and logout evidence without exposing page text', () => {
    const evidence = inspectHtml(
      '<nav><button>로그아웃</button><a>메뉴 관리</a></nav>',
      'https://store.coupangeats.com/merchant/management/menu/109935'
    )

    expect(evidence).toMatchObject({
      managementMarkerDetected: true,
      logoutMarkerDetected: true,
      visiblePasswordInputCount: 0
    })
    expect(JSON.stringify(evidence)).not.toMatch(/메뉴 관리|로그아웃/)
  })

  it('evaluates a boolean-only page reducer in the requested tab', async () => {
    const evidence = inspectHtml('<input id="loginId"><input id="password" type="password">')
    const evaluateJson = vi.fn().mockResolvedValue(evidence)
    const probe = new ManagedChromeLoginPageProbe({ evaluateJson })

    await expect(
      probe.inspect('tab-1', coupangEatsPasswordManagerLoginDescriptor)
    ).resolves.toEqual(evidence)
    const expression = String(evaluateJson.mock.calls[0]?.[1] ?? '')
    expect(expression).not.toMatch(/Runtime\.getProperties|FormData|outerHTML|console\./)
    expect(expression).not.toMatch(/value\.length/)
  })
})
