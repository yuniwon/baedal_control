import type { ManagedChromeSessionStatus } from '../../../shared/contracts'
import type {
  PlatformMenuFetchResult,
  PlatformMenuSnapshot,
  PlatformOptionGroupSnapshot
} from '../base/types'
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

type DdangyoOptionRow = Record<string, unknown>

export interface DdangyoManagedOptionGroupRow extends DdangyoOptionRow {
  optn_grp_id: unknown
  optn_grp_nm: unknown
  optn_cnt?: unknown
  menu_nm?: unknown
}

export interface DdangyoManagedOptionGroupDetail {
  groupId: string
  rows: DdangyoOptionRow[]
}

interface DdangyoManagedOptionCapture {
  groups: DdangyoManagedOptionGroupRow[]
}

const normalizedName = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim()

const textValue = (value: unknown) =>
  typeof value === 'string' ? normalizedName(value) : value == null ? '' : String(value).trim()

const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.replaceAll(',', '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

const optionItemStatus = (row: DdangyoOptionRow) => {
  if (textValue(row.hide_yn) === '1') return '숨김'
  if (textValue(row.sldot_yn) === '1') return '품절'
  return '판매중'
}

export const buildDdangyoOptionGroupSnapshots = (
  menus: PlatformMenuSnapshot[],
  groups: DdangyoManagedOptionGroupRow[],
  details: DdangyoManagedOptionGroupDetail[]
): { optionGroups: PlatformOptionGroupSnapshot[]; issues: string[] } => {
  const issues: string[] = []
  const menusByName = new Map<string, PlatformMenuSnapshot[]>()
  for (const menu of menus) {
    const key = normalizedName(menu.platformMenuName)
    const matches = menusByName.get(key) ?? []
    matches.push(menu)
    menusByName.set(key, matches)
  }
  const detailByGroupId = new Map(details.map((detail) => [detail.groupId, detail.rows]))

  const optionGroups = groups.flatMap((group): PlatformOptionGroupSnapshot[] => {
    const optionGroupId = textValue(group.optn_grp_id)
    const optionGroupName = textValue(group.optn_grp_nm)
    if (!optionGroupId || !optionGroupName) return []

    const rows = detailByGroupId.get(optionGroupId) ?? []
    const declaredOptionCount = numberValue(group.optn_cnt)
    if (declaredOptionCount !== null && declaredOptionCount !== rows.length) {
      issues.push(
        `ddangyo_option_count_mismatch:${optionGroupId}:${rows.length}/${declaredOptionCount}`
      )
    }

    const menuNames = textValue(group.menu_nm)
      .split(',')
      .map((name) => normalizedName(name))
      .filter(Boolean)
    const mappedMenus = menuNames.flatMap((menuName) => {
      const matches = menusByName.get(menuName) ?? []
      if (matches.length === 0) {
        issues.push(`ddangyo_option_binding_missing:${optionGroupId}:${menuName}`)
        return []
      }
      if (matches.length > 1) {
        issues.push(`ddangyo_option_binding_ambiguous:${optionGroupId}:${menuName}`)
        return []
      }
      const menu = matches[0]
      return [
        {
          platformMenuId: menu.platformMenuId,
          platformMenuName: menu.platformMenuName,
          ...(menu.platformMenuGroupName
            ? { platformMenuGroupName: menu.platformMenuGroupName }
            : {})
        }
      ]
    })

    const firstRow = rows[0]
    return [
      {
        optionGroupId,
        optionGroupName,
        minOrderQuantity: firstRow ? numberValue(firstRow.min_optn_choice_cnt) : null,
        maxOrderQuantity: firstRow ? numberValue(firstRow.max_optn_choice_cnt) : null,
        mappingMenusCount: menuNames.length,
        menus: mappedMenus,
        options: rows.flatMap((row) => {
          const optionId = textValue(row.optn_id)
          const optionName = textValue(row.optn_nm)
          if (!optionId || !optionName) return []
          return [
            {
              optionId,
              optionName,
              optionPrice: numberValue(row.optn_unitprc),
              itemStatus: optionItemStatus(row),
              restockedAt:
                textValue(row.sldot_yn) === '1'
                  ? textValue(row.nx_sldot_end_dttm) || null
                  : null
            }
          ]
        })
      }
    ]
  })

  return { optionGroups, issues }
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

export const buildDdangyoManagedOptionCatalogExpression = () => `
(async () => {
  const normalizeText = (value) => String(value || '').normalize('NFKC').replace(/\\s+/g, ' ').trim()
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
  const findDataList = (suffix) => {
    const key = Object.keys(window).find((candidate) => {
      if (!candidate.endsWith(suffix)) return false
      const value = window[candidate]
      return value && typeof value.getRowCount === 'function' && typeof value.getRowJSON === 'function'
    })
    return key ? window[key] : null
  }
  const readRows = (dataList) =>
    Array.from({ length: dataList.getRowCount() }, (_, index) => dataList.getRowJSON(index))
  const findExactControl = (label) =>
    Array.from(document.querySelectorAll('a, button, input, span, [role="button"]')).find(
      (element) => {
        const text = element instanceof HTMLInputElement ? element.value : element.textContent
        const rect = element.getBoundingClientRect()
        return normalizeText(text) === label && rect.width > 0 && rect.height > 0
      }
    )
  const waitFor = async (probe, errorCode, timeoutMs = 10000) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const value = probe()
      if (value) return value
      await delay(100)
    }
    throw new Error(errorCode)
  }

  const optionControl = findExactControl('옵션편집')
  if (!optionControl) throw new Error('ddangyo_option_edit_control_missing')
  optionControl.click()
  const groupList = await waitFor(() => {
    const dataList = findDataList('_dma_optEdit')
    if (!dataList) return null
    if (dataList.getRowCount() > 0) {
      const firstGroup = document.querySelector('[id$="_gen_optionGrp_0_ibx_optnGrpNm"]')
      if (!firstGroup) return null
      const rect = firstGroup.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 ? dataList : null
    }
    const noData = Array.from(document.querySelectorAll('*')).some(
      (element) => {
        const rect = element.getBoundingClientRect()
        return (
          normalizeText(element.textContent) === '조회된 내역이 없습니다.' &&
          rect.width > 0 &&
          rect.height > 0
        )
      }
    )
    return noData ? dataList : null
  }, 'ddangyo_option_group_list_not_ready')

  return JSON.stringify({ groups: readRows(groupList) })
})()
`.trim()

const buildDdangyoManagedOptionGroupDetailExpression = (
  groupIndex: number,
  groupId: string,
  expectedOptionCount: number,
  returnToGroupList: boolean
) => `
(async () => {
  const groupIndex = ${groupIndex}
  const groupId = ${JSON.stringify(groupId)}
  const expectedOptionCount = ${expectedOptionCount}
  const returnToGroupList = ${JSON.stringify(returnToGroupList)}
  const normalizeText = (value) => String(value || '').normalize('NFKC').replace(/\\s+/g, ' ').trim()
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
  const findDataList = (suffix) => {
    const key = Object.keys(window).find((candidate) => {
      if (!candidate.endsWith(suffix)) return false
      const value = window[candidate]
      return value && typeof value.getRowCount === 'function' && typeof value.getRowJSON === 'function'
    })
    return key ? window[key] : null
  }
  const readRows = (dataList) =>
    Array.from({ length: dataList.getRowCount() }, (_, index) => dataList.getRowJSON(index))
  const findExactControl = (label) =>
    Array.from(document.querySelectorAll('a, button, input, span, [role="button"]')).find(
      (element) => {
        const text = element instanceof HTMLInputElement ? element.value : element.textContent
        const rect = element.getBoundingClientRect()
        return normalizeText(text) === label && rect.width > 0 && rect.height > 0
      }
    )
  const waitFor = async (probe, errorCode, timeoutMs = 10000) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const value = probe()
      if (value) return value
      await delay(100)
    }
    throw new Error(errorCode)
  }

  const groupControl = await waitFor(() => {
    const element = document.querySelector(
      '[id$="_gen_optionGrp_' + groupIndex + '_ibx_optnGrpNm"]'
    )
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 ? element : null
  }, 'ddangyo_option_group_control_missing:' + groupIndex)
  groupControl.click()

  const detail = await waitFor(() => {
    const optionList = findDataList('_dma_optionList')
    const parameterMapKey = Object.keys(window).find((candidate) => {
      if (!candidate.endsWith('_dma_para')) return false
      const value = window[candidate]
      return value && typeof value.get === 'function' && value.get('optn_grp_id') === groupId
    })
    if (!optionList || !parameterMapKey) return null
    if (optionList.getRowCount() !== expectedOptionCount) return null
    if (optionList.getRowCount() > 0) {
      const returnedGroupId = String(optionList.getCellData(0, 'optn_grp_id') || '').trim()
      if (returnedGroupId !== groupId) return null
    }
    return optionList
  }, 'ddangyo_option_detail_not_ready:' + groupId)

  const result = { groupId, rows: readRows(detail) }
  if (returnToGroupList) {
    const allGroupsControl = findExactControl('전체그룹')
    if (!allGroupsControl) throw new Error('ddangyo_all_option_groups_control_missing')
    allGroupsControl.click()
    await waitFor(() => {
      const element = document.querySelector(
        '[id$="_gen_optionGrp_' + groupIndex + '_ibx_optnGrpNm"]'
      )
      if (!element || !findDataList('_dma_optEdit')) return null
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 ? element : null
    }, 'ddangyo_option_group_list_return_not_ready')
  }
  return JSON.stringify(result)
})()
`.trim()

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

    return this.readMenusFromTab(tab.tabId)
  }

  async readCatalog(): Promise<PlatformMenuFetchResult> {
    const session = await this.sessionProbe.inspect()
    const tab = session.tabs.find((candidate) => candidate.platformCode === 'ddangyo')
    if (!tab) throw new Error('ddangyo_managed_tab_not_found')

    const menus = await this.readMenusFromTab(tab.tabId)
    const capture = await this.scriptRunner.evaluateJson<DdangyoManagedOptionCapture>(
      tab.tabId,
      buildDdangyoManagedOptionCatalogExpression()
    )
    const details: DdangyoManagedOptionGroupDetail[] = []
    for (let groupIndex = 0; groupIndex < capture.groups.length; groupIndex += 1) {
      const group = capture.groups[groupIndex]
      const groupId = textValue(group.optn_grp_id)
      if (!groupId) continue
      details.push(
        await this.scriptRunner.evaluateJson<DdangyoManagedOptionGroupDetail>(
          tab.tabId,
          buildDdangyoManagedOptionGroupDetailExpression(
            groupIndex,
            groupId,
            numberValue(group.optn_cnt) ?? 0,
            groupIndex < capture.groups.length - 1
          )
        )
      )
    }
    const { optionGroups, issues } = buildDdangyoOptionGroupSnapshots(
      menus,
      capture.groups,
      details
    )
    const optionIssues = issues.filter((issue) => issue.includes('option_count_mismatch'))
    const bindingIssues = issues.filter((issue) => issue.includes('option_binding_'))

    return {
      menus,
      optionGroups,
      optionCatalogFetched: true,
      rawMenuCount: menus.length,
      fetchMode: 'managed_browser',
      completeness: {
        menuCatalog: 'complete',
        optionCatalog: optionIssues.length === 0 ? 'complete' : 'incomplete',
        optionBindings: bindingIssues.length === 0 ? 'complete' : 'incomplete',
        collectedMenuCount: menus.length,
        expectedMenuCount: menus.length,
        collectedOptionGroupCount: optionGroups.length,
        expectedOptionGroupCount: capture.groups.length,
        issues
      }
    }
  }

  private async readMenusFromTab(tabId: string): Promise<PlatformMenuSnapshot[]> {

    const preparation = await this.scriptRunner.evaluateJson<DdangyoManagedCatalogPreparation>(
      tabId,
      buildDdangyoManagedCatalogPreparationExpression()
    )
    const groups: DdangyoManagedCatalogGroup[] = preparation.ungrouped
      ? [preparation.ungrouped]
      : []
    for (let groupIndex = 0; groupIndex < preparation.groupCount; groupIndex += 1) {
      groups.push(
        await this.scriptRunner.evaluateJson<DdangyoManagedCatalogGroup>(
          tabId,
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
