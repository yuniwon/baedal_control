import { useEffect, useState } from 'react'
import type {
  PlatformCode,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord
} from '../../../shared/contracts'
import { appApi } from '../lib/api'
import {
  MappingReviewTable,
  type MappingCandidate,
  type MappingReviewRow
} from '../components/MappingReviewTable'
import type { MenuRow } from '../components/MenuTable'
import { flattenPlatformMenuPriceVariants } from '../lib/platform-menu-price-variants'

const platforms: PlatformCode[] = ['baemin', 'coupangeats', 'ddangyo']
const normalizeSearchValue = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')

const buildDuplicateCounts = (platformMenus: PlatformMenuCatalogRecord[]) =>
  platformMenus.reduce<Record<string, number>>((counts, platformMenu) => {
    const key = `${platformMenu.platformCode}:${platformMenu.platformMenuName.trim()}`
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})

const buildCandidateCatalog = (
  menus: MenuRow[],
  mappings: PlatformMenuMappingRecord[],
  platformMenus: PlatformMenuCatalogRecord[]
): Record<PlatformCode, MappingCandidate[]> => {
  const menuById = new Map(menus.map((menu) => [menu.menuId, menu]))
  const mappingByPlatformMenuKey = new Map(
    mappings.map((mapping) => [`${mapping.platformCode}:${mapping.platformMenuId}`, mapping])
  )
  const platformMenuKeys = new Set(
    platformMenus.map((platformMenu) => `${platformMenu.platformCode}:${platformMenu.platformMenuId}`)
  )
  const mergedPlatformMenus = [
    ...platformMenus,
    ...mappings
      .filter((mapping) => !platformMenuKeys.has(`${mapping.platformCode}:${mapping.platformMenuId}`))
      .map((mapping) => ({
        platformCode: mapping.platformCode,
        platformMenuId: mapping.platformMenuId,
        platformMenuName: mapping.platformMenuName,
        platformMenuGroupName: mapping.platformMenuGroupName ?? null,
        platformMenuStatus: mapping.platformMenuStatus ?? null,
        platformMenuPriceSummary: mapping.platformMenuPriceSummary ?? null,
        platformMenuPriceVariants: mapping.platformMenuPriceVariants ?? null,
        platformMenuBindingSummary: mapping.platformMenuBindingSummary ?? null,
        platformMenuBindingStatus: mapping.platformMenuBindingStatus ?? null
      }))
  ].reduce<PlatformMenuCatalogRecord[]>((records, record) => {
    const exists = records.some(
      (current) =>
        current.platformCode === record.platformCode &&
        current.platformMenuId === record.platformMenuId
    )

    if (!exists) {
      records.push(record)
    }

    return records
  }, [])
  const duplicateCountsWithFallback = buildDuplicateCounts(mergedPlatformMenus)

  return platforms.reduce<Record<PlatformCode, MappingCandidate[]>>(
    (catalog, platformCode) => {
      catalog[platformCode] = mergedPlatformMenus
        .filter((platformMenu) => platformMenu.platformCode === platformCode)
        .map((platformMenu) => {
          const currentMapping = mappingByPlatformMenuKey.get(
            `${platformMenu.platformCode}:${platformMenu.platformMenuId}`
          )

          return {
            currentMappingId: currentMapping?.mappingId,
            currentMenuId: currentMapping?.menuId,
            currentBaseName: currentMapping
              ? menuById.get(currentMapping.menuId)?.baseName ?? ''
              : undefined,
            platformCode: platformMenu.platformCode,
            platformMenuId: platformMenu.platformMenuId,
            platformMenuName: platformMenu.platformMenuName,
            platformMenuGroupName: platformMenu.platformMenuGroupName ?? undefined,
            platformMenuStatus: platformMenu.platformMenuStatus ?? undefined,
            platformMenuPriceSummary: platformMenu.platformMenuPriceSummary ?? undefined,
            platformMenuPriceVariants: platformMenu.platformMenuPriceVariants ?? undefined,
            platformMenuBindingSummary: platformMenu.platformMenuBindingSummary ?? undefined,
            platformMenuBindingStatus: platformMenu.platformMenuBindingStatus ?? undefined,
            duplicateNameCount:
              duplicateCountsWithFallback[
                `${platformMenu.platformCode}:${platformMenu.platformMenuName.trim()}`
              ]
          }
        })

      return catalog
    },
    {
      baemin: [],
      coupangeats: [],
      ddangyo: []
    }
  )
}

const buildMappingRows = (
  menus: MenuRow[],
  mappings: PlatformMenuMappingRecord[]
): MappingReviewRow[] => {
  const duplicateCounts = mappings.reduce<Record<string, number>>((counts, mapping) => {
    const key = `${mapping.platformCode}:${mapping.platformMenuName.trim()}`
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})

  return menus
    .filter((menu) => (menu.isManaged ?? 1) === 1)
    .flatMap((menu) =>
      platforms.map((platformCode) => {
        const mapping = mappings.find(
          (entry) => entry.menuId === menu.menuId && entry.platformCode === platformCode
        )

        return {
          menuId: menu.menuId,
          baseName: menu.baseName,
          platformCode,
          platformMenuId: mapping?.platformMenuId,
          platformMenuName: mapping?.platformMenuName ?? '',
          platformMenuGroupName: mapping?.platformMenuGroupName ?? undefined,
          platformMenuStatus: mapping?.platformMenuStatus ?? undefined,
          platformMenuPriceSummary: mapping?.platformMenuPriceSummary ?? undefined,
          platformMenuPriceVariants: mapping?.platformMenuPriceVariants ?? undefined,
          platformMenuBindingSummary: mapping?.platformMenuBindingSummary ?? undefined,
          platformMenuBindingStatus: mapping?.platformMenuBindingStatus ?? undefined,
          duplicateNameCount: mapping
            ? duplicateCounts[`${mapping.platformCode}:${mapping.platformMenuName.trim()}`]
            : undefined
        }
      })
    )
}

const mergeCandidateCatalog = (
  current: Record<PlatformCode, MappingCandidate[]>,
  next: Record<PlatformCode, MappingCandidate[]>
) =>
  platforms.reduce<Record<PlatformCode, MappingCandidate[]>>(
    (merged, platformCode) => {
      const byPlatformMenuId = new Map<string, MappingCandidate>()

      for (const candidate of current[platformCode]) {
        byPlatformMenuId.set(candidate.platformMenuId, candidate)
      }

      for (const candidate of next[platformCode]) {
        byPlatformMenuId.set(candidate.platformMenuId, candidate)
      }

      merged[platformCode] = [...byPlatformMenuId.values()]
      return merged
    },
    {
      baemin: [],
      coupangeats: [],
      ddangyo: []
    }
  )

export const MappingPage = () => {
  const [rows, setRows] = useState<MappingReviewRow[]>([])
  const [catalog, setCatalog] = useState<Record<PlatformCode, MappingCandidate[]>>({
    baemin: [],
    coupangeats: [],
    ddangyo: []
  })
  const [search, setSearch] = useState('')

  const reload = () =>
    Promise.all([appApi.menus.list(), appApi.mappings.list(), appApi.platformMenus.list()]).then(
      ([menuValue, mappingValue, platformMenuValue]) => {
        const menus = Array.isArray(menuValue) ? (menuValue as MenuRow[]) : []
        const mappings = Array.isArray(mappingValue)
          ? (mappingValue as PlatformMenuMappingRecord[])
          : []
        const platformMenus = Array.isArray(platformMenuValue)
          ? (platformMenuValue as PlatformMenuCatalogRecord[])
          : []

        setRows(buildMappingRows(menus, mappings))
        setCatalog((current) =>
          mergeCandidateCatalog(current, buildCandidateCatalog(menus, mappings, platformMenus))
        )
      }
    )

  useEffect(() => {
    void reload()
  }, [])

  const handleSelectCandidate = (
    menuId: string,
    platformCode: PlatformCode,
    candidate: MappingCandidate
  ) => {
    const mappingId = `${menuId}:${platformCode}`

    void Promise.resolve()
      .then(() => {
        if (candidate.currentMappingId && candidate.currentMappingId !== mappingId) {
          return appApi.mappings.delete(candidate.currentMappingId)
        }

        return undefined
      })
      .then(() =>
        appApi.mappings.save({
          mappingId,
          menuId,
          platformCode,
          platformMenuId: candidate.platformMenuId,
          platformMenuName: candidate.platformMenuName,
          platformMenuGroupName: candidate.platformMenuGroupName ?? null,
          platformMenuStatus: candidate.platformMenuStatus ?? null,
          platformMenuPriceSummary: candidate.platformMenuPriceSummary ?? null,
          platformMenuPriceVariants: candidate.platformMenuPriceVariants ?? null,
          platformMenuBindingSummary: candidate.platformMenuBindingSummary ?? null,
          platformMenuBindingStatus: candidate.platformMenuBindingStatus ?? null,
          matchedBy: 'manual',
          isConfirmed: 1
        })
      )
      .then(() => reload())
  }

  const handleClear = (menuId: string, platformCode: PlatformCode) => {
    void appApi.mappings
      .delete(`${menuId}:${platformCode}`)
      .then(() => reload())
  }

  const normalizedSearch = normalizeSearchValue(search)
  const visibleMenuIds = new Set(
    rows
      .filter((row) => {
        if (!normalizedSearch) {
          return true
        }

        const searchableText = normalizeSearchValue(
          [
            row.baseName,
            row.platformMenuName,
            row.platformMenuGroupName,
            row.platformMenuStatus,
            row.platformMenuBindingStatus,
            row.platformMenuPriceSummary,
            ...flattenPlatformMenuPriceVariants(row.platformMenuPriceVariants)
          ].join(' ')
        )

        return searchableText.includes(normalizedSearch)
      })
      .map((row) => row.menuId)
  )
  const filteredRows = rows.filter((row) => visibleMenuIds.has(row.menuId))
  const menuCount = new Set(filteredRows.map((row) => row.menuId)).size
  const connectedCount = filteredRows.filter((row) => row.platformMenuId).length
  const pendingCount = filteredRows.filter((row) => !row.platformMenuId).length

  return (
    <section className="page">
      <header className="page-header">
        <h1>매핑 검토</h1>
        <p>관리 대상 메뉴만 보면서 후보를 눌러 연결하고, 잘못 붙은 매핑은 바로 해제합니다.</p>
      </header>

      <section className="panel panel-flat">
        {!!rows.length && (
          <div className="workspace-summary">
            <article className="change-summary-row">
              <strong>{menuCount}</strong>
              <span>검토 중인 기준 메뉴</span>
            </article>
            <article className="change-summary-row">
              <strong>{connectedCount}</strong>
              <span>현재 연결된 플랫폼 메뉴</span>
            </article>
            <article className="change-summary-row">
              <strong>{pendingCount}</strong>
              <span>아직 비어 있는 연결</span>
            </article>
          </div>
        )}
        {!!rows.length && (
          <div className="panel-toolbar workspace-toolbar">
            <div className="workspace-toolbar-copy">
              <strong>기준 메뉴별 연결 검토</strong>
              <span>한 메뉴 안에서 플랫폼별 후보와 현재 연결을 같이 비교합니다.</span>
            </div>
            <label className="toolbar-search">
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="기준 메뉴 또는 현재 연결 검색"
                type="search"
                value={search}
              />
            </label>
          </div>
        )}
        {filteredRows.length ? (
          <MappingReviewTable
            rows={filteredRows}
            catalog={catalog}
            onSelectCandidate={handleSelectCandidate}
            onClear={handleClear}
          />
        ) : rows.length ? (
          <p className="source-empty">조건에 맞는 기준 메뉴가 없습니다.</p>
        ) : (
          <p className="source-empty">관리 대상 메뉴가 없습니다.</p>
        )}
      </section>
    </section>
  )
}
