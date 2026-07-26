import type { BrowserInspectionApiEvent } from '../../../shared/contracts'
import type { PlatformMenuSnapshot, PlatformOptionGroupSnapshot } from '../base/types'

interface BrowserCatalogApiParseResult {
  menus: PlatformMenuSnapshot[]
  optionGroups: PlatformOptionGroupSnapshot[]
  issues: string[]
  parsedResponseCount: number
}

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const firstValue = (record: JsonRecord, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key]
    }
  }
  return undefined
}

const toIdentifier = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return undefined
}

const toText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.replaceAll(',', '').trim()
    if (normalized && /^-?\d+(?:\.\d+)?$/.test(normalized)) {
      const parsed = Number(normalized)
      return Number.isFinite(parsed) ? parsed : undefined
    }
  }
  return undefined
}

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return undefined
}

const normalizeStatus = (status: unknown, forceNotExpose?: unknown): string | undefined => {
  if (toBoolean(forceNotExpose)) return '숨김'

  const text = toText(status)
  if (!text) return undefined

  const normalized = text.toUpperCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (
    ['ON_SALE', 'SALE', 'NORMAL', 'ACTIVE', 'EXPOSE', 'DISPLAY', 'VISIBLE'].includes(normalized)
  ) {
    return '판매중'
  }
  if (['SOLD_OUT', 'SOLDOUT', 'OUT_OF_STOCK', 'PAUSE'].includes(normalized)) {
    return '품절'
  }
  if (
    ['NOT_EXPOSE', 'HIDE', 'HIDDEN', 'INACTIVE', 'NOT_DISPLAY', 'INVISIBLE'].includes(normalized)
  ) {
    return '숨김'
  }
  return text
}

const visitRecords = (value: unknown, visitor: (record: JsonRecord) => void): void => {
  if (Array.isArray(value)) {
    for (const item of value) visitRecords(item, visitor)
    return
  }
  if (!isRecord(value)) return

  visitor(value)
  for (const child of Object.values(value)) {
    visitRecords(child, visitor)
  }
}

const parseMenu = (record: JsonRecord): PlatformMenuSnapshot | null => {
  const platformMenuId = toIdentifier(
    firstValue(record, ['menuId', 'dishId', 'menuItemId', 'productId'])
  )
  const platformMenuName = toText(
    firstValue(record, ['menuName', 'dishName', 'menuItemName', 'productName'])
  )
  if (!platformMenuId || !platformMenuName) return null

  const currentPrice = toNumber(
    firstValue(record, ['salePrice', 'menuPrice', 'dishPrice', 'productPrice', 'price', 'amount'])
  )
  const platformMenuStatus = normalizeStatus(
    firstValue(record, ['displayStatus', 'saleStatus', 'exposeStatus', 'status']),
    firstValue(record, ['forceNotExpose', 'hidden'])
  )
  const platformMenuGroupName = toText(
    firstValue(record, ['menuGroupName', 'dishGroupName', 'categoryName', 'groupName'])
  )

  return {
    platformMenuId,
    platformMenuName,
    ...(currentPrice === undefined ? {} : { currentPrice }),
    ...(platformMenuStatus ? { platformMenuStatus } : {}),
    ...(platformMenuGroupName ? { platformMenuGroupName } : {})
  }
}

const parseOptionGroup = (record: JsonRecord): PlatformOptionGroupSnapshot | null => {
  const rawItems = firstValue(record, ['optionItems', 'optionItemList', 'options'])
  if (!Array.isArray(rawItems)) return null

  const optionGroupId = toIdentifier(
    firstValue(record, ['optionGroupId', 'optionId', 'groupId', 'id'])
  )
  const optionGroupName = toText(
    firstValue(record, ['optionGroupName', 'optionName', 'groupName', 'name'])
  )
  if (!optionGroupId || !optionGroupName) return null

  const options = rawItems.flatMap((item) => {
    if (!isRecord(item)) return []
    const optionId = toIdentifier(
      firstValue(item, ['optionItemId', 'itemId', 'optionId', 'id'])
    )
    const optionName = toText(
      firstValue(item, ['optionItemName', 'itemName', 'optionName', 'name'])
    )
    if (!optionId || !optionName) return []

    const optionPrice = toNumber(
      firstValue(item, ['salePrice', 'optionPrice', 'additionalPrice', 'price', 'amount'])
    )
    const itemStatus = normalizeStatus(
      firstValue(item, ['displayStatus', 'saleStatus', 'exposeStatus', 'status']),
      firstValue(item, ['forceNotExpose', 'hidden'])
    )
    return [
      {
        optionId,
        optionName,
        ...(optionPrice === undefined ? {} : { optionPrice }),
        ...(itemStatus ? { itemStatus } : {})
      }
    ]
  })

  const rawMenus = firstValue(record, [
    'mappingDishes',
    'mappingMenus',
    'mappedMenus',
    'dishes',
    'menus'
  ])
  const menus = (Array.isArray(rawMenus) ? rawMenus : []).flatMap((menu) => {
    if (!isRecord(menu)) return []
    const platformMenuId = toIdentifier(
      firstValue(menu, ['menuId', 'dishId', 'menuItemId', 'productId', 'id'])
    )
    const platformMenuName = toText(
      firstValue(menu, ['menuName', 'dishName', 'menuItemName', 'productName', 'name'])
    )
    if (!platformMenuId || !platformMenuName) return []
    const platformMenuGroupName = toText(
      firstValue(menu, ['menuGroupName', 'dishGroupName', 'categoryName', 'groupName'])
    )
    return [
      {
        platformMenuId,
        platformMenuName,
        ...(platformMenuGroupName ? { platformMenuGroupName } : {})
      }
    ]
  })

  const mappingMenusCount = toNumber(
    firstValue(record, [
      'mappingMenusCount',
      'mappingMenuCount',
      'mappingDishCount',
      'mappedMenuCount'
    ])
  )
  const minOrderQuantity = toNumber(
    firstValue(record, ['minOrderQuantity', 'minSelect', 'minSelection', 'minimum'])
  )
  const maxOrderQuantity = toNumber(
    firstValue(record, ['maxOrderQuantity', 'maxSelect', 'maxSelection', 'maximum'])
  )

  return {
    optionGroupId,
    optionGroupName,
    ...(minOrderQuantity === undefined ? {} : { minOrderQuantity }),
    ...(maxOrderQuantity === undefined ? {} : { maxOrderQuantity }),
    ...(mappingMenusCount === undefined ? {} : { mappingMenusCount }),
    options,
    menus
  }
}

const richness = (value: PlatformMenuSnapshot | PlatformOptionGroupSnapshot): number =>
  JSON.stringify(value).length

export const parseBrowserCatalogApiEvents = (
  events: BrowserInspectionApiEvent[]
): BrowserCatalogApiParseResult => {
  const menuById = new Map<string, PlatformMenuSnapshot>()
  const optionGroupById = new Map<string, PlatformOptionGroupSnapshot>()
  const issues: string[] = []
  const seenResponses = new Set<string>()
  let parsedResponseCount = 0

  for (const event of events) {
    const responsePreview = event.responsePreview?.trim()
    if (!responsePreview) continue

    const responseKey = `${event.url}\n${responsePreview}`
    if (seenResponses.has(responseKey)) continue
    seenResponses.add(responseKey)

    let payload: unknown
    try {
      payload = JSON.parse(responsePreview)
      parsedResponseCount += 1
    } catch {
      issues.push(`api_response_invalid_json:${event.url}`)
      continue
    }

    visitRecords(payload, (record) => {
      const menu = parseMenu(record)
      if (menu) {
        const existing = menuById.get(menu.platformMenuId)
        if (!existing || richness(menu) > richness(existing)) {
          menuById.set(menu.platformMenuId, menu)
        }
      }

      const optionGroup = parseOptionGroup(record)
      if (optionGroup) {
        const existing = optionGroupById.get(optionGroup.optionGroupId)
        if (!existing || richness(optionGroup) > richness(existing)) {
          optionGroupById.set(optionGroup.optionGroupId, optionGroup)
        }
      }
    })
  }

  return {
    menus: [...menuById.values()],
    optionGroups: [...optionGroupById.values()],
    issues: [...new Set(issues)],
    parsedResponseCount
  }
}
