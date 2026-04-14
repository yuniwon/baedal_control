import type {
  BrowserInspectionSnapshot,
  ManagedChromeSessionStatus,
  ManagedChromeTabInfo,
  PlatformCode,
  SyncPreviewItem,
  SyncRunFailureContext
} from '../../shared/contracts'

interface SyncFailureContextHandler {
  capture: (item: SyncPreviewItem, error: unknown) => Promise<SyncRunFailureContext | null>
}

interface ManagedBrowserFailureContextHandlerOptions {
  platformCode: PlatformCode
  managedChromeSessionProbe: {
    inspect: () => Promise<ManagedChromeSessionStatus> | ManagedChromeSessionStatus
  }
  managedChromeSnapshotCapturer: {
    captureTab: (tabId: string) => Promise<BrowserInspectionSnapshot> | BrowserInspectionSnapshot
  }
  browserInspectionSnapshotRepository?: {
    save: (snapshot: BrowserInspectionSnapshot) => void
  }
  tabMatcher?: (tab: ManagedChromeTabInfo, item: SyncPreviewItem) => boolean
  now?: () => Date
}

const defaultTabMatcher = (platformCode: PlatformCode) => (tab: ManagedChromeTabInfo) =>
  tab.platformCode === platformCode && tab.pageKind === 'menu_list'

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown_error'

export class SyncFailureContextCollector {
  constructor(private readonly handlers: SyncFailureContextHandler[] = []) {}

  async capture(item: SyncPreviewItem, error: unknown) {
    for (const handler of this.handlers) {
      const context = await handler.capture(item, error)
      if (context) {
        return context
      }
    }

    return null
  }
}

export class ManagedBrowserFailureContextHandler implements SyncFailureContextHandler {
  private readonly tabMatcher: (tab: ManagedChromeTabInfo, item: SyncPreviewItem) => boolean
  private readonly now: () => Date

  constructor(private readonly options: ManagedBrowserFailureContextHandlerOptions) {
    this.tabMatcher = options.tabMatcher ?? defaultTabMatcher(options.platformCode)
    this.now = options.now ?? (() => new Date())
  }

  async capture(item: SyncPreviewItem, error: unknown): Promise<SyncRunFailureContext | null> {
    if (item.platformCode !== this.options.platformCode || item.executionMode !== 'managed_browser') {
      return null
    }

    const rawError = toErrorMessage(error)
    if (!rawError.includes('managed')) {
      return null
    }

    try {
      const session = await this.options.managedChromeSessionProbe.inspect()
      const tab = session.tabs.find((candidate) => this.tabMatcher(candidate, item))

      if (!tab) {
        return {
          kind: 'managed_browser_snapshot',
          status: 'tab_not_found',
          capturedAt: this.now().toISOString(),
          pageKind: 'menu_list',
          detail: 'managed_chrome_menu_tab_not_found'
        }
      }

      try {
        const snapshot = await this.options.managedChromeSnapshotCapturer.captureTab(tab.tabId)
        this.options.browserInspectionSnapshotRepository?.save(snapshot)

        return {
          kind: 'managed_browser_snapshot',
          status: 'captured',
          capturedAt: snapshot.capturedAt,
          snapshotId: snapshot.snapshotId,
          pageTitle: snapshot.pageTitle,
          pageUrl: snapshot.pageUrl,
          pageKind: snapshot.pageKind ?? 'unknown',
          menuCount: snapshot.menuItems.length || snapshot.menuNames.length,
          optionGroupCount: snapshot.optionGroupNames.length,
          detail: null
        }
      } catch (captureError) {
        return {
          kind: 'managed_browser_snapshot',
          status: 'capture_failed',
          capturedAt: this.now().toISOString(),
          pageTitle: tab.title,
          pageUrl: tab.url,
          pageKind: tab.pageKind,
          detail: toErrorMessage(captureError)
        }
      }
    } catch (probeError) {
      return {
        kind: 'managed_browser_snapshot',
        status: 'capture_failed',
        capturedAt: this.now().toISOString(),
        detail: toErrorMessage(probeError)
      }
    }
  }
}
