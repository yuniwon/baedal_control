import { describe, expect, it, vi } from 'vitest'

import { ManagedChromeLoginAutomator } from '../../../src/main/services/managed-chrome-login-automator'

describe('ManagedChromeLoginAutomator', () => {
  it('returns already authenticated when a coupangeats menu tab is already open', async () => {
    const inspect = vi.fn().mockResolvedValue({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: true,
      error: null,
      tabs: [
        {
          tabId: 'tab-menu',
          title: '쿠팡이츠 메뉴 관리',
          url: 'https://store.coupangeats.com/merchant/management/menu/109935',
          type: 'page',
          host: 'store.coupangeats.com',
          platformCode: 'coupangeats',
          pageKind: 'menu_list'
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
      automator.autoLogin('coupangeats', {
        username: 'saved-id',
        password: 'saved-password'
      })
    ).resolves.toEqual({
      platformCode: 'coupangeats',
      status: 'already_authenticated',
      message: '이미 쿠팡이츠 로그인 세션이 열려 있습니다.'
    })

    expect(evaluateJson).not.toHaveBeenCalled()
  })

  it('submits saved coupangeats credentials to the managed chrome login tab', async () => {
    const inspect = vi.fn().mockResolvedValue({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: true,
      error: null,
      tabs: [
        {
          tabId: 'tab-login',
          title: '쿠팡이츠 로그인',
          url: 'https://store.coupangeats.com/merchant/login',
          type: 'page',
          host: 'store.coupangeats.com',
          platformCode: 'coupangeats',
          pageKind: 'unknown'
        }
      ]
    })
    const evaluateJson = vi.fn().mockResolvedValue({
      status: 'submitted',
      message: '저장된 쿠팡이츠 계정으로 로그인을 시도했습니다.'
    })

    const automator = new ManagedChromeLoginAutomator({
      managedChromeSessionProbe: { inspect },
      managedChromeScriptRunner: { evaluateJson },
      maxAttempts: 1
    })

    await expect(
      automator.autoLogin('coupangeats', {
        username: 'saved-id',
        password: 'saved-password'
      })
    ).resolves.toEqual({
      platformCode: 'coupangeats',
      status: 'submitted',
      message: '저장된 쿠팡이츠 계정으로 로그인을 시도했습니다.'
    })

    expect(evaluateJson).toHaveBeenCalledWith(
      'tab-login',
      expect.stringContaining('saved-id')
    )
    expect(evaluateJson).toHaveBeenCalledWith(
      'tab-login',
      expect.stringContaining('saved-password')
    )
    expect(evaluateJson).toHaveBeenCalledWith(
      'tab-login',
      expect.stringContaining('#loginId')
    )
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
})
