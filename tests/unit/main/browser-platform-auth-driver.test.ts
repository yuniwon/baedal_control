import { describe, expect, it, vi } from 'vitest'

import { BrowserPlatformAuthDriver } from '../../../src/main/services/browser-platform-auth-driver'
import { ExtensionSessionBroker } from '../../../src/main/services/extension-session-broker'
import { PLATFORM_METADATA } from '../../../src/shared/platforms'
import { PLATFORM_CAPABILITIES } from '../../../src/shared/platform-capabilities'

const emptySession = {
  endpointUrl: 'http://127.0.0.1:39482',
  connected: true,
  error: null,
  tabs: []
}

const createDriver = (overrides: Record<string, unknown> = {}) => {
  const inspect = vi.fn().mockResolvedValue(emptySession)
  const inspectAuthEvidence = vi.fn().mockResolvedValue({
    visiblePasswordInputCount: 0,
    loginMarkerDetected: false,
    credentialRejectionMarkerDetected: false,
    logoutMarkerDetected: false,
    managementMarkerDetected: false
  })
  const listLatest = vi.fn().mockReturnValue([])
  const autoLogin = vi.fn().mockResolvedValue({
    platformCode: 'coupangeats',
    status: 'submitted',
    message: 'submitted'
  })
  const launch = vi.fn().mockResolvedValue(undefined)
  const passwordManagerConnect = vi.fn().mockResolvedValue({
    state: 'ready',
    detailCode: 'password_manager_login_verified'
  })
  const markSessionReady = vi.fn()
  const driver = new BrowserPlatformAuthDriver({
    platformCode: 'coupangeats',
    metadata: PLATFORM_METADATA.coupangeats,
    capabilities: PLATFORM_CAPABILITIES.coupangeats,
    managedChromeSessionProbe: { inspect },
    managedChromeAuthEvidenceProbe: { inspect: inspectAuthEvidence },
    browserInspectionSnapshots: { listLatest },
    extensionSessionBroker: new ExtensionSessionBroker({
      now: () => new Date('2026-07-26T02:00:00.000Z')
    }),
    managedChromeLoginAutomator: {
      getLaunchUrl: (platformCode) => PLATFORM_METADATA[platformCode].loginUrl,
      autoLogin
    },
    managedChromeLauncher: { launch },
    managedPasswordManagerLoginCoordinator: {
      connect: passwordManagerConnect,
      markSessionReady
    },
    ...overrides
  })

  return {
    driver,
    inspect,
    inspectAuthEvidence,
    listLatest,
    autoLogin,
    launch,
    passwordManagerConnect,
    markSessionReady
  }
}

describe('BrowserPlatformAuthDriver', () => {
  it('recognizes an authenticated managed Chrome menu tab', async () => {
    const { driver, inspect, inspectAuthEvidence } = createDriver()
    inspect.mockResolvedValue({
      ...emptySession,
      tabs: [
        {
          tabId: 'tab-1',
          title: '메뉴 관리',
          url: 'https://store.coupangeats.com/merchant/management/menu/1',
          type: 'page',
          host: 'store.coupangeats.com',
          platformCode: 'coupangeats',
          pageKind: 'menu_list'
        }
      ]
    })
    inspectAuthEvidence.mockResolvedValue({
      visiblePasswordInputCount: 0,
      loginMarkerDetected: false,
      credentialRejectionMarkerDetected: false,
      logoutMarkerDetected: true,
      managementMarkerDetected: true
    })

    await expect(driver.probe()).resolves.toEqual({
      state: 'ready',
      detailCode: 'managed_session_ready'
    })
  })

  it('recognizes recent extension authentication evidence', async () => {
    const { driver, listLatest } = createDriver()
    listLatest.mockReturnValue([
      {
        snapshotId: 'snap-1',
        platformCode: 'coupangeats',
        source: 'browser_extension',
        pageUrl: 'https://store.coupangeats.com/merchant/management/menu/1',
        pageTitle: '메뉴 관리',
        host: 'store.coupangeats.com',
        capturedAt: '2026-07-26T01:58:00.000Z',
        menuNames: [],
        menuItems: [],
        optionGroupNames: [],
        buttonLabels: [],
        inputHints: [],
        fields: [],
        apiEvents: [],
        visiblePasswordInputCount: 0,
        loginMarkerDetected: false,
        logoutMarkerDetected: true,
        managementMarkerDetected: true
      }
    ])

    await expect(driver.probe()).resolves.toEqual({
      state: 'ready',
      detailCode: 'extension_session_ready'
    })
  })

  it('recognizes an authenticated management path without requiring a menu tab', async () => {
    const { driver, inspect, inspectAuthEvidence } = createDriver()
    inspect.mockResolvedValue({
      ...emptySession,
      tabs: [
        {
          tabId: 'tab-coupang-home',
          title: '쿠팡이츠 사장님 포털',
          url: 'https://store.coupangeats.com/merchant/management/home/1',
          type: 'page',
          host: 'store.coupangeats.com',
          platformCode: 'coupangeats',
          pageKind: 'unknown'
        }
      ]
    })
    inspectAuthEvidence.mockResolvedValue({
      visiblePasswordInputCount: 0,
      loginMarkerDetected: false,
      credentialRejectionMarkerDetected: false,
      logoutMarkerDetected: true,
      managementMarkerDetected: true
    })

    await expect(driver.probe()).resolves.toEqual({
      state: 'ready',
      detailCode: 'managed_session_ready'
    })
  })

  it('does not trust a Coupang management route without authenticated page evidence', async () => {
    const { driver, inspect } = createDriver()
    inspect.mockResolvedValue({
      ...emptySession,
      tabs: [{
        tabId: 'tab-unverified',
        title: '쿠팡이츠 메뉴 관리',
        url: 'https://store.coupangeats.com/merchant/management/menu/1',
        type: 'page',
        host: 'store.coupangeats.com',
        platformCode: 'coupangeats',
        pageKind: 'menu_list'
      }]
    })

    await expect(driver.probe()).resolves.toEqual({
      state: 'unknown',
      detailCode: 'session_evidence_missing'
    })
  })

  it('does not trust Coupang extension evidence outside the management route', async () => {
    const { driver, listLatest } = createDriver()
    listLatest.mockReturnValue([{
      snapshotId: 'snap-unverified-route',
      platformCode: 'coupangeats',
      source: 'browser_extension',
      pageUrl: 'https://store.coupangeats.com/merchant/menu',
      pageTitle: '메뉴 관리',
      host: 'store.coupangeats.com',
      capturedAt: '2026-07-26T01:58:00.000Z',
      menuNames: [],
      menuItems: [],
      optionGroupNames: [],
      buttonLabels: [],
      inputHints: [],
      fields: [],
      apiEvents: [],
      visiblePasswordInputCount: 0,
      loginMarkerDetected: false,
      logoutMarkerDetected: true,
      managementMarkerDetected: true
    }])

    await expect(driver.probe()).resolves.toEqual({
      state: 'unknown',
      detailCode: 'session_evidence_missing'
    })
  })

  it('recognizes a root login URL as expired only from visible login evidence', async () => {
    const { driver, inspect, inspectAuthEvidence } = createDriver({
      platformCode: 'yogiyo',
      metadata: PLATFORM_METADATA.yogiyo,
      capabilities: PLATFORM_CAPABILITIES.yogiyo
    })
    inspect.mockResolvedValue({
      ...emptySession,
      tabs: [
        {
          tabId: 'tab-yogiyo',
          title: '요기요 사장님사이트',
          url: 'https://ceo.yogiyo.co.kr/',
          type: 'page',
          host: 'ceo.yogiyo.co.kr',
          platformCode: 'yogiyo',
          pageKind: 'unknown'
        }
      ]
    })
    inspectAuthEvidence.mockResolvedValue({
      visiblePasswordInputCount: 1,
      loginMarkerDetected: true,
      credentialRejectionMarkerDetected: false,
      logoutMarkerDetected: false,
      managementMarkerDetected: false
    })

    await expect(driver.probe()).resolves.toEqual({
      state: 'expired',
      detailCode: 'managed_login_page'
    })
  })

  it('recognizes an authenticated root app from management evidence', async () => {
    const { driver, inspect, inspectAuthEvidence } = createDriver({
      platformCode: 'ddangyo',
      metadata: PLATFORM_METADATA.ddangyo,
      capabilities: PLATFORM_CAPABILITIES.ddangyo
    })
    inspect.mockResolvedValue({
      ...emptySession,
      tabs: [
        {
          tabId: 'tab-ddangyo',
          title: '땡겨요 사장님라운지',
          url: 'https://boss.ddangyo.com/',
          type: 'page',
          host: 'boss.ddangyo.com',
          platformCode: 'ddangyo',
          pageKind: 'unknown'
        }
      ]
    })
    inspectAuthEvidence.mockResolvedValue({
      visiblePasswordInputCount: 0,
      loginMarkerDetected: false,
      credentialRejectionMarkerDetected: false,
      logoutMarkerDetected: true,
      managementMarkerDetected: true
    })

    await expect(driver.probe()).resolves.toEqual({
      state: 'ready',
      detailCode: 'managed_session_ready'
    })
  })

  it('reports an explicit managed-browser login error as a rejected credential', async () => {
    const { driver, inspect, inspectAuthEvidence } = createDriver({
      platformCode: 'deliveryspecial',
      metadata: PLATFORM_METADATA.deliveryspecial,
      capabilities: PLATFORM_CAPABILITIES.deliveryspecial
    })
    inspect.mockResolvedValue({
      ...emptySession,
      tabs: [
        {
          tabId: 'tab-deliveryspecial',
          title: '로그인',
          url: 'https://partner.payco.kr/user/login/error',
          type: 'page',
          host: 'partner.payco.kr',
          platformCode: 'deliveryspecial',
          pageKind: 'login'
        }
      ]
    })
    inspectAuthEvidence.mockResolvedValue({
      visiblePasswordInputCount: 1,
      loginMarkerDetected: true,
      credentialRejectionMarkerDetected: true,
      logoutMarkerDetected: false,
      managementMarkerDetected: false
    })

    await expect(driver.probe()).resolves.toEqual({
      state: 'credential_rejected',
      detailCode: 'managed_login_rejected'
    })
  })

  it('treats a Baemin credential submission as a challenge until a fresh probe succeeds', async () => {
    const { driver, autoLogin, launch } = createDriver({
      platformCode: 'baemin',
      metadata: PLATFORM_METADATA.baemin,
      capabilities: PLATFORM_CAPABILITIES.baemin
    })

    await expect(
      driver.submitCredential?.({ username: 'owner', password: 'secret' })
    ).resolves.toEqual({
      state: 'challenge_required',
      detailCode: 'credential_submitted_check_required'
    })
    expect(launch).toHaveBeenCalledWith(PLATFORM_METADATA.baemin.loginUrl)
    expect(autoLogin).toHaveBeenCalledTimes(1)
  })

  it('delegates credential-free password-manager login for Coupang Eats', async () => {
    const { driver, passwordManagerConnect, autoLogin } = createDriver()

    await expect(driver.authenticateWithPasswordManager?.()).resolves.toEqual({
      state: 'ready',
      detailCode: 'password_manager_login_verified'
    })
    expect(passwordManagerConnect).toHaveBeenCalledWith('coupangeats')
    expect(autoLogin).not.toHaveBeenCalled()
  })

  it('opens manual authentication without submitting credentials', async () => {
    const { driver, autoLogin, launch } = createDriver()

    await driver.openUserChallenge?.()

    expect(launch).toHaveBeenCalledWith(PLATFORM_METADATA.coupangeats.loginUrl)
    expect(autoLogin).not.toHaveBeenCalled()
  })
})
