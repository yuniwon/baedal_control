import { describe, expect, it } from 'vitest'

import {
  cleanCatalogCategoryName,
  catalogCategoryIdentity
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
})
