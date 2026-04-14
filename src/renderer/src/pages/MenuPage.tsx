import { useEffect, useState } from 'react'
import type {
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord,
  PlatformMenuPriceVariantRecord,
  PlatformOptionGroupRecord
} from '../../../shared/contracts'
import { appApi } from '../lib/api'
import {
  MenuTable,
  type MenuRow,
  type MenuSourceOptionGroupInfo
} from '../components/MenuTable'
import {
  isSourceMissingSuspected,
  isSourcePlatformAbsent,
  isSourceResurfaced
} from '../lib/menu-source-labels'
import { flattenPlatformMenuPriceVariants } from '../lib/platform-menu-price-variants'

type MenuFilter =
  | 'all'
  | 'managed'
  | 'excluded'
  | 'binding-review'
  | 'missing-suspected'
  | 'platform-absent'
  | 'resurfaced'
const uncategorizedLabel = '미분류'
const preferredPlatformOrder = ['baemin', 'coupangeats', 'ddangyo'] as const
const normalizeSearchValue = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')

const buildDuplicateCounts = (mappings: PlatformMenuMappingRecord[]) =>
  mappings.reduce<Record<string, number>>((counts, mapping) => {
    const key = `${mapping.platformCode}:${mapping.platformMenuName.trim()}`
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})

const deriveBasePriceVariants = (
  existingVariants?: PlatformMenuPriceVariantRecord[] | null,
  sources?: Array<{ platformCode: string; platformMenuPriceVariants?: PlatformMenuPriceVariantRecord[] }>
) => {
  if (existingVariants?.length) {
    return existingVariants
  }

  const orderedSources = [...(sources ?? [])].sort(
    (left, right) =>
      preferredPlatformOrder.indexOf(left.platformCode as (typeof preferredPlatformOrder)[number]) -
      preferredPlatformOrder.indexOf(right.platformCode as (typeof preferredPlatformOrder)[number])
  )

  return (
    orderedSources.find((source) => (source.platformMenuPriceVariants?.length ?? 0) > 1)
      ?.platformMenuPriceVariants
    ?? orderedSources.find((source) => (source.platformMenuPriceVariants?.length ?? 0) > 0)
      ?.platformMenuPriceVariants
    ?? null
  )
}

const buildMenuRows = (
  menus: MenuRow[],
  mappings: PlatformMenuMappingRecord[],
  platformMenus: PlatformMenuCatalogRecord[],
  platformOptionGroups: PlatformOptionGroupRecord[]
): MenuRow[] => {
  const duplicateCounts = buildDuplicateCounts(mappings)
  const platformMenusByKey = new Map(
    platformMenus.map((platformMenu) => [
      `${platformMenu.platformCode}:${platformMenu.platformMenuId}`,
      platformMenu
    ])
  )
  const optionGroupsBySourceKey = platformOptionGroups.reduce<Map<string, MenuSourceOptionGroupInfo[]>>(
    (groups, optionGroup) => {
      const nextGroup: MenuSourceOptionGroupInfo = {
        optionGroupId: optionGroup.optionGroupId,
        optionGroupName: optionGroup.optionGroupName,
        minOrderQuantity: optionGroup.minOrderQuantity ?? null,
        maxOrderQuantity: optionGroup.maxOrderQuantity ?? null,
        mappingMenusCount: optionGroup.mappingMenusCount ?? null,
        optionCount: optionGroup.options.length,
        sampleOptionNames: optionGroup.options
          .map((option) => option.optionName.trim())
          .filter((optionName) => optionName.length > 0)
          .slice(0, 2)
      }

      for (const menu of optionGroup.menus) {
        const key = `${optionGroup.platformCode}:${menu.platformMenuId}`
        groups.set(key, [...(groups.get(key) ?? []), nextGroup])
      }

      return groups
    },
    new Map<string, MenuSourceOptionGroupInfo[]>()
  )

  return menus.map((menu) => {
    const sources = mappings
      .filter((mapping) => mapping.menuId === menu.menuId)
      .map((mapping) => {
        const platformMenu = platformMenusByKey.get(`${mapping.platformCode}:${mapping.platformMenuId}`)

        return {
          platformCode: mapping.platformCode,
          platformMenuId: mapping.platformMenuId,
          platformMenuName: mapping.platformMenuName,
          mappingStatus: mapping.mappingStatus ?? 'active',
          presenceStatus: platformMenu?.presenceStatus,
          lastSeenAt: platformMenu?.lastSeenAt ?? null,
          platformMenuGroupName: platformMenu?.platformMenuGroupName ?? mapping.platformMenuGroupName ?? undefined,
          platformMenuStatus: platformMenu?.platformMenuStatus ?? mapping.platformMenuStatus ?? undefined,
          platformMenuPriceSummary:
            platformMenu?.platformMenuPriceSummary ?? mapping.platformMenuPriceSummary ?? undefined,
          platformMenuPriceVariants:
            platformMenu?.platformMenuPriceVariants ?? mapping.platformMenuPriceVariants ?? undefined,
          platformMenuBindingSummary:
            platformMenu?.platformMenuBindingSummary ?? mapping.platformMenuBindingSummary ?? undefined,
          platformMenuBindingStatus:
            platformMenu?.platformMenuBindingStatus ?? mapping.platformMenuBindingStatus ?? undefined,
          duplicateNameCount: duplicateCounts[`${mapping.platformCode}:${mapping.platformMenuName.trim()}`],
          optionGroups:
            optionGroupsBySourceKey
              .get(`${mapping.platformCode}:${mapping.platformMenuId}`)
              ?.sort((left, right) =>
                left.optionGroupName.localeCompare(right.optionGroupName, 'ko-KR')
              ) ?? []
        }
      })

    return {
      ...menu,
      basePriceVariants: deriveBasePriceVariants(menu.basePriceVariants, sources),
      isManaged: menu.isManaged ?? 1,
      sources
    }
  })
}

const deriveCategoryName = (menu: MenuRow) => {
  const baeminCategory = menu.sources
    ?.find((source) => source.platformCode === 'baemin' && source.platformMenuGroupName?.trim())
    ?.platformMenuGroupName?.trim()

  if (baeminCategory) {
    return baeminCategory
  }

  const orderedSources = [...(menu.sources ?? [])].sort(
    (left, right) =>
      preferredPlatformOrder.indexOf(left.platformCode) -
      preferredPlatformOrder.indexOf(right.platformCode)
  )

  return (
    orderedSources.find((source) => source.platformMenuGroupName?.trim())?.platformMenuGroupName?.trim()
    ?? uncategorizedLabel
  )
}

const buildMenuCategoryGroups = (menus: MenuRow[]) => {
  const grouped = menus.reduce<Record<string, MenuRow[]>>((groups, menu) => {
    const key = menu.categoryName?.trim() || uncategorizedLabel
    groups[key] = [...(groups[key] ?? []), menu]
    return groups
  }, {})

  return Object.entries(grouped)
    .sort(([left], [right]) => {
      if (left === uncategorizedLabel) {
        return 1
      }

      if (right === uncategorizedLabel) {
        return -1
      }

      return left.localeCompare(right, 'ko-KR')
    })
    .map(([categoryName, items]) => ({
      categoryName,
      menus: items
    }))
}

const needsBindingReview = (menu: MenuRow) =>
  Boolean(
    menu.sources?.some(
      (source) =>
        source.platformMenuBindingStatus &&
        source.platformMenuBindingStatus !== '연결 정상'
    )
  )

const needsMissingSuspectedReview = (menu: MenuRow) =>
  Boolean(menu.sources?.some((source) => isSourceMissingSuspected(source)))

const needsPlatformAbsentReview = (menu: MenuRow) =>
  Boolean(menu.sources?.some((source) => isSourcePlatformAbsent(source)))

const needsResurfacedReview = (menu: MenuRow) =>
  Boolean(menu.sources?.some((source) => isSourceResurfaced(source)))

export const MenuPage = () => {
  const [menus, setMenus] = useState<MenuRow[]>([])
  const [filter, setFilter] = useState<MenuFilter>('all')
  const [search, setSearch] = useState('')
  const [showSourceDetails, setShowSourceDetails] = useState(false)

  useEffect(() => {
    void Promise.all([
      appApi.menus.list(),
      appApi.mappings.list(),
      appApi.platformMenus.list(),
      appApi.platformOptionGroups.list()
    ]).then(([menuValue, mappingValue, platformMenuValue, optionGroupValue]) => {
      const nextMenus = Array.isArray(menuValue) ? (menuValue as MenuRow[]) : []
      const nextMappings = Array.isArray(mappingValue)
        ? (mappingValue as PlatformMenuMappingRecord[])
        : []
      const nextPlatformMenus = Array.isArray(platformMenuValue)
        ? (platformMenuValue as PlatformMenuCatalogRecord[])
        : []
      const nextOptionGroups = Array.isArray(optionGroupValue)
        ? (optionGroupValue as PlatformOptionGroupRecord[])
        : []

      setMenus(
        buildMenuRows(nextMenus, nextMappings, nextPlatformMenus, nextOptionGroups).map((menu) => ({
          ...menu,
          categoryName: deriveCategoryName(menu)
        }))
      )
    })
  }, [])

  const handleChange = (menuId: string, patch: Partial<MenuRow>) => {
    setMenus((current) =>
      current.map((menu) => {
        if (menu.menuId !== menuId) {
          return menu
        }

        const shouldMarkDirty = Object.prototype.hasOwnProperty.call(patch, 'baseName')
          || Object.prototype.hasOwnProperty.call(patch, 'basePrice')
          || Object.prototype.hasOwnProperty.call(patch, 'basePriceVariants')
        const nextRecord = {
          ...menu,
          ...patch,
          isManaged: patch.isManaged ?? menu.isManaged ?? 1,
          isDirty: shouldMarkDirty ? 1 : menu.isDirty
        }
        const { sources: _sources, ...payload } = nextRecord

        void appApi.menus.save(payload)
        return nextRecord
      })
    )
  }

  const handleDelete = (menuId: string) => {
    if (!globalThis.confirm?.('연결되지 않은 메뉴를 삭제할까요?')) {
      return
    }

    void appApi.menus.delete(menuId).then((result) => {
      if (!result.ok) {
        return
      }

      setMenus((current) => current.filter((menu) => menu.menuId !== menuId))
    })
  }

  const handleAddMenu = () => {
    const menuId =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `menu-${Date.now()}`
    const nextRecord = {
      menuId,
      baseName: '새 메뉴',
      basePrice: 0,
      isDirty: 1,
      isManaged: 1
    }

    setMenus((current) => [...current, nextRecord])
    void appApi.menus.save(nextRecord)
  }

  const filterOptions = [
    { key: 'all' as const, label: `전체 ${menus.length}` },
    {
      key: 'managed' as const,
      label: `관리 대상 ${menus.filter((menu) => (menu.isManaged ?? 1) === 1).length}`
    },
    {
      key: 'excluded' as const,
      label: `관리 제외 ${menus.filter((menu) => (menu.isManaged ?? 1) === 0).length}`
    },
    {
      key: 'binding-review' as const,
      label: `가게 연결 검토 필요 ${menus.filter((menu) => needsBindingReview(menu)).length}`
    },
    {
      key: 'missing-suspected' as const,
      label: `원본 누락 의심 ${menus.filter((menu) => needsMissingSuspectedReview(menu)).length}`
    },
    {
      key: 'platform-absent' as const,
      label: `플랫폼에 없음 ${menus.filter((menu) => needsPlatformAbsentReview(menu)).length}`
    },
    {
      key: 'resurfaced' as const,
      label: `재등장 ${menus.filter((menu) => needsResurfacedReview(menu)).length}`
    }
  ]

  const filteredMenus = menus.filter((menu) => {
    let passesFilter = true

    if (filter === 'managed') {
      passesFilter = (menu.isManaged ?? 1) === 1
    }
    if (filter === 'excluded') {
      passesFilter = (menu.isManaged ?? 1) === 0
    }
    if (filter === 'binding-review') {
      passesFilter = needsBindingReview(menu)
    }
    if (filter === 'missing-suspected') {
      passesFilter = needsMissingSuspectedReview(menu)
    }
    if (filter === 'platform-absent') {
      passesFilter = needsPlatformAbsentReview(menu)
    }
    if (filter === 'resurfaced') {
      passesFilter = needsResurfacedReview(menu)
    }

    if (!passesFilter) {
      return false
    }

    const normalizedSearch = normalizeSearchValue(search)
    if (!normalizedSearch) {
      return true
    }

    const searchableText = normalizeSearchValue(
      [
        menu.baseName,
        menu.categoryName,
        ...(menu.sources ?? []).flatMap((source) => [
          source.platformMenuName,
          source.platformMenuGroupName,
          source.platformMenuStatus,
          source.platformMenuBindingStatus,
          source.platformMenuBindingSummary,
          source.platformMenuPriceSummary,
          ...flattenPlatformMenuPriceVariants(source.platformMenuPriceVariants)
        ])
      ].join(' ')
    )

    return searchableText.includes(normalizedSearch)
  })

  const reviewCounts = {
    managed: menus.filter((menu) => (menu.isManaged ?? 1) === 1).length,
    binding: menus.filter((menu) => needsBindingReview(menu)).length,
    absent: menus.filter((menu) => needsPlatformAbsentReview(menu)).length
  }

  const groupedMenus = buildMenuCategoryGroups(filteredMenus)

  return (
    <section className="page">
      <header className="page-header">
        <h1>메뉴</h1>
        <p>기준 메뉴명과 가격을 먼저 정리하고, 원본 상세는 필요할 때만 펼쳐서 확인합니다.</p>
      </header>

      <section className="panel panel-flat">
        {menus.length ? (
          <div className="workspace-summary">
            <article className="change-summary-row">
              <strong>{reviewCounts.managed}</strong>
              <span>관리 대상 메뉴</span>
            </article>
            <article className="change-summary-row">
              <strong>{reviewCounts.binding}</strong>
              <span>가게 연결 검토 필요</span>
            </article>
            <article className="change-summary-row">
              <strong>{reviewCounts.absent}</strong>
              <span>플랫폼에 없음</span>
            </article>
          </div>
        ) : null}
        {menus.length ? (
          <div className="panel-toolbar workspace-toolbar">
            <div className="menu-filter-list">
              {filterOptions.map((option) => (
                <button
                  key={option.key}
                  className={filter === option.key ? 'primary-button' : 'secondary-button'}
                  onClick={() => setFilter(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="workspace-toolbar-actions">
              <label className="toolbar-search">
                <input
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="기준 메뉴 또는 플랫폼 메뉴 검색"
                  type="search"
                  value={search}
                />
              </label>
              <button
                className="secondary-button"
                onClick={() => setShowSourceDetails((current) => !current)}
                type="button"
              >
                {showSourceDetails ? '원본 상세 접기' : '원본 상세 보기'}
              </button>
              <button className="secondary-button" onClick={handleAddMenu} type="button">
                메뉴 추가
              </button>
            </div>
          </div>
        ) : null}
        {!menus.length ? <p>아직 불러온 메뉴가 없습니다. 계정 연결에서 메뉴를 먼저 가져오세요.</p> : null}
        {groupedMenus.length ? (
          <div className="menu-category-list">
            {groupedMenus.map((group) => (
              <section className="menu-category-section" key={group.categoryName}>
                <header className="menu-category-header">
                  <h2>{group.categoryName}</h2>
                  <span>{`메뉴 ${group.menus.length}개`}</span>
                </header>
                <MenuTable
                  menus={group.menus}
                  onChange={handleChange}
                  onDelete={handleDelete}
                  showSourceDetails={showSourceDetails}
                />
              </section>
            ))}
          </div>
        ) : null}
        {menus.length && !groupedMenus.length ? (
          <p className="source-empty">조건에 맞는 메뉴가 없습니다.</p>
        ) : null}
      </section>
    </section>
  )
}
