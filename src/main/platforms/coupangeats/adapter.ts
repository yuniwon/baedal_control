import { chromium } from 'playwright'
import type { SyncPreviewItem } from '../../../shared/contracts'
import type { PlatformAdapter } from '../base/types'
import { parseCoupangEatsMenus } from './parser'
import { coupangEatsSelectors } from './selectors'

export class CoupangEatsAdapter implements PlatformAdapter {
  readonly platformCode = 'coupangeats' as const

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly baseUrl = 'https://store.coupangeats.com/'
  ) {}

  async fetchMenus() {
    const browser = await chromium.launch({ headless: false })
    const page = await browser.newPage()

    try {
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle')
      return parseCoupangEatsMenus(await page.content())
    } finally {
      await browser.close()
    }
  }

  async applyMenuUpdate(item: SyncPreviewItem) {
    const browser = await chromium.launch({ headless: false })
    const page = await browser.newPage()

    try {
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
      await page.fill(coupangEatsSelectors.username, this.credentials.username)
      await page.fill(coupangEatsSelectors.password, this.credentials.password)
      await page.click(coupangEatsSelectors.loginButton)
      await page.locator(`${coupangEatsSelectors.menuRow}[data-menu-id="${item.platformMenuId}"] ${coupangEatsSelectors.nameInput}`).fill(item.nextName)
      await page.locator(`${coupangEatsSelectors.menuRow}[data-menu-id="${item.platformMenuId}"] ${coupangEatsSelectors.priceInput}`).fill(String(item.nextPrice))
      await page.click(coupangEatsSelectors.saveButton)
    } finally {
      await browser.close()
    }
  }
}
