import { describe, expect, it } from 'vitest'
import { buildReferenceCategoryIndex, resolveCatalogCategory } from '../../../src/renderer/src/lib/catalog-category'

describe('catalog category resolution', () => {
  const referenceCategories = buildReferenceCategoryIndex([
    '소스 추가',
    '함께하면 더욱 좋은 음료 및 사이드 메뉴',
    '선택에 실패 없는 알뜰피자'
  ])

  it('uses the reference platform spelling for equivalent category names', () => {
    expect(resolveCatalogCategory(['소스추가'], referenceCategories)).toBe('소스 추가')
    expect(resolveCatalogCategory(['함께하면 더욱 좋은 음료 및 사이드메뉴'], referenceCategories))
      .toBe('함께하면 더욱 좋은 음료 및 사이드 메뉴')
  })

  it('removes count and badge text captured from a platform heading', () => {
    expect(resolveCatalogCategory(
      ['선택에 실패 없는 알뜰피자15성인식권아이콘메뉴할인아이콘'],
      referenceCategories
    )).toBe('선택에 실패 없는 알뜰피자')
  })

  it('keeps a genuinely different platform category instead of guessing', () => {
    expect(resolveCatalogCategory(['일반피자 M 메뉴'], referenceCategories)).toBe('일반피자 M 메뉴')
  })

  it('ignores blank labels and falls back to unclassified', () => {
    expect(resolveCatalogCategory([' ', ''], referenceCategories)).toBe('미분류')
  })
})
