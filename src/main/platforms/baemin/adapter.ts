import type { Locator, Page, Response } from 'playwright'
import type {
  PlatformInspectionField,
  PlatformInspectionReport,
  PlatformInspectionStep,
  SyncRunFailureContext,
  SyncPreviewItem
} from '../../../shared/contracts'
import type { PlatformAdapter, PlatformMenuFetchResult } from '../base/types'
import {
  extractBaeminOptionGroupRequestContext,
  parseBaeminOptionGroupPageResponse
} from './option-parser'
import {
  extractBaeminMenuRequestContext,
  parseBaeminMenuPageResponse
} from './parser'
import { baeminSelectors } from './selectors'
import {
  refineBaeminNameApplyFailureMessage,
  getBaeminNameChangeBlockerMessage,
  getBaeminNameChangeBlockerMessageFromVisibleText
} from './detail-guard'
import { pickBaeminSearchResult } from './update-flow'
import { launchPlaywrightChromium } from '../../services/playwright-runtime'

export class BaeminAdapter implements PlatformAdapter {
  readonly platformCode = 'baemin' as const

  constructor(
    private readonly credentials: { username: string; password: string },
    private readonly baseUrl = 'https://self.baemin.com/'
  ) {}

  async fetchMenus() {
    const result = await this.fetchMenusWithInspection()
    return result.menus
  }

  async fetchOptionGroups() {
    const { browser, page } = await this.createAuthenticatedSession()

    try {
      return await this.fetchOptionGroupsFromApi(page)
    } finally {
      await browser.close()
    }
  }

  async fetchMenusWithInspection(): Promise<PlatformMenuFetchResult> {
    const inspection = this.createInspectionReport()
    const { browser, page } = await this.createAuthenticatedSession(inspection)

    try {
      await this.capturePageStep(inspection, page, {
        kind: 'navigation',
        title: '로그인 완료',
        detail: '배민셀프서비스에 로그인했습니다.'
      })

      const menus = await this.fetchMenusFromApi(page, inspection)
      return { menus, inspection }
    } finally {
      await browser.close()
    }
  }

  async applyMenuUpdate(item: SyncPreviewItem) {
    const nameChanged = item.previousName !== item.nextName
    const priceChanged =
      typeof item.previousPrice === 'number'
        ? item.previousPrice !== item.nextPrice
        : true
    const stageTracker = {
      current: '수정 대상 확인'
    }

    if (!nameChanged && !priceChanged) {
      return
    }

    const { browser, page } = await this.createAuthenticatedSession()

    try {
      stageTracker.current = '메뉴 상세 열기'
      const detail = await this.openMenuDetail(page, item)

      if (nameChanged) {
        stageTracker.current = '이름 변경 전 상세 검증'
        if (detail.nameChangeBlockerMessage) {
          throw new Error(detail.nameChangeBlockerMessage)
        }

        try {
          await this.applyNameChange(page, item.nextName, stageTracker)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown_error'
          throw new Error(
            refineBaeminNameApplyFailureMessage(
              message,
              detail.detailPayload,
              detail.visibleText
            )
          )
        }
      }

      if (priceChanged) {
        if ((item.platformMenuPriceCount ?? 0) > 1) {
          throw new Error('baemin_multi_price_menu_requires_review')
        }

        if (typeof item.previousPrice !== 'number') {
          throw new Error('baemin_previous_price_missing')
        }

        await this.applyPriceChange(page, item.previousPrice, item.nextPrice, stageTracker)
      }

      stageTracker.current = '상세 패널 반영 확인'
      await this.waitForDetailModalToReflectUpdate(
        page,
        {
          nextName: nameChanged ? item.nextName : undefined,
          nextPrice: priceChanged ? item.nextPrice : undefined
        },
        stageTracker
      )
    } catch (error) {
      throw await this.attachFailureContext(page, error, stageTracker.current)
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
        detail: '배민 로그인 화면을 열었습니다.'
      })
    }
    await this.performLogin(page)

    return { browser, page }
  }

  private async openMenuDetail(page: Page, item: SyncPreviewItem) {
    const searchInput = await this.openMenuPage(page)
    const searchResultPages = new Map<number, ReturnType<typeof parseBaeminMenuPageResponse>>()
    const onResponse = async (response: Response) => {
      const requestContext = extractBaeminMenuRequestContext(response.url())
      if (!requestContext || response.request().method() !== 'GET') {
        return
      }

      const payload = await response.json().catch(() => null)
      if (!payload) {
        return
      }

      const parsedPage = parseBaeminMenuPageResponse(payload)
      searchResultPages.set(parsedPage.page, parsedPage)
    }

    page.on('response', onResponse)

    await searchInput.fill(item.previousName)
    await searchInput.press('Enter')
    await this.waitFor(() => searchResultPages.has(0), 15000)

    const detailResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          response.url().includes(`/menus/${item.platformMenuId}`) &&
          response.url().includes('/shop-owners/') &&
          !response.url().includes('/menus/one-shop'),
        { timeout: 15000 }
      )
      .catch(() => null)

    try {
      const pickedSearchResultIndex = await this.resolveMenuSearchResultIndex(
        page,
        item,
        searchResultPages
      )

      if (typeof pickedSearchResultIndex === 'number') {
        await this.clickMenuSearchResultByIndex(page, pickedSearchResultIndex)
      } else {
        const candidates = await this.readMenuSearchCandidatesFromDom(page, item.previousName)
        const picked = pickBaeminSearchResult(candidates, {
          platformMenuId: item.platformMenuId,
          previousName: item.previousName,
          platformMenuBindingSummary: item.platformMenuBindingSummary,
          platformMenuPriceSummary: item.platformMenuPriceSummary
        })

        await page.locator('button').nth(picked.buttonIndex).click()
      }

      await page.waitForTimeout(1500)
      await page.getByRole('button', { name: '가격 변경' }).waitFor({ timeout: 10000 })
      const detailResponse = await detailResponsePromise
      const detailPayload = detailResponse ? await detailResponse.json().catch(() => null) : null
      const visibleText = await page.locator('body').innerText().catch(() => '')

      return {
        detailPayload,
        visibleText,
        nameChangeBlockerMessage:
          getBaeminNameChangeBlockerMessage(detailPayload) ??
          getBaeminNameChangeBlockerMessageFromVisibleText(visibleText)
      }
    } finally {
      page.off('response', onResponse)
    }
  }

  private async resolveMenuSearchResultIndex(
    page: Page,
    item: SyncPreviewItem,
    searchResultPages: Map<number, ReturnType<typeof parseBaeminMenuPageResponse>>
  ) {
    const tryPick = () => {
      const searchResultCandidates = [...searchResultPages.values()]
        .sort((left, right) => left.page - right.page)
        .flatMap((currentPage) => currentPage.items)
        .map((menu, resultIndex) => ({
          resultIndex,
          platformMenuId: menu.platformMenuId,
          buttonText: [
            menu.platformMenuName,
            menu.platformMenuPriceSummary,
            ...(menu.platformMenuBindingLabels ?? [])
          ]
            .filter((value): value is string => Boolean(value))
            .join('\n'),
          contextText: [
            menu.platformMenuStatus,
            menu.platformMenuName,
            menu.platformMenuPriceSummary,
            ...(menu.platformMenuBindingLabels ?? [])
          ]
            .filter((value): value is string => Boolean(value))
            .join('\n')
        }))

      if (searchResultCandidates.length === 0) {
        return null
      }

      try {
        return pickBaeminSearchResult(searchResultCandidates, {
          platformMenuId: item.platformMenuId,
          previousName: item.previousName,
          platformMenuBindingSummary: item.platformMenuBindingSummary,
          platformMenuPriceSummary: item.platformMenuPriceSummary
        }).resultIndex
      } catch {
        return null
      }
    }

    let pickedResultIndex = tryPick()
    const firstPage = searchResultPages.get(0)
    const totalPages = firstPage?.totalPages ?? 1
    let attempts = 0

    while (pickedResultIndex == null && searchResultPages.size < totalPages && attempts < totalPages * 4) {
      await page.mouse.move(900, 500)
      await page.mouse.wheel(0, 2200)
      await page.waitForTimeout(700)
      attempts += 1
      pickedResultIndex = tryPick()
    }

    return pickedResultIndex
  }

  private async clickMenuSearchResultByIndex(page: Page, resultIndex: number) {
    const selector = `[data-index="${resultIndex}"] button`

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const targetButton = page.locator(selector).first()
      if ((await targetButton.count()) > 0) {
        await targetButton.scrollIntoViewIfNeeded().catch(() => undefined)
        await targetButton.click()
        return
      }

      const scrolled = await page.evaluate((index) => {
        const currentRow = document.querySelector(`[data-index="${index}"]`) as HTMLElement | null
        if (currentRow) {
          return true
        }

        const firstRow = document.querySelector('[data-index]') as HTMLElement | null
        if (!firstRow) {
          return false
        }

        let container: HTMLElement | null = firstRow.parentElement
        while (container) {
          if (container.scrollHeight > container.clientHeight + 8) {
            break
          }
          container = container.parentElement
        }

        if (!container) {
          return false
        }

        const renderedRows = Array.from(document.querySelectorAll('[data-index]')) as HTMLElement[]
        const sampleRow = renderedRows[0]
        const rowHeight = Math.max(sampleRow?.getBoundingClientRect().height ?? 160, 80)
        container.scrollTop = Math.max(0, index * rowHeight - rowHeight)
        return true
      }, resultIndex)

      if (!scrolled) {
        break
      }

      await page.waitForTimeout(250)
    }

    throw new Error(`baemin_menu_result_not_rendered:${resultIndex}`)
  }

  private async readMenuSearchCandidatesFromDom(page: Page, menuName: string) {
    return await page.evaluate((currentMenuName) => {
      const buttons = Array.from(document.querySelectorAll('button'))
      return buttons
        .map((button, buttonIndex) => {
          const buttonText = button.innerText.replace(/\s+/g, ' ').trim()
          if (!buttonText.includes(currentMenuName)) {
            return null
          }

          let current: HTMLElement | null = button
          for (let level = 0; level < 3 && current?.parentElement; level += 1) {
            current = current.parentElement
          }

          return {
            buttonIndex,
            buttonText,
            contextText: current?.innerText.replace(/\s+/g, ' ').trim() ?? buttonText
          }
        })
        .filter(
          (
            candidate
          ): candidate is { buttonIndex: number; buttonText: string; contextText: string } =>
            Boolean(candidate)
        )
    }, menuName)
  }

  private async performLogin(page: Page) {
    await page.waitForSelector(baeminSelectors.username, { timeout: 30000 })
    await page.fill(baeminSelectors.username, this.credentials.username)
    await page.fill(baeminSelectors.password, this.credentials.password)
    await page.click(baeminSelectors.loginButton)

    await page.waitForFunction(
      ({ usernameSelector, passwordSelector }) =>
        !document.querySelector(usernameSelector) && !document.querySelector(passwordSelector),
      {
        usernameSelector: baeminSelectors.username,
        passwordSelector: baeminSelectors.password
      },
      { timeout: 30000 }
    )
    await page.waitForLoadState('networkidle').catch(() => undefined)
  }

  private async openMenuPage(page: Page) {
    const menuUrl = new URL('/menu', this.baseUrl).toString()
    await page.goto(menuUrl, {
      waitUntil: 'domcontentloaded'
    })

    let searchInput = await this.findMenuSearchInput(page)
    if (searchInput) {
      return searchInput
    }

    if (await this.isLoginPage(page)) {
      await this.performLogin(page)
      await page.goto(menuUrl, { waitUntil: 'domcontentloaded' })
      searchInput = await this.findMenuSearchInput(page)
      if (searchInput) {
        return searchInput
      }
    }

    const debugContext = await this.describePage(page)
    throw new Error(`baemin_menu_search_input_not_found:${debugContext}`)
  }

  private async findMenuSearchInput(page: Page) {
    const candidates = [
      page.getByPlaceholder('메뉴명을 입력해주세요').first(),
      page.locator('input[placeholder*="메뉴명"]').first(),
      page.locator('input[placeholder*="입력해주세요"]').first()
    ]

    for (const candidate of candidates) {
      try {
        await candidate.waitFor({ timeout: 10000 })
        return candidate
      } catch {
        continue
      }
    }

    return null
  }

  private async isLoginPage(page: Page) {
    try {
      return await page.locator(baeminSelectors.username).first().isVisible({ timeout: 1000 })
    } catch {
      return false
    }
  }

  private async describePage(page: Page) {
    const [title, text] = await Promise.all([
      page.title().catch(() => ''),
      page.locator('body').innerText().catch(() => '')
    ])

    return JSON.stringify({
      url: page.url(),
      title,
      text: text.replace(/\s+/g, ' ').trim().slice(0, 240)
    })
  }

  private async applyNameChange(
    page: Page,
    nextName: string,
    stageTracker?: { current: string }
  ) {
    const nameCheckState: {
      accepted: boolean | null
      message: string | null
    } = {
      accepted: null,
      message: null
    }
    const onResponse = async (response: Response) => {
      if (
        response.request().method() !== 'GET' ||
        !response.url().includes('/menu-name-accept/result/')
      ) {
        return
      }

      const payload = await response.json().catch(() => null)
      const data = this.getRecord(this.getRecord(payload)?.data)
      if (!data) {
        return
      }

      if (typeof data.acceptedYn === 'boolean') {
        nameCheckState.accepted = data.acceptedYn
      }

      if (typeof data.menuNameGuidanceMessage === 'string') {
        nameCheckState.message = data.menuNameGuidanceMessage
      }
    }

    page.on('response', onResponse)

    try {
      const input = page.getByPlaceholder('예) 국물떡볶이')
      const confirmButton = page.getByRole('button', { name: '확인' })
      const applyButton = page.getByRole('button', { name: '적용하기' })

      if (stageTracker) {
        stageTracker.current = '이름 변경 입력'
      }
      await page.getByRole('button', { name: '변경' }).first().click()
      await input.waitFor({ timeout: 10000 })
      await input.fill(nextName)
      if (stageTracker) {
        stageTracker.current = '이름 변경 검사 대기'
      }
      await confirmButton.click()

      await this.waitForNameApplyReady(page, applyButton, nameCheckState)

      if (stageTracker) {
        stageTracker.current = '이름 변경 저장'
      }
      const applyResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' && response.url().includes('/base-info'),
        { timeout: 15000 }
      )

      await applyButton.click()
      const applyResponse = await applyResponsePromise
      if (!applyResponse.ok()) {
        throw new Error(await this.buildApplyFailureMessage('baemin_menu_name_apply_failed', applyResponse))
      }

      if (stageTracker) {
        stageTracker.current = '이름 변경 저장 후 편집창 닫힘 대기'
      }
      await input.waitFor({ state: 'hidden', timeout: 15000 })
    } finally {
      page.off('response', onResponse)
    }
  }

  private async applyPriceChange(
    page: Page,
    previousPrice: number,
    nextPrice: number,
    stageTracker?: { current: string }
  ) {
    if (stageTracker) {
      stageTracker.current = '가격 변경 입력'
    }
    await page.getByRole('button', { name: '가격 변경' }).click()
    const formattedPreviousPrice = this.formatPrice(previousPrice)
    const formattedNextPrice = this.formatPrice(nextPrice)
    const deliveryPriceInput = page.locator(`input[value="${formattedPreviousPrice}"]`).first()

    await deliveryPriceInput.waitFor({ timeout: 10000 })
    await deliveryPriceInput.fill(formattedNextPrice)
    if (stageTracker) {
      stageTracker.current = '가격 변경 저장'
    }
    const applyResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' && response.url().includes('/price'),
      { timeout: 15000 }
    )
    await page.getByRole('button', { name: '적용하기' }).click()
    const applyResponse = await applyResponsePromise
    if (!applyResponse.ok()) {
      throw new Error(
        await this.buildApplyFailureMessage('baemin_menu_price_apply_failed', applyResponse)
      )
    }
    if (stageTracker) {
      stageTracker.current = '가격 변경 저장 후 편집창 닫힘 대기'
    }
    await deliveryPriceInput.waitFor({ state: 'hidden', timeout: 15000 })
  }

  private async waitForDetailModalToReflectUpdate(
    page: Page,
    options: {
      nextName?: string
      nextPrice?: number
      timeoutMs?: number
    },
    stageTracker?: { current: string }
  ) {
    const expectedTokens = [
      typeof options.nextName === 'string' && options.nextName.trim().length > 0
        ? options.nextName.trim()
        : null,
      typeof options.nextPrice === 'number' && Number.isFinite(options.nextPrice)
        ? `${options.nextPrice.toLocaleString('ko-KR')}원`
        : null
    ].filter((value): value is string => Boolean(value))

    if (expectedTokens.length === 0) {
      return
    }

    const timeoutMs = options.timeoutMs ?? 15000
    const detailModal = page.locator('#menuDetailModal').first()
    const startedAt = Date.now()
    if (stageTracker) {
      stageTracker.current = '상세 패널 반영 확인'
    }

    while (Date.now() - startedAt < timeoutMs) {
      const visibleText = await detailModal.innerText().catch(() => '')
      if (expectedTokens.every((token) => visibleText.includes(token))) {
        return
      }

      await page.waitForTimeout(250)
    }

    throw new Error(`baemin_menu_detail_verification_timeout:${JSON.stringify(expectedTokens)}`)
  }

  private async attachFailureContext(page: Page, error: unknown, operationStage?: string | null) {
    const context = await this.captureFailureContext(page, operationStage)
    if (!context) {
      return error instanceof Error ? error : new Error(String(error))
    }

    const nextError = error instanceof Error ? error : new Error(String(error))
    ;(nextError as Error & { syncFailureContext?: SyncRunFailureContext | null }).syncFailureContext =
      context
    return nextError
  }

  private async captureFailureContext(
    page: Page,
    operationStage?: string | null
  ): Promise<SyncRunFailureContext | null> {
    try {
      const [pageTitle, visibleTextSnippet] = await Promise.all([
        page.title().catch(() => ''),
        page.locator('body').innerText().catch(() => '')
      ])
      const normalizedText = visibleTextSnippet.replace(/\s+/g, ' ').trim().slice(0, 400)

      return {
        kind: 'platform_page_snapshot',
        status: 'captured',
        capturedAt: new Date().toISOString(),
        operationStage: operationStage ?? null,
        pageTitle: pageTitle || null,
        pageUrl: page.url(),
        pageKind: await this.inferFailurePageKind(page, normalizedText),
        visibleTextSnippet: normalizedText || null,
        detail: null
      }
    } catch (captureError) {
      return {
        kind: 'platform_page_snapshot',
        status: 'capture_failed',
        capturedAt: new Date().toISOString(),
        operationStage: operationStage ?? null,
        pageTitle: null,
        pageUrl: page.url(),
        pageKind: 'unknown',
        visibleTextSnippet: null,
        detail:
          captureError instanceof Error ? captureError.message : 'baemin_failure_context_capture_failed'
      }
    }
  }

  private async inferFailurePageKind(
    page: Page,
    normalizedText: string
  ): Promise<SyncRunFailureContext['pageKind']> {
    if (
      normalizedText.includes('가격 변경') ||
      normalizedText.includes('이 메뉴를 판매하는 가게 변경')
    ) {
      return 'menu_detail'
    }

    const detailModalVisible = await page
      .locator('#menuDetailModal')
      .first()
      .isVisible()
      .catch(() => false)
    if (detailModalVisible) {
      return 'menu_detail'
    }

    if (page.url().includes('/menu')) {
      return 'menu_list'
    }

    return 'unknown'
  }

  private formatPrice(value: number) {
    return value.toLocaleString('ko-KR')
  }

  private async waitForNameApplyReady(
    page: Page,
    applyButton: Locator,
    nameCheckState: { accepted: boolean | null; message: string | null }
  ) {
    const startedAt = Date.now()

    while (Date.now() - startedAt < 30000) {
      if (await this.isEnabled(applyButton)) {
        return
      }

      if (nameCheckState.accepted === false) {
        throw new Error(
          `baemin_menu_name_rejected:${nameCheckState.message ?? 'unknown_rejection'}`
        )
      }

      const visibleBlockerMessage = await this.readNameCheckBlockerMessageFromPage(page)
      if (visibleBlockerMessage) {
        throw new Error(`baemin_menu_name_rejected:${visibleBlockerMessage}`)
      }

      await page.waitForTimeout(250)
    }

    throw new Error(
      `baemin_menu_name_apply_button_timeout:${JSON.stringify(nameCheckState)}:${await this.describePage(page)}`
    )
  }

  private async readNameCheckBlockerMessageFromPage(page: Page) {
    const visibleText = await page.locator('body').innerText().catch(() => '')
    return this.extractNameCheckBlockerMessage(visibleText)
  }

  private extractNameCheckBlockerMessage(visibleText: string) {
    const normalized = visibleText.replace(/\s+/g, ' ').trim()
    if (!normalized) {
      return null
    }

    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0)

    return (
      sentences.find((sentence) => /(입력할 수 없어요|적용할 수 없어요)/.test(sentence)) ?? null
    )
  }

  private async isEnabled(locator: Locator) {
    try {
      const ariaDisabled = await locator.getAttribute('aria-disabled')
      const disabled = await locator.isDisabled()
      return ariaDisabled !== 'true' && !disabled
    } catch {
      return false
    }
  }

  private async buildApplyFailureMessage(prefix: string, response: Response) {
    const raw = await response.text().catch(() => '')
    if (!raw) {
      return `${prefix}:${response.status()}`
    }

    try {
      const payload = JSON.parse(raw) as Record<string, unknown>
      const errorType = typeof payload.errorType === 'string' ? payload.errorType : String(response.status())
      const errorMessage =
        typeof payload.errorMessage === 'string' ? payload.errorMessage : raw.slice(0, 240)
      return `${prefix}:${errorType}:${errorMessage}`
    } catch {
      return `${prefix}:${response.status()}:${raw.slice(0, 240)}`
    }
  }

  private async fetchMenusFromApi(page: Page, inspection?: PlatformInspectionReport) {
    const pages = new Map<number, ReturnType<typeof parseBaeminMenuPageResponse>>()
    const onResponse = async (response: Response) => {
      const requestContext = extractBaeminMenuRequestContext(response.url())
      if (!requestContext || response.request().method() !== 'GET') {
        return
      }

      const payload = await response.json()
      const parsedPage = parseBaeminMenuPageResponse(payload)
      pages.set(parsedPage.page, parsedPage)

      if (inspection) {
        this.pushInspectionStep(inspection, {
          kind: 'api',
          title: `메뉴 API ${parsedPage.page + 1}페이지 감지`,
          detail: `${parsedPage.items.length}개 메뉴를 읽었습니다.`,
          url: response.url(),
          fields: this.buildApiFields(payload, parsedPage.page, parsedPage.totalPages)
        })
      }
    }

    page.on('response', onResponse)

    try {
      await page.goto(new URL('/menu', this.baseUrl).toString(), {
        waitUntil: 'domcontentloaded'
      })
      await this.dismissCollectionOverlays(page)

      await this.waitFor(() => pages.has(0), 30000)
      const firstPage = pages.get(0)

      if (!firstPage) {
        throw new Error('baemin_menu_page_not_found')
      }

      if (inspection) {
        await page.waitForTimeout(300)
        await this.capturePageStep(inspection, page, {
          kind: 'navigation',
          title: '메뉴 페이지',
          detail: '메뉴 목록 화면으로 이동했습니다.'
        })
      }

      const totalPages = firstPage.totalPages
      let attempts = 0

      while (pages.size < totalPages && attempts < totalPages * 4) {
        await page.mouse.move(900, 500)
        await page.mouse.wheel(0, 2400)
        await page.waitForTimeout(1500)
        attempts += 1
      }

      if (pages.size < totalPages) {
        throw new Error(`baemin_menu_page_collection_incomplete:${pages.size}/${totalPages}`)
      }

      return [...pages.values()]
        .sort((left, right) => left.page - right.page)
        .flatMap((currentPage) => currentPage.items)
    } finally {
      page.off('response', onResponse)
    }
  }

  private async fetchOptionGroupsFromApi(page: Page) {
    const pages = new Map<number, ReturnType<typeof parseBaeminOptionGroupPageResponse>>()
    const onResponse = async (response: Response) => {
      const requestContext = extractBaeminOptionGroupRequestContext(response.url())
      if (!requestContext || response.request().method() !== 'GET') {
        return
      }

      const payload = await response.json().catch(() => null)
      if (!payload) {
        return
      }

      const parsedPage = parseBaeminOptionGroupPageResponse(payload)
      pages.set(parsedPage.page, parsedPage)
    }

    page.on('response', onResponse)

    try {
      await page.goto(new URL('/menu', this.baseUrl).toString(), {
        waitUntil: 'domcontentloaded'
      })
      await this.dismissCollectionOverlays(page)
      await page.getByText('옵션', { exact: true }).first().click({ timeout: 15000 })
      await this.dismissCollectionOverlays(page)

      await this.waitFor(() => pages.has(0), 30000)
      const firstPage = pages.get(0)

      if (!firstPage) {
        throw new Error('baemin_option_group_page_not_found')
      }

      const totalPages = firstPage.totalPages > 0 ? firstPage.totalPages : 1
      let attempts = 0

      while (pages.size < totalPages && attempts < totalPages * 4) {
        await page.mouse.move(920, 560)
        await page.mouse.wheel(0, 2200)
        await page.waitForTimeout(1200)
        attempts += 1
      }

      if (pages.size < totalPages) {
        throw new Error(
          `baemin_option_group_page_collection_incomplete:${pages.size}/${totalPages}`
        )
      }

      return [...pages.values()]
        .sort((left, right) => left.page - right.page)
        .flatMap((currentPage) => currentPage.items)
    } finally {
      page.off('response', onResponse)
    }
  }

  private async waitFor(check: () => boolean, timeoutMs: number) {
    const startedAt = Date.now()
    while (!check()) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error('baemin_menu_page_timeout')
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  private async dismissCollectionOverlays(page: Page) {
    const dismissButtons = [
      page.getByRole('button', { name: /오늘 하루 보지 않기|오늘 하루 보지않기/ }).first(),
      page.getByRole('button', { name: /오늘 하루 닫기|오늘만 닫기/ }).first(),
      page.getByRole('button', { name: /닫기/ }).first()
    ]

    for (const button of dismissButtons) {
      try {
        if (!(await button.isVisible({ timeout: 1000 }))) {
          continue
        }

        await button.click()
        await page.waitForTimeout(300)
      } catch {
        continue
      }
    }
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
    step: Omit<PlatformInspectionStep, 'recordedAt' | 'pageTitle' | 'url' | 'visibleTextSnippet' | 'screenshotDataUrl'>
  ) {
    const screenshotDataUrl = await this.captureScreenshot(page)
    const visibleTextSnippet = await this.readVisibleText(page)
    const pageTitle = await page.title().catch(() => '')

    this.pushInspectionStep(inspection, {
      ...step,
      pageTitle: pageTitle || undefined,
      url: page.url(),
      visibleTextSnippet: visibleTextSnippet || undefined,
      screenshotDataUrl: screenshotDataUrl || undefined
    })
  }

  private async captureScreenshot(page: Page) {
    try {
      const image = await page.screenshot({ type: 'png' })
      return `data:image/png;base64,${image.toString('base64')}`
    } catch {
      return undefined
    }
  }

  private async readVisibleText(page: Page) {
    try {
      const text = await page.locator('body').innerText()
      return text.replace(/\s+/g, ' ').trim().slice(0, 400)
    } catch {
      return undefined
    }
  }

  private buildApiFields(payload: unknown, pageNumber: number, totalPages: number): PlatformInspectionField[] {
    const data = this.getRecord(this.getRecord(payload)?.data)
    const content = Array.isArray(data?.content) ? data.content : []
    const firstMenu = this.getRecord(content[0])
    const usedKeys = new Set([
      'menuId',
      'menuName',
      'useShops',
      'menuStatusResponse',
      'menuPrices'
    ])

    const fields: PlatformInspectionField[] = [
      { name: 'data.number', value: String(pageNumber + 1), usage: 'control' },
      { name: 'data.totalPages', value: String(totalPages), usage: 'control' },
      { name: 'data.content.length', value: String(content.length), usage: 'control' }
    ]

    if (!firstMenu) {
      return fields
    }

    for (const [key, value] of Object.entries(firstMenu)) {
      fields.push({
        name: `content[0].${key}`,
        value: this.stringifyFieldValue(value),
        usage: usedKeys.has(key) ? 'used' : 'ignored'
      })
    }

    return fields
  }

  private getRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null
    }

    return value as Record<string, unknown>
  }

  private stringifyFieldValue(value: unknown) {
    if (typeof value === 'string') {
      return value
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }

    if (value == null) {
      return 'null'
    }

    try {
      return JSON.stringify(value).slice(0, 160)
    } catch {
      return String(value)
    }
  }
}
