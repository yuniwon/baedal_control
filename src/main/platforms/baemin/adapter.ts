import type { SyncPreviewItem } from '../../../shared/contracts'
import type { PlatformAdapter } from '../base/types'
import { parseBaeminMenus } from './parser'
import { baeminSelectors } from './selectors'
import { launchPlaywrightChromium } from '../../services/playwright-runtime'

export class BaeminAdapter implements PlatformAdapter {
  readonly platformCode = 'baemin' as const

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly baseUrl = 'https://ceo.baemin.com/'
  ) {}

  async fetchMenus() {
    const { browser, page } = await this.createAuthenticatedSession()

    try {
      await page.waitForSelector(baeminSelectors.menuRow)
      return parseBaeminMenus(await page.content())
    } finally {
      await browser.close()
    }
  }

  async applyMenuUpdate(item: SyncPreviewItem) {
    const { browser, page } = await this.createAuthenticatedSession()

    try {
      await page.waitForSelector(baeminSelectors.menuRow)
      await page.locator(`${baeminSelectors.menuRow}[data-menu-id="${item.platformMenuId}"] ${baeminSelectors.nameInput}`).fill(item.nextName)
      await page.locator(`${baeminSelectors.menuRow}[data-menu-id="${item.platformMenuId}"] ${baeminSelectors.priceInput}`).fill(String(item.nextPrice))
      await page.click(baeminSelectors.saveButton)
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
    await page.fill(baeminSelectors.username, this.credentials.username)
    await page.fill(baeminSelectors.password, this.credentials.password)
    await page.click(baeminSelectors.loginButton)
    await page.waitForLoadState('networkidle')

    return { browser, page }
  }
}
