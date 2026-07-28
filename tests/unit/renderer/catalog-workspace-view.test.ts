import { describe, expect, it } from 'vitest'
import { deriveCatalogMenuItems, filterCatalogMenuItems, getCatalogCategories } from '../../../src/renderer/src/lib/catalog-workspace-view'

describe('catalog workspace view', () => {
  const items = deriveCatalogMenuItems([
    { menuId: '1', baseName: '치즈 피자', basePrice: 19000, isDirty: 0, categoryName: '피자', sources: [{ platformCode: 'baemin', platformMenuId: 'a', platformMenuName: '치즈피자 M', platformMenuPriceSummary: '19,000원', optionGroups: [] }] },
    { menuId: '2', baseName: '콜라', basePrice: 2000, isDirty: 0, isManaged: 0, sources: [] }
  ])

  it('keeps uncategorized last and builds compact platform/search summaries', () => {
    expect(getCatalogCategories(items)).toEqual(['피자', '미분류'])
    expect(items[0]).toMatchObject({ priceSummary: '19,000원', connectedPlatformCount: 1 })
    expect(filterCatalogMenuItems(items, '치즈피자 M', null, 'all').map((item) => item.menuId)).toEqual(['1'])
    expect(filterCatalogMenuItems(items, '', null, 'excluded').map((item) => item.menuId)).toEqual(['2'])
  })
})
