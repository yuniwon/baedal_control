import { createHash, randomUUID as nodeRandomUUID } from 'node:crypto'
import type {
  BrowserInspectorStatus,
  ManagedChromeSessionStatus,
  PlatformAuthPreferenceRecord,
  PlatformAuthProbe,
  PlatformCode
} from '../../shared/contracts'
import type {
  ManagedChromeLoginBlocker,
  ManagedChromeLoginPageEvidence,
  ManagedPasswordManagerLoginDescriptor
} from './managed-chrome-login-page-probe'

interface ManagedPasswordManagerLoginCoordinatorDependencies {
  descriptors: Partial<Record<PlatformCode, ManagedPasswordManagerLoginDescriptor>>
  preferences: {
    get(workspaceId: string, platformCode: PlatformCode): PlatformAuthPreferenceRecord
  }
  clickAttempts: {
    claim(input: {
      attemptId: string
      workspaceId: string
      platformCode: PlatformCode
      documentKeyHash: string
      attemptedAt: string
    }): boolean
    markState(
      attemptId: string,
      state: 'submitted' | 'succeeded' | 'handed_off',
      at: string
    ): void
    markPlatformReady(workspaceId: string, platformCode: PlatformCode, at: string): void
    getUnresolved(workspaceId: string, platformCode: PlatformCode): unknown | null
  }
  managedChromeLauncher: {
    getStatus(): BrowserInspectorStatus
    launch(url?: string): Promise<BrowserInspectorStatus> | BrowserInspectorStatus
  }
  managedChromeSessionProbe: {
    inspect(): Promise<ManagedChromeSessionStatus> | ManagedChromeSessionStatus
  }
  loginPageProbe: {
    inspect(
      tabId: string,
      descriptor: ManagedPasswordManagerLoginDescriptor
    ): Promise<ManagedChromeLoginPageEvidence>
  }
  scriptRunner: {
    getDocumentIdentity(tabId: string): Promise<{ tabId: string; loaderId: string }>
    clickSelector(tabId: string, selector: string): Promise<void>
  }
  workspaceId?: string
  now?: () => string
  randomUUID?: () => string
  sleep?: (ms: number) => Promise<void>
  autofillPollAttempts?: number
  autofillPollIntervalMs?: number
  verificationPollAttempts?: number
  verificationPollIntervalMs?: number
}

type AutofillCandidate =
  | { kind: 'ready' }
  | { kind: 'clickable'; tabId: string }
  | { kind: 'challenge'; probe: PlatformAuthProbe }
  | { kind: 'timeout' }

const blockerDetailCodes: Record<ManagedChromeLoginBlocker, string> = {
  login_error: 'managed_login_rejected',
  captcha: 'captcha_required',
  otp: 'otp_required',
  account_selection: 'account_selection_required'
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export class ManagedPasswordManagerLoginCoordinator {
  private readonly workspaceId: string
  private readonly now: () => string
  private readonly randomUUID: () => string
  private readonly sleep: (ms: number) => Promise<void>
  private readonly autofillPollAttempts: number
  private readonly autofillPollIntervalMs: number
  private readonly verificationPollAttempts: number
  private readonly verificationPollIntervalMs: number

  constructor(private readonly deps: ManagedPasswordManagerLoginCoordinatorDependencies) {
    this.workspaceId = deps.workspaceId ?? 'default'
    this.now = deps.now ?? (() => new Date().toISOString())
    this.randomUUID = deps.randomUUID ?? nodeRandomUUID
    this.sleep = deps.sleep ?? delay
    this.autofillPollAttempts = Math.max(1, deps.autofillPollAttempts ?? 20)
    this.autofillPollIntervalMs = Math.max(0, deps.autofillPollIntervalMs ?? 500)
    this.verificationPollAttempts = Math.max(1, deps.verificationPollAttempts ?? 30)
    this.verificationPollIntervalMs = Math.max(0, deps.verificationPollIntervalMs ?? 500)
  }

  async connect(platformCode: PlatformCode): Promise<PlatformAuthProbe> {
    const descriptor = this.deps.descriptors[platformCode]
    if (!descriptor) {
      return { state: 'unsupported', detailCode: 'password_manager_login_unsupported' }
    }

    let initialSession: ManagedChromeSessionStatus
    try {
      initialSession = await this.deps.managedChromeSessionProbe.inspect()
    } catch {
      return { state: 'challenge_required', detailCode: 'managed_chrome_session_unavailable' }
    }
    if (await this.isVerifiedManagementSession(initialSession, descriptor)) {
      this.markSessionReady(platformCode)
      return { state: 'ready', detailCode: 'managed_session_ready' }
    }

    if (!this.deps.managedChromeLauncher.getStatus().passwordManagerLoginReady) {
      return { state: 'challenge_required', detailCode: 'google_chrome_profile_required' }
    }

    const preference = this.deps.preferences.get(this.workspaceId, platformCode)
    if (!preference.autoClickLoginButtonConsented) {
      return {
        state: 'expired',
        detailCode: 'password_manager_auto_click_consent_required'
      }
    }

    if (this.deps.clickAttempts.getUnresolved(this.workspaceId, platformCode)) {
      return { state: 'challenge_required', detailCode: 'login_click_already_attempted' }
    }

    let launchStatus: BrowserInspectorStatus
    try {
      launchStatus = await this.deps.managedChromeLauncher.launch(descriptor.loginUrl)
    } catch {
      return { state: 'challenge_required', detailCode: 'google_chrome_profile_required' }
    }
    if (!launchStatus.passwordManagerLoginReady) {
      return { state: 'challenge_required', detailCode: 'google_chrome_profile_required' }
    }

    const candidate = await this.waitForAutofill(descriptor)
    if (candidate.kind === 'ready') {
      this.markSessionReady(platformCode)
      return { state: 'ready', detailCode: 'managed_session_ready' }
    }
    if (candidate.kind === 'challenge') {
      return candidate.probe
    }
    if (candidate.kind === 'timeout') {
      return {
        state: 'challenge_required',
        detailCode: 'password_manager_unlock_or_account_selection_required'
      }
    }

    let documentIdentity: { tabId: string; loaderId: string }
    try {
      documentIdentity = await this.deps.scriptRunner.getDocumentIdentity(candidate.tabId)
    } catch {
      return {
        state: 'challenge_required',
        detailCode: 'password_manager_document_identity_unavailable'
      }
    }
    const attemptId = this.randomUUID()
    const documentKeyHash = createHash('sha256')
      .update(`${documentIdentity.tabId}\u0000${documentIdentity.loaderId}`)
      .digest('hex')
    const attemptedAt = this.now()
    const claimed = this.deps.clickAttempts.claim({
      attemptId,
      workspaceId: this.workspaceId,
      platformCode,
      documentKeyHash,
      attemptedAt
    })
    if (!claimed) {
      return { state: 'challenge_required', detailCode: 'login_click_already_attempted' }
    }

    try {
      await this.deps.scriptRunner.clickSelector(candidate.tabId, descriptor.submitSelector)
      this.deps.clickAttempts.markState(attemptId, 'submitted', this.now())
    } catch {
      this.deps.clickAttempts.markState(attemptId, 'handed_off', this.now())
      return {
        state: 'challenge_required',
        detailCode: 'password_manager_login_not_confirmed'
      }
    }

    const verification = await this.verifyAfterClick(descriptor)
    if (verification.state === 'ready') {
      this.deps.clickAttempts.markState(attemptId, 'succeeded', this.now())
      return verification
    }

    this.deps.clickAttempts.markState(attemptId, 'handed_off', this.now())
    return verification
  }

  markSessionReady(platformCode: PlatformCode): void {
    this.deps.clickAttempts.markPlatformReady(
      this.workspaceId,
      platformCode,
      this.now()
    )
  }

  private async waitForAutofill(
    descriptor: ManagedPasswordManagerLoginDescriptor
  ): Promise<AutofillCandidate> {
    for (let attempt = 0; attempt < this.autofillPollAttempts; attempt += 1) {
      let session: ManagedChromeSessionStatus
      try {
        session = await this.deps.managedChromeSessionProbe.inspect()
      } catch {
        return {
          kind: 'challenge',
          probe: { state: 'challenge_required', detailCode: 'managed_chrome_session_unavailable' }
        }
      }
      if (await this.isVerifiedManagementSession(session, descriptor)) {
        return { kind: 'ready' }
      }

      const loginTab = this.findTab(session, descriptor, descriptor.loginPathPattern)
      if (loginTab) {
        let evidence: ManagedChromeLoginPageEvidence
        try {
          evidence = await this.deps.loginPageProbe.inspect(loginTab.tabId, descriptor)
        } catch {
          return {
            kind: 'challenge',
            probe: {
              state: 'challenge_required',
              detailCode: 'password_manager_login_page_unavailable'
            }
          }
        }
        if (evidence.blocker) {
          return {
            kind: 'challenge',
            probe: {
              state: 'challenge_required',
              detailCode: blockerDetailCodes[evidence.blocker]
            }
          }
        }
        if (
          evidence.loginFormVisible &&
          evidence.usernameFilled &&
          evidence.passwordFilled &&
          evidence.submitVisible &&
          evidence.submitEnabled
        ) {
          return { kind: 'clickable', tabId: loginTab.tabId }
        }
      }

      if (attempt < this.autofillPollAttempts - 1) {
        await this.sleep(this.autofillPollIntervalMs)
      }
    }

    return { kind: 'timeout' }
  }

  private async verifyAfterClick(
    descriptor: ManagedPasswordManagerLoginDescriptor
  ): Promise<PlatformAuthProbe> {
    for (let attempt = 0; attempt < this.verificationPollAttempts; attempt += 1) {
      let session: ManagedChromeSessionStatus
      try {
        session = await this.deps.managedChromeSessionProbe.inspect()
      } catch {
        return { state: 'challenge_required', detailCode: 'managed_chrome_session_unavailable' }
      }
      if (await this.isVerifiedManagementSession(session, descriptor)) {
        return { state: 'ready', detailCode: 'password_manager_login_verified' }
      }

      const loginTab = this.findTab(session, descriptor, descriptor.loginPathPattern)
      if (loginTab) {
        let evidence: ManagedChromeLoginPageEvidence
        try {
          evidence = await this.deps.loginPageProbe.inspect(loginTab.tabId, descriptor)
        } catch {
          return {
            state: 'challenge_required',
            detailCode: 'password_manager_login_page_unavailable'
          }
        }
        if (evidence.blocker) {
          return {
            state: 'challenge_required',
            detailCode: blockerDetailCodes[evidence.blocker]
          }
        }
      }

      if (attempt < this.verificationPollAttempts - 1) {
        await this.sleep(this.verificationPollIntervalMs)
      }
    }

    return {
      state: 'challenge_required',
      detailCode: 'password_manager_login_not_confirmed'
    }
  }

  private async isVerifiedManagementSession(
    session: ManagedChromeSessionStatus,
    descriptor: ManagedPasswordManagerLoginDescriptor
  ): Promise<boolean> {
    const managementTabs = session.tabs.filter(
      (tab) =>
        tab.platformCode === descriptor.platformCode &&
        this.matchesPath(tab.url, descriptor.managementPathPattern)
    )

    for (const tab of managementTabs) {
      try {
        const evidence = await this.deps.loginPageProbe.inspect(tab.tabId, descriptor)
        if (
          evidence.visiblePasswordInputCount === 0 &&
          (evidence.logoutMarkerDetected || evidence.managementMarkerDetected)
        ) {
          return true
        }
      } catch {
        continue
      }
    }
    return false
  }

  private findTab(
    session: ManagedChromeSessionStatus,
    descriptor: ManagedPasswordManagerLoginDescriptor,
    pathPattern: string
  ) {
    return session.tabs.find(
      (tab) =>
        tab.platformCode === descriptor.platformCode && this.matchesPath(tab.url, pathPattern)
    ) ?? null
  }

  private matchesPath(url: string, pathPattern: string): boolean {
    try {
      return new RegExp(pathPattern, 'i').test(new URL(url).pathname)
    } catch {
      return false
    }
  }
}
