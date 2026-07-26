import type { BrowserInspectionApiEvent } from '../../../shared/contracts'

type JsonRecord = Record<string, unknown>

interface BuildYogiyoCatalogApiEventsInput {
  capturedAt: string
  menuUrl: string
  optionUrl: string
  menuPages: unknown[]
  optionPages: unknown[]
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

const booleanValue = (value: unknown) => value === true

const pageData = (page: unknown): JsonRecord[] =>
  isRecord(page) ? asRecords(page.data) : []

const assertTerminated = (pages: unknown[], collection: 'menu' | 'option') => {
  if (pages.length === 0 || pageData(pages[pages.length - 1]).length > 0) {
    throw new Error(`yogiyo_${collection}_pagination_incomplete`)
  }
}

const normalizedName = (value: string) => value.normalize('NFKC').trim().toLowerCase()

const mergeYogiyoOptionFragments = (pages: unknown[]) => {
  const groupsById = new Map<string, JsonRecord>()

  for (const page of pages) {
    for (const group of pageData(page)) {
      const optionGroupId = identifier(group.vendor_option_section_id)
      if (!optionGroupId) continue

      const existing = groupsById.get(optionGroupId)
      if (!existing) {
        groupsById.set(optionGroupId, {
          ...group,
          options: asRecords(group.options),
          products: asRecords(group.products)
        })
        continue
      }

      const optionsById = new Map<string, JsonRecord>()
      for (const option of [...asRecords(existing.options), ...asRecords(group.options)]) {
        const optionId = identifier(option.vendor_option_id)
        if (optionId) optionsById.set(optionId, option)
      }

      const productsByName = new Map<string, JsonRecord>()
      for (const product of [...asRecords(existing.products), ...asRecords(group.products)]) {
        const productName = text(product.name)
        if (productName) productsByName.set(normalizedName(productName), product)
      }

      groupsById.set(optionGroupId, {
        ...existing,
        ...group,
        options: [...optionsById.values()],
        products: [...productsByName.values()]
      })
    }
  }

  return [...groupsById.values()]
}

export const countYogiyoPageEntities = (page: unknown, collection: 'menu' | 'option') => {
  const data = pageData(page)
  if (collection === 'option') return data.length
  return data.reduce((count, category) => count + asRecords(category.products).length, 0)
}

export const readYogiyoPageCursor = (page: unknown): string | null => {
  if (!isRecord(page) || !isRecord(page.page)) return null
  return text(page.page.cursor)
}

export const buildYogiyoCatalogApiEvents = ({
  capturedAt,
  menuUrl,
  optionUrl,
  menuPages,
  optionPages
}: BuildYogiyoCatalogApiEventsInput): BrowserInspectionApiEvent[] => {
  assertTerminated(menuPages, 'menu')
  assertTerminated(optionPages, 'option')

  const menus = menuPages.flatMap((page) =>
    pageData(page).flatMap((category) => {
      const menuGroupName = text(category.name)
      return asRecords(category.products).flatMap((product) => {
        const menuId = identifier(product.vendor_product_id)
        const menuName = text(product.name)
        if (!menuId || !menuName) return []

        return [
          {
            menuId,
            menuName,
            salePrice: numberValue(product.price),
            displayStatus: booleanValue(product.invisible) ? 'HIDDEN' : 'ACTIVE',
            ...(menuGroupName ? { menuGroupName } : {})
          }
        ]
      })
    })
  )

  const menusByName = new Map<
    string,
    Array<{ menuId: string; menuName: string; menuGroupName?: string }>
  >()
  for (const menu of menus) {
    const key = normalizedName(menu.menuName)
    const matches = menusByName.get(key) ?? []
    matches.push({
      menuId: menu.menuId,
      menuName: menu.menuName,
      ...(menu.menuGroupName ? { menuGroupName: menu.menuGroupName } : {})
    })
    menusByName.set(key, matches)
  }

  const optionGroups = mergeYogiyoOptionFragments(optionPages).flatMap((group) => {
      const optionGroupId = identifier(group.vendor_option_section_id)
      const optionGroupName = text(group.name)
      if (!optionGroupId || !optionGroupName) return []

      const rawOptions = asRecords(group.options)
      const rawProducts = asRecords(group.products)
      const multiple = booleanValue(group.multiple)
      const selectionCount = numberValue(group.multiple_count)
      const mandatory = booleanValue(group.mandatory)

      return [
        {
          optionGroupId,
          optionGroupName,
          minOrderQuantity: mandatory ? (multiple ? (selectionCount ?? 1) : 1) : 0,
          maxOrderQuantity: multiple ? (selectionCount ?? rawOptions.length) : 1,
          mappingMenusCount: rawProducts.length,
          mappingMenus: rawProducts.flatMap((product) => {
            const menuName = text(product.name)
            if (!menuName) return []
            const matches = menusByName.get(normalizedName(menuName)) ?? []
            const match = matches.length === 1 ? matches[0] : null
            return [
              {
                menuId: match?.menuId ?? `name:${encodeURIComponent(normalizedName(menuName))}`,
                menuName,
                ...(match?.menuGroupName ? { menuGroupName: match.menuGroupName } : {})
              }
            ]
          }),
          optionItems: rawOptions.flatMap((option) => {
            const optionItemId = identifier(option.vendor_option_id)
            const optionItemName = text(option.name)
            if (!optionItemId || !optionItemName) return []
            return [
              {
                optionItemId,
                optionItemName,
                optionPrice: numberValue(option.price),
                displayStatus: booleanValue(option.invisible) ? 'HIDDEN' : 'ACTIVE'
              }
            ]
          })
        }
      ]
    })

  return [
    {
      url: menuUrl,
      method: 'GET',
      status: 200,
      capturedAt,
      responsePreview: JSON.stringify({
        menus,
        totalCount: menus.length,
        collectionComplete: true,
        sourcePageCount: menuPages.length
      })
    },
    {
      url: optionUrl,
      method: 'GET',
      status: 200,
      capturedAt,
      responsePreview: JSON.stringify({
        optionGroups,
        totalCount: optionGroups.length,
        collectionComplete: true,
        sourcePageCount: optionPages.length
      })
    }
  ]
}
