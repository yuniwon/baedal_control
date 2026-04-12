import type { SyncPreviewItem } from '../../../shared/contracts'
import type { PlatformAdapter } from '../base/types'
import { parseDdangyoMenus } from './parser'
import { ddangyoSelectors } from './selectors'

export class DdangyoAdapter implements PlatformAdapter {
  readonly platformCode = 'ddangyo' as const

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly baseUrl = 'https://boss.ddangyo.com/'
  ) {}

  async fetchMenus() {
    const { browser, page } = await this.createAuthenticatedSession()

    try {
      await page.waitForSelector(ddangyoSelectors.menuRow)
      return parseDdangyoMenus(await page.content())
    } finally {
      await browser.close()
    }
  }

  async applyMenuUpdate(item: SyncPreviewItem) {
    const { browser, page } = await this.createAuthenticatedSession()

    try {
      await page.waitForSelector(ddangyoSelectors.menuRow)
      await page.locator(`${ddangyoSelectors.menuRow}[data-menu-id="${item.platformMenuId}"] ${ddangyoSelectors.nameInput}`).fill(item.nextName)
      await page.locator(`${ddangyoSelectors.menuRow}[data-menu-id="${item.platformMenuId}"] ${ddangyoSelectors.priceInput}`).fill(String(item.nextPrice))
      await page.click(ddangyoSelectors.saveButton)
    } finally {
      await browser.close()
    }
  }

  private async launchBrowser() {
    const { chromium } = await import('playwright')
    return chromium.launch({ headless: false })
  }

  private async createAuthenticatedSession() {
    const browser = await this.launchBrowser()
    const page = await browser.newPage()

    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
    await page.fill(ddangyoSelectors.username, this.credentials.username)
    await page.fill(ddangyoSelectors.password, this.credentials.password)
    await page.click(ddangyoSelectors.loginButton)
    await page.waitForLoadState('networkidle')

    return { browser, page }
  }
}
