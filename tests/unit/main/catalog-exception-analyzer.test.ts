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

  it('does not fan out platform-only canonical rows as missing when a reference platform is set', () => {
    const items = analyze({
      referencePlatformCode: 'baemin',
      menus: [
        menu({ menuId: 'reference-menu', baseName: '기준 메뉴' }),
        menu({ menuId: 'platform-only', baseName: '요기요 전용 메뉴' })
      ],
      platformMenus: [
        source({ platformCode: 'baemin', platformMenuId: 'b-1', platformMenuName: '기준 메뉴' }),
        source({ platformCode: 'yogiyo', platformMenuId: 'y-1', platformMenuName: '요기요 전용 메뉴' })
      ],
      mappings: [
        mapping({ mappingId: 'reference-menu:baemin', menuId: 'reference-menu', platformCode: 'baemin', platformMenuId: 'b-1', platformMenuName: '기준 메뉴' }),
        mapping({ mappingId: 'platform-only:yogiyo', menuId: 'platform-only', platformCode: 'yogiyo', platformMenuId: 'y-1', platformMenuName: '요기요 전용 메뉴', isConfirmed: 0 })
      ]
    })

    expect(items.filter((item) =>
      item.kind === 'missing_on_platform' && item.canonicalMenuId === 'platform-only'
    )).toEqual([])
    expect(items.some((item) =>
      item.kind === 'missing_on_platform' && item.canonicalMenuId === 'reference-menu'
    )).toBe(true)
  })

  it('surfaces a managed canonical menu that exists only outside the reference platform', () => {
    const items = analyze({
      referencePlatformCode: 'baemin',
      menus: [
        menu({ menuId: 'reference-menu', baseName: '치즈피자' }),
        menu({ menuId: 'platform-only', baseName: '고구마피자' })
      ],
      platformMenus: [
        source({ platformCode: 'baemin', platformMenuId: 'b-1', platformMenuName: '치즈피자' }),
        source({ platformCode: 'coupangeats', platformMenuId: 'c-1', platformMenuName: '고구마피자' })
      ],
      mappings: [
        mapping({ mappingId: 'reference-menu:baemin', menuId: 'reference-menu', platformCode: 'baemin', platformMenuId: 'b-1', platformMenuName: '치즈피자' }),
        mapping({ mappingId: 'platform-only:coupangeats', menuId: 'platform-only', platformCode: 'coupangeats', platformMenuId: 'c-1', platformMenuName: '고구마피자' })
      ]
    })

    expect(items.find((item) => item.kind === 'canonical_platform_only' && item.canonicalMenuId === 'platform-only')).toMatchObject({
      recommendation: 'manual_review',
      platformCode: null
    })
  })

  it('offers explicit store aliases as merge candidates for platform-only menus', () => {
    const items = analyze({
      referencePlatformCode: 'baemin',
      menus: [
        menu({ menuId: 'cola', baseName: '코카콜라', basePrice: 1800 }),
        menu({ menuId: 'cider', baseName: '칠성사이다', basePrice: 1800 }),
        menu({ menuId: 'spaghetti', baseName: '치즈오븐스파게티', basePrice: 7000 }),
        menu({ menuId: 'cola-platform-only', baseName: '콜라(500ml/1.25L)', basePrice: 1800 }),
        menu({ menuId: 'cider-platform-only', baseName: '사이다(500ml/1.25L)', basePrice: 1800 }),
        menu({ menuId: 'spaghetti-platform-only', baseName: '스파게티', basePrice: 7000 })
      ],
      platformMenus: [
        source({ platformCode: 'baemin', platformMenuId: 'b-cola', platformMenuName: '코카콜라', platformMenuCurrentPrice: 1800 }),
        source({ platformCode: 'baemin', platformMenuId: 'b-cider', platformMenuName: '칠성사이다', platformMenuCurrentPrice: 1800 }),
        source({ platformCode: 'baemin', platformMenuId: 'b-spaghetti', platformMenuName: '치즈오븐스파게티', platformMenuCurrentPrice: 7000 }),
        source({ platformCode: 'coupangeats', platformMenuId: 'c-cola', platformMenuName: '콜라(500ml/1.25L)', platformMenuCurrentPrice: 1800 }),
        source({ platformCode: 'coupangeats', platformMenuId: 'c-cider', platformMenuName: '사이다(500ml/1.25L)', platformMenuCurrentPrice: 1800 }),
        source({ platformCode: 'yogiyo', platformMenuId: 'y-spaghetti', platformMenuName: '스파게티', platformMenuCurrentPrice: 7000 })
      ],
      mappings: [
        mapping({ mappingId: 'cola:baemin', menuId: 'cola', platformCode: 'baemin', platformMenuId: 'b-cola', platformMenuName: '코카콜라' }),
        mapping({ mappingId: 'cider:baemin', menuId: 'cider', platformCode: 'baemin', platformMenuId: 'b-cider', platformMenuName: '칠성사이다' }),
        mapping({ mappingId: 'spaghetti:baemin', menuId: 'spaghetti', platformCode: 'baemin', platformMenuId: 'b-spaghetti', platformMenuName: '치즈오븐스파게티' }),
        mapping({ mappingId: 'cola-platform-only:coupangeats', menuId: 'cola-platform-only', platformCode: 'coupangeats', platformMenuId: 'c-cola', platformMenuName: '콜라(500ml/1.25L)' }),
        mapping({ mappingId: 'cider-platform-only:coupangeats', menuId: 'cider-platform-only', platformCode: 'coupangeats', platformMenuId: 'c-cider', platformMenuName: '사이다(500ml/1.25L)' }),
        mapping({ mappingId: 'spaghetti-platform-only:yogiyo', menuId: 'spaghetti-platform-only', platformCode: 'yogiyo', platformMenuId: 'y-spaghetti', platformMenuName: '스파게티' })
      ]
    })

    expect(items.filter((item) => item.kind === 'canonical_platform_only')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalMenuId: 'cola-platform-only',
          evidenceJson: expect.stringContaining('"canonicalMenuId":"cola"')
        }),
        expect.objectContaining({
          canonicalMenuId: 'cider-platform-only',
          evidenceJson: expect.stringContaining('"canonicalMenuId":"cider"')
        }),
        expect.objectContaining({
          canonicalMenuId: 'spaghetti-platform-only',
          evidenceJson: expect.stringContaining('"canonicalMenuId":"spaghetti"')
        })
      ])
    )
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

  it('separates a general-menu gap from a paid option-only presence', () => {
    const items = analyze({
      menus: [menu({ menuId: 'pickle', baseName: '국산피클', basePrice: 500 })],
      platformMenus: [source({ platformMenuId: 'other', platformMenuName: '다른 메뉴' })],
      mappings: [],
      logicalOptionGroups: [{
        logicalGroupKey: 'coupangeats:sauce',
        platformCode: 'coupangeats',
        displayName: '소스 추가',
        minOrderQuantity: 0,
        maxOrderQuantity: 5,
        optionCount: 1,
        connectedMenuCount: 1,
        sourceGroupCount: 1,
        sampleOptionNames: ['피클'],
        logicalOptions: [{ optionName: '피클', optionPrice: 500 }],
        status: 'single',
        sourceGroups: [{
          optionGroupId: 'sauce-1',
          optionGroupName: '소스 추가',
          presenceStatus: 'present',
          linkedMenuCount: 1,
          linkedMenuNames: ['치즈피자'],
          options: [{ optionName: '피클', optionPrice: 500 }]
        }]
      }]
    })

    const item = items.find((candidate) => candidate.kind === 'option_only_on_platform')

    expect(item).toMatchObject({
      canonicalMenuId: 'pickle',
      platformCode: 'coupangeats',
      recommendation: 'add_to_platform'
    })
    expect(items.some((candidate) =>
      candidate.kind === 'missing_on_platform' && candidate.canonicalMenuId === 'pickle'
    )).toBe(false)
    expect(JSON.parse(item?.evidenceJson ?? '{}')).toMatchObject({
      surface: 'option',
      optionRole: 'paid_add_on',
      optionMatches: [{ optionName: '피클', optionPrice: 500 }]
    })
  })

  it('marks a similar beverage option as a conservative candidate instead of an exact match', () => {
    const items = analyze({
      menus: [menu({ menuId: 'cola', baseName: '코카콜라', basePrice: 2000 })],
      platformMenus: [source({ platformMenuId: 'other', platformMenuName: '다른 메뉴' })],
      mappings: [],
      logicalOptionGroups: [{
        logicalGroupKey: 'coupangeats:drink',
        platformCode: 'coupangeats',
        displayName: '음료 선택',
        minOrderQuantity: 0,
        maxOrderQuantity: 1,
        optionCount: 1,
        connectedMenuCount: 1,
        sourceGroupCount: 1,
        sampleOptionNames: ['콜라 500ml'],
        logicalOptions: [{ optionName: '콜라 500ml', optionPrice: 2000 }],
        status: 'single',
        sourceGroups: [{
          optionGroupId: 'drink-1',
          optionGroupName: '음료 선택',
          presenceStatus: 'present',
          linkedMenuCount: 1,
          linkedMenuNames: ['피자 세트'],
          options: [{ optionName: '콜라 500ml', optionPrice: 2000 }]
        }]
      }]
    })

    const item = items.find((candidate) => candidate.kind === 'option_candidate_on_platform')
    expect(item).toMatchObject({
      canonicalMenuId: 'cola',
      platformCode: 'coupangeats',
      recommendation: 'manual_review',
      confidence: 0.7
    })
    expect(JSON.parse(item?.evidenceJson ?? '{}')).toMatchObject({
      optionRole: 'paid_add_on',
      optionMatches: [{ optionName: '콜라 500ml', maxOrderQuantity: 1 }]
    })
  })

  it('records a free optional role and its selection range', () => {
    const items = analyze({
      menus: [menu({ menuId: 'pickle', baseName: '국산피클', basePrice: 500 })],
      platformMenus: [source({ platformMenuId: 'other', platformMenuName: '다른 메뉴' })],
      mappings: [],
      logicalOptionGroups: [{
        logicalGroupKey: 'coupangeats:free-sauce',
        platformCode: 'coupangeats',
        displayName: '소스 추가',
        minOrderQuantity: 0,
        maxOrderQuantity: 6,
        optionCount: 1,
        connectedMenuCount: 1,
        sourceGroupCount: 1,
        sampleOptionNames: ['국산피클'],
        logicalOptions: [{ optionName: '국산피클', optionPrice: 0 }],
        status: 'single',
        sourceGroups: [{
          optionGroupId: 'free-sauce-1',
          optionGroupName: '소스 추가',
          presenceStatus: 'present',
          linkedMenuCount: 1,
          linkedMenuNames: ['치즈피자'],
          options: [{ optionName: '국산피클', optionPrice: 0 }]
        }]
      }]
    })

    const item = items.find((candidate) => candidate.kind === 'option_only_on_platform')
    expect(JSON.parse(item?.evidenceJson ?? '{}')).toMatchObject({
      optionRole: 'free_optional',
      optionMatches: [{ minOrderQuantity: 0, maxOrderQuantity: 6 }]
    })
  })

  it('flags the same option name at different prices for the same platform menu', () => {
    const sharedMenu = '킹쉬림프피자'
    const items = analyze({
      menus: [menu()],
      platformMenus: [source({ platformMenuName: sharedMenu })],
      mappings: [],
      logicalOptionGroups: [
        {
          logicalGroupKey: 'coupangeats:sauce-a',
          platformCode: 'coupangeats',
          displayName: '소스 추가',
          minOrderQuantity: 0,
          maxOrderQuantity: 1,
          optionCount: 1,
          connectedMenuCount: 1,
          sourceGroupCount: 1,
          sampleOptionNames: ['요거트소스'],
          logicalOptions: [{ optionName: '요거트소스', optionPrice: 300 }],
          status: 'single',
          sourceGroups: [{
            optionGroupId: 'sauce-a-1',
            optionGroupName: '소스 추가',
            presenceStatus: 'present',
            linkedMenuCount: 1,
            linkedMenuNames: [sharedMenu],
            options: [{ optionName: '요거트소스', optionPrice: 300 }]
          }]
        },
        {
          logicalGroupKey: 'coupangeats:sauce-b',
          platformCode: 'coupangeats',
          displayName: '소스 선택',
          minOrderQuantity: 0,
          maxOrderQuantity: 1,
          optionCount: 1,
          connectedMenuCount: 1,
          sourceGroupCount: 1,
          sampleOptionNames: ['요거트 소스'],
          logicalOptions: [{ optionName: '요거트 소스', optionPrice: 500 }],
          status: 'single',
          sourceGroups: [{
            optionGroupId: 'sauce-b-1',
            optionGroupName: '소스 선택',
            presenceStatus: 'present',
            linkedMenuCount: 1,
            linkedMenuNames: [sharedMenu],
            options: [{ optionName: '요거트 소스', optionPrice: 500 }]
          }]
        }
      ]
    })

    const item = items.find((candidate) => candidate.kind === 'option_price_outlier')
    expect(item).toMatchObject({
      platformCode: 'coupangeats',
      sourceEntityId: 'coupangeats:sauce-a',
      recommendation: 'manual_review'
    })
    expect(JSON.parse(item?.evidenceJson ?? '{}')).toMatchObject({
      fieldKey: 'option_price',
      distinctPrices: [300, 500]
    })
  })

  it('keeps a general-menu alias in the general-menu review lane', () => {
    const items = analyze({
      menus: [menu({ menuId: 'pickle', baseName: '국산피클', basePrice: 500 })],
      platformMenus: [source({
        platformMenuId: 'pickle-source',
        platformMenuName: '피클',
        platformMenuCurrentPrice: 500
      })],
      mappings: []
    })

    expect(items.some((candidate) =>
      candidate.kind === 'missing_on_platform' && candidate.canonicalMenuId === 'pickle'
    )).toBe(false)
    expect(items.find((candidate) => candidate.kind === 'unmatched_platform_menu')).toMatchObject({
      canonicalMenuId: 'pickle',
      recommendation: 'align_to_canonical'
    })
  })

  it('keeps an included set option distinct from a paid general menu', () => {
    const items = analyze({
      menus: [menu({ menuId: 'spaghetti', baseName: '스파게티', basePrice: 7000 })],
      platformMenus: [source({ platformMenuId: 'other', platformMenuName: '다른 메뉴' })],
      mappings: [],
      logicalOptionGroups: [{
        logicalGroupKey: 'baemin:set-side',
        platformCode: 'baemin',
        displayName: '사이드메뉴 선택',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        optionCount: 1,
        connectedMenuCount: 1,
        sourceGroupCount: 1,
        sampleOptionNames: ['스파게티'],
        logicalOptions: [{ optionName: '스파게티', optionPrice: 0 }],
        status: 'single',
        sourceGroups: [{
          optionGroupId: 'set-side-1',
          optionGroupName: '사이드메뉴 선택',
          presenceStatus: 'present',
          linkedMenuCount: 1,
          linkedMenuNames: ['미디움 피자 세트'],
          options: [{ optionName: '스파게티', optionPrice: 0 }]
        }]
      }]
    })

    const item = items.find((candidate) => candidate.kind === 'option_only_on_platform')

    expect(item).toBeTruthy()
    expect(JSON.parse(item?.evidenceJson ?? '{}')).toMatchObject({
      optionRole: 'bundle_selection'
    })
  })

  it('does not equate a generic included option with a differently named general menu', () => {
    const items = analyze({
      menus: [menu({ menuId: 'cheese-spaghetti', baseName: '치즈오븐스파게티', basePrice: 7000 })],
      platformMenus: [source({ platformMenuId: 'other', platformMenuName: '다른 메뉴' })],
      mappings: [],
      logicalOptionGroups: [{
        logicalGroupKey: 'baemin:set-side',
        platformCode: 'baemin',
        displayName: '사이드메뉴 선택',
        optionCount: 1,
        connectedMenuCount: 1,
        sourceGroupCount: 1,
        sampleOptionNames: ['스파게티'],
        logicalOptions: [{ optionName: '스파게티', optionPrice: 0 }],
        status: 'single',
        sourceGroups: [{
          optionGroupId: 'set-side-1',
          optionGroupName: '사이드메뉴 선택',
          presenceStatus: 'present',
          linkedMenuCount: 1,
          linkedMenuNames: ['미디움 피자 세트'],
          options: [{ optionName: '스파게티', optionPrice: 0 }]
        }]
      }]
    })

    expect(items.some((candidate) =>
      candidate.kind === 'missing_on_platform' && candidate.canonicalMenuId === 'cheese-spaghetti'
    )).toBe(true)
    expect(items.some((candidate) =>
      candidate.kind === 'option_only_on_platform' && candidate.canonicalMenuId === 'cheese-spaghetti'
    )).toBe(false)
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
