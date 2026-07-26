import type { BrowserInspectionApiEvent } from '../../../shared/contracts'

type JsonRecord = Record<string, unknown>

export interface DeliverySpecialCatalogCapturePayload {
  saleMenus: unknown[]
  saleMenuTotal: number
  categories: unknown[]
  categoryMenus: unknown[]
  menuDetails: unknown[]
}

interface BuildDeliverySpecialCatalogApiEventsInput {
  capturedAt: string
  payload: DeliverySpecialCatalogCapturePayload
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asRecords = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const identifier = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.replaceAll(',', '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

const isActiveSaleMenu = (menu: JsonRecord) =>
  (text(menu.saleStatus)?.toUpperCase() ?? '') === 'SALE'

const displayStatus = (value: JsonRecord) =>
  value.displayFlag === 'N' || value.useFlag === 'N' ? 'HIDDEN' : 'ACTIVE'

export const extractDeliverySpecialMainMenuFromHtml = (html: string): unknown => {
  const marker = 'var mainMenu ='
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) return null

  const start = html.indexOf('{', markerIndex + marker.length)
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return JSON.parse(html.slice(start, index + 1)) as unknown
    }
  }

  return null
}

export const buildDeliverySpecialCatalogCaptureExpression = () => {
  const extractMainMenuSource = extractDeliverySpecialMainMenuFromHtml.toString()

  return `
(async () => {
  const extractMainMenu = ${extractMainMenuSource}
  const shopId = document.querySelector('#shopId')?.value
  const brandId = document.querySelector('#brandId')?.value ?? ''
  if (!shopId) throw new Error('deliveryspecial_shop_id_missing')

  const readJson = async (path, params) => {
    const url = path + '?' + new URLSearchParams(params)
    const response = await fetch(url, { method: 'GET', credentials: 'include' })
    if (!response.ok) throw new Error('deliveryspecial_catalog_http_' + response.status + ':' + path)
    return response.json()
  }

  const [saleMenuResponse, categoryResponse] = await Promise.all([
    readJson('/api/saleMenu/list', {
      shopId,
      brandId,
      saleStatus: 'SALE',
      searchType: 'PRODUCT_NAME',
      searchText: '',
      length: '1000',
      start: '0'
    }),
    readJson('/api/menuBoard/categories', { shopId, brandId, saleStatus: 'SALE' })
  ])

  const saleMenus = Array.isArray(saleMenuResponse.data) ? saleMenuResponse.data : []
  const categories = Array.isArray(categoryResponse.data) ? categoryResponse.data : []
  const categoryResponses = await Promise.all(
    categories.map((category) =>
      readJson('/api/menuBoard/menus', {
        shopId,
        brandId,
        saleStatus: 'SALE',
        categoryId: String(category.categoryId ?? '')
      })
    )
  )
  const categoryMenus = categoryResponses.flatMap((response) =>
    Array.isArray(response.data) ? response.data : []
  )

  const detailIds = [...new Set(
    saleMenus
      .filter((menu) => String(menu.saleStatus ?? '').toUpperCase() === 'SALE')
      .map((menu) => String(menu.treeId ?? ''))
      .filter(Boolean)
  )]
  const menuDetails = []

  for (let index = 0; index < detailIds.length; index += 6) {
    const batch = detailIds.slice(index, index + 6)
    const details = await Promise.all(
      batch.map(async (treeId) => {
        const response = await fetch('/product/saleMenu/detail', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({ treeId })
        })
        if (!response.ok) {
          throw new Error('deliveryspecial_detail_http_' + response.status + ':' + treeId)
        }
        const detail = extractMainMenu(await response.text())
        if (!detail) throw new Error('deliveryspecial_detail_payload_missing:' + treeId)
        return detail
      })
    )
    menuDetails.push(...details)
  }

  return JSON.stringify({
    saleMenus,
    saleMenuTotal:
      typeof saleMenuResponse.recordsTotal === 'number'
        ? saleMenuResponse.recordsTotal
        : saleMenus.length,
    categories,
    categoryMenus,
    menuDetails
  })
})()
`.trim()
}

export const buildDeliverySpecialCatalogApiEvents = ({
  capturedAt,
  payload
}: BuildDeliverySpecialCatalogApiEventsInput): BrowserInspectionApiEvent[] => {
  const saleMenus = asRecords(payload.saleMenus).filter(isActiveSaleMenu)
  if (saleMenus.length !== payload.saleMenuTotal) {
    throw new Error(
      `deliveryspecial_menu_collection_incomplete:${saleMenus.length}/${payload.saleMenuTotal}`
    )
  }

  const categories = asRecords(payload.categories)
  const categoryMenus = asRecords(payload.categoryMenus)
  for (const category of categories) {
    const categoryId = identifier(category.categoryId)
    const expectedCount = numberValue(category.countOfSaleMenu)
    if (!categoryId || expectedCount === null) continue
    const collectedCount = categoryMenus.filter(
      (menu) => identifier(menu.categoryId) === categoryId
    ).length
    if (collectedCount !== expectedCount) {
      throw new Error(
        `deliveryspecial_category_collection_incomplete:${categoryId}:${collectedCount}/${expectedCount}`
      )
    }
  }

  const detailsByMenuId = new Map<string, JsonRecord>()
  for (const detail of asRecords(payload.menuDetails)) {
    const rootMenu = isRecord(detail.menu) ? detail.menu : null
    const menuId = rootMenu ? identifier(rootMenu.treeId) : null
    if (menuId) detailsByMenuId.set(menuId, detail)
  }

  for (const saleMenu of saleMenus) {
    const menuId = identifier(saleMenu.treeId)
    if (menuId && !detailsByMenuId.has(menuId)) {
      throw new Error(`deliveryspecial_option_detail_missing:${menuId}`)
    }
  }

  const categoryById = new Map(
    categories.flatMap((category) => {
      const categoryId = identifier(category.categoryId)
      return categoryId ? [[categoryId, category] as const] : []
    })
  )
  const membershipsByMenuId = new Map<string, JsonRecord[]>()
  for (const membership of categoryMenus) {
    const menuId = identifier(membership.treeId ?? membership.menuId)
    if (!menuId) continue
    const memberships = membershipsByMenuId.get(menuId) ?? []
    memberships.push(membership)
    membershipsByMenuId.set(menuId, memberships)
  }

  const menuGroupName = (menuId: string, detail?: JsonRecord) => {
    const rootMenu = detail && isRecord(detail.menu) ? detail.menu : null
    const detailCategory = rootMenu ? text(rootMenu.categoryName) : null
    if (detailCategory && detailCategory.toUpperCase() !== 'SAMPLE') return detailCategory

    const memberships = membershipsByMenuId.get(menuId) ?? []
    const ordered = [...memberships].sort((left, right) => {
      const leftCategory = categoryById.get(identifier(left.categoryId) ?? '')
      const rightCategory = categoryById.get(identifier(right.categoryId) ?? '')
      return (numberValue(leftCategory?.ordinal) ?? 0) - (numberValue(rightCategory?.ordinal) ?? 0)
    })
    const preferred =
      ordered.find((membership) => {
        const category = categoryById.get(identifier(membership.categoryId) ?? '')
        return text(category?.eventType) !== 'ET04'
      }) ?? ordered[0]
    return preferred ? text(preferred.categoryName) : null
  }

  const menus = saleMenus.flatMap((saleMenu) => {
    const menuId = identifier(saleMenu.treeId)
    const menuName = text(saleMenu.simpleName)
    if (!menuId || !menuName) return []
    const detail = detailsByMenuId.get(menuId)
    const groupName = menuGroupName(menuId, detail)
    const price = numberValue(saleMenu.amount)
    return [
      {
        menuId,
        menuName,
        ...(price === null ? {} : { salePrice: price }),
        displayStatus: displayStatus(saleMenu),
        ...(groupName ? { menuGroupName: groupName } : {})
      }
    ]
  })

  const optionGroupsById = new Map<
    string,
    {
      optionGroupId: string
      optionGroupName: string
      minOrderQuantity: number | null
      maxOrderQuantity: number | null
      mappingMenus: Map<string, { menuId: string; menuName: string; menuGroupName?: string }>
      optionItems: Map<
        string,
        {
          optionItemId: string
          optionItemName: string
          optionPrice?: number
          displayStatus: string
        }
      >
    }
  >()

  for (const saleMenu of saleMenus) {
    const menuId = identifier(saleMenu.treeId)
    const menuName = text(saleMenu.simpleName)
    if (!menuId || !menuName) continue
    const detail = detailsByMenuId.get(menuId)
    if (!detail) continue
    const groupName = menuGroupName(menuId, detail)

    for (const group of asRecords(detail.options)) {
      const groupMenu = isRecord(group.menu) ? group.menu : null
      if (!groupMenu || text(group.levelType)?.toUpperCase() !== 'GROUP') continue
      const optionGroupId = identifier(groupMenu.optionGroupCode ?? groupMenu.treeId)
      const optionGroupName = text(groupMenu.simpleName)
      if (!optionGroupId || !optionGroupName) continue

      const existing = optionGroupsById.get(optionGroupId) ?? {
        optionGroupId,
        optionGroupName,
        minOrderQuantity: numberValue(groupMenu.minQuantity),
        maxOrderQuantity: numberValue(groupMenu.maxQuantity),
        mappingMenus: new Map(),
        optionItems: new Map()
      }
      existing.mappingMenus.set(menuId, {
        menuId,
        menuName,
        ...(groupName ? { menuGroupName: groupName } : {})
      })

      for (const option of asRecords(group.options)) {
        const optionMenu = isRecord(option.menu) ? option.menu : null
        if (!optionMenu || text(option.levelType)?.toUpperCase() !== 'MENU') continue
        const optionItemId = identifier(
          optionMenu.productId ?? optionMenu.posMenuCode ?? optionMenu.treeId
        )
        const optionItemName = text(optionMenu.simpleName)
        if (!optionItemId || !optionItemName) continue
        const optionPrice = numberValue(optionMenu.amount)
        existing.optionItems.set(optionItemId, {
          optionItemId,
          optionItemName,
          ...(optionPrice === null ? {} : { optionPrice }),
          displayStatus: displayStatus(optionMenu)
        })
      }

      optionGroupsById.set(optionGroupId, existing)
    }
  }

  const optionGroups = [...optionGroupsById.values()].map((group) => ({
    optionGroupId: group.optionGroupId,
    optionGroupName: group.optionGroupName,
    ...(group.minOrderQuantity === null ? {} : { minOrderQuantity: group.minOrderQuantity }),
    ...(group.maxOrderQuantity === null ? {} : { maxOrderQuantity: group.maxOrderQuantity }),
    mappingMenusCount: group.mappingMenus.size,
    mappingMenus: [...group.mappingMenus.values()],
    optionItems: [...group.optionItems.values()]
  }))

  return [
    {
      url: 'https://partner.payco.kr/api/saleMenu/list?scope=complete',
      method: 'GET',
      status: 200,
      capturedAt,
      responsePreview: JSON.stringify({
        menus,
        totalCount: menus.length,
        collectionComplete: true,
        sourceSaleMenuCount: saleMenus.length,
        sourceCategoryRowCount: categoryMenus.length
      })
    },
    {
      url: 'https://partner.payco.kr/product/saleMenu/detail?scope=complete-options',
      method: 'POST',
      status: 200,
      capturedAt,
      responsePreview: JSON.stringify({
        optionGroups,
        totalCount: optionGroups.length,
        collectionComplete: true,
        sourceDetailCount: detailsByMenuId.size
      })
    }
  ]
}
