import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import type {
  PlatformInspectionReport,
  PlatformInspectionStep,
  PlatformMenuPriceChannelCode,
  SyncPreviewItem
} from '../../../shared/contracts'
import { comparePlatformMenuPriceVariants } from '../../../shared/platform-menu-price-variants'
import type {
  PlatformAdapter,
  PlatformMenuFetchResult,
  PlatformMenuSnapshot
} from '../base/types'
import { requiresMultiPriceMenuReview } from '../base/menu-update-policy'
import { parseDdangyoMenus } from './parser'
import { buildDdangyoPriceRowSnapshots } from './price-row-snapshots'
import { ddangyoSelectors } from './selectors'
import { launchPlaywrightChromium } from '../../services/playwright-runtime'

interface DdangyoAdapterOptions {
  readManagedBrowserCatalog?: () => Promise<PlatformMenuFetchResult>
}

export class DdangyoAdapter implements PlatformAdapter {
  readonly platformCode = 'ddangyo' as const
  readonly capabilities = { optionCatalog: true }
  private readonly updateSuccessMessage = '적용 완료되었습니다.'
  private readonly menuInfoFramePrefix = 'mf_wfm_contents_wfm_tabcontents_SMWME01T120P40_wframe'
  private readonly priceInputIdPattern = /_gen_menuPrc_(\d+)_ibx_menuPrc(\d+)$/
  private readonly enableSaveDebug = process.env.DDANGYO_DEBUG_SAVE === '1'
  private readonly saveDebugPath = join(process.cwd(), '.tmp', 'ddangyo-save-debug.ndjson')
  private readonly priceChannelByInputIndex: Record<number, PlatformMenuPriceChannelCode> = {
    1: 'delivery',
    2: 'pickup',
    3: 'dine_in'
  }

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly baseUrl = 'https://boss.ddangyo.com/',
    private readonly options: DdangyoAdapterOptions = {}
  ) {}

  async fetchMenus() {
    const result = await this.fetchMenusWithInspection()
    return result.menus
  }

  async fetchMenusWithInspection(): Promise<PlatformMenuFetchResult> {
    const inspection = this.createInspectionReport()
    if (this.options.readManagedBrowserCatalog) {
      const catalog = await this.options.readManagedBrowserCatalog()
      const menus = catalog.menus
      if (menus.length === 0) throw new Error('ddangyo_managed_catalog_empty')
      this.pushInspectionStep(inspection, {
        kind: 'result',
        title: '전용 크롬 메뉴 읽기',
        detail: `로그인된 전용 크롬 세션에서 메뉴 ${menus.length}개와 옵션 그룹 ${catalog.optionGroups?.length ?? 0}개를 읽었습니다.`
      })
      return {
        ...catalog,
        rawMenuCount: catalog.rawMenuCount ?? menus.length,
        fetchMode: catalog.fetchMode ?? 'managed_browser',
        inspection
      }
    }
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

  async inspectMenuInfo(platformMenuId: string) {
    const { browser, page } = await this.createAuthenticatedSession()

    try {
      await this.openMenuManagement(page)
      await this.openMenuInfoEditor(page, platformMenuId)
      return await this.readMenuInfoDebugState(page)
    } finally {
      await browser.close()
    }
  }

  async applyMenuUpdate(item: SyncPreviewItem) {
    const nameChanged = item.previousName !== item.nextName
    const scalarPriceChanged =
      typeof item.previousPrice === 'number' ? item.previousPrice !== item.nextPrice : true
    const variantComparison = this.hasComparablePriceVariants(item)
      ? comparePlatformMenuPriceVariants(item.previousPriceVariants, item.nextPriceVariants)
      : {
          hasVariantData: false,
          structureMatches: true,
          amountChanged: false,
          changed: false
        }
    const priceChanged = scalarPriceChanged || variantComparison.changed

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
      && !(priceChanged && variantComparison.hasVariantData && variantComparison.structureMatches)
    ) {
      throw new Error('ddangyo_multi_price_menu_requires_review')
    }

    const { browser, page } = await this.createAuthenticatedSession()

    try {
      await this.openMenuManagement(page)
      await this.openMenuInfoEditor(page, item.platformMenuId)
      await this.applyMenuInfoChanges(page, item, { priceChanged })
      if (this.enableSaveDebug) {
        await this.openMenuManagement(page)
        await this.openMenuInfoEditor(page, item.platformMenuId)
        this.writeSaveDebug({
          stage: 'reopen-after-save',
          platformMenuId: item.platformMenuId,
          editorState: await this.readMenuInfoDebugState(page)
        })
      }
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
    const priceUpdates = options.priceChanged ? this.buildPriceUpdates(item, priceInputIds) : []
    const priceRowSnapshots = options.priceChanged
      ? buildDdangyoPriceRowSnapshots(item.previousPriceVariants, item.nextPriceVariants)
      : []

    if (options.priceChanged && priceInputIds.length === 0) {
      throw new Error('ddangyo_menu_price_input_not_found')
    }

    const updateState = await page.evaluate(
      ({ framePrefix, nextName, nextPrice, priceUpdates, priceRowSnapshots, applyPriceChange }) => {
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
          | { getRowCount?: () => number; setCellData?: (rowIndex: number, columnId: string, value: unknown) => void }
          | undefined

        if (!getComponentById) {
          throw new Error('ddangyo_component_api_unavailable')
        }

        if (!scope || typeof scope.ibx_menuNm_onkeyup !== 'function') {
          throw new Error('ddangyo_menu_name_handler_not_found')
        }

        void nextPrice

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

          for (const priceUpdate of priceUpdates) {
            const priceComponent = getComponentById(priceUpdate.inputId) as
              | { setValue?: (value: string) => void }
              | undefined

            if (!priceComponent || typeof priceComponent.setValue !== 'function') {
              throw new Error('ddangyo_menu_price_component_not_found')
            }

            priceComponent.setValue(String(priceUpdate.value))
            assuredPriceKeyupHandler.call(priceComponent, { keyCode: 65 })
          }

          if (typeof dltMenuPrc?.setCellData === 'function' && priceRowSnapshots.length > 0) {
            for (let rowIndex = 0; rowIndex < priceRowSnapshots.length; rowIndex += 1) {
              const rowSnapshot = priceRowSnapshots[rowIndex]
              for (const [columnId, value] of Object.entries(rowSnapshot)) {
                if (value === undefined) {
                  continue
                }

                dltMenuPrc.setCellData(rowIndex, columnId, value)
              }
            }
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
        priceUpdates,
        priceRowSnapshots,
        applyPriceChange: options.priceChanged
      }
    )

    if (updateState.menuName !== item.nextName) {
      throw new Error('ddangyo_menu_name_apply_failed')
    }

    const saveNetworkEvents = this.enableSaveDebug ? this.attachSaveDebugListener(page) : null
    if (this.enableSaveDebug) {
      this.writeSaveDebug({
        stage: 'before-save',
        platformMenuId: item.platformMenuId,
        nextName: item.nextName,
        nextPriceVariants: item.nextPriceVariants ?? null,
        updateState,
        editorState: await this.readMenuInfoDebugState(page)
      })
    }

    await page.click(ddangyoSelectors.menuInfoApplyButton)
    await this.waitForApplySuccess(page)

    if (this.enableSaveDebug && saveNetworkEvents) {
      await page.waitForTimeout(1000).catch(() => undefined)
      saveNetworkEvents.detach()
      this.writeSaveDebug({
        stage: 'after-save',
        platformMenuId: item.platformMenuId,
        editorState: await this.readMenuInfoDebugState(page),
        networkEvents: saveNetworkEvents.events
      })
    }
  }

  private async waitForApplySuccess(page: Page, timeoutMs = 30000) {
    await page.waitForFunction(
      (successMessage) => document.body.innerText.includes(successMessage),
      this.updateSuccessMessage,
      { timeout: timeoutMs }
    )

    const clearedWithoutInteraction = await this.waitForSuccessMessageToClear(page, 1200)
    if (clearedWithoutInteraction) {
      return
    }

    await this.dismissApplySuccessMessage(page)
    await this.waitForSuccessMessageToClear(page, 5000)
  }

  private async waitForSuccessMessageToClear(page: Page, timeoutMs: number) {
    return page
      .waitForFunction(
        (successMessage) => !document.body.innerText.includes(successMessage),
        this.updateSuccessMessage,
        { timeout: timeoutMs }
      )
      .then(() => true)
      .catch(() => false)
  }

  private async dismissApplySuccessMessage(page: Page) {
    const pageWithRole = page as Page & {
      getByRole?: (role: string, options?: { name?: string }) => { click: (options?: { timeout?: number }) => Promise<void> }
    }
    const pageWithText = page as Page & {
      getByText?: (text: string, options?: { exact?: boolean }) => { click: (options?: { timeout?: number }) => Promise<void> }
    }
    const dismissalAttempts: Array<() => Promise<void>> = []

    if (pageWithRole.getByRole) {
      dismissalAttempts.push(() =>
        pageWithRole.getByRole?.('button', { name: '확인' }).click({ timeout: 1000 }) ?? Promise.resolve()
      )
      dismissalAttempts.push(() =>
        pageWithRole.getByRole?.('button', { name: '닫기' }).click({ timeout: 1000 }) ?? Promise.resolve()
      )
    }

    if (pageWithText.getByText) {
      dismissalAttempts.push(() =>
        pageWithText.getByText?.('확인', { exact: true }).click({ timeout: 1000 }) ?? Promise.resolve()
      )
      dismissalAttempts.push(() =>
        pageWithText.getByText?.('닫기', { exact: true }).click({ timeout: 1000 }) ?? Promise.resolve()
      )
    }

    for (const attempt of dismissalAttempts) {
      const dismissed = await attempt()
        .then(() => true)
        .catch(() => false)
      if (dismissed) {
        return
      }
    }

    await page.keyboard.press('Enter').catch(() => undefined)
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

  private hasComparablePriceVariants(item: SyncPreviewItem) {
    return (item.previousPriceVariants?.length ?? 0) > 0 && (item.nextPriceVariants?.length ?? 0) > 0
  }

  private buildPriceUpdates(item: SyncPreviewItem, priceInputIds: string[]) {
    if (this.hasComparablePriceVariants(item)) {
      const comparison = comparePlatformMenuPriceVariants(
        item.previousPriceVariants,
        item.nextPriceVariants
      )

      if (comparison.hasVariantData && comparison.structureMatches) {
        return priceInputIds.map((inputId) => {
          const matchedIds = inputId.match(this.priceInputIdPattern)
          if (!matchedIds) {
            throw new Error('ddangyo_menu_price_input_shape_mismatch')
          }

          const variantIndex = Number(matchedIds[1])
          const inputChannelIndex = Number(matchedIds[2])
          const channelCode = this.priceChannelByInputIndex[inputChannelIndex]
          const variant = item.nextPriceVariants?.[variantIndex]
          const channel = variant?.channels.find((entry) => entry.channelCode === channelCode)

          if (!channelCode || !variant || typeof channel?.amount !== 'number') {
            throw new Error('ddangyo_menu_price_variant_input_mismatch')
          }

          return {
            inputId,
            value: channel.amount
          }
        })
      }
    }

    return priceInputIds.map((inputId) => ({
      inputId,
      value: item.nextPrice
    }))
  }

  private async readCurrentGroupName(page: Page) {
    try {
      return normalizeText(await page.locator(ddangyoSelectors.groupName).first().innerText())
    } catch {
      return ''
    }
  }

  private writeSaveDebug(payload: Record<string, unknown>) {
    try {
      mkdirSync(join(process.cwd(), '.tmp'), { recursive: true })
      appendFileSync(
        this.saveDebugPath,
        `${JSON.stringify({ recordedAt: new Date().toISOString(), ...payload })}\n`,
        'utf8'
      )
    } catch {
      // ignore debug write failures
    }
  }

  private attachSaveDebugListener(page: Page) {
    const events: Array<{
      url: string
      method: string
      resourceType: string
      status: number | null
      requestPreview?: string | null
      bodyPreview?: string | null
    }> = []
    const listener = async (response: Awaited<ReturnType<Page['waitForResponse']>>) => {
      try {
        const request = response.request()
        const resourceType = request.resourceType()
        if (resourceType !== 'xhr' && resourceType !== 'fetch') {
          return
        }

        const url = response.url()
        if (!url.includes('ddangyo')) {
          return
        }

        const requestPreview = request.postData()?.slice(0, 1000) ?? null
        const bodyPreview = await response.text().then((value) => value.slice(0, 300)).catch(() => null)
        events.push({
          url,
          method: request.method(),
          resourceType,
          status: response.status(),
          requestPreview,
          bodyPreview
        })
      } catch {
        // ignore debug listener errors
      }
    }

    page.on('response', listener)

    return {
      events,
      detach: () => {
        page.off('response', listener)
      }
    }
  }

  private async readMenuInfoDebugState(page: Page) {
    return page.evaluate(({ framePrefix }) => {
      const scopeName = `${framePrefix}_scwin`
      const dataName = `${framePrefix}_dma_para`
      const priceDataName = `${framePrefix}_dlt_menuPrc`
      const getComponentById = (window as { $p?: { getComponentById?: (id: string) => unknown } }).$p
        ?.getComponentById
      const scope = (window as unknown as Record<string, unknown>)[scopeName] as Record<string, unknown> | undefined
      const dmaPara = (window as unknown as Record<string, unknown>)[dataName] as
        | { get?: (key: string) => string | null }
        | undefined
      const dltMenuPrc = (window as unknown as Record<string, unknown>)[priceDataName] as
        | {
            getRowCount?: () => number
            getCellData?: (rowIndex: number, columnId: string) => unknown
            getRowJSON?: (rowIndex: number) => unknown
          }
        | undefined

      const visiblePriceInputs = [...document.querySelectorAll('input')]
        .filter((element) => {
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
        .map((element) => {
          const html = element as HTMLInputElement
          const component = getComponentById?.(html.id) as { getValue?: () => string | number } | undefined
          return {
            inputId: html.id,
            domValue: html.value,
            componentValue: component?.getValue?.() ?? null
          }
        })

      const rowCount = dltMenuPrc?.getRowCount?.() ?? 0
      const datasetRows = Array.from({ length: rowCount }, (_, rowIndex) => ({
        rowIndex,
        menuPrc: dltMenuPrc?.getCellData?.(rowIndex, 'menuPrc') ?? null,
        menuPrc1: dltMenuPrc?.getCellData?.(rowIndex, 'menuPrc1') ?? null,
        menuPrc2: dltMenuPrc?.getCellData?.(rowIndex, 'menuPrc2') ?? null,
        menuPrc3: dltMenuPrc?.getCellData?.(rowIndex, 'menuPrc3') ?? null,
        rowJson: dltMenuPrc?.getRowJSON?.(rowIndex) ?? null
      }))

      return {
        menuId: dmaPara?.get?.('menu_id') ?? null,
        menuName: dmaPara?.get?.('menu_nm') ?? null,
        scopeKeys: scope ? Object.keys(scope).filter((key) => key.includes('menuPrc')).slice(0, 20) : [],
        visiblePriceInputs,
        datasetRows
      }
    }, {
      framePrefix: this.menuInfoFramePrefix
    })
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
