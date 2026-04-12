import type { SyncPreviewItem } from '../../../shared/contracts'
import type { PlatformAdapter } from '../base/types'
import { parseCoupangEatsMenus } from './parser'
import { coupangEatsSelectors } from './selectors'
import { launchPlaywrightChromium } from '../../services/playwright-runtime'

export class CoupangEatsAdapter implements PlatformAdapter {
  readonly platformCode = 'coupangeats' as const

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly baseUrl = 'https://store.coupangeats.com/'
  ) {}

  async fetchMenus() {
    const { browser, page } = await this.createAuthenticatedSession()

    try {
      await page.waitForSelector(coupangEatsSelectors.menuRow)
      return parseCoupangEatsMenus(await page.content())
    } finally {
      await browser.close()
    }
  }

  async applyMenuUpdate(item: SyncPreviewItem) {
    const { browser, page } = await this.createAuthenticatedSession()

    try {
      await page.waitForSelector(coupangEatsSelectors.menuRow)
      await page.locator(`${coupangEatsSelectors.menuRow}[data-menu-id="${item.platformMenuId}"] ${coupangEatsSelectors.nameInput}`).fill(item.nextName)
      await page.locator(`${coupangEatsSelectors.menuRow}[data-menu-id="${item.platformMenuId}"] ${coupangEatsSelectors.priceInput}`).fill(String(item.nextPrice))
      await page.click(coupangEatsSelectors.saveButton)
    } finally {
      await browser.close()
    }
  }

  private async launchBrowser() {
    return launchPlaywrightChromium()
  }

  private async createAuthenticatedSession() {
    const browser = await this.launchBrowser()
    const page = await browser.newPage()

    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
    await page.fill(coupangEatsSelectors.username, this.credentials.username)
    await page.fill(coupangEatsSelectors.password, this.credentials.password)
    await page.click(coupangEatsSelectors.loginButton)
    await page.waitForLoadState('networkidle')

    return { browser, page }
  }
}
