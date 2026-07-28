import { describe, expect, it, vi } from 'vitest'

import { ManagedChromeLoginAutomator } from '../../../src/main/services/managed-chrome-login-automator'

describe('ManagedChromeLoginAutomator', () => {
  it('never accepts Coupang Eats credentials in the legacy form-filling automator', async () => {
    const inspect = vi.fn()
    const evaluateJson = vi.fn()
    const clickSelector = vi.fn()
    const automator = new ManagedChromeLoginAutomator({
      managedChromeSessionProbe: { inspect },
      managedChromeScriptRunner: { evaluateJson, clickSelector },
      maxAttempts: 1
    })

    await expect(
      automator.autoLogin('coupangeats', {
        username: 'must-not-be-read',
        password: 'must-not-be-read'
      })
    ).resolves.toMatchObject({ status: 'unsupported' })
    expect(automator.getLaunchUrl('coupangeats')).toBeNull()
    expect(inspect).not.toHaveBeenCalled()
    expect(evaluateJson).not.toHaveBeenCalled()
    expect(clickSelector).not.toHaveBeenCalled()
  })

  it('submits saved baemin credentials to the managed chrome login tab', async () => {
    const inspect = vi.fn().mockResolvedValue({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: true,
      error: null,
      tabs: [
        {
          tabId: 'tab-baemin-login',
          title: '배민비즈회원',
          url: 'https://biz-member.baemin.com/login?returnUrl=https%3A%2F%2Fself.baemin.com%2Fmenu',
          type: 'page',
          host: 'biz-member.baemin.com',
          platformCode: 'baemin',
          pageKind: 'unknown'
        }
      ]
    })
    const evaluateJson = vi.fn().mockResolvedValue({
      status: 'submitted',
      message: '저장된 배민 계정으로 로그인을 시도했습니다.'
    })

    const automator = new ManagedChromeLoginAutomator({
      managedChromeSessionProbe: { inspect },
      managedChromeScriptRunner: { evaluateJson },
      maxAttempts: 1
    })

    await expect(
      automator.autoLogin('baemin', {
        username: 'saved-baemin-id',
        password: 'saved-baemin-password'
      })
    ).resolves.toEqual({
      platformCode: 'baemin',
      status: 'submitted',
      message: '저장된 배민 계정으로 로그인을 시도했습니다.'
    })

    expect(automator.getLaunchUrl('baemin')).toBe(
      'https://biz-member.baemin.com/login?returnUrl=https%3A%2F%2Fself.baemin.com%2Fmenu'
    )
    expect(evaluateJson).toHaveBeenCalledWith(
      'tab-baemin-login',
      expect.stringContaining('saved-baemin-id')
    )
    expect(evaluateJson).toHaveBeenCalledWith(
      'tab-baemin-login',
      expect.stringContaining('saved-baemin-password')
    )
    expect(evaluateJson).toHaveBeenCalledWith(
      'tab-baemin-login',
      expect.stringContaining('input[name=')
    )
  })

  it('reuses an authenticated Naver SmartPlace session without requiring saved credentials', async () => {
    const inspect = vi.fn().mockResolvedValue({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: true,
      error: null,
      tabs: [
        {
          tabId: 'naver-menu',
          title: '네이버주문 메뉴 관리',
          url: 'https://new.smartplace.naver.com/bizes/123/order/menu',
          type: 'page',
          host: 'new.smartplace.naver.com',
          platformCode: 'naverorder',
          pageKind: 'menu_list'
        }
      ]
    })
    const evaluateJson = vi.fn()
    const automator = new ManagedChromeLoginAutomator({
      managedChromeSessionProbe: { inspect },
      managedChromeScriptRunner: { evaluateJson, clickSelector: vi.fn() },
      maxAttempts: 1
    })

    await expect(automator.autoLogin('naverorder', null)).resolves.toEqual({
      platformCode: 'naverorder',
      status: 'already_authenticated',
      message: '이미 네이버주문 로그인 세션이 열려 있습니다.'
    })
    expect(evaluateJson).not.toHaveBeenCalled()
  })

  it.each([
    ['yogiyo', 'https://ceo.yogiyo.co.kr/login/'],
    ['ddangyo', 'https://boss.ddangyo.com/'],
    ['deliveryspecial', 'https://partner.payco.kr/user/login'],
    [
      'naverorder',
      'https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fnew.smartplace.naver.com%2F'
    ]
  ] as const)('provides a managed login launch URL for %s', (platformCode, loginUrl) => {
    const automator = new ManagedChromeLoginAutomator({
      managedChromeSessionProbe: { inspect: vi.fn() },
      managedChromeScriptRunner: { evaluateJson: vi.fn() }
    })

    expect(automator.getLaunchUrl(platformCode)).toBe(loginUrl)
  })

  it.each([
    'https://partner.payco.kr/shop/main',
    'https://partner.payco.kr/product/menuBoard/shop/detail'
  ])('reuses an authenticated Delivery Special session at %s', async (url) => {
    const inspect = vi.fn().mockResolvedValue({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: true,
      error: null,
      tabs: [
        {
          tabId: 'payco-authenticated',
          title: 'Delivery Special partner',
          url,
          type: 'page',
          host: 'partner.payco.kr',
          platformCode: 'deliveryspecial',
          pageKind: 'unknown'
        }
      ]
    })
    const evaluateJson = vi.fn()
    const automator = new ManagedChromeLoginAutomator({
      managedChromeSessionProbe: { inspect },
      managedChromeScriptRunner: { evaluateJson },
      maxAttempts: 1
    })

    await expect(
      automator.autoLogin('deliveryspecial', {
        username: 'stale-id',
        password: 'stale-password'
      })
    ).resolves.toMatchObject({ status: 'already_authenticated' })
    expect(evaluateJson).not.toHaveBeenCalled()
  })

  it('submits saved Delivery Special credentials to the PAYCO login form', async () => {
    const inspect = vi.fn().mockResolvedValue({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: true,
      error: null,
      tabs: [
        {
          tabId: 'payco-login',
          title: '사장님사이트 로그인',
          url: 'https://partner.payco.kr/user/login',
          type: 'page',
          host: 'partner.payco.kr',
          platformCode: 'deliveryspecial',
          pageKind: 'unknown'
        }
      ]
    })
    const evaluateJson = vi.fn().mockResolvedValue({ status: 'submitted' })
    const clickSelector = vi.fn().mockResolvedValue(undefined)
    const automator = new ManagedChromeLoginAutomator({
      managedChromeSessionProbe: { inspect },
      managedChromeScriptRunner: { evaluateJson, clickSelector },
      maxAttempts: 1
    })

    await expect(
      automator.autoLogin('deliveryspecial', {
        username: 'payco-id',
        password: 'payco-password'
      })
    ).resolves.toMatchObject({ status: 'submitted' })

    expect(evaluateJson).toHaveBeenCalledWith('payco-login', expect.stringContaining('#id'))
    expect(evaluateJson).toHaveBeenCalledWith(
      'payco-login',
      expect.stringContaining('#loginButton')
    )
    expect(clickSelector).toHaveBeenCalledWith(
      'payco-login',
      'button#loginButton[type="submit"]'
    )
  })

  it('recognizes the current and legacy Ddangyo encrypted login fields', async () => {
    const inspect = vi.fn().mockResolvedValue({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: true,
      error: null,
      tabs: [
        {
          tabId: 'ddangyo-login',
          title: '땡겨요 사장님라운지',
          url: 'https://boss.ddangyo.com/',
          type: 'page',
          host: 'boss.ddangyo.com',
          platformCode: 'ddangyo',
          pageKind: 'unknown'
        }
      ]
    })
    const evaluateJson = vi.fn().mockResolvedValue({ status: 'submitted' })
    const clickSelector = vi.fn().mockResolvedValue(undefined)
    const automator = new ManagedChromeLoginAutomator({
      managedChromeSessionProbe: { inspect },
      managedChromeScriptRunner: { evaluateJson, clickSelector },
      maxAttempts: 1
    })

    await expect(
      automator.autoLogin('ddangyo', {
        username: 'saved-ddangyo-id',
        password: 'saved-ddangyo-password'
      })
    ).resolves.toMatchObject({ status: 'submitted' })

    const expression = evaluateJson.mock.calls[0]?.[1] as string
    expect(expression).toContain('#mf_encrypted_id, #mf_ibx_mbrId')
    expect(expression).toContain('#mf_encrypted_pwd, #mf_sct_pwd')
    expect(expression).toContain('component?.setValue?.(value)')
    expect(clickSelector).toHaveBeenCalledWith('ddangyo-login', '#mf_btn_webLogin')
  })
})
