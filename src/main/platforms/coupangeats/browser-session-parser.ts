import type {
  BrowserInspectionSnapshot,
  PlatformMenuPriceVariantRecord
} from '../../../shared/contracts'
import type {
  PlatformMenuSnapshot,
  PlatformOptionGroupSnapshot
} from '../base/types'

type MenuApiResponse = {
  data?: {
    menus?: Array<{
      menuId?: number
      menuName?: string
      exposeStatus?: string | null
      dishes?: Array<{
        dishId?: number
        dishName?: string
        salePrice?: number | null
        displayStatus?: string | null
        forceNotExpose?: boolean | null
      }>
    }>
  } | null
}

type OptionApiResponse = {
  data?:
    | Array<{
        optionId?: number
        optionName?: string
        minSelect?: number | null
        maxSelect?: number | null
        isMandatory?: boolean | null
        mappingDishCount?: number | null
        mappingDishes?: Array<{
          id?: number
          name?: string
        }>
        optionItems?: Array<{
          optionItemId?: number
          optionItemName?: string
          salePrice?: number | null
          displayStatus?: string | null
          forceNotExpose?: boolean | null
        }>
      }>
    | {
        options?: Array<{
          optionId?: number
          optionName?: string
          minSelect?: number | null
          maxSelect?: number | null
          isMandatory?: boolean | null
          mappingDishCount?: number | null
          mappingDishes?: Array<{
            id?: number
            name?: string
          }>
          optionItems?: Array<{
            optionItemId?: number
            optionItemName?: string
            salePrice?: number | null
            displayStatus?: string | null
            forceNotExpose?: boolean | null
          }>
        }>
      }
    | null
}

const toSnapshotArray = (value: BrowserInspectionSnapshot | BrowserInspectionSnapshot[]) =>
  Array.isArray(value) ? value : [value]

const parseJson = <T,>(value: string | null | undefined): T | null => {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const formatWon = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('ko-KR')}원` : null

const buildBasePriceVariants = (
  value: number | null | undefined
): PlatformMenuPriceVariantRecord[] => {
  const amountText = formatWon(value)
  if (!amountText || typeof value !== 'number' || !Number.isFinite(value)) {
    return []
  }

  return [
    {
      variantLabel: null,
      channels: [
        {
          channelCode: 'base',
          channelLabel: '기본가',
          amount: value,
          amountText
        }
      ]
    }
  ]
}

const normalizeStatus = (
  displayStatus?: string | null,
  forceNotExpose?: boolean | null
): string | null => {
  if (forceNotExpose) {
    return '숨김'
  }

  if (displayStatus === 'NOT_EXPOSE') {
    return '숨김'
  }

  if (displayStatus === 'ON_SALE') {
    return '판매중'
  }

  if (displayStatus === 'EXPOSE') {
    return '판매중'
  }

  if (displayStatus === 'SOLD_OUT_TODAY') {
    return '오늘만 품절'
  }

  if (displayStatus === 'SOLD_OUT' || displayStatus === 'OUT_OF_STOCK') {
    return '품절'
  }

  return displayStatus?.trim() || null
}

const findLatestParsedPayload = <T,>(
  snapshots: BrowserInspectionSnapshot[],
  matcher: (url: string) => boolean
) => {
  const candidates = [...snapshots]
    .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
    .flatMap((snapshot) =>
      snapshot.apiEvents
        .filter(
          (event) =>
            matcher(event.url) &&
            typeof event.responsePreview === 'string' &&
            event.responsePreview.trim().length > 0
        )
        .map((event) => ({
          capturedAt: snapshot.capturedAt,
          responsePreview: event.responsePreview as string
        }))
    )
    .sort((left, right) => {
      if (right.capturedAt !== left.capturedAt) {
        return right.capturedAt.localeCompare(left.capturedAt)
      }

      return right.responsePreview.length - left.responsePreview.length
    })

  for (const candidate of candidates) {
    const payload = parseJson<T>(candidate.responsePreview)
    if (payload) {
      return payload
    }
  }

  return null
}

const normalizeOptionGroups = (payload: OptionApiResponse | null) => {
  if (Array.isArray(payload?.data)) {
    return payload.data
  }

  if (payload?.data && typeof payload.data === 'object' && Array.isArray(payload.data.options)) {
    return payload.data.options
  }

  return []
}

export const parseCoupangEatsMenusFromBrowserSnapshot = (
  input: BrowserInspectionSnapshot | BrowserInspectionSnapshot[]
): PlatformMenuSnapshot[] => {
  const snapshots = toSnapshotArray(input)
  const payload = findLatestParsedPayload<MenuApiResponse>(
    snapshots,
    (url) => url.includes('/api/v1/merchant/web/stores/') && url.includes('/all-menu-dishes')
  )
  const menus = payload?.data?.menus

  if (!Array.isArray(menus)) {
    return []
  }

  return menus.flatMap((menu) => {
    const groupName = typeof menu.menuName === 'string' ? menu.menuName.trim() : ''
    const exposeStatus = menu.exposeStatus ?? null

    return (menu.dishes ?? []).flatMap((dish) => {
      const platformMenuId =
        typeof dish.dishId === 'number' && Number.isFinite(dish.dishId) ? String(dish.dishId) : ''
      const platformMenuName =
        typeof dish.dishName === 'string' ? dish.dishName.trim() : ''

      if (!platformMenuId || !platformMenuName) {
        return []
      }

      const currentPrice =
        typeof dish.salePrice === 'number' && Number.isFinite(dish.salePrice) ? dish.salePrice : 0
      const platformMenuStatus =
        normalizeStatus(dish.displayStatus ?? exposeStatus, dish.forceNotExpose) ?? null
      const platformMenuPriceVariants = buildBasePriceVariants(currentPrice)

      return [
        {
          platformMenuId,
          platformMenuName,
          currentPrice,
          platformMenuPriceCount: 1,
          ...(platformMenuPriceVariants.length > 0 ? { platformMenuPriceVariants } : {}),
          platformMenuGroupName: groupName || undefined,
          platformMenuStatus: platformMenuStatus ?? undefined,
          platformMenuPriceSummary: formatWon(currentPrice) ?? undefined
        }
      ]
    })
  })
}

export const parseCoupangEatsOptionGroupsFromBrowserSnapshot = (
  input: BrowserInspectionSnapshot | BrowserInspectionSnapshot[]
): PlatformOptionGroupSnapshot[] => {
  const snapshots = toSnapshotArray(input)
  const payload = findLatestParsedPayload<OptionApiResponse>(
    snapshots,
    (url) => url.includes('/api/v1/merchant/web/stores/') && url.includes('/all-options?fetchDish=true')
  )
  const optionGroups = normalizeOptionGroups(payload)

  if (!Array.isArray(optionGroups)) {
    return []
  }

  return optionGroups.flatMap((optionGroup) => {
    const optionGroupId =
      typeof optionGroup.optionId === 'number' && Number.isFinite(optionGroup.optionId)
        ? String(optionGroup.optionId)
        : ''
    const optionGroupName =
      typeof optionGroup.optionName === 'string' ? optionGroup.optionName.trim() : ''

    if (!optionGroupId || !optionGroupName) {
      return []
    }

    const minOrderQuantity =
      typeof optionGroup.minSelect === 'number' && Number.isFinite(optionGroup.minSelect)
        ? Math.max(optionGroup.minSelect, 0)
        : null
    const maxOrderQuantity =
      typeof optionGroup.maxSelect === 'number' && Number.isFinite(optionGroup.maxSelect)
        ? optionGroup.maxSelect >= 0
          ? optionGroup.maxSelect
          : null
        : null
    const menus = (optionGroup.mappingDishes ?? []).flatMap((dish) => {
      const platformMenuId =
        typeof dish.id === 'number' && Number.isFinite(dish.id) ? String(dish.id) : ''
      const platformMenuName = typeof dish.name === 'string' ? dish.name.trim() : ''

      if (!platformMenuName) {
        return []
      }

      return [
        {
          platformMenuId,
          platformMenuName,
          platformMenuGroupName: null
        }
      ]
    })
    const mappingMenusCount =
      menus.length > 0
        ? menus.length
        : typeof optionGroup.mappingDishCount === 'number' && Number.isFinite(optionGroup.mappingDishCount)
          ? Math.max(optionGroup.mappingDishCount, 0)
          : null

    return [
      {
        optionGroupId,
        optionGroupName,
        minOrderQuantity,
        maxOrderQuantity,
        mappingMenusCount,
        options: (optionGroup.optionItems ?? []).flatMap((item) => {
          const optionId =
            typeof item.optionItemId === 'number' && Number.isFinite(item.optionItemId)
              ? String(item.optionItemId)
              : ''
          const optionName = typeof item.optionItemName === 'string' ? item.optionItemName.trim() : ''

          if (!optionId || !optionName) {
            return []
          }

          return [
            {
              optionId,
              optionName,
              optionPrice:
                typeof item.salePrice === 'number' && Number.isFinite(item.salePrice)
                  ? item.salePrice
                  : null,
              itemStatus: normalizeStatus(item.displayStatus, item.forceNotExpose),
              restockedAt: null
            }
          ]
        }),
        menus
      }
    ]
  })
}
