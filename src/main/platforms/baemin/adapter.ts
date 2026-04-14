import type { Locator, Page, Response } from 'playwright'
import type {
  PlatformInspectionField,
  PlatformInspectionReport,
  PlatformMenuPriceVariantRecord,
  PlatformInspectionStep,
  SyncRunFailureContext,
  SyncPreviewItem
} from '../../../shared/contracts'
import { comparePlatformMenuPriceVariants } from '../../../shared/platform-menu-price-variants'
import type { PlatformAdapter, PlatformMenuFetchResult } from '../base/types'
import {
  extractBaeminOptionGroupRequestContext,
  parseBaeminOptionGroupPageResponse
} from './option-parser'
import {
  buildBaeminPriceInputUpdates,
  type BaeminVisiblePriceInputSnapshot
} from './price-change'
import {
  pickBaeminCreateWizardAdvanceButtonLabel,
  pickBaeminCreateWizardGroupOptionValue,
  prioritizeBaeminCreateWizardVisibleControlLabels
} from './create-wizard'
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
import { pickBaeminRenderedSearchResult } from './update-flow'
import { launchPlaywrightChromium } from '../../services/playwright-runtime'

type BaeminCreateWizardEntryState = {
  buttonFound: boolean
  buttonCount: number
  buttonText: string | null
  ariaDisabled: string | null
  disabledAttribute: string | null
  dataDisabled: string | null
  hasDisabledLikeClass: boolean
  buttonHtmlSnippet: string | null
  buttonRect: { x: number; y: number; width: number; height: number } | null
  centerHitTag: string | null
  centerHitText: string | null
  centerHitClassName: string | null
  centerHitHtmlSnippet: string | null
  centerHitOwnsButton: boolean | null
  visibleOverlays: string[]
  hasReactFiber: boolean
  reactLimitBranchDetected: boolean
  bodyLimitMessage: string | null
  visibleButtons: string[]
  visibleInputs: string[]
}

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

  async inspectCreateMenuFlow() {
    const inspection = this.createInspectionReport()
    const { browser, page } = await this.createAuthenticatedSession(inspection)

    try {
      await this.openMenuPage(page)
      await this.captureCreateWizardStep(inspection, page, '메뉴 목록', '새 메뉴 추가 전 상태입니다.')

      const preClickCreateWizardEntryState = await this.inspectCreateWizardEntryState(page)
      await page.getByRole('button', { name: '메뉴 추가' }).first().click({ timeout: 10000 })
      await this.selectCreateWizardMenuTypeIfVisible(page)
      await this.waitForCreateWizardNameInput(page, preClickCreateWizardEntryState)
      await this.captureCreateWizardStep(
        inspection,
        page,
        '새 메뉴 추가 1단계',
        '메뉴명 검사 화면입니다.'
      )

      const nameInput = page.getByPlaceholder('예) 국물떡볶이')
      const confirmButton = page.getByRole('button', { name: '확인' })
      await nameInput.fill('갈릭소스추가')
      await confirmButton.click()
      const advanceButton = await this.waitForCreateWizardAdvanceReady(page, {
        accepted: null,
        message: null
      })
      await this.captureCreateWizardStep(
        inspection,
        page,
        '새 메뉴 추가 1단계 검사 완료',
        '사용 가능한 메뉴명으로 다음 단계 진입 직전 상태입니다.'
      )

      await advanceButton.click()
      const groupSelect = await this.findCreateWizardGroupSelect(page)
      await groupSelect.waitFor({ timeout: 10000 })
      await this.captureCreateWizardStep(
        inspection,
        page,
        '새 메뉴 추가 2단계',
        '메뉴 그룹 선택 화면입니다.'
      )

      const groupOptions = await this.readCreateWizardGroupOptions(groupSelect)
      const selectedGroupValue = pickBaeminCreateWizardGroupOptionValue(groupOptions)
      if (!selectedGroupValue) {
        throw new Error('baemin_create_wizard_group_option_not_found')
      }

      await groupSelect.selectOption(selectedGroupValue)
      await this.clickCreateWizardAdvanceButton(page)

      const priceInput = await this.findCreateWizardPriceInput(page)
      await priceInput.fill('100')
      await this.captureCreateWizardStep(
        inspection,
        page,
        '새 메뉴 추가 3단계',
        '가격 입력 화면입니다. 실제 저장은 수행하지 않습니다.'
      )

      await this.clickCreateWizardAdvanceButton(page)
      await page.waitForTimeout(500)
      await this.captureCreateWizardStep(
        inspection,
        page,
        '새 메뉴 추가 4단계',
        '부가정보 화면입니다. 최종 저장 전에서 중단합니다.'
      )

      this.pushInspectionStep(inspection, {
        kind: 'result',
        title: '생성 마법사 읽기 전용 점검 완료',
        detail: '최종 저장은 수행하지 않았습니다.'
      })

      return inspection
    } catch (error) {
      this.pushInspectionStep(inspection, {
        kind: 'result',
        title: '생성 마법사 읽기 전용 점검 중단',
        detail: error instanceof Error ? error.message : 'baemin_create_wizard_inspection_failed'
      })

      return inspection
    } finally {
      await browser.close()
    }
  }

  async applyMenuUpdate(item: SyncPreviewItem) {
    const nameChanged = item.previousName !== item.nextName
    const scalarPriceChanged =
      typeof item.previousPrice === 'number'
        ? item.previousPrice !== item.nextPrice
        : true
    const variantComparison = this.hasComparablePriceVariants(item)
      ? comparePlatformMenuPriceVariants(item.previousPriceVariants, item.nextPriceVariants)
      : {
          hasVariantData: false,
          structureMatches: true,
          amountChanged: false,
          changed: false
        }
    const priceChanged = scalarPriceChanged || variantComparison.changed
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
        const canApplyStructuredPriceChange =
          (item.platformMenuPriceCount ?? 0) > 1
          && variantComparison.hasVariantData
          && variantComparison.structureMatches

        if ((item.platformMenuPriceCount ?? 0) > 1 && !canApplyStructuredPriceChange) {
          throw new Error('baemin_multi_price_menu_requires_review')
        }

        if (!canApplyStructuredPriceChange && typeof item.previousPrice !== 'number') {
          throw new Error('baemin_previous_price_missing')
        }

        if (canApplyStructuredPriceChange) {
          await this.applyStructuredPriceChange(page, item, stageTracker)
        } else {
          await this.applyPriceChange(page, item.previousPrice as number, item.nextPrice, stageTracker)
        }
      }

      stageTracker.current = '상세 패널 반영 확인'
      await this.waitForDetailModalToReflectUpdate(
        page,
        {
          nextName: nameChanged ? item.nextName : undefined,
          nextPrice: priceChanged ? item.nextPrice : undefined,
          nextPriceVariants: priceChanged ? item.nextPriceVariants : undefined
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

    await this.ensureMenuSearchStatusFilter(page, item.platformMenuStatus)
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
        await this.clickMenuSearchResultByIndex(page, pickedSearchResultIndex, item)
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

  private getMenuSearchStatusFilterOptionLabel(status?: string | null) {
    const normalizedStatus = status?.trim() ?? ''
    if (normalizedStatus.includes('숨김')) {
      return '숨김'
    }

    if (normalizedStatus.includes('품절')) {
      return '품절'
    }

    return null
  }

  private async ensureMenuSearchStatusFilter(page: Page, status?: string | null) {
    const optionLabel = this.getMenuSearchStatusFilterOptionLabel(status)
    if (!optionLabel) {
      return
    }

    const filterButtons = page.getByRole('button', { name: '판매상태 전체' })
    const filterButtonCount = await filterButtons.count().catch(() => 0)
    if (filterButtonCount <= 0) {
      return
    }

    await filterButtons.first().click()
    const filterOptions = page.getByRole('option', { name: optionLabel, exact: true })
    const filterOptionCount = await filterOptions.count().catch(() => 0)
    if (filterOptionCount <= 0) {
      return
    }

    await filterOptions.first().click()
    await page.waitForTimeout(500)
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

  private async clickMenuSearchResultByIndex(page: Page, resultIndex: number, item: SyncPreviewItem) {
    const selector = `[data-index="${resultIndex}"] button`

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const renderedCandidates = await this.readRenderedMenuSearchCandidates(page)
      let pickedRenderedCandidate: { dataIndex: number } | null = null
      if (renderedCandidates.length > 0) {
        try {
          pickedRenderedCandidate = pickBaeminRenderedSearchResult(renderedCandidates, {
            platformMenuId: item.platformMenuId,
            previousName: item.previousName,
            platformMenuBindingSummary: item.platformMenuBindingSummary,
            platformMenuPriceSummary: item.platformMenuPriceSummary
          })
        } catch {
          pickedRenderedCandidate = null
        }
      }
      const targetSelector = pickedRenderedCandidate
        ? `[data-index="${pickedRenderedCandidate.dataIndex}"] button`
        : selector
      const targetButton = page.locator(targetSelector).first()
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

  private async readRenderedMenuSearchCandidates(page: Page) {
    return await page.evaluate(() => {
      const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? ''
      return Array.from(document.querySelectorAll('[data-index]'))
        .map((row) => {
          const currentRow = row as HTMLElement
          const rawDataIndex = currentRow.getAttribute('data-index')
          const dataIndex = rawDataIndex ? Number(rawDataIndex) : Number.NaN
          const button = currentRow.querySelector('button') as HTMLButtonElement | null
          if (!button || Number.isNaN(dataIndex)) {
            return null
          }

          return {
            dataIndex,
            buttonText: normalize(button.innerText),
            contextText: normalize(currentRow.innerText)
          }
        })
        .filter(
          (
            candidate
          ): candidate is { dataIndex: number; buttonText: string; contextText: string } =>
            Boolean(candidate)
        )
    })
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

  private async describePage(page: Page, extra?: Record<string, unknown> | null) {
    const [title, text] = await Promise.all([
      page.title().catch(() => ''),
      page.locator('body').innerText().catch(() => '')
    ])

    return JSON.stringify({
      url: page.url(),
      title,
      text: text.replace(/\s+/g, ' ').trim().slice(0, 240),
      ...(extra ?? {})
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

  private async applyStructuredPriceChange(
    page: Page,
    item: SyncPreviewItem,
    stageTracker?: { current: string }
  ) {
    if (stageTracker) {
      stageTracker.current = '가격 변경 입력'
    }

    await page.getByRole('button', { name: '가격 변경' }).click()
    const visibleInputs = await this.readVisiblePriceChangeInputs(page)
    const updates = buildBaeminPriceInputUpdates(visibleInputs, item.nextPriceVariants)

    for (const update of updates) {
      await page.locator('input').nth(update.domIndex).fill(update.value)
    }

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
    await page.locator('input').nth(updates[0].domIndex).waitFor({ state: 'hidden', timeout: 15000 })
  }

  private async readVisiblePriceChangeInputs(page: Page): Promise<BaeminVisiblePriceInputSnapshot[]> {
    return await page.evaluate(() => {
      const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? ''
      const isVisible = (element: Element) => {
        if (!(element instanceof HTMLElement)) {
          return false
        }

        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      }

      return Array.from(document.querySelectorAll('input'))
        .map((input, domIndex) => {
          const current = input as HTMLInputElement
          return {
            domIndex,
            placeholder: normalize(current.placeholder),
            value: normalize(current.value),
            type: normalize(current.type)
          }
        })
        .filter((input) => {
          const element = document.querySelectorAll('input')[input.domIndex]
          return isVisible(element)
        })
    })
  }

  private async waitForDetailModalToReflectUpdate(
    page: Page,
    options: {
      nextName?: string
      nextPrice?: number
      nextPriceVariants?: PlatformMenuPriceVariantRecord[] | null
      timeoutMs?: number
    },
    stageTracker?: { current: string }
  ) {
    const variantTokens =
      options.nextPriceVariants?.flatMap((variant) => {
        const tokens: string[] = []
        const normalizedLabel = variant.variantLabel?.trim()
        if (normalizedLabel) {
          tokens.push(normalizedLabel)
        }

        for (const channel of variant.channels) {
          if (typeof channel.amount === 'number' && Number.isFinite(channel.amount)) {
            tokens.push(`${channel.amount.toLocaleString('ko-KR')}원`)
          }
        }

        return tokens
      }) ?? []
    const expectedTokens = [
      typeof options.nextName === 'string' && options.nextName.trim().length > 0
        ? options.nextName.trim()
        : null,
      typeof options.nextPrice === 'number' && Number.isFinite(options.nextPrice)
        ? `${options.nextPrice.toLocaleString('ko-KR')}원`
        : null
    ]
      .filter((value): value is string => Boolean(value))
      .concat(variantTokens)

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

  private async waitForCreateWizardAdvanceReady(
    page: Page,
    nameCheckState: { accepted: boolean | null; message: string | null }
  ) {
    const startedAt = Date.now()

    while (Date.now() - startedAt < 30000) {
      const advanceButton = await this.findVisibleCreateWizardAdvanceButton(page)
      if (advanceButton && (await this.isEnabled(advanceButton))) {
        return advanceButton
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

  private hasComparablePriceVariants(item: SyncPreviewItem) {
    return (item.previousPriceVariants?.length ?? 0) > 0 && (item.nextPriceVariants?.length ?? 0) > 0
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

  private async captureCreateWizardStep(
    inspection: PlatformInspectionReport,
    page: Page,
    title: string,
    detail: string
  ) {
    await this.capturePageStep(inspection, page, {
      kind: 'navigation',
      title,
      detail,
      fields: await this.readCreateWizardSurfaceFields(page)
    })
  }

  private async readCreateWizardSurfaceFields(page: Page): Promise<PlatformInspectionField[]> {
    return await page.evaluate(() => {
      const isVisible = (element: Element) => {
        if (!(element instanceof HTMLElement)) {
          return false
        }

        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      }

      const fields: Array<{ name: string; value: string; usage: 'control' }> = []
      const buttons = Array.from(document.querySelectorAll('button'))
        .filter(isVisible)
        .map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter((value) => value.length > 0)

      return {
        fields,
        buttons,
        inputs: Array.from(document.querySelectorAll('input'))
          .filter(isVisible)
          .map((input) => {
            const current = input as HTMLInputElement
            return {
              placeholder: current.placeholder?.trim() ?? '',
              value: current.value?.trim() ?? '',
              type: current.type
            }
          }),
        selects: Array.from(document.querySelectorAll('select'))
          .filter(isVisible)
          .map((select) => {
            const current = select as HTMLSelectElement
            const options = Array.from(current.options)
              .map((option) => option.textContent?.replace(/\s+/g, ' ').trim() ?? '')
              .filter((value) => value.length > 0)
              .slice(0, 8)
            return options.join(' / ')
          })
      }
    }).then(({ buttons, inputs, selects }) => {
      const fields: PlatformInspectionField[] = []

      prioritizeBaeminCreateWizardVisibleControlLabels(buttons).forEach((label, index) => {
        fields.push({ name: `button[${index}]`, value: label, usage: 'control' })
      })

      inputs.slice(0, 10).forEach((input, index) => {
        const parts = [input.placeholder || '(placeholder 없음)', input.value || '(값 없음)', input.type]
        fields.push({ name: `input[${index}]`, value: parts.join(' | '), usage: 'control' })
      })

      selects.slice(0, 5).forEach((value, index) => {
        fields.push({ name: `select[${index}]`, value, usage: 'control' })
      })

      return fields
    })
  }

  private async waitForCreateWizardNameInput(
    page: Page,
    preClickCreateWizardEntryState?: BaeminCreateWizardEntryState | null
  ) {
    const nameInput = page.getByPlaceholder('예) 국물떡볶이')

    try {
      await nameInput.waitFor({ timeout: 10000 })
      return nameInput
    } catch {
      const createWizardBlockReason = await this.detectCreateWizardBlockReason(
        page,
        preClickCreateWizardEntryState
      )
      if (createWizardBlockReason) {
        throw new Error(createWizardBlockReason)
      }

      const postClickCreateWizardEntryState = await this.inspectCreateWizardEntryState(page)
      throw new Error(
        `baemin_create_wizard_not_opened:${await this.describePage(page, {
          createWizardEntryState: {
            beforeClick: preClickCreateWizardEntryState ?? null,
            afterClick: postClickCreateWizardEntryState
          }
        })}`
      )
    }
  }

  private async selectCreateWizardMenuTypeIfVisible(page: Page) {
    const normalMenuOption = page.getByRole('option', { name: '일반메뉴', exact: true }).first()
    const chooserVisible = await normalMenuOption
      .waitFor({ state: 'visible', timeout: 1500 })
      .then(() => true)
      .catch(() => false)

    if (!chooserVisible) {
      return false
    }

    await normalMenuOption.click({ timeout: 5000 })
    await page.waitForTimeout(300)
    return true
  }

  private extractCreateWizardLimitMessage(visibleText: string) {
    const normalizedText = visibleText.replace(/\s+/g, ' ').trim()
    const directMatch = normalizedText.match(/메뉴는 .*?개 까지 추가할 수 있어요\.?/u)
    if (directMatch) {
      return directMatch[0]
    }

    return null
  }

  private async detectCreateWizardBlockReason(
    page: Page,
    preClickCreateWizardEntryState?: BaeminCreateWizardEntryState | null
  ) {
    const visibleText = await page.locator('body').innerText().catch(() => '')
    const directLimitMessage = this.extractCreateWizardLimitMessage(visibleText)
    if (directLimitMessage) {
      return `baemin_create_wizard_limit_reached:${directLimitMessage}`
    }

    const entryState = preClickCreateWizardEntryState ?? (await this.inspectCreateWizardEntryState(page))

    if (entryState?.bodyLimitMessage) {
      return `baemin_create_wizard_limit_reached:${entryState.bodyLimitMessage}`
    }

    if (entryState?.reactLimitBranchDetected) {
      return 'baemin_create_wizard_limit_reached:react_handler_menu_limit_detected'
    }

    if (
      entryState?.buttonFound &&
      (
        entryState.disabledAttribute !== null ||
        entryState.ariaDisabled === 'true' ||
        entryState.dataDisabled === 'true' ||
        entryState.hasDisabledLikeClass
      )
    ) {
      return `baemin_create_wizard_button_disabled:${JSON.stringify(entryState)}`
    }

    return null
  }

  private async inspectCreateWizardEntryState(page: Page): Promise<BaeminCreateWizardEntryState | null> {
    return await page
      .evaluate(() => {
        const normalize = (value: string | null | undefined) =>
          value?.replace(/\s+/g, ' ').trim() ?? ''
        const isVisible = (element: Element) => {
          if (!(element instanceof HTMLElement)) {
            return false
          }

          const style = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return (
            !element.hidden &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          )
        }

        const visibleButtons = Array.from(document.querySelectorAll('button'))
          .filter(isVisible)
          .map((button) => normalize(button.textContent))
          .filter((value) => value.length > 0)
          .slice(0, 10)

        const visibleInputs = Array.from(document.querySelectorAll('input'))
          .filter(isVisible)
          .map((input) => {
            const current = input as HTMLInputElement
            const placeholder = normalize(current.placeholder)
            const value = normalize(current.value)
            return [placeholder || '(placeholder 없음)', value || '(값 없음)', current.type].join(' | ')
          })
          .slice(0, 8)
        const visibleOverlays = Array.from(
          document.querySelectorAll(
            '[data-testid], [role=\"dialog\"], [role=\"menu\"], [role=\"listbox\"], [class*=\"Dropdown\"], [data-state=\"open\"]'
          )
        )
          .filter(isVisible)
          .map((element) => {
            const current = element as HTMLElement
            const parts = [
              current.tagName.toLowerCase(),
              current.getAttribute('role'),
              current.getAttribute('data-testid'),
              normalize(current.className),
              normalize(current.textContent).slice(0, 120)
            ].filter((value) => typeof value === 'string' && value.length > 0)
            return parts.join(' | ')
          })
          .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
          .slice(0, 8)

        const menuAddButtons = Array.from(document.querySelectorAll('button')).filter((button) =>
          normalize(button.textContent).includes('메뉴 추가')
        )
        const menuAddButton = menuAddButtons[0] as unknown as
          | (HTMLElement & Record<string, unknown>)
          | undefined

        let hasReactFiber = false
        let reactLimitBranchDetected = false
        const buttonRect = menuAddButton
          ? (() => {
              const rect = menuAddButton.getBoundingClientRect()
              return {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            })()
          : null
        const centerHitElement =
          menuAddButton && buttonRect
            ? document.elementFromPoint(
                buttonRect.x + Math.max(1, Math.round(buttonRect.width / 2)),
                buttonRect.y + Math.max(1, Math.round(buttonRect.height / 2))
              )
            : null
        if (menuAddButton) {
          const fiberKey = Object.keys(menuAddButton).find((key) => key.startsWith('__reactFiber$'))
          hasReactFiber = Boolean(fiberKey)
          let fiber = fiberKey ? (menuAddButton[fiberKey] as Record<string, unknown> | null) : null

          for (let depth = 0; depth < 12 && fiber; depth += 1) {
            const memoizedProps =
              typeof fiber.memoizedProps === 'object' && fiber.memoizedProps
                ? (fiber.memoizedProps as Record<string, unknown>)
                : null
            const onClickSource =
              typeof memoizedProps?.onClick === 'function'
                ? normalize(String(memoizedProps.onClick))
                : ''
            if (onClickSource.includes('메뉴는') && onClickSource.includes('추가할 수 있어요')) {
              reactLimitBranchDetected = true
              break
            }

            fiber =
              typeof fiber.return === 'object' && fiber.return
                ? (fiber.return as Record<string, unknown>)
                : null
          }
        }

        const bodyLimitMessage =
          normalize(document.body?.innerText ?? '').match(/메뉴는 .*?개 까지 추가할 수 있어요\.?/u)?.[0] ??
          null

        return {
          buttonFound: Boolean(menuAddButton),
          buttonCount: menuAddButtons.length,
          buttonText: normalize(menuAddButton?.textContent),
          ariaDisabled: menuAddButton?.getAttribute('aria-disabled') ?? null,
          disabledAttribute: menuAddButton?.getAttribute('disabled') ?? null,
          dataDisabled: menuAddButton?.getAttribute('data-disabled') ?? null,
          hasDisabledLikeClass: /disabled/i.test(normalize(menuAddButton?.className ? String(menuAddButton.className) : '')),
          buttonHtmlSnippet: menuAddButton ? normalize(menuAddButton.outerHTML).slice(0, 240) : null,
          buttonRect,
          centerHitTag: centerHitElement?.tagName?.toLowerCase() ?? null,
          centerHitText: normalize(centerHitElement?.textContent).slice(0, 120) || null,
          centerHitClassName: normalize(
            centerHitElement instanceof HTMLElement ? centerHitElement.className : ''
          ) || null,
          centerHitHtmlSnippet: centerHitElement instanceof HTMLElement
            ? normalize(centerHitElement.outerHTML).slice(0, 240)
            : null,
          centerHitOwnsButton: menuAddButton && centerHitElement
            ? centerHitElement === menuAddButton || menuAddButton.contains(centerHitElement)
            : null,
          visibleOverlays,
          hasReactFiber,
          reactLimitBranchDetected,
          bodyLimitMessage,
          visibleButtons,
          visibleInputs
        }
      })
      .catch(() => null)
  }

  private async findCreateWizardGroupSelect(page: Page) {
    const dialog = page.getByRole('dialog').first()
    await dialog.waitFor({ timeout: 10000 })
    const selectLocator = dialog.locator('select').first()
    await selectLocator.waitFor({ timeout: 10000 })
    return selectLocator
  }

  private async readCreateWizardGroupOptions(selectLocator: Locator) {
    return await selectLocator.evaluate((element) =>
      Array.from((element as HTMLSelectElement).options).map((option) => ({
        value: option.value ?? '',
        label: option.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      }))
    )
  }

  private async clickCreateWizardAdvanceButton(page: Page) {
    const advanceButton = await this.findVisibleCreateWizardAdvanceButton(page)
    if (!advanceButton) {
      throw new Error('baemin_create_wizard_advance_button_not_found')
    }

    await advanceButton.click()
  }

  private async findVisibleCreateWizardAdvanceButton(page: Page) {
    const visibleLabels = await this.readVisibleCreateWizardButtonLabels(page)
    const nextLabel = pickBaeminCreateWizardAdvanceButtonLabel(visibleLabels)
    if (!nextLabel) {
      return null
    }

    return page.getByRole('button', { name: nextLabel }).first()
  }

  private async readVisibleCreateWizardButtonLabels(page: Page) {
    return await page.evaluate(() => {
      const isVisible = (element: Element) => {
        if (!(element instanceof HTMLElement)) {
          return false
        }

        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      }

      return Array.from(document.querySelectorAll('button'))
        .filter(isVisible)
        .map((button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter((value) => value.length > 0)
    })
  }

  private async findCreateWizardPriceInput(page: Page) {
    const indexedInputs = await page.evaluate(() => {
      const isVisible = (element: Element) => {
        if (!(element instanceof HTMLElement)) {
          return false
        }

        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      }

      return Array.from(document.querySelectorAll('input'))
        .map((input, index) => {
          const current = input as HTMLInputElement
          return {
            index,
            placeholder: current.placeholder?.trim() ?? '',
            value: current.value?.trim() ?? '',
            type: current.type
          }
        })
        .filter((input) => {
          if (!isVisible(document.querySelectorAll('input')[input.index])) {
            return false
          }

          return input.placeholder !== '예) 국물떡볶이'
        })
    })

    const target = indexedInputs.find((input) => input.value === '0')
      ?? indexedInputs.find((input) => input.type === 'number')
      ?? indexedInputs[0]

    if (!target) {
      throw new Error('baemin_create_wizard_price_input_not_found')
    }

    return page.locator('input').nth(target.index)
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
