import { z } from 'zod'

const baeminOptionSchema = z.object({
  optionId: z.union([z.number(), z.string()]),
  optionName: z.string(),
  optionPrice: z.number().nullable().optional(),
  itemStatus: z.string().nullable().optional(),
  restockedAt: z.string().nullable().optional()
})

const baeminOptionMenuUseShopSchema = z
  .object({
    menuGroupName: z.string().nullable().optional()
  })
  .passthrough()

const baeminOptionMenuSchema = z.object({
  menuId: z.union([z.number(), z.string()]),
  menuName: z.string(),
  useShops: z.array(baeminOptionMenuUseShopSchema).default([])
})

const baeminOptionGroupSchema = z.object({
  optionGroupId: z.union([z.number(), z.string()]),
  optionGroupName: z.string(),
  minOrderQuantity: z.number().nullable().optional(),
  maxOrderQuantity: z.number().nullable().optional(),
  mappingMenusCount: z.number().nullable().optional(),
  options: z.array(baeminOptionSchema).default([]),
  menus: z.array(baeminOptionMenuSchema).default([])
})

const baeminOptionGroupPageSchema = z.object({
  data: z.object({
    content: z.array(baeminOptionGroupSchema).default([]),
    last: z.boolean().optional(),
    number: z.number().optional(),
    size: z.number().optional(),
    totalPages: z.number().optional()
  })
})

export interface BaeminOptionGroupRequestContext {
  ownerId: string
  page: number
  size: number
}

export interface BaeminOptionGroupPage {
  items: Array<{
    optionGroupId: string
    optionGroupName: string
    minOrderQuantity: number | null
    maxOrderQuantity: number | null
    mappingMenusCount: number | null
    options: Array<{
      optionId: string
      optionName: string
      optionPrice: number | null
      itemStatus: string | null
      restockedAt: string | null
    }>
    menus: Array<{
      platformMenuId: string
      platformMenuName: string
      platformMenuGroupName?: string
    }>
  }>
  last: boolean
  page: number
  size: number
  totalPages: number
}

export const extractBaeminOptionGroupRequestContext = (
  url: string
): BaeminOptionGroupRequestContext | null => {
  const parsedUrl = new URL(url)
  const match = parsedUrl.pathname.match(/\/shop-owners\/([^/]+)\/option-groups$/)

  if (!match) {
    return null
  }

  return {
    ownerId: match[1],
    page: Number(parsedUrl.searchParams.get('page') ?? 0),
    size: Number(parsedUrl.searchParams.get('size') ?? 20)
  }
}

export const parseBaeminOptionGroupPageResponse = (payload: unknown): BaeminOptionGroupPage => {
  const parsed = baeminOptionGroupPageSchema.parse(payload)

  return {
    items: parsed.data.content.map((optionGroup) => ({
      optionGroupId: String(optionGroup.optionGroupId),
      optionGroupName: optionGroup.optionGroupName.trim(),
      minOrderQuantity:
        typeof optionGroup.minOrderQuantity === 'number' ? optionGroup.minOrderQuantity : null,
      maxOrderQuantity:
        typeof optionGroup.maxOrderQuantity === 'number' ? optionGroup.maxOrderQuantity : null,
      mappingMenusCount:
        typeof optionGroup.mappingMenusCount === 'number' ? optionGroup.mappingMenusCount : null,
      options: optionGroup.options.map((option) => ({
        optionId: String(option.optionId),
        optionName: option.optionName.trim(),
        optionPrice: typeof option.optionPrice === 'number' ? option.optionPrice : null,
        itemStatus: option.itemStatus?.trim() ?? null,
        restockedAt: option.restockedAt ?? null
      })),
      menus: optionGroup.menus.map((menu) => ({
        platformMenuId: String(menu.menuId),
        platformMenuName: menu.menuName.trim(),
        ...(menu.useShops[0]?.menuGroupName?.trim()
          ? { platformMenuGroupName: menu.useShops[0].menuGroupName.trim() }
          : {})
      }))
    })),
    last: parsed.data.last ?? false,
    page: parsed.data.number ?? 0,
    size: parsed.data.size ?? parsed.data.content.length,
    totalPages: parsed.data.totalPages ?? (parsed.data.content.length > 0 ? 1 : 0)
  }
}
