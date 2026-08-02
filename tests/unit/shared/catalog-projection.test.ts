import { describe, expect, it } from 'vitest'
import type {
  MenuRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord,
  PlatformOptionGroupRecord
} from '../../../src/shared/contracts'
import { buildCatalogProjectionPreview } from '../../../src/shared/catalog-projection'

const menu = (overrides: Partial<MenuRecord>): MenuRecord => ({
  menuId: 'menu-1',
  baseName: '킹쉬림프 피자',
  basePrice: 19900,
  basePriceVariants: null,
  isDirty: 0,
  isManaged: 1,
  ...overrides
})

const source = (overrides: Partial<PlatformMenuCatalogRecord>): PlatformMenuCatalogRecord => ({
  platformCode: 'coupangeats',
  platformMenuId: 'source-1',
  platformMenuName: '킹쉬림프 피자',
  platformMenuCurrentPrice: 19900,
  platformMenuPriceVariants: null,
  platformMenuGroupName: '피자',
  ...overrides
})

const mapping = (overrides: Partial<PlatformMenuMappingRecord>): PlatformMenuMappingRecord => ({
  mappingId: 'mapping-1',
  menuId: 'menu-1',
  platformCode: 'coupangeats',
  platformMenuId: 'source-1',
  platformMenuName: '킹쉬림프 피자',
  matchedBy: 'auto',
  isConfirmed: 1,
  ...overrides
})

const sizeGroup = (platformCode: PlatformOptionGroupRecord['platformCode']): PlatformOptionGroupRecord => ({
  platformCode,
  optionGroupId: `${platformCode}-size`,
  optionGroupName: '사이즈 선택',
  minOrderQuantity: 1,
  maxOrderQuantity: 1,
  options: [
    { optionId: 'm', optionName: '미디움', optionPrice: 0 },
    { optionId: 'l', optionName: '라지', optionPrice: 4000 }
  ],
  menus: [{ platformMenuId: 'source-1', platformMenuName: '킹쉬림프 피자' }]
})

describe('buildCatalogProjectionPreview', () => {
  it('projects a missing canonical L price through a required size option', () => {
    const preview = buildCatalogProjectionPreview({
      referencePlatformCode: 'baemin',
      menus: [menu({ basePrice: 21900 })],
      mappings: [mapping({})],
      platformMenus: [source({ platformMenuCurrentPrice: 21900 })],
      optionGroups: [sizeGroup('coupangeats')],
      generatedAt: '2026-08-02T00:00:00.000Z'
    })
    const item = preview.items[0]
    expect(item.mode).toBe('required_size_option')
    expect(item.variants.map((variant) => [variant.label, variant.canonicalAmount])).toEqual([
      ['M', 21900],
      ['L', 25900]
    ])
    expect(item.status).toBe('review')
    expect(item.warnings[0]).toContain('L 가격이 없어')
  })

  it('keeps Yogiyo M/L source menus as separate platform menus', () => {
    const preview = buildCatalogProjectionPreview({
      referencePlatformCode: 'baemin',
      menus: [menu({ basePrice: 21900, basePriceVariants: [{ variantLabel: 'M', channels: [{ channelCode: 'base', channelLabel: '기본', amount: 21900, amountText: '21,900원' }] }, { variantLabel: 'L', channels: [{ channelCode: 'base', channelLabel: '기본', amount: 25900, amountText: '25,900원' }] }] })],
      mappings: [
        mapping({ mappingId: 'y-m', platformCode: 'yogiyo', platformMenuId: 'y-m', platformMenuName: '킹쉬림프 피자 M' }),
        mapping({ mappingId: 'y-l', platformCode: 'yogiyo', platformMenuId: 'y-l', platformMenuName: '킹쉬림프 피자 L' })
      ],
      platformMenus: [
        source({ platformCode: 'yogiyo', platformMenuId: 'y-m', platformMenuName: '킹쉬림프 피자 M', platformMenuCurrentPrice: 21900 }),
        source({ platformCode: 'yogiyo', platformMenuId: 'y-l', platformMenuName: '킹쉬림프 피자 L', platformMenuCurrentPrice: 25900 })
      ],
      optionGroups: []
    })
    const item = preview.items.find((candidate) => candidate.platformCode === 'yogiyo')
    expect(item?.mode).toBe('separate_menus')
    expect(item?.status).toBe('ready')
    expect(item?.sourceMenuIds).toEqual(['y-m', 'y-l'])
  })

  it('does not infer a family menu as an M/L sibling', () => {
    const preview = buildCatalogProjectionPreview({
      referencePlatformCode: 'baemin',
      menus: [menu({ menuId: 'family', baseName: '꾸버스 패밀리피자', basePrice: 39900, basePriceVariants: [{ variantLabel: 'F', channels: [{ channelCode: 'base', channelLabel: '기본', amount: 39900, amountText: '39,900원' }] }] })],
      mappings: [mapping({ menuId: 'family', platformMenuName: '꾸버스 패밀리피자' })],
      platformMenus: [source({ platformMenuName: '꾸버스 패밀리피자', platformMenuCurrentPrice: 39900 })],
      optionGroups: []
    })
    const item = preview.items[0]
    expect(item.mode).toBe('single_menu')
    expect(item.variants[0].label).toBe('F')
  })
})
