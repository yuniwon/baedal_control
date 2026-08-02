import { describe, expect, it } from 'vitest'

import {
  cleanCatalogCategoryName,
  catalogCategoryIdentity,
  catalogMenuIdentity,
  parseCatalogMenuSize,
  stripCatalogMenuSize
} from '../../../src/shared/catalog-normalization'

describe('catalog category normalization', () => {
  it('removes Ddangyo count and accessibility badge text from headings', () => {
    expect(cleanCatalogCategoryName('소스추가6성인식권아이콘메뉴할인아이콘'))
      .toBe('소스추가')
  })

  it('uses one stable identity for old count headings and current badge headings', () => {
    expect(catalogCategoryIdentity('가성비 최고의 알뜰세트 7'))
      .toBe(catalogCategoryIdentity('가성비 최고의 알뜰세트7성인식권아이콘메뉴할인아이콘'))
  })

  it('does not remove meaningful numbers from an ordinary category', () => {
    expect(cleanCatalogCategoryName('1인 세트')).toBe('1인 세트')
  })

  it('recognizes size markers before a parenthetical menu descriptor', () => {
    expect(parseCatalogMenuSize('슈퍼불고기 피자 M（하프앤하프）')).toBe('M')
    expect(parseCatalogMenuSize('슈퍼불고기 피자 L（하프앤하프）')).toBe('L')
    expect(stripCatalogMenuSize('슈퍼불고기 피자 M（하프앤하프）'))
      .toBe('슈퍼불고기 피자（하프앤하프）')
    expect(catalogMenuIdentity('슈퍼불고기 피자 M（하프앤하프）'))
      .toBe(catalogMenuIdentity('슈퍼불고기 피자 L（하프앤하프）'))
  })

  it('does not treat two-pizza size notation as a single size marker', () => {
    expect(parseCatalogMenuSize('일반피자 M＋M')).toBeNull()
    expect(parseCatalogMenuSize('일반피자 L＋L')).toBeNull()
    expect(catalogMenuIdentity('일반피자 M＋M'))
      .not.toBe(catalogMenuIdentity('일반피자 L＋L'))
  })
})
