import { describe, expect, it, vi } from 'vitest'

import type {
  BrowserInspectorStatus,
  ManagedChromeSessionStatus,
  PlatformAuthPreferenceRecord
} from '../../../src/shared/contracts'
import { coupangEatsPasswordManagerLoginDescriptor } from '../../../src/main/platforms/coupangeats/password-manager-login-descriptor'
import type { ManagedChromeLoginPageEvidence } from '../../../src/main/services/managed-chrome-login-page-probe'
import { ManagedPasswordManagerLoginCoordinator } from '../../../src/main/services/managed-password-manager-login-coordinator'

const loginSession: ManagedChromeSessionStatus = {
  endpointUrl: 'http://127.0.0.1:39482',
  connected: true,
  error: null,
  tabs: [
    {
      tabId: 'login-tab',
      title: '쿠팡이츠 로그인',
      url: 'https://store.coupangeats.com/merchant/login',
      type: 'page',
      host: 'store.coupangeats.com',
      platformCode: 'coupangeats',
      pageKind: 'unknown'
    }
  ]
}

const managementSession: ManagedChromeSessionStatus = {
  endpointUrl: 'http://127.0.0.1:39482',
  connected: true,
  error: null,
  tabs: [
    {
      tabId: 'management-tab',
      title: '쿠팡이츠 메뉴 관리',
      url: 'https://store.coupangeats.com/merchant/management/menu/109935',
      type: 'page',
      host: 'store.coupangeats.com',
      platformCode: 'coupangeats',
      pageKind: 'menu_list'
    }
  ]
}

const emptyLoginEvidence: ManagedChromeLoginPageEvidence = {
  loginFormVisible: true,
  usernameFilled: false,
  passwordFilled: false,
  submitVisible: true,
  submitEnabled: true,
  blocker: null,
  managementMarkerDetected: false,
  logoutMarkerDetected: false,
  visiblePasswordInputCount: 1
}

const filledLoginEvidence: ManagedChromeLoginPageEvidence = {
  ...emptyLoginEvidence,
  usernameFilled: true,
  passwordFilled: true
}

const managementEvidence: ManagedChromeLoginPageEvidence = {
  loginFormVisible: false,
  usernameFilled: false,
  passwordFilled: false,
  submitVisible: false,
  submitEnabled: false,
  blocker: null,
  managementMarkerDetected: true,
  logoutMarkerDetected: true,
  visiblePasswordInputCount: 0
}

const makeStatus = (ready = true): BrowserInspectorStatus => ({
  receiverUrl: '',
  extensionPath: '',
  isRunning: false,
  chromeAvailable: true,
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  chromeProfilePath: 'C:\\AppData\\delivery-menu-sync\\managed-chrome',
  passwordManagerLoginReady: ready,
  managedChromeRunning: true,
  lastLaunchUrl: null,
  chromeError: null
})

const makeHarness = ({
  consented = true,
  sessions = [loginSession],
  evidences = [filledLoginEvidence]
}: {
  consented?: boolean
  sessions?: ManagedChromeSessionStatus[]
  evidences?: ManagedChromeLoginPageEvidence[]
} = {}) => {
  const preference: PlatformAuthPreferenceRecord = {
    workspaceId: 'default',
    platformCode: 'coupangeats',
    autoClickLoginButtonConsented: consented,
    consentUpdatedAt: consented ? '2026-07-26T10:00:00.000Z' : null
  }
  const managedChromeSessionProbe = {
    inspect: vi.fn()
  }
  for (const session of sessions) {
    managedChromeSessionProbe.inspect.mockResolvedValueOnce(session)
  }
  managedChromeSessionProbe.inspect.mockResolvedValue(sessions.at(-1) ?? loginSession)

  const loginPageProbe = { inspect: vi.fn() }
  for (const evidence of evidences) {
    loginPageProbe.inspect.mockResolvedValueOnce(evidence)
  }
  loginPageProbe.inspect.mockResolvedValue(evidences.at(-1) ?? emptyLoginEvidence)

  const clickAttempts = {
    claim: vi.fn().mockReturnValue(true),
    markState: vi.fn(),
    markPlatformReady: vi.fn(),
    getUnresolved: vi.fn().mockReturnValue(null)
  }
  const scriptRunner = {
    getDocumentIdentity: vi.fn().mockResolvedValue({ tabId: 'login-tab', loaderId: 'loader-7' }),
    clickSelector: vi.fn().mockResolvedValue(undefined)
  }
  const managedChromeLauncher = {
    getStatus: vi.fn().mockReturnValue(makeStatus()),
    launch: vi.fn().mockReturnValue(makeStatus())
  }
  const coordinator = new ManagedPasswordManagerLoginCoordinator({
    descriptors: { coupangeats: coupangEatsPasswordManagerLoginDescriptor },
    preferences: { get: vi.fn().mockReturnValue(preference) },
    clickAttempts,
    managedChromeLauncher,
    managedChromeSessionProbe,
    loginPageProbe,
    scriptRunner,
    workspaceId: 'default',
    now: () => '2026-07-26T10:00:00.000Z',
    randomUUID: () => 'attempt-1',
    sleep: vi.fn().mockResolvedValue(undefined),
    autofillPollAttempts: 2,
    autofillPollIntervalMs: 0,
    verificationPollAttempts: 2,
    verificationPollIntervalMs: 0
  })

  return {
    coordinator,
    clickAttempts,
    loginPageProbe,
    managedChromeLauncher,
    managedChromeSessionProbe,
    scriptRunner
  }
}

describe('ManagedPasswordManagerLoginCoordinator', () => {
  it('reuses a strictly verified management session without opening login', async () => {
    const harness = makeHarness({
      sessions: [managementSession],
      evidences: [managementEvidence]
    })

    await expect(harness.coordinator.connect('coupangeats')).resolves.toEqual({
      state: 'ready',
      detailCode: 'managed_session_ready'
    })
    expect(harness.managedChromeLauncher.launch).not.toHaveBeenCalled()
    expect(harness.scriptRunner.clickSelector).not.toHaveBeenCalled()
  })

  it('does not open or click login without saved explicit consent', async () => {
    const harness = makeHarness({ consented: false })

    await expect(harness.coordinator.connect('coupangeats')).resolves.toEqual({
      state: 'expired',
      detailCode: 'password_manager_auto_click_consent_required'
    })
    expect(harness.managedChromeLauncher.launch).not.toHaveBeenCalled()
    expect(harness.scriptRunner.clickSelector).not.toHaveBeenCalled()
  })

  it('waits for autofill, clicks once, and verifies URL plus management evidence', async () => {
    const harness = makeHarness({
      sessions: [loginSession, loginSession, loginSession, managementSession],
      evidences: [emptyLoginEvidence, filledLoginEvidence, managementEvidence]
    })

    await expect(harness.coordinator.connect('coupangeats')).resolves.toEqual({
      state: 'ready',
      detailCode: 'password_manager_login_verified'
    })
    expect(harness.clickAttempts.claim).toHaveBeenCalledTimes(1)
    expect(harness.scriptRunner.clickSelector).toHaveBeenCalledTimes(1)
    expect(harness.scriptRunner.clickSelector).toHaveBeenCalledWith(
      'login-tab',
      'button[type="submit"]'
    )
    expect(harness.clickAttempts.markState).toHaveBeenLastCalledWith(
      'attempt-1',
      'succeeded',
      '2026-07-26T10:00:00.000Z'
    )
  })

  it('does not click when an unresolved attempt already exists', async () => {
    const harness = makeHarness()
    harness.clickAttempts.getUnresolved.mockReturnValue({ attemptId: 'previous-attempt' })

    await expect(harness.coordinator.connect('coupangeats')).resolves.toEqual({
      state: 'challenge_required',
      detailCode: 'login_click_already_attempted'
    })
    expect(harness.scriptRunner.clickSelector).not.toHaveBeenCalled()
  })

  it.each([
    ['login_error', 'managed_login_rejected'],
    ['captcha', 'captcha_required'],
    ['otp', 'otp_required'],
    ['account_selection', 'account_selection_required']
  ] as const)('hands off %s without clicking', async (blocker, detailCode) => {
    const harness = makeHarness({
      evidences: [{ ...filledLoginEvidence, blocker }]
    })

    await expect(harness.coordinator.connect('coupangeats')).resolves.toEqual({
      state: 'challenge_required',
      detailCode
    })
    expect(harness.scriptRunner.clickSelector).not.toHaveBeenCalled()
  })

  it('hands off when Chrome autofill does not become available', async () => {
    const harness = makeHarness({
      sessions: [loginSession, loginSession, loginSession],
      evidences: [emptyLoginEvidence, emptyLoginEvidence, emptyLoginEvidence]
    })

    await expect(harness.coordinator.connect('coupangeats')).resolves.toEqual({
      state: 'challenge_required',
      detailCode: 'password_manager_unlock_or_account_selection_required'
    })
    expect(harness.scriptRunner.clickSelector).not.toHaveBeenCalled()
  })

  it('hands off without clicking when the login page cannot be inspected safely', async () => {
    const harness = makeHarness()
    harness.loginPageProbe.inspect.mockReset()
    harness.loginPageProbe.inspect.mockRejectedValue(new Error('cdp_page_unavailable'))

    await expect(harness.coordinator.connect('coupangeats')).resolves.toEqual({
      state: 'challenge_required',
      detailCode: 'password_manager_login_page_unavailable'
    })
    expect(harness.clickAttempts.claim).not.toHaveBeenCalled()
    expect(harness.scriptRunner.clickSelector).not.toHaveBeenCalled()
  })

  it('hands off without clicking when the document identity cannot be established', async () => {
    const harness = makeHarness()
    harness.scriptRunner.getDocumentIdentity.mockRejectedValue(new Error('loader_id_unavailable'))

    await expect(harness.coordinator.connect('coupangeats')).resolves.toEqual({
      state: 'challenge_required',
      detailCode: 'password_manager_document_identity_unavailable'
    })
    expect(harness.clickAttempts.claim).not.toHaveBeenCalled()
    expect(harness.scriptRunner.clickSelector).not.toHaveBeenCalled()
  })

  it('hands off after one click when authentication cannot be confirmed', async () => {
    const harness = makeHarness({
      sessions: [loginSession, loginSession, loginSession],
      evidences: [filledLoginEvidence, filledLoginEvidence, filledLoginEvidence]
    })

    await expect(harness.coordinator.connect('coupangeats')).resolves.toEqual({
      state: 'challenge_required',
      detailCode: 'password_manager_login_not_confirmed'
    })
    expect(harness.scriptRunner.clickSelector).toHaveBeenCalledTimes(1)
    expect(harness.clickAttempts.markState).toHaveBeenLastCalledWith(
      'attempt-1',
      'handed_off',
      '2026-07-26T10:00:00.000Z'
    )
  })

  it('requires a real Google Chrome fixed profile', async () => {
    const harness = makeHarness()
    harness.managedChromeLauncher.getStatus.mockReturnValue(makeStatus(false))

    await expect(harness.coordinator.connect('coupangeats')).resolves.toEqual({
      state: 'challenge_required',
      detailCode: 'google_chrome_profile_required'
    })
    expect(harness.managedChromeLauncher.launch).not.toHaveBeenCalled()
  })

  it('resolves the persisted latch after a manual login becomes ready', () => {
    const harness = makeHarness()

    harness.coordinator.markSessionReady('coupangeats')

    expect(harness.clickAttempts.markPlatformReady).toHaveBeenCalledWith(
      'default',
      'coupangeats',
      '2026-07-26T10:00:00.000Z'
    )
    expect(harness.scriptRunner.clickSelector).not.toHaveBeenCalled()
  })
})
