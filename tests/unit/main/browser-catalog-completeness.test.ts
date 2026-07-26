import { describe, expect, it } from 'vitest'

import { buildBrowserCatalogCompleteness } from '../../../src/main/platforms/browser-catalog/completeness'

describe('buildBrowserCatalogCompleteness', () => {
  it('marks proven full menu, option, and binding collections complete', () => {
    expect(
      buildBrowserCatalogCompleteness({
        menus: [{ platformMenuId: '1', platformMenuName: '피자' }],
        optionGroups: [
          {
            optionGroupId: 'size',
            optionGroupName: '사이즈',
            mappingMenusCount: 1,
            options: [],
            menus: [{ platformMenuId: '1', platformMenuName: '피자' }]
          }
        ],
        menuCollectionProven: true,
        optionCollectionProven: true,
        expectedMenuCount: 1,
        expectedOptionGroupCount: 1,
        parseIssues: []
      })
    ).toEqual({
      menuCatalog: 'complete',
      optionCatalog: 'complete',
      optionBindings: 'complete',
      expectedMenuCount: 1,
      collectedMenuCount: 1,
      expectedOptionGroupCount: 1,
      collectedOptionGroupCount: 1,
      issues: []
    })
  })

  it('marks truncated bindings incomplete when the platform reports more mappings', () => {
    const completeness = buildBrowserCatalogCompleteness({
      menus: [{ platformMenuId: '1', platformMenuName: '피자' }],
      optionGroups: [
        {
          optionGroupId: 'size',
          optionGroupName: '사이즈',
          mappingMenusCount: 17,
          options: [],
          menus: [{ platformMenuId: '1', platformMenuName: '피자' }]
        }
      ],
      menuCollectionProven: true,
      optionCollectionProven: true,
      parseIssues: []
    })

    expect(completeness.optionBindings).toBe('incomplete')
    expect(completeness.issues).toContain('option_binding_count_mismatch:size:1/17')
  })

  it('does not claim completeness for DOM-only collections without count evidence', () => {
    const completeness = buildBrowserCatalogCompleteness({
      menus: [{ platformMenuId: 'dom:1', platformMenuName: '피자' }],
      optionGroups: [],
      menuCollectionProven: false,
      optionCollectionProven: false,
      parseIssues: []
    })

    expect(completeness.menuCatalog).toBe('unknown')
    expect(completeness.optionCatalog).toBe('unknown')
    expect(completeness.optionBindings).toBe('unknown')
  })
})
