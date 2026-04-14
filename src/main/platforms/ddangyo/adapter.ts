import type { Page } from 'playwright'
import type {
  PlatformInspectionReport,
  PlatformInspectionStep,
  SyncPreviewItem
} from '../../../shared/contracts'
import type {
  PlatformAdapter,
  PlatformMenuFetchResult,
  PlatformMenuSnapshot
} from '../base/types'
import { requiresMultiPriceMenuReview } from '../base/menu-update-policy'
import { parseDdangyoMenus } from './parser'
import { ddangyoSelectors } from './selectors'
import { launchPlaywrightChromium } from '../../services/playwright-runtime'

export class DdangyoAdapter implements PlatformAdapter {
  readonly platformCode = 'ddangyo' as const
  private readonly updateSuccessMessage = '적용 완료되었습니다.'
  private readonly menuInfoFramePrefix = 'mf_wfm_contents_wfm_tabcontents_SMWME01T120P40_wframe'

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly baseUrl = 'https://boss.ddangyo.com/'
  ) {}

  async fetchMenus() {
    const result = await this.fetchMenusWithInspection()
    return result.menus
  }

  async fetchMenusWithInspection(): Promise<PlatformMenuFetchResult> {
    const inspection = this.createInspectionReport()
    const { browser, page } = await this.createAuthenticatedSession(inspection)

    try {
      await this.capturePageStep(inspection, page, {
        kind: 'navigation',
        title: '로그인 완료',
        detail: '땡겨요 사장님라운지에 로그인했습니다.'
      })

      const menus = await this.collectMenusFromAllGroups(page, inspection)
      return { menus, inspection }
    } finally {
      await browser.close()
    }
  }

  async applyMenuUpdate(item: SyncPreviewItem) {
    const nameChanged = item.previousName !== item.nextName
    const priceChanged =
      typeof item.previousPrice === 'number' ? item.previousPrice !== item.nextPrice : true

    if (!nameChanged && !priceChanged) {
      return
    }

    if (
      requiresMultiPriceMenuReview({
        platformCode: this.platformCode,
        platformMenuPriceCount: item.platformMenuPriceCount ?? null,
        nameChanged,
        priceChanged
      })
    ) {
      throw new Error('ddangyo_multi_price_menu_requires_review')
    }

    const { browser, page } = await this.createAuthenticatedSession()

    try {
      await this.openMenuManagement(page)
      await this.openMenuInfoEditor(page, item.platformMenuId)
      await this.applyMenuInfoChanges(page, item, { priceChanged })
    } finally {
      await browser.close()
    }
  }

  private async launchBrowser() {
    return launchPlaywrightChromium()
  }

  private async createAuthenticatedSession(inspection?: PlatformInspectionReport) {
    const browser = await this.launchBrowser()
    const page = await browser.newPage()

    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
    if (inspection) {
      await this.capturePageStep(inspection, page, {
        kind: 'navigation',
        title: '로그인 페이지',
        detail: '땡겨요 로그인 화면을 열었습니다.'
      })
    }
    await this.performLogin(page)

    return { browser, page }
  }

  private async performLogin(page: Page) {
    await page.waitForSelector(ddangyoSelectors.username, { timeout: 30000 })
    await page.fill(ddangyoSelectors.username, this.credentials.username)
    await page.fill(ddangyoSelectors.password, this.credentials.password)
    await page.click(ddangyoSelectors.loginButton)

    await page.waitForFunction(
      (usernameSelector) => !document.querySelector(usernameSelector),
      ddangyoSelectors.username,
      { timeout: 30000 }
    )
    await page.waitForLoadState('networkidle').catch(() => undefined)
    await page.waitForTimeout(1000)
  }

  private async collectMenusFromAllGroups(
    page: Page,
    inspection: PlatformInspectionReport
  ) {
    await this.openMenuManagement(page)
    await this.capturePageStep(inspection, page, {
      kind: 'navigation',
      title: '메뉴 그룹 목록',
      detail: '메뉴 그룹 목록 화면으로 이동했습니다.'
    })

    const groupCount = await page.locator(ddangyoSelectors.groupLink).count()
    if (groupCount === 0) {
      await page.waitForSelector(ddangyoSelectors.menuList, { timeout: 30000 })
      return parseDdangyoMenus(await page.content(), await this.readCurrentGroupName(page))
    }

    const menus: PlatformMenuSnapshot[] = []

    for (let index = 0; index < groupCount; index += 1) {
      await page.waitForSelector(ddangyoSelectors.groupLink, { timeout: 30000 })
      const groupLink = page.locator(ddangyoSelectors.groupLink).nth(index)
      const groupName = normalizeText(await groupLink.innerText().catch(() => ''))

      await groupLink.click()
      await page.waitForSelector(ddangyoSelectors.menuList, { timeout: 30000 })

      const resolvedGroupName = groupName || (await this.readCurrentGroupName(page))
      const groupMenus = parseDdangyoMenus(await page.content(), resolvedGroupName)
      menus.push(...groupMenus)

      if (index === 0) {
        await this.capturePageStep(inspection, page, {
          kind: 'navigation',
          title: '그룹 상세',
          detail: `${resolvedGroupName || '첫 번째 그룹'} 메뉴 목록을 읽었습니다.`
        })
      }

      if (index < groupCount - 1) {
        await page.click(ddangyoSelectors.groupListBackButton)
        await page.waitForSelector(ddangyoSelectors.groupLink, { timeout: 30000 })
      }
    }

    return this.deduplicateMenus(menus)
  }

  private async openMenuManagement(page: Page) {
    await page.getByText('메뉴관리', { exact: true }).first().click()
    await page.waitForSelector(ddangyoSelectors.groupLink, { timeout: 30000 })
    await page.waitForTimeout(1000)
  }

  private async openMenuInfoEditor(page: Page, platformMenuId: string) {
    const menuRow = await this.findMenuRow(page, platformMenuId)

    if (!menuRow) {
      throw new Error('ddangyo_menu_match_not_found')
    }

    await menuRow.locator(ddangyoSelectors.menuManageButton).click()
    await page.waitForTimeout(300)
    await page.getByText('메뉴 정보 변경', { exact: true }).click()
    await this.waitForMenuInfoEditorLoaded(page, platformMenuId)
  }

  private async findMenuRow(page: Page, platformMenuId: string) {
    const directRow = await this.findMenuRowInCurrentGroup(page, platformMenuId)
    if (directRow) {
      return directRow
    }

    const groupCount = await page.locator(ddangyoSelectors.groupLink).count()
    for (let index = 0; index < groupCount; index += 1) {
      await page.waitForSelector(ddangyoSelectors.groupLink, { timeout: 30000 })
      await page.locator(ddangyoSelectors.groupLink).nth(index).click()
      await page.waitForSelector(ddangyoSelectors.menuList, { timeout: 30000 })

      const row = await this.findMenuRowInCurrentGroup(page, platformMenuId)
      if (row) {
        return row
      }

      if (index < groupCount - 1) {
        await page.click(ddangyoSelectors.groupListBackButton)
        await page.waitForSelector(ddangyoSelectors.groupLink, { timeout: 30000 })
      }
    }

    return null
  }

  private async findMenuRowInCurrentGroup(page: Page, platformMenuId: string) {
    const menuRows = page.locator(ddangyoSelectors.menuList)
    const menuCount = await menuRows.count()

    for (let index = 0; index < menuCount; index += 1) {
      const row = menuRows.nth(index)
      const rowMenuId = normalizeText(
        await row
          .locator(ddangyoSelectors.menuId)
          .innerText()
          .catch(() => '')
      )

      if (rowMenuId === platformMenuId) {
        return row
      }
    }

    return null
  }

  private async applyMenuInfoChanges(
    page: Page,
    item: SyncPreviewItem,
    options: { priceChanged: boolean }
  ) {
    const priceInputIds = await this.findVisibleInputIds(page, /_ibx_menuPrc\d+$/)

    if (options.priceChanged && priceInputIds.length === 0) {
      throw new Error('ddangyo_menu_price_input_not_found')
    }

    const updateState = await page.evaluate(
      ({ framePrefix, nextName, nextPrice, priceInputIds, applyPriceChange }) => {
        const scopeName = `${framePrefix}_scwin`
        const dataName = `${framePrefix}_dma_para`
        const priceDataName = `${framePrefix}_dlt_menuPrc`
        const nameInputId = `${framePrefix}_ibx_menuNm`
        const getComponentById = (window as { $p?: { getComponentById?: (id: string) => unknown } }).$p
          ?.getComponentById
        const scope = (window as unknown as Record<string, unknown>)[scopeName] as
          | {
              ibx_menuNm_onkeyup?: (this: unknown, event: { keyCode: number }) => void
              ibx_menuPrc_onkeyup?: (this: unknown, event: { keyCode: number }) => void
            }
          | undefined
        const priceKeyupHandler = scope?.ibx_menuPrc_onkeyup
        const dmaPara = (window as unknown as Record<string, unknown>)[dataName] as
          | { get?: (key: string) => string | null }
          | undefined
        const dltMenuPrc = (window as unknown as Record<string, unknown>)[priceDataName] as
          | { getRowCount?: () => number }
          | undefined

        if (!getComponentById) {
          throw new Error('ddangyo_component_api_unavailable')
        }

        if (!scope || typeof scope.ibx_menuNm_onkeyup !== 'function') {
          throw new Error('ddangyo_menu_name_handler_not_found')
        }

        if (applyPriceChange && typeof priceKeyupHandler !== 'function') {
          throw new Error('ddangyo_menu_price_handler_not_found')
        }

        const nameComponent = getComponentById(nameInputId) as
          | { setValue?: (value: string) => void; getValue?: () => string }
          | undefined

        if (!nameComponent || typeof nameComponent.setValue !== 'function') {
          throw new Error('ddangyo_menu_name_component_not_found')
        }

        nameComponent.setValue(nextName)
        scope.ibx_menuNm_onkeyup.call(nameComponent, { keyCode: 65 })

        if (applyPriceChange) {
          const assuredPriceKeyupHandler = priceKeyupHandler as (
            this: { setValue?: (value: string) => void },
            event: { keyCode: number }
          ) => void

          for (const priceInputId of priceInputIds) {
            const priceComponent = getComponentById(priceInputId) as
              | { setValue?: (value: string) => void }
              | undefined

            if (!priceComponent || typeof priceComponent.setValue !== 'function') {
              continue
            }

            priceComponent.setValue(String(nextPrice))
            assuredPriceKeyupHandler.call(priceComponent, { keyCode: 65 })
          }
        }

        return {
          menuName: dmaPara?.get?.('menu_nm') ?? null,
          priceRowCount: dltMenuPrc?.getRowCount?.() ?? 0
        }
      },
      {
        framePrefix: this.menuInfoFramePrefix,
        nextName: item.nextName,
        nextPrice: item.nextPrice,
        priceInputIds,
        applyPriceChange: options.priceChanged
      }
    )

    if (updateState.menuName !== item.nextName) {
      throw new Error('ddangyo_menu_name_apply_failed')
    }

    await page.click(ddangyoSelectors.menuInfoApplyButton)
    await this.waitForApplySuccess(page)
  }

  private async waitForApplySuccess(page: Page, timeoutMs = 30000) {
    await page.waitForFunction(
      (successMessage) => document.body.innerText.includes(successMessage),
      this.updateSuccessMessage,
      { timeout: timeoutMs }
    )
  }

  private async waitForMenuInfoEditorLoaded(page: Page, platformMenuId: string) {
    await page.waitForFunction(
      ({ framePrefix, expectedPlatformMenuId }) => {
        const nameInputId = `${framePrefix}_ibx_menuNm`
        const dataName = `${framePrefix}_dma_para`
        const sourceName = `${framePrefix}_dma_menu`
        const input = document.getElementById(nameInputId) as HTMLInputElement | null
        const getComponentById = (window as { $p?: { getComponentById?: (id: string) => unknown } }).$p
          ?.getComponentById
        const component = getComponentById?.(nameInputId) as
          | { getValue?: () => string }
          | undefined
        const dmaPara = (window as unknown as Record<string, unknown>)[dataName] as
          | { get?: (key: string) => string | null }
          | undefined
        const dmaMenu = (window as unknown as Record<string, unknown>)[sourceName] as
          | { get?: (key: string) => string | null }
          | undefined
        const sourceMenuId = dmaPara?.get?.('menu_id') ?? ''
        const sourceMenuName = dmaMenu?.get?.('menu_nm') ?? ''
        const visiblePriceInputs = [...document.querySelectorAll('input')].filter((element) => {
          const html = element as HTMLInputElement
          const style = window.getComputedStyle(html)
          const rect = html.getBoundingClientRect()
          return (
            /_ibx_menuPrc\d+$/.test(html.id) &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          )
        })

        return (
          sourceMenuId === expectedPlatformMenuId &&
          sourceMenuName.length > 0 &&
          input?.value === sourceMenuName &&
          component?.getValue?.() === sourceMenuName &&
          visiblePriceInputs.length > 0
        )
      },
      {
        framePrefix: this.menuInfoFramePrefix,
        expectedPlatformMenuId: platformMenuId
      },
      { timeout: 30000 }
    )
  }

  private async findVisibleInputIds(page: Page, idPattern: RegExp) {
    return page.evaluate((patternSource) => {
      const pattern = new RegExp(patternSource)
      return [...document.querySelectorAll('input')]
        .filter((element) => {
          const html = element as HTMLInputElement
          const style = window.getComputedStyle(html)
          const rect = html.getBoundingClientRect()
          return (
            pattern.test(html.id) &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          )
        })
        .map((element) => (element as HTMLInputElement).id)
    }, idPattern.source)
  }

  private async readCurrentGroupName(page: Page) {
    try {
      return normalizeText(await page.locator(ddangyoSelectors.groupName).first().innerText())
    } catch {
      return ''
    }
  }

  private deduplicateMenus(menus: PlatformMenuSnapshot[]) {
    const uniqueMenus = new Map<string, PlatformMenuSnapshot>()

    for (const menu of menus) {
      if (!uniqueMenus.has(menu.platformMenuId)) {
        uniqueMenus.set(menu.platformMenuId, menu)
      }
    }

    return [...uniqueMenus.values()]
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

const normalizeText = (value: string | null | undefined) =>
  value?.replace(/\s+/g, ' ').trim() ?? ''
