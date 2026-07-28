import type { PlatformMenuPriceVariantRecord } from '../../../shared/contracts'
import type { MenuRow } from '../components/MenuTable'

export type CatalogMenuFilter = 'all' | 'managed' | 'review' | 'excluded'

export interface CatalogMenuListItem extends MenuRow {
  categoryName: string
  priceSummary: string
  connectedPlatformCount: number
  issueCount: number
  searchText: string
}

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`

const summarizeVariants = (variants?: PlatformMenuPriceVariantRecord[] | null, fallback = 0) => {
  const amounts = variants?.flatMap((variant) => variant.channels)
    .map((channel) => channel.amount)
    .filter((amount): amount is number => typeof amount === 'number') ?? []
  const unique = [...new Set(amounts)]
  if (unique.length === 0) return won(fallback)
  if (unique.length === 1) return won(unique[0])
  return `${won(Math.min(...unique))} ~ ${won(Math.max(...unique))}`
}

export const deriveCatalogMenuItems = (menus: MenuRow[]): CatalogMenuListItem[] => menus.map((menu) => {
  const categoryName = menu.categoryName?.trim() || '미분류'
  const issueCount = (menu.sources ?? []).filter((source) =>
    source.presenceStatus === 'missing_suspected'
    || source.presenceStatus === 'absent_confirmed'
    || source.mappingStatus === 'source_absent'
    || Boolean(source.platformMenuBindingStatus && source.platformMenuBindingStatus !== '연결 정상')
  ).length
  const priceSummary = summarizeVariants(menu.basePriceVariants, menu.basePrice)
  return {
    ...menu,
    categoryName,
    priceSummary,
    connectedPlatformCount: new Set((menu.sources ?? []).map((source) => source.platformCode)).size,
    issueCount,
    searchText: normalize([
      menu.baseName,
      categoryName,
      priceSummary,
      ...(menu.sources ?? []).flatMap((source) => [
        source.platformMenuName,
        source.platformMenuGroupName,
        source.platformMenuPriceSummary,
        ...(source.optionGroups ?? []).flatMap((group) => [group.optionGroupName, ...group.sampleOptionNames])
      ])
    ].filter(Boolean).join(' '))
  }
})

export const getCatalogCategories = (items: CatalogMenuListItem[]) => [
  ...new Set(items.map((item) => item.categoryName))
].sort((left, right) => {
  if (left === '미분류') return 1
  if (right === '미분류') return -1
  return left.localeCompare(right, 'ko-KR')
})

export const filterCatalogMenuItems = (
  items: CatalogMenuListItem[],
  search: string,
  category: string | null,
  filter: CatalogMenuFilter
) => {
  const query = normalize(search)
  return items.filter((item) => {
    if (category && item.categoryName !== category) return false
    if (filter === 'managed' && (item.isManaged ?? 1) !== 1) return false
    if (filter === 'excluded' && (item.isManaged ?? 1) !== 0) return false
    if (filter === 'review' && item.issueCount === 0) return false
    return !query || item.searchText.includes(query)
  })
}
