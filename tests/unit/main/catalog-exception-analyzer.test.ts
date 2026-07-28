import { describe, expect, it } from 'vitest'

import { analyzeCatalogExceptions } from '../../../src/main/services/catalog-exception-analyzer'
import type {
  LogicalOptionGroupRecord,
  MenuRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord
} from '../../../src/shared/contracts'

const menu = (overrides: Partial<MenuRecord> = {}): MenuRecord => ({
  menuId: 'menu-1',
  baseName: '킹쉬림프피자',
  basePrice: 25900,
  isDirty: 0,
  isManaged: 1,
  ...overrides
})

const source = (
  overrides: Partial<PlatformMenuCatalogRecord> = {}
): PlatformMenuCatalogRecord => ({
  platformCode: 'coupangeats',
  platformMenuId: 'source-1',
  platformMenuName: '감자피자',
  platformMenuCurrentPrice: 19900,
  presenceStatus: 'present',
  ...overrides
})

const mapping = (
  overrides: Partial<PlatformMenuMappingRecord> = {}
): PlatformMenuMappingRecord => ({
  mappingId: 'menu-2:coupangeats',
  menuId: 'menu-2',
  platformCode: 'coupangeats',
  platformMenuId: 'source-1',
  platformMenuName: '감자피자',
  platformMenuCurrentPrice: 19900,
  matchedBy: 'manual',
  isConfirmed: 1,
  ...overrides
})

const analyze = (overrides: Partial<Parameters<typeof analyzeCatalogExceptions>[0]> = {}) =>
  analyzeCatalogExceptions({
    workspaceId: 'default',
    menus: [menu(), menu({ menuId: 'menu-2', baseName: '감자피자', basePrice: 19900 })],
    platformMenus: [source()],
    mappings: [mapping()],
    logicalOptionGroups: [],
    ...overrides
  })

describe('analyzeCatalogExceptions', () => {
  it('recommends adding a canonical menu that is missing on a connected platform', () => {
    const item = analyze().find(
      (candidate) =>
        candidate.kind === 'missing_on_platform' && candidate.canonicalMenuId === 'menu-1'
    )

    expect(item).toMatchObject({
      state: 'open',
      platformCode: 'coupangeats',
      recommendation: 'add_to_platform',
      confidence: 1
    })
    expect(JSON.parse(item?.evidenceJson ?? '{}')).toMatchObject({
      canonicalMenuId: 'menu-1',
      signals: { confirmedPlatformMappingMissing: true }
    })
  })

  it('marks a mapped price outlier as a decision instead of silently aligning it', () => {
    const item = analyze({
      menus: [menu()],
      platformMenus: [
        source({
          platformMenuId: 'shrimp-1',
          platformMenuName: '킹쉬림프피자',
          platformMenuCurrentPrice: 23900
        })
      ],
      mappings: [
        mapping({
          mappingId: 'menu-1:coupangeats',
          menuId: 'menu-1',
          platformMenuId: 'shrimp-1',
          platformMenuName: '킹쉬림프피자',
          platformMenuCurrentPrice: 23900
        })
      ]
    }).find((candidate) => candidate.kind === 'price_outlier')

    expect(item).toMatchObject({
      canonicalMenuId: 'menu-1',
      sourceEntityId: 'shrimp-1',
      recommendation: 'manual_review'
    })
    expect(JSON.parse(item?.evidenceJson ?? '{}')).toMatchObject({
      fieldKey: 'base_price',
      canonicalPrice: 25900,
      platformPrice: 23900,
      sourceEntityIds: ['shrimp-1']
    })
  })

  it('reports an unmapped platform row with conservative match evidence', () => {
    const [item] = analyze({
      menus: [menu()],
      platformMenus: [
        source({
          platformMenuId: 'new-1',
          platformMenuName: '킹 쉬림프 피자',
          platformMenuCurrentPrice: 25900
        })
      ],
      mappings: []
    }).filter((candidate) => candidate.kind === 'unmatched_platform_menu')

    expect(item).toMatchObject({
      sourceEntityId: 'new-1',
      canonicalMenuId: 'menu-1',
      recommendation: 'align_to_canonical'
    })
    expect(JSON.parse(item.evidenceJson)).toMatchObject({
      sourceEntityIds: ['new-1'],
      match: { level: 'unique_safe' }
    })
  })

  it('turns identical option shapes with fragmented links into a merge candidate', () => {
    const logicalOptionGroups: LogicalOptionGroupRecord[] = [
      {
        logicalGroupKey: 'baemin:same-shape',
        platformCode: 'baemin',
        displayName: '사이즈 선택',
        optionCount: 2,
        connectedMenuCount: 2,
        sourceGroupCount: 2,
        sampleOptionNames: ['M', 'L'],
        logicalOptions: [
          { optionName: 'M', optionPrice: 0 },
          { optionName: 'L', optionPrice: 3000 }
        ],
        status: 'merge_candidate',
        sourceGroups: [
          {
            optionGroupId: 'g-1',
            optionGroupName: '사이즈 선택',
            presenceStatus: 'present',
            linkedMenuCount: 1,
            linkedMenuNames: ['감자피자'],
            options: [{ optionName: 'M', optionPrice: 0 }]
          },
          {
            optionGroupId: 'g-2',
            optionGroupName: '사이즈 선택',
            presenceStatus: 'present',
            linkedMenuCount: 1,
            linkedMenuNames: ['킹쉬림프피자'],
            options: [{ optionName: 'M', optionPrice: 0 }]
          }
        ]
      }
    ]

    const item = analyze({ logicalOptionGroups }).find(
      (candidate) => candidate.kind === 'duplicate_option_group'
    )

    expect(item).toMatchObject({
      platformCode: 'baemin',
      recommendation: 'merge_canonical_only'
    })
    expect(JSON.parse(item?.evidenceJson ?? '{}')).toMatchObject({
      sourceEntityIds: ['g-1', 'g-2']
    })
  })

  it('produces stable fingerprints and ordering for the same evidence', () => {
    expect(analyze()).toEqual(analyze())
  })

  it('accepts a size-specific source price that exists in the canonical variants', () => {
    const items = analyze({
      menus: [menu({
        basePriceVariants: [
          { variantLabel: 'M', channels: [{ channelCode: 'delivery', channelLabel: '배달', amount: 19900, amountText: '19,900원' }] },
          { variantLabel: 'L', channels: [{ channelCode: 'delivery', channelLabel: '배달', amount: 25900, amountText: '25,900원' }] }
        ]
      })],
      platformMenus: [source({
        platformCode: 'yogiyo',
        platformMenuId: 'shrimp-m',
        platformMenuName: '킹쉬림프피자 M',
        platformMenuCurrentPrice: 19900
      })],
      mappings: [mapping({
        mappingId: 'menu-1:yogiyo:m',
        menuId: 'menu-1',
        platformCode: 'yogiyo',
        platformMenuId: 'shrimp-m',
        platformMenuName: '킹쉬림프피자 M',
        platformMenuCurrentPrice: 19900
      })]
    })

    expect(items.some((candidate) => candidate.kind === 'price_outlier')).toBe(false)
  })

  it('treats separate M and L platform rows as size variants when M matches the base price', () => {
    const items = analyze({
      menus: [menu()],
      platformMenus: [
        source({ platformCode: 'yogiyo', platformMenuId: 'shrimp-m', platformMenuName: '킹쉬림프피자 M', platformMenuCurrentPrice: 25900 }),
        source({ platformCode: 'yogiyo', platformMenuId: 'shrimp-l', platformMenuName: '킹쉬림프피자 L', platformMenuCurrentPrice: 29900 })
      ],
      mappings: [
        mapping({ mappingId: 'menu-1:yogiyo:m', menuId: 'menu-1', platformCode: 'yogiyo', platformMenuId: 'shrimp-m', platformMenuName: '킹쉬림프피자 M', platformMenuCurrentPrice: 25900 }),
        mapping({ mappingId: 'menu-1:yogiyo:l', menuId: 'menu-1', platformCode: 'yogiyo', platformMenuId: 'shrimp-l', platformMenuName: '킹쉬림프피자 L', platformMenuCurrentPrice: 29900 })
      ]
    })

    expect(items.some((candidate) => candidate.kind === 'price_outlier')).toBe(false)
  })

  it('keeps a price decision fingerprint stable when a Ddangyo heading capture changes', () => {
    const analyzeCategory = (categoryName: string) => analyze({
      menus: [menu()],
      platformMenus: [source({
        platformCode: 'ddangyo',
        platformMenuId: 'shrimp-1',
        platformMenuName: '킹쉬림프피자',
        platformMenuCurrentPrice: 29900,
        platformMenuGroupName: categoryName
      })],
      mappings: [mapping({
        mappingId: 'menu-1:ddangyo',
        menuId: 'menu-1',
        platformCode: 'ddangyo',
        platformMenuId: 'shrimp-1',
        platformMenuName: '킹쉬림프피자',
        platformMenuCurrentPrice: 29900,
        platformMenuGroupName: categoryName
      })]
    }).find((candidate) => candidate.kind === 'price_outlier')

    const oldCapture = analyzeCategory('선택에 실패 없는 알뜰피자 15')
    const currentCapture = analyzeCategory(
      '선택에 실패 없는 알뜰피자15성인식권아이콘메뉴할인아이콘'
    )

    expect(currentCapture?.fingerprint).toBe(oldCapture?.fingerprint)
    expect(JSON.parse(currentCapture?.evidenceJson ?? '{}').categoryKey)
      .toBe('선택에 실패 없는 알뜰피자')
  })

  it('does not create missing or price reviews for menus excluded from management', () => {
    const items = analyze({
      menus: [menu({ isManaged: 0 })],
      platformMenus: [source({
        platformMenuId: 'shrimp-1',
        platformMenuName: '킹쉬림프피자',
        platformMenuCurrentPrice: 29900
      })],
      mappings: [mapping({
        mappingId: 'menu-1:coupangeats',
        menuId: 'menu-1',
        platformMenuId: 'shrimp-1',
        platformMenuName: '킹쉬림프피자',
        platformMenuCurrentPrice: 29900
      })]
    })

    expect(items.filter((item) =>
      item.canonicalMenuId === 'menu-1' && ['missing_on_platform', 'price_outlier'].includes(item.kind)
    )).toEqual([])
  })
})
