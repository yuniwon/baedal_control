import type { Page } from 'playwright'
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
import { parseCoupangEatsMenus } from './parser'
import { coupangEatsSelectors } from './selectors'
import { launchPlaywrightChromium } from '../../services/playwright-runtime'

type ImportErrorWithInspection = Error & { inspection?: PlatformInspectionReport }
interface CoupangEatsAdapterOptions {
  captureManagedBrowserSnapshots?: () => Promise<BrowserInspectionSnapshot[]>
  applyManagedBrowserUpdate?: (item: SyncPreviewItem) => Promise<void>
}

export class CoupangEatsAdapter implements PlatformAdapter {
  readonly platformCode = 'coupangeats' as const

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly baseUrl = 'https://store.coupangeats.com/',
    private readonly options: CoupangEatsAdapterOptions = {}
  ) {}

  async fetchMenus() {
    const result = await this.fetchMenusWithInspection()
    return result.menus
  }

  async fetchMenusWithInspection(): Promise<PlatformMenuFetchResult> {
    const inspection = this.createInspectionReport()
    let browser: Awaited<ReturnType<CoupangEatsAdapter['launchBrowser']>> | null = null

    try {
      browser = await this.launchBrowser()
      const page = await this.createAuthenticatedSession(browser, inspection)
      const menus = await this.openManagementPageAndReadMenus(page, inspection)
      return { menus, inspection }
    } catch (error) {
      const recovered = await this.tryManagedBrowserFallback(error, inspection)
      if (recovered) {
        return recovered
      }

      throw this.attachInspection(error, inspection)
    } finally {
      await browser?.close()
    }
  }

  async applyMenuUpdate(_item: SyncPreviewItem) {
    if (_item.executionMode === 'managed_browser' && this.options.applyManagedBrowserUpdate) {
      await this.options.applyManagedBrowserUpdate(_item)
      return
    }

    throw new Error('coupangeats_menu_update_not_implemented')
  }

  private async launchBrowser() {
    return launchPlaywrightChromium()
  }

  private async createAuthenticatedSession(
    browser: Awaited<ReturnType<CoupangEatsAdapter['launchBrowser']>>,
    inspection?: PlatformInspectionReport
  ) {
    const page = await browser.newPage()

    await page.goto(new URL('/merchant/login', this.baseUrl).toString(), {
      waitUntil: 'domcontentloaded'
    })
    if (inspection) {
      await this.capturePageStep(inspection, page, {
        kind: 'navigation',
        title: '로그인 페이지',
        detail: '쿠팡이츠 로그인 화면을 열었습니다.'
      })
    }
    await page.waitForSelector(coupangEatsSelectors.username, { timeout: 30000 })

    return page
  }

  private async openManagementPageAndReadMenus(
    page: Page,
    inspection: PlatformInspectionReport
  ) {
    let loginBlocked = false

    const onResponse = (response: { url: () => string; status: () => number }) => {
      if (
        response.url().includes('/api/v1/merchant/login') &&
        response.status() === 403
      ) {
        loginBlocked = true
      }
    }

    page.on('response', onResponse)

    try {
      await page.fill(coupangEatsSelectors.username, this.credentials.username)
      await page.fill(coupangEatsSelectors.password, this.credentials.password)
      await page.click(coupangEatsSelectors.loginButton)
      await page.waitForTimeout(5000)

      if (loginBlocked) {
        throw new Error('coupangeats_login_access_denied')
      }

      const visibleText = await this.readVisibleText(page)
      if (
        visibleText?.includes("Cannot read properties of undefined (reading 'data')") &&
        (await this.isLoginFormVisible(page))
      ) {
        throw new Error('coupangeats_login_script_error')
      }

      await this.capturePageStep(inspection, page, {
        kind: 'navigation',
        title: '로그인 이후 화면',
        detail: '로그인 직후 쿠팡이츠 화면 상태를 확인했습니다.'
      })

      if (page.url().includes('/merchant/login') && (await this.isLoginFormVisible(page))) {
        throw new Error('coupangeats_login_script_error')
      }

      const bodyText = visibleText ?? ''
      if (bodyText.includes('Access Denied')) {
        throw new Error('coupangeats_login_access_denied')
      }

      if (!bodyText.trim()) {
        throw new Error('coupangeats_management_app_blank')
      }

      await page.waitForSelector(coupangEatsSelectors.menuRow, { timeout: 10000 })
      return parseCoupangEatsMenus(await page.content())
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('page.waitForSelector: Timeout')) {
        throw new Error('coupangeats_menu_page_not_loaded')
      }

      throw error
    } finally {
      page.off('response', onResponse)
    }
  }

  private async isLoginFormVisible(page: Page) {
    try {
      return await page.locator(coupangEatsSelectors.username).first().isVisible({ timeout: 1000 })
    } catch {
      return false
    }
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
      optionCatalogFetched: optionGroups.length > 0,
      rawMenuCount: menus.length,
      fetchMode: 'managed_browser',
      inspection
    }
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

  private async capturePageStep(
    inspection: PlatformInspectionReport,
    page: Page,
    step: Omit<
      PlatformInspectionStep,
      'recordedAt' | 'pageTitle' | 'url' | 'visibleTextSnippet' | 'screenshotDataUrl'
    >
  ) {
    const [pageTitle, visibleTextSnippet, screenshotDataUrl] = await Promise.all([
      page.title().catch(() => ''),
      this.readVisibleText(page),
      this.captureScreenshot(page)
    ])

    this.pushInspectionStep(inspection, {
      ...step,
      pageTitle: pageTitle || undefined,
      url: page.url(),
      visibleTextSnippet: visibleTextSnippet || undefined,
      screenshotDataUrl: screenshotDataUrl || undefined
    })
  }

  private async readVisibleText(page: Page) {
    try {
      const text = await page.locator('body').innerText()
      return text.replace(/\s+/g, ' ').trim().slice(0, 400)
    } catch {
      return undefined
    }
  }

  private async captureScreenshot(page: Page) {
    try {
      const image = await page.screenshot({ type: 'png' })
      return `data:image/png;base64,${image.toString('base64')}`
    } catch {
      return undefined
    }
  }
}
