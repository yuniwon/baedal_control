import type { ManagedChromeSessionStatus } from '../../../shared/contracts'
import type { PlatformMenuSnapshot } from '../base/types'
import { parseDdangyoMenus } from './parser'
import { ddangyoSelectors } from './selectors'
import { dismissSafeNoticeDialogsInDocument } from '../../services/safe-notice-dialog-dismissal'
import { cleanCatalogCategoryName } from '../../../shared/catalog-normalization'

interface DdangyoManagedCatalogPreparation {
  groupCount: number
  ungrouped: { groupName: string; html: string } | null
}

interface DdangyoManagedCatalogGroup {
  groupName: string
  html: string
}

const buildDdangyoManagedCatalogPreparationExpression = () => {
  const selectors = JSON.stringify(ddangyoSelectors)
  return `
(async () => {
  const selectors = ${selectors}
  const dismissSafeNoticeDialogsInDocument = ${dismissSafeNoticeDialogsInDocument.toString()}
  const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim()
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
  const waitFor = async (selector, timeoutMs = 10000) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (document.querySelector(selector)) return true
      await delay(100)
    }
    return false
  }
  const findExactControl = (label) =>
    Array.from(document.querySelectorAll('a, button, [role="button"]')).find(
      (element) => normalizeText(element.textContent) === label
    )

  dismissSafeNoticeDialogsInDocument(document)

  const menuControl = findExactControl('메뉴관리')
  if (menuControl) {
    menuControl.click()
    await delay(200)
    dismissSafeNoticeDialogsInDocument(document)
  }

  let groupListReady = await waitFor(selectors.groupLink)
  if (!groupListReady) {
    const backButton = document.querySelector(selectors.groupListBackButton)
    if (backButton) {
      backButton.click()
      groupListReady = await waitFor(selectors.groupLink)
    }
  }

  if (!groupListReady) {
    if (!(await waitFor(selectors.menuList, 1000))) {
      throw new Error('ddangyo_managed_menu_page_not_ready')
    }
    return JSON.stringify({
      groupCount: 0,
      ungrouped: {
        groupName: normalizeText(document.querySelector(selectors.groupName)?.textContent),
        html: document.documentElement.outerHTML
      }
    })
  }

  return JSON.stringify({
    groupCount: document.querySelectorAll(selectors.groupLink).length,
    ungrouped: null
  })
})()
`.trim()
}

const buildDdangyoManagedCatalogGroupExpression = (
  groupIndex: number,
  returnToGroupList: boolean
) => {
  const selectors = JSON.stringify(ddangyoSelectors)
  return `
(async () => {
  const selectors = ${selectors}
  const dismissSafeNoticeDialogsInDocument = ${dismissSafeNoticeDialogsInDocument.toString()}
  const groupIndex = ${groupIndex}
  const returnToGroupList = ${JSON.stringify(returnToGroupList)}
  const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim()
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
  const waitFor = async (selector, timeoutMs = 10000) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (document.querySelector(selector)) return true
      await delay(100)
    }
    return false
  }
  dismissSafeNoticeDialogsInDocument(document)
  const links = Array.from(document.querySelectorAll(selectors.groupLink))
  const link = links[groupIndex]
  if (!link) throw new Error('ddangyo_managed_group_link_missing')
  const groupName = normalizeText(link.textContent)
  link.click()
  if (!(await waitFor(selectors.menuList))) {
    throw new Error('ddangyo_managed_group_menu_not_ready')
  }
  await delay(250)
  const result = {
    groupName:
      groupName || normalizeText(document.querySelector(selectors.groupName)?.textContent),
    html: document.documentElement.outerHTML
  }
  if (returnToGroupList) {
    const backButton = document.querySelector(selectors.groupListBackButton)
    if (!backButton) throw new Error('ddangyo_managed_group_back_missing')
    backButton.click()
    if (!(await waitFor(selectors.groupLink))) {
      throw new Error('ddangyo_managed_group_list_not_ready')
    }
  }
  return JSON.stringify(result)
})()
`.trim()
}

export class DdangyoManagedCatalogReader {
  constructor(
    private readonly sessionProbe: {
      inspect(): Promise<ManagedChromeSessionStatus> | ManagedChromeSessionStatus
    },
    private readonly scriptRunner: {
      evaluateJson<T>(tabId: string, expression: string): Promise<T>
    }
  ) {}

  async read(): Promise<PlatformMenuSnapshot[]> {
    const session = await this.sessionProbe.inspect()
    const tab = session.tabs.find((candidate) => candidate.platformCode === 'ddangyo')
    if (!tab) throw new Error('ddangyo_managed_tab_not_found')

    const preparation = await this.scriptRunner.evaluateJson<DdangyoManagedCatalogPreparation>(
      tab.tabId,
      buildDdangyoManagedCatalogPreparationExpression()
    )
    const groups: DdangyoManagedCatalogGroup[] = preparation.ungrouped
      ? [preparation.ungrouped]
      : []
    for (let groupIndex = 0; groupIndex < preparation.groupCount; groupIndex += 1) {
      groups.push(
        await this.scriptRunner.evaluateJson<DdangyoManagedCatalogGroup>(
          tab.tabId,
          buildDdangyoManagedCatalogGroupExpression(
            groupIndex,
            groupIndex < preparation.groupCount - 1
          )
        )
      )
    }
    const menus = groups.flatMap((group) =>
      parseDdangyoMenus(group.html, cleanCatalogCategoryName(group.groupName) || undefined)
    )
    const uniqueMenus = new Map<string, PlatformMenuSnapshot>()
    for (const menu of menus) {
      if (!uniqueMenus.has(menu.platformMenuId)) {
        uniqueMenus.set(menu.platformMenuId, menu)
      }
    }
    return [...uniqueMenus.values()]
  }
}
