import type {
  BrowserInspectionSnapshot,
  ManagedChromeSessionStatus,
  PlatformAuthProbe,
  PlatformCode
} from '../../shared/contracts'
import type { PlatformMetadata } from '../../shared/platforms'
import type { PlatformCapabilityManifest } from '../../shared/platform-capabilities'
import type {
  PlatformAuthDriver,
  PlatformCredential
} from '../platforms/base/plugin'
import type { ExtensionSessionBroker } from './extension-session-broker'
import type { ManagedChromeAuthEvidence } from './managed-chrome-auth-evidence-probe'

type ManagedChromeAutoLoginStatus =
  | 'submitted'
  | 'already_authenticated'
  | 'credential_missing'
  | 'login_tab_not_found'
  | 'unsupported'
  | 'failed'

interface BrowserPlatformAuthDriverDependencies {
  platformCode: PlatformCode
  metadata: PlatformMetadata
  capabilities: PlatformCapabilityManifest
  managedChromeSessionProbe: {
    inspect(): Promise<ManagedChromeSessionStatus> | ManagedChromeSessionStatus
  }
  managedChromeAuthEvidenceProbe: {
    inspect(tabId: string): Promise<ManagedChromeAuthEvidence>
  }
  browserInspectionSnapshots: {
    listLatest(limit?: number): BrowserInspectionSnapshot[]
  }
  extensionSessionBroker: Pick<ExtensionSessionBroker, 'probe'>
  managedChromeLoginAutomator: {
    getLaunchUrl(platformCode: PlatformCode): string | null
    autoLogin(
      platformCode: PlatformCode,
      credential?: PlatformCredential | null
    ): Promise<{
      platformCode: PlatformCode
      status: ManagedChromeAutoLoginStatus
      message: string
    }>
  }
  managedChromeLauncher: {
    launch(url?: string): Promise<unknown> | unknown
  }
  managedPasswordManagerLoginCoordinator?: {
    connect(platformCode: PlatformCode): Promise<PlatformAuthProbe>
    markSessionReady(platformCode: PlatformCode): void
  }
}

const isLoginUrl = (url: string) =>
  /\/(?:login|signin|sign-in|auth)(?:[/?#]|$)/i.test(url)

const matchesConfiguredLoginUrl = (currentUrl: string, configuredUrl: string) => {
  try {
    const current = new URL(currentUrl)
    const configured = new URL(configuredUrl)
    const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/'
    return (
      current.host.toLowerCase() === configured.host.toLowerCase() &&
      normalizePath(current.pathname) === normalizePath(configured.pathname)
    )
  } catch {
    return false
  }
}

const matchesAuthenticatedPath = (url: string, patterns: readonly string[]) => {
  try {
    const path = new URL(url).pathname
    return patterns.some((pattern) => new RegExp(pattern, 'i').test(path))
  } catch {
    return false
  }
}

const hasExplicitConfiguredLoginPath = (configuredUrl: string) => {
  try {
    return new URL(configuredUrl).pathname.replace(/\/+$/, '') !== ''
  } catch {
    return false
  }
}

export class BrowserPlatformAuthDriver implements PlatformAuthDriver {
  constructor(private readonly deps: BrowserPlatformAuthDriverDependencies) {}

  async probe(): Promise<PlatformAuthProbe> {
    let expiredEvidence: PlatformAuthProbe | null = null
    const requiresStrictManagementEvidence =
      this.deps.capabilities.authentication.strategies.includes(
        'managed_password_manager_login'
      )

    try {
      const snapshots = this.deps.browserInspectionSnapshots
        .listLatest(50)
        .filter((snapshot) => snapshot.platformCode === this.deps.platformCode)

      for (const snapshot of snapshots) {
        const result = this.deps.extensionSessionBroker.probe(
          this.deps.platformCode,
          snapshot
        )
        if (result.state === 'ready') {
          if (
            requiresStrictManagementEvidence &&
            !matchesAuthenticatedPath(
              snapshot.pageUrl,
              this.deps.capabilities.authentication.authenticatedPathPatterns
            )
          ) {
            continue
          }
          return result
        }
        if (result.state === 'expired' && !expiredEvidence) {
          expiredEvidence = result
        }
      }
    } catch {
      // Managed Chrome may still provide a usable session.
    }

    try {
      const session = await this.deps.managedChromeSessionProbe.inspect()
      const platformTabs = session.tabs.filter(
        (tab) => tab.platformCode === this.deps.platformCode
      )
      for (const tab of platformTabs) {
        const authenticatedRouteReady = matchesAuthenticatedPath(
          tab.url,
          this.deps.capabilities.authentication.authenticatedPathPatterns
        )
        const routeReady =
          tab.pageKind === 'menu_list' ||
          tab.pageKind === 'option_list' ||
          authenticatedRouteReady
        try {
          const evidence = await this.deps.managedChromeAuthEvidenceProbe.inspect(tab.tabId)
          if (evidence.credentialRejectionMarkerDetected) {
            return { state: 'credential_rejected', detailCode: 'managed_login_rejected' }
          }
          if (
            evidence.visiblePasswordInputCount > 0 ||
            evidence.loginMarkerDetected
          ) {
            expiredEvidence = { state: 'expired', detailCode: 'managed_login_page' }
            continue
          }
          if (requiresStrictManagementEvidence) {
            if (
              authenticatedRouteReady &&
              evidence.visiblePasswordInputCount === 0 &&
              (evidence.logoutMarkerDetected || evidence.managementMarkerDetected)
            ) {
              return { state: 'ready', detailCode: 'managed_session_ready' }
            }
            continue
          }
          if (
            evidence.logoutMarkerDetected ||
            evidence.managementMarkerDetected ||
            routeReady
          ) {
            return { state: 'ready', detailCode: 'managed_session_ready' }
          }
        } catch {
          if (!requiresStrictManagementEvidence && routeReady) {
            return { state: 'ready', detailCode: 'managed_session_ready' }
          }
        }
      }
      if (
        platformTabs.some(
          (tab) =>
            isLoginUrl(tab.url) ||
            (hasExplicitConfiguredLoginPath(this.deps.metadata.loginUrl) &&
              matchesConfiguredLoginUrl(tab.url, this.deps.metadata.loginUrl))
        )
      ) {
        expiredEvidence = { state: 'expired', detailCode: 'managed_login_page' }
      }
    } catch {
      // A missing debugging endpoint is an unknown session, not an auth failure.
    }

    return expiredEvidence ?? { state: 'unknown', detailCode: 'session_evidence_missing' }
  }

  async submitCredential(credential: PlatformCredential): Promise<PlatformAuthProbe> {
    const launchUrl =
      this.deps.managedChromeLoginAutomator.getLaunchUrl(this.deps.platformCode) ??
      this.deps.metadata.loginUrl
    await this.deps.managedChromeLauncher.launch(launchUrl)
    const result = await this.deps.managedChromeLoginAutomator.autoLogin(
      this.deps.platformCode,
      credential
    )

    switch (result.status) {
      case 'already_authenticated':
        return { state: 'ready', detailCode: 'managed_session_ready' }
      case 'submitted':
        return {
          state: 'challenge_required',
          detailCode: 'credential_submitted_check_required'
        }
      case 'credential_missing':
        return { state: 'credential_required', detailCode: 'credential_not_found' }
      case 'login_tab_not_found':
        return { state: 'challenge_required', detailCode: 'login_tab_not_found' }
      case 'unsupported':
        return { state: 'unsupported', detailCode: 'credential_login_unsupported' }
      default:
        return { state: 'error', detailCode: 'credential_login_failed' }
    }
  }

  async authenticateWithPasswordManager(): Promise<PlatformAuthProbe> {
    if (!this.deps.managedPasswordManagerLoginCoordinator) {
      return { state: 'unsupported', detailCode: 'password_manager_login_unsupported' }
    }
    return this.deps.managedPasswordManagerLoginCoordinator.connect(this.deps.platformCode)
  }

  async openUserChallenge(): Promise<void> {
    await this.deps.managedChromeLauncher.launch(this.deps.metadata.loginUrl)
  }
}
