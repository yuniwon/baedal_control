import { z } from 'zod'
import type { PlatformMenuPriceVariantRecord } from '../../../shared/contracts'
import type { PlatformMenuSnapshot } from '../base/types'

const baeminMenuPriceSchema = z.object({
  menuPriceName: z.string().nullable().optional(),
  minMenuPrice: z.number().nullable().optional(),
  maxMenuPrice: z.number().nullable().optional(),
  pickupMenuPrice: z.number().nullable().optional()
})

const baeminMenuStatusSchema = z
  .object({
    status: z.string().nullable().optional(),
    displayYn: z.boolean().nullable().optional()
  })
  .nullable()
  .optional()

const baeminUseShopSchema = z
  .object({
    menuGroupName: z.string().nullable().optional()
  })
  .passthrough()

const baeminMenuSchema = z.object({
  menuId: z.union([z.number(), z.string()]),
  menuName: z.string(),
  useShops: z.array(baeminUseShopSchema).default([]),
  menuStatusResponse: baeminMenuStatusSchema,
  menuPrices: z.array(baeminMenuPriceSchema).default([])
})

const baeminMenuPageSchema = z.object({
  data: z.object({
    content: z.array(baeminMenuSchema).default([]),
    last: z.boolean().optional(),
    number: z.number().optional(),
    size: z.number().optional(),
    totalPages: z.number().optional()
  })
})

export interface BaeminMenuRequestContext {
  ownerId: string
  page: number
  shopId: string
  size: number
}

export interface BaeminMenuPage {
  items: PlatformMenuSnapshot[]
  last: boolean
  page: number
  size: number
  totalPages: number
}

export const extractBaeminMenuRequestContext = (
  url: string
): BaeminMenuRequestContext | null => {
  const parsedUrl = new URL(url)
  const match = parsedUrl.pathname.match(/\/shop-owners\/([^/]+)\/menus\/one-shop$/)

  if (!match) {
    return null
  }

  const shopId = parsedUrl.searchParams.get('shopId')
  if (!shopId) {
    return null
  }

  return {
    ownerId: match[1],
    page: Number(parsedUrl.searchParams.get('page') ?? 0),
    shopId,
    size: Number(parsedUrl.searchParams.get('size') ?? 20)
  }
}

export const parseBaeminMenuPageResponse = (payload: unknown): BaeminMenuPage => {
  const parsed = baeminMenuPageSchema.parse(payload)

  return {
    items: parsed.data.content.map((menu) => {
      const platformMenuGroupName = menu.useShops[0]?.menuGroupName?.trim() || undefined
      const platformMenuBindingLabels = resolveBindingLabels(menu.useShops)
      const platformMenuStatus = resolveMenuStatus(menu.menuStatusResponse)
      const platformMenuPriceVariants = resolvePriceVariants(menu.menuPrices)
      const platformMenuPriceSummary = resolvePriceSummary(menu.menuPrices)

      return {
        platformMenuId: String(menu.menuId),
        platformMenuName: menu.menuName.trim(),
        currentPrice: resolveRepresentativePrice(menu.menuPrices),
        platformMenuPriceCount: menu.menuPrices.length,
        ...(platformMenuPriceVariants.length > 0 ? { platformMenuPriceVariants } : {}),
        ...(platformMenuGroupName ? { platformMenuGroupName } : {}),
        ...(platformMenuBindingLabels.length > 0 ? { platformMenuBindingLabels } : {}),
        ...(platformMenuStatus ? { platformMenuStatus } : {}),
        ...(platformMenuPriceSummary ? { platformMenuPriceSummary } : {})
      }
    }),
    last: parsed.data.last ?? false,
    page: parsed.data.number ?? 0,
    size: parsed.data.size ?? parsed.data.content.length,
    totalPages: parsed.data.totalPages ?? (parsed.data.content.length > 0 ? 1 : 0)
  }
}

const resolveRepresentativePrice = (
  prices: Array<z.infer<typeof baeminMenuPriceSchema>>
) => {
  const candidates = prices
    .flatMap((price) => [
      price.minMenuPrice ?? undefined,
      price.maxMenuPrice ?? undefined,
      price.pickupMenuPrice ?? undefined
    ])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (candidates.length === 0) {
    return 0
  }

  return Math.min(...candidates)
}

const resolveMenuStatus = (status: z.infer<typeof baeminMenuStatusSchema>) => {
  if (!status) {
    return undefined
  }

  const labels: string[] = []
  const normalizedStatus = status.status?.trim().toUpperCase()

  if (
    status.displayYn === false ||
    normalizedStatus === 'HIDE' ||
    normalizedStatus === 'HIDDEN'
  ) {
    labels.push('숨김')
  }

  if (normalizedStatus === 'SOLD_OUT' || normalizedStatus === 'SOLDOUT') {
    labels.push('품절')
  }

  if (
    labels.length === 0 &&
    (status.displayYn === true ||
      normalizedStatus === 'NORMAL' ||
      normalizedStatus === 'ACTIVE' ||
      normalizedStatus === 'ON_SALE' ||
      normalizedStatus === 'SALE')
  ) {
    labels.push('판매중')
  }

  return labels.length > 0 ? labels.join(' · ') : undefined
}

const resolvePriceSummary = (prices: Array<z.infer<typeof baeminMenuPriceSchema>>) => {
  const summaries = resolvePriceVariants(prices)
    .map((variant) => {
      const parts = variant.channels.map(
        (channel) => `${channel.channelLabel} ${channel.amountText}`
      )

      if (variant.variantLabel?.trim()) {
        parts.unshift(variant.variantLabel.trim())
      }

      return parts.join(' · ')
    })
    .filter((summary) => summary.length > 0)

  return summaries.length > 0 ? summaries.join(' / ') : undefined
}

const resolvePriceVariants = (
  prices: Array<z.infer<typeof baeminMenuPriceSchema>>
): PlatformMenuPriceVariantRecord[] =>
  prices
    .flatMap((price) => {
      const channels: PlatformMenuPriceVariantRecord['channels'] = []
      const deliveryAmount = pickRepresentativeAmount(price.minMenuPrice, price.maxMenuPrice)
      const deliveryText = formatPriceRange(price.minMenuPrice, price.maxMenuPrice)
      const pickupText = formatWon(price.pickupMenuPrice)

      if (deliveryText) {
        channels.push({
          channelCode: 'delivery',
          channelLabel: '배달',
          amount: deliveryAmount,
          amountText: deliveryText
        })
      }

      if (pickupText) {
        channels.push({
          channelCode: 'pickup',
          channelLabel: '픽업',
          amount: price.pickupMenuPrice ?? null,
          amountText: pickupText
        })
      }

      if (channels.length === 0) {
        return []
      }

      return [
        {
          ...(price.menuPriceName?.trim()
            ? { variantLabel: price.menuPriceName.trim() }
            : {}),
          channels
        } satisfies PlatformMenuPriceVariantRecord
      ]
    })

const resolveBindingLabels = (useShops: Array<z.infer<typeof baeminUseShopSchema>>) => {
  const labels = useShops
    .map((useShop) => formatBindingLabel(useShop))
    .filter((label): label is string => Boolean(label))

  return [...new Set(labels)]
}

const formatBindingLabel = (useShop: z.infer<typeof baeminUseShopSchema>) => {
  const serviceName = pickKnownValue(useShop, [
    'serviceTypeName',
    'deliveryTypeName',
    'deliveryServiceName',
    'serviceName',
    'serviceType',
    'bizTypeName',
    'useShopTypeName'
  ])
  const shopName = pickKnownValue(useShop, [
    'shopName',
    'shopDisplayName',
    'storeName',
    'restaurantName',
    'branchName',
    'bizName'
  ])

  if (serviceName && shopName) {
    return `[${serviceName}] ${shopName}`
  }

  if (shopName) {
    return shopName
  }

  if (serviceName) {
    return `[${serviceName}]`
  }

  const fallbackValues = Object.entries(useShop)
    .filter(([key]) => !['menuGroupName', 'id', 'shopId', 'ownerId'].includes(key))
    .map(([, value]) => normalizeBindingValue(value))
    .filter((value): value is string => Boolean(value))

  if (fallbackValues.length === 0) {
    return undefined
  }

  return [...new Set(fallbackValues)].join(' · ')
}

const pickKnownValue = (
  source: Record<string, unknown>,
  keys: string[]
) => {
  for (const key of keys) {
    const value = normalizeBindingValue(source[key])
    if (value) {
      return value
    }
  }

  return undefined
}

const normalizeBindingValue = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return undefined
  }

  if (/^(Y|N|true|false|null|undefined)$/i.test(normalized)) {
    return undefined
  }

  if (/^[0-9_-]+$/.test(normalized)) {
    return undefined
  }

  return normalized
}

const formatPriceRange = (minPrice?: number | null, maxPrice?: number | null) => {
  const minValue = formatWon(minPrice)
  const maxValue = formatWon(maxPrice)

  if (minValue && maxValue && minValue !== maxValue) {
    return `${minValue}~${maxValue}`
  }

  return minValue ?? maxValue
}

const formatWon = (price?: number | null) => {
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    return undefined
  }

  return `${price.toLocaleString('ko-KR')}원`
}

const pickRepresentativeAmount = (minPrice?: number | null, maxPrice?: number | null) => {
  if (
    typeof minPrice === 'number' &&
    Number.isFinite(minPrice) &&
    typeof maxPrice === 'number' &&
    Number.isFinite(maxPrice)
  ) {
    return minPrice === maxPrice ? minPrice : null
  }

  if (typeof minPrice === 'number' && Number.isFinite(minPrice)) {
    return minPrice
  }

  if (typeof maxPrice === 'number' && Number.isFinite(maxPrice)) {
    return maxPrice
  }

  return null
}
