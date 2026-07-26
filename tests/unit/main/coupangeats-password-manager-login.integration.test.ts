import { describe, expect, it, vi } from 'vitest'

import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import { PlatformAuthPreferenceRepository } from '../../../src/main/repositories/platform-auth-preference-repository'
import { PlatformLoginClickAttemptRepository } from '../../../src/main/repositories/platform-login-click-attempt-repository'
import { PlatformSessionStateRepository } from '../../../src/main/repositories/platform-session-state-repository'
import { PlatformPluginRegistry } from '../../../src/main/platforms/base/plugin-registry'
import { coupangEatsPasswordManagerLoginDescriptor } from '../../../src/main/platforms/coupangeats/password-manager-login-descriptor'
import { AuthAttemptGuard } from '../../../src/main/services/auth-attempt-guard'
import { ManagedPasswordManagerLoginCoordinator } from '../../../src/main/services/managed-password-manager-login-coordinator'
import { PlatformSessionOrchestrator } from '../../../src/main/services/platform-session-orchestrator'
import { PLATFORM_CAPABILITIES } from '../../../src/shared/platform-capabilities'
import { PLATFORM_METADATA } from '../../../src/shared/platforms'
import type {
  ManagedChromeSessionStatus,
  PlatformAuthProbe,
  PlatformSessionStateRecord
} from '../../../src/shared/contracts'
import type { ManagedChromeLoginPageEvidence } from '../../../src/main/services/managed-chrome-login-page-probe'

const loginSession: ManagedChromeSessionStatus = {
  endpointUrl: 'http://127.0.0.1:39482',
  connected: true,
  error: null,
  tabs: [{
    tabId: 'login-tab',
    title: '쿠팡이츠 로그인',
    url: 'https://store.coupangeats.com/merchant/login',
    type: 'page',
    host: 'store.coupangeats.com',
    platformCode: 'coupangeats',
    pageKind: 'unknown'
  }]
}

const managementSession: ManagedChromeSessionStatus = {
  ...loginSession,
  tabs: [{
    ...loginSession.tabs[0],
    tabId: 'management-tab',
    title: '쿠팡이츠 메뉴 관리',
    url: 'https://store.coupangeats.com/merchant/management/menu/109935',
    pageKind: 'menu_list'
  }]
}

const emptyEvidence: ManagedChromeLoginPageEvidence = {
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

const filledEvidence: ManagedChromeLoginPageEvidence = {
  ...emptyEvidence,
  usernameFilled: true,
  passwordFilled: true
}

const managementEvidence: ManagedChromeLoginPageEvidence = {
  ...emptyEvidence,
  loginFormVisible: false,
  submitVisible: false,
  submitEnabled: false,
  managementMarkerDetected: true,
  logoutMarkerDetected: true,
  visiblePasswordInputCount: 0
}

const chromeStatus = {
  receiverUrl: '',
  extensionPath: '',
  isRunning: false,
  chromeAvailable: true,
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  chromeProfilePath: 'C:\\AppData\\delivery-menu-sync\\managed-chrome',
  passwordManagerLoginReady: true,
  managedChromeRunning: true,
  lastLaunchUrl: null,
  chromeError: null
}

describe('Coupang Eats password-manager login integration', () => {
  it('continues the original import after one consented trusted click and strict verification', async () => {
    const db = createInMemoryConnection()
    migrate(db)
    const sequence: string[] = []
    const cdpCommands: string[] = []
    const preferences = new PlatformAuthPreferenceRepository(db)
    const attempts = new PlatformLoginClickAttemptRepository(db)
    const stateRepository = new PlatformSessionStateRepository(db)
    preferences.setAutoClickConsent('default', 'coupangeats', true, '2026-07-26T10:00:00.000Z')

    const sessions = [loginSession, loginSession, loginSession, managementSession]
    const evidences = [emptyEvidence, filledEvidence, managementEvidence]
    const coordinator = new ManagedPasswordManagerLoginCoordinator({
      descriptors: { coupangeats: coupangEatsPasswordManagerLoginDescriptor },
      preferences,
      clickAttempts: {
        claim: (input) => {
          sequence.push('claim attempt')
          return attempts.claim(input)
        },
        markState: (...args) => attempts.markState(...args),
        markPlatformReady: (...args) => attempts.markPlatformReady(...args),
        getUnresolved: (...args) => attempts.getUnresolved(...args)
      },
      managedChromeLauncher: {
        getStatus: () => chromeStatus,
        launch: () => {
          sequence.push('launch fixed profile')
          return chromeStatus
        }
      },
      managedChromeSessionProbe: {
        inspect: vi.fn().mockImplementation(async () => sessions.shift() ?? managementSession)
      },
      loginPageProbe: {
        inspect: vi.fn().mockImplementation(async () => {
          const evidence = evidences.shift() ?? managementEvidence
          if (evidence.managementMarkerDetected) sequence.push('observe management URL and marker')
          else if (evidence.usernameFilled && evidence.passwordFilled) sequence.push('observe true/true autofill')
          else sequence.push('observe false/false autofill')
          return evidence
        })
      },
      scriptRunner: {
        getDocumentIdentity: async () => ({ tabId: 'login-tab', loaderId: 'loader-7' }),
        clickSelector: async () => {
          sequence.push('dispatch one trusted click')
          cdpCommands.push('mousePressed', 'mouseReleased')
        }
      },
      now: () => '2026-07-26T10:00:00.000Z',
      randomUUID: () => 'attempt-1',
      sleep: async () => undefined,
      autofillPollAttempts: 2,
      autofillPollIntervalMs: 0,
      verificationPollAttempts: 1,
      verificationPollIntervalMs: 0
    })

    const plugins = new PlatformPluginRegistry()
    plugins.register({
      metadata: { code: 'coupangeats', ...PLATFORM_METADATA.coupangeats },
      capabilities: PLATFORM_CAPABILITIES.coupangeats,
      auth: {
        probe: async (): Promise<PlatformAuthProbe> => {
          sequence.push('probe expired')
          return { state: 'expired', detailCode: 'managed_login_page' }
        },
        authenticateWithPasswordManager: () => coordinator.connect('coupangeats'),
        openUserChallenge: async () => undefined
      }
    })
    const states = {
      get: (workspaceId: string, platformCode: 'coupangeats') =>
        stateRepository.get(workspaceId, platformCode),
      list: (workspaceId: string) => stateRepository.list(workspaceId),
      save: (record: PlatformSessionStateRecord) => stateRepository.save(record)
    }
    const credentialVault = {
      get: vi.fn(() => { throw new Error('Coupang credential must not be read') }),
      getRevision: vi.fn(() => { throw new Error('Coupang credential revision must not be read') })
    }
    const orchestrator = new PlatformSessionOrchestrator({
      plugins,
      states,
      credentialVault,
      attemptGuard: new AuthAttemptGuard(stateRepository),
      passwordManagerLoginCoordinator: coordinator
    })
    const importer = vi.fn(async () => {
      sequence.push('invoke importer once')
      return { summary: { platformCode: 'coupangeats', fetchedCount: 38 } }
    })

    const session = await orchestrator.connect('coupangeats')
    if (session.state === 'ready') {
      sequence.push('persist ready')
      await importer()
    }

    expect(sequence).toEqual([
      'probe expired',
      'launch fixed profile',
      'observe false/false autofill',
      'observe true/true autofill',
      'claim attempt',
      'dispatch one trusted click',
      'observe management URL and marker',
      'persist ready',
      'invoke importer once'
    ])
    expect(cdpCommands.filter((command) => command === 'mousePressed')).toHaveLength(1)
    expect(cdpCommands.filter((command) => command === 'mouseReleased')).toHaveLength(1)
    expect(importer).toHaveBeenCalledTimes(1)
    expect(credentialVault.get).not.toHaveBeenCalled()
    expect(credentialVault.getRevision).not.toHaveBeenCalled()
    expect(stateRepository.get('default', 'coupangeats')).toMatchObject({ state: 'ready' })
    expect(attempts.getUnresolved('default', 'coupangeats')).toBeNull()

    const persisted = db.prepare(`
      select attempt_id, platform_code, document_key_hash, state, attempted_at, resolved_at
      from platform_login_click_attempts
    `).all()
    expect(JSON.stringify({ session, persisted, cdpCommands })).not.toMatch(
      /sentinel-owner|sentinel-password|username|password/i
    )
  })

  it.each([
    ['login_error', 'managed_login_rejected', filledEvidence, 0],
    ['captcha', 'captcha_required', filledEvidence, 0],
    ['otp', 'otp_required', filledEvidence, 0],
    ['account_selection', 'account_selection_required', filledEvidence, 0],
    [null, 'password_manager_unlock_or_account_selection_required', emptyEvidence, 0],
    [null, 'password_manager_login_not_confirmed', filledEvidence, 1]
  ] as const)(
    'hands off %s/%s and never retries the login click',
    async (blocker, expectedDetailCode, baseEvidence, expectedClickCount) => {
      const db = createInMemoryConnection()
      migrate(db)
      const preferences = new PlatformAuthPreferenceRepository(db)
      const attempts = new PlatformLoginClickAttemptRepository(db)
      const states = new PlatformSessionStateRepository(db)
      preferences.setAutoClickConsent('default', 'coupangeats', true, '2026-07-26T10:00:00.000Z')
      const clickSelector = vi.fn().mockResolvedValue(undefined)
      const coordinator = new ManagedPasswordManagerLoginCoordinator({
        descriptors: { coupangeats: coupangEatsPasswordManagerLoginDescriptor },
        preferences,
        clickAttempts: attempts,
        managedChromeLauncher: { getStatus: () => chromeStatus, launch: () => chromeStatus },
        managedChromeSessionProbe: { inspect: async () => loginSession },
        loginPageProbe: {
          inspect: async () => ({ ...baseEvidence, blocker })
        },
        scriptRunner: {
          getDocumentIdentity: async () => ({ tabId: 'login-tab', loaderId: 'loader-7' }),
          clickSelector
        },
        now: () => '2026-07-26T10:00:00.000Z',
        randomUUID: () => 'attempt-1',
        sleep: async () => undefined,
        autofillPollAttempts: 1,
        verificationPollAttempts: 1
      })
      const plugins = new PlatformPluginRegistry()
      const probe = vi.fn(async (): Promise<PlatformAuthProbe> => ({
        state: 'expired',
        detailCode: 'managed_login_page'
      }))
      const authenticate = vi.fn(() => coordinator.connect('coupangeats'))
      plugins.register({
        metadata: { code: 'coupangeats', ...PLATFORM_METADATA.coupangeats },
        capabilities: PLATFORM_CAPABILITIES.coupangeats,
        auth: { probe, authenticateWithPasswordManager: authenticate, openUserChallenge: async () => undefined }
      })
      const credentialVault = {
        get: vi.fn(() => { throw new Error('credential read forbidden') }),
        getRevision: vi.fn(() => { throw new Error('credential revision read forbidden') })
      }
      const orchestrator = new PlatformSessionOrchestrator({
        plugins,
        states,
        credentialVault,
        attemptGuard: new AuthAttemptGuard(states),
        passwordManagerLoginCoordinator: coordinator
      })
      const importer = vi.fn()

      const first = await orchestrator.connect('coupangeats')
      if (first.state === 'ready') await importer()
      const clickCountAfterFirst = clickSelector.mock.calls.length
      await orchestrator.connect('coupangeats')
      await orchestrator.resumeAfterUserAction('coupangeats')

      expect(first).toMatchObject({ state: 'challenge_required', detailCode: expectedDetailCode })
      expect(clickCountAfterFirst).toBe(expectedClickCount)
      expect(clickSelector).toHaveBeenCalledTimes(expectedClickCount)
      expect(authenticate).toHaveBeenCalledTimes(1)
      expect(importer).not.toHaveBeenCalled()
      expect(credentialVault.get).not.toHaveBeenCalled()
      expect(credentialVault.getRevision).not.toHaveBeenCalled()
    }
  )
})
