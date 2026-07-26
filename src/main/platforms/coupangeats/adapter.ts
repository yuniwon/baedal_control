import type {
  BrowserInspectionSnapshot,
  PlatformInspectionReport,
  PlatformInspectionStep,
  SyncPreviewItem
} from '../../../shared/contracts'
import type { PlatformAdapter, PlatformMenuFetchResult } from '../base/types'
import {
  parseCoupangEatsMenusFromBrowserSnapshot,
  parseCoupangEatsOptionGroupsFromBrowserSnapshot
} from './browser-session-parser'
import { buildBrowserCatalogCompleteness } from '../browser-catalog/completeness'

type ImportErrorWithInspection = Error & { inspection?: PlatformInspectionReport }
interface CoupangEatsAdapterOptions {
  captureManagedBrowserSnapshots?: () => Promise<BrowserInspectionSnapshot[]>
  applyManagedBrowserUpdate?: (item: SyncPreviewItem) => Promise<void>
}

export class CoupangEatsAdapter implements PlatformAdapter {
  readonly platformCode = 'coupangeats' as const

  constructor(
    _credentials: { username: string; password: string },
    _baseUrl = 'https://store.coupangeats.com/',
    private readonly options: CoupangEatsAdapterOptions = {}
  ) {}

  async fetchMenus() {
    const result = await this.fetchMenusWithInspection()
    return result.menus
  }

  async fetchMenusWithInspection(): Promise<PlatformMenuFetchResult> {
    const inspection = this.createInspectionReport()
    const recovered = await this.tryManagedBrowserFallback(
      new Error('coupangeats_login_access_denied'),
      inspection
    )
    if (recovered) {
      return recovered
    }

    throw this.attachInspection(
      new Error('coupangeats_managed_session_unavailable'),
      inspection
    )
  }

  async applyMenuUpdate(_item: SyncPreviewItem) {
    if (_item.executionMode === 'managed_browser' && this.options.applyManagedBrowserUpdate) {
      await this.options.applyManagedBrowserUpdate(_item)
      return
    }

    throw new Error('coupangeats_menu_update_not_implemented')
  }

  private attachInspection(error: unknown, inspection: PlatformInspectionReport) {
    if (error instanceof Error) {
      const nextError = error as ImportErrorWithInspection
      nextError.inspection = inspection
      return nextError
    }

    const fallback = new Error('unknown_error') as ImportErrorWithInspection
    fallback.inspection = inspection
    return fallback
  }

  private async tryManagedBrowserFallback(
    error: unknown,
    inspection: PlatformInspectionReport
  ): Promise<PlatformMenuFetchResult | null> {
    if (!this.options.captureManagedBrowserSnapshots) {
      return null
    }

    if (!this.shouldUseManagedBrowserFallback(error)) {
      return null
    }

    const snapshots = await this.options.captureManagedBrowserSnapshots().catch(() => [])
    const menus = parseCoupangEatsMenusFromBrowserSnapshot(snapshots)

    if (menus.length === 0) {
      return null
    }

    const optionGroups = parseCoupangEatsOptionGroupsFromBrowserSnapshot(snapshots)
    const menuCollectionProven = this.hasSuccessfulCatalogEvent(
      snapshots,
      (url) => url.includes('/all-menu-dishes')
    )
    const optionCollectionProven = this.hasSuccessfulCatalogEvent(
      snapshots,
      (url) => url.includes('/all-options') && url.includes('fetchDish=true')
    )
    const completeness = buildBrowserCatalogCompleteness({
      menus,
      optionGroups,
      menuCollectionProven,
      optionCollectionProven,
      parseIssues: []
    })

    this.pushInspectionStep(inspection, {
      kind: 'result',
      title: '브라우저 세션 복구',
      detail:
        optionGroups.length > 0
          ? `로그인 차단으로 현재 전용 크롬 세션에서 메뉴 ${menus.length}개와 옵션 ${optionGroups.length}개를 읽었습니다.`
          : `로그인 차단으로 현재 전용 크롬 세션에서 메뉴 ${menus.length}개를 읽었습니다.`
    })

    return {
      menus,
      optionGroups,
      optionCatalogFetched: optionCollectionProven,
      rawMenuCount: menus.length,
      fetchMode: 'managed_browser',
      completeness,
      inspection
    }
  }

  private hasSuccessfulCatalogEvent(
    snapshots: BrowserInspectionSnapshot[],
    matchesUrl: (url: string) => boolean
  ) {
    return snapshots.some((snapshot) =>
      snapshot.apiEvents.some((event) => {
        if (event.status !== 200 || !matchesUrl(event.url) || !event.responsePreview?.trim()) {
          return false
        }
        try {
          JSON.parse(event.responsePreview)
          return true
        } catch {
          return false
        }
      })
    )
  }

  private shouldUseManagedBrowserFallback(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return [
      'coupangeats_login_access_denied',
      'coupangeats_login_script_error',
      'coupangeats_menu_page_not_loaded'
    ].includes(message)
  }

  private createInspectionReport(): PlatformInspectionReport {
    return {
      platformCode: this.platformCode,
      steps: []
    }
  }

  private pushInspectionStep(
    inspection: PlatformInspectionReport,
    step: Omit<PlatformInspectionStep, 'recordedAt'>
  ) {
    inspection.steps.push({
      ...step,
      recordedAt: new Date().toISOString()
    })
  }

}
