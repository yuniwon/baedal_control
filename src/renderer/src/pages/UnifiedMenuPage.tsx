import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CatalogMaintenancePreview,
  CatalogMaintenanceResult,
  CatalogProjectionPreview,
  MenuRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord
} from '../../../shared/contracts'
import { getPlatformLabel, PLATFORM_CODES } from '../../../shared/platforms'
import type { MenuRow } from '../components/MenuTable'
import { CategoryRail } from '../components/menu-workspace/CategoryRail'
import { MenuDetailPane } from '../components/menu-workspace/MenuDetailPane'
import { MenuListPane } from '../components/menu-workspace/MenuListPane'
import { CreateMenuPanel } from '../components/menu-workspace/CreateMenuPanel'
import {
  deriveCatalogMenuItems,
  filterCatalogMenuItems,
  getCatalogCategories,
  type CatalogMenuFilter,
  type CatalogMenuListItem
} from '../lib/catalog-workspace-view'
import { appApi } from '../lib/api'
import { buildReferenceCategoryIndex, resolveCatalogCategory } from '../lib/catalog-category'
import { OptionPage } from './OptionPage'

const assembleMenuRows = (
  menus: MenuRecord[],
  mappings: PlatformMenuMappingRecord[],
  platformMenus: PlatformMenuCatalogRecord[]
): MenuRow[] => {
  const referenceCategories = buildReferenceCategoryIndex(
    platformMenus
      .filter((menu) => menu.platformCode === 'baemin' && menu.presenceStatus !== 'absent_confirmed')
      .map((menu) => menu.platformMenuGroupName)
  )

  return menus.map((menu) => {
    const sources = mappings.filter((mapping) => mapping.menuId === menu.menuId).map((mapping) => {
      const source = platformMenus.find((candidate) => candidate.platformCode === mapping.platformCode && candidate.platformMenuId === mapping.platformMenuId)
      return {
        platformCode: mapping.platformCode,
        platformMenuId: mapping.platformMenuId,
        platformMenuName: mapping.platformMenuName,
        mappingStatus: mapping.mappingStatus,
        presenceStatus: source?.presenceStatus,
        lastSeenAt: source?.lastSeenAt,
        platformMenuGroupName: source?.platformMenuGroupName ?? mapping.platformMenuGroupName ?? undefined,
        platformMenuStatus: source?.platformMenuStatus ?? mapping.platformMenuStatus ?? undefined,
        platformMenuPriceSummary: source?.platformMenuPriceSummary ?? mapping.platformMenuPriceSummary ?? undefined,
        platformMenuPriceVariants: source?.platformMenuPriceVariants ?? mapping.platformMenuPriceVariants ?? undefined,
        platformMenuBindingSummary: source?.platformMenuBindingSummary ?? mapping.platformMenuBindingSummary ?? undefined,
        platformMenuBindingStatus: source?.platformMenuBindingStatus ?? mapping.platformMenuBindingStatus ?? undefined,
        optionGroups: []
      }
    })
    const activeSources = sources.filter((source) =>
      source.mappingStatus !== 'source_absent' && source.presenceStatus !== 'absent_confirmed'
    )
    const referenceSource = activeSources.find((source) =>
      source.platformCode === 'baemin' && source.platformMenuGroupName
    )
    const categoryName = resolveCatalogCategory(
      [referenceSource?.platformMenuGroupName, ...activeSources.map((source) => source.platformMenuGroupName)],
      referenceCategories
    )
    return { ...menu, categoryName, sources }
  })
}

const filterLabels: Array<{ value: CatalogMenuFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'managed', label: '관리 대상' },
  { value: 'review', label: '확인 필요' },
  { value: 'excluded', label: '관리 제외' }
]

const projectionModeLabels = {
  price_rows: '가격행 사용',
  required_size_option: '필수 사이즈 옵션',
  separate_menus: '플랫폼 메뉴 분리',
  single_menu: '단일 메뉴',
  unverified: '확인 필요'
} as const

const projectionStatusLabels = {
  ready: '구조 확인',
  review: '검토 필요',
  blocked: '수집 필요'
} as const

const projectionAmount = (amount: number | null | undefined) =>
  amount === null || amount === undefined ? '미정' : `${amount.toLocaleString()}원`

export const UnifiedMenuPage = () => {
  const [items, setItems] = useState<CatalogMenuListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CatalogMenuFilter>('all')
  const [view, setView] = useState<'menus' | 'options'>('menus')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [detailDirty, setDetailDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [maintenancePreview, setMaintenancePreview] = useState<CatalogMaintenancePreview | null>(null)
  const [maintenanceResult, setMaintenanceResult] = useState<CatalogMaintenanceResult | null>(null)
  const [maintenanceState, setMaintenanceState] = useState<'idle' | 'loading' | 'applying'>('idle')
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null)
  const [projectionPreview, setProjectionPreview] = useState<CatalogProjectionPreview | null>(null)
  const [projectionState, setProjectionState] = useState<'idle' | 'loading'>('idle')
  const [projectionError, setProjectionError] = useState<string | null>(null)

  const loadCatalog = useCallback(async () => {
    const [menus, mappings, platformMenus] = await Promise.all([
      appApi.menus.list(),
      appApi.mappings.list(),
      appApi.platformMenus.list()
    ])
    setItems(deriveCatalogMenuItems(assembleMenuRows(
      menus as MenuRecord[], mappings as PlatformMenuMappingRecord[], platformMenus as PlatformMenuCatalogRecord[]
    )))
  }, [])

  useEffect(() => {
    void loadCatalog()
      .catch((reason) => setError(reason instanceof Error ? reason.message : '메뉴를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [loadCatalog])

  const categories = useMemo(() => getCatalogCategories(items), [items])
  const visible = useMemo(() => filterCatalogMenuItems(items, search, category, filter), [items, search, category, filter])
  const selected = items.find((item) => item.menuId === selectedId) ?? null
  const save = async (next: CatalogMenuListItem) => {
    const { sources: _sources, categoryName: _category, priceSummary: _summary, connectedPlatformCount: _count, issueCount: _issues, searchText: _search, ...payload } = next
    await appApi.menus.save(payload)
    setItems((current) => deriveCatalogMenuItems(current.map((item) => item.menuId === next.menuId ? next : item)))
  }
  const create = async (menu: MenuRecord) => {
    await appApi.menus.save(menu)
    const [next] = deriveCatalogMenuItems([{ ...menu, categoryName: '미분류', sources: [] }])
    setItems((current) => [...current, next])
    setCreating(false)
    setSelectedId(menu.menuId)
  }
  const canLeaveDraft = () => !detailDirty || (globalThis.confirm?.('저장하지 않은 변경이 있습니다. 이동할까요?') ?? true)
  const selectMenu = (item: CatalogMenuListItem) => {
    if (!canLeaveDraft()) return
    setCreating(false)
    setSelectedId(item.menuId)
  }
  const changeView = (next: 'menus' | 'options') => {
    if (next === view || canLeaveDraft()) setView(next)
  }
  const previewMaintenance = async () => {
    setMaintenanceState('loading')
    setMaintenanceError(null)
    setMaintenanceResult(null)
    try {
      setMaintenancePreview(await appApi.catalogMaintenance.preview('baemin'))
    } catch (reason) {
      setMaintenanceError(reason instanceof Error ? reason.message : '정리할 데이터를 확인하지 못했습니다.')
    } finally {
      setMaintenanceState('idle')
    }
  }
  const applyMaintenance = async () => {
    if (!maintenancePreview) return
    setMaintenanceState('applying')
    setMaintenanceError(null)
    try {
      const result = await appApi.catalogMaintenance.apply({
        referencePlatformCode: maintenancePreview.referencePlatformCode,
        acceptedCandidateIds: maintenancePreview.safeMerges.map((candidate) => candidate.candidateId),
        excludeHiddenOnlyMenus: true
      })
      setMaintenanceResult(result)
      await loadCatalog()
    } catch (reason) {
      setMaintenanceError(reason instanceof Error ? reason.message : '데이터 정리를 적용하지 못했습니다.')
    } finally {
      setMaintenanceState('idle')
    }
  }
  const previewProjection = async () => {
    setProjectionState('loading')
    setProjectionError(null)
    try {
      setProjectionPreview(await appApi.catalogMaintenance.projectionPreview('baemin'))
    } catch (reason) {
      setProjectionError(reason instanceof Error ? reason.message : '가격 구조를 확인하지 못했습니다.')
    } finally {
      setProjectionState('idle')
    }
  }
  const projectionGroups = useMemo(() => PLATFORM_CODES.map((platformCode) => ({
    platformCode,
    items: projectionPreview?.items.filter((item) => item.platformCode === platformCode) ?? []
  })).filter((group) => group.items.length > 0), [projectionPreview])

  return (
    <section className="page catalog-page">
      <header className="catalog-header">
        <div><span className="eyebrow">메뉴 운영의 기준</span><h1>통합메뉴</h1><p>한 번 정리한 메뉴를 각 배달앱과 비교하고 안전하게 관리합니다.</p></div>
        <div className="catalog-header-actions"><button className="secondary-button" disabled={maintenanceState !== 'idle'} onClick={() => void previewMaintenance()} type="button">{maintenanceState === 'loading' ? '확인 중…' : '데이터 정리'}</button><button className="secondary-button" disabled={projectionState !== 'idle'} onClick={() => void previewProjection()} type="button">{projectionState === 'loading' ? '구조 확인 중…' : '가격 구조 미리보기'}</button><button className="primary-button" onClick={() => { if (canLeaveDraft()) { setSelectedId(null); setCreating(true) } }} type="button">+ 새 메뉴</button></div>
      </header>
      {maintenancePreview && (
        <section className="catalog-maintenance-panel" aria-label="통합메뉴 데이터 정리">
          <header>
            <div><span className="eyebrow">안전 정리 미리보기</span><h2>통합메뉴 데이터 정리</h2></div>
            <button aria-label="데이터 정리 닫기" className="icon-button" onClick={() => setMaintenancePreview(null)} type="button">×</button>
          </header>
          <p>배민을 기준으로 확실히 같은 메뉴만 합칩니다. 각 플랫폼에서 가져온 원본은 삭제하지 않으며, 변경 전에 데이터베이스를 백업합니다.</p>
          <div className="maintenance-summary">
            <strong>확정 병합 {maintenancePreview.safeMerges.length}개</strong>
            <strong>숨김 메뉴 제외 {maintenancePreview.hiddenMenuIds.length}개</strong>
          </div>
          {maintenancePreview.safeMerges.length > 0 && <ul className="maintenance-candidates">{maintenancePreview.safeMerges.map((candidate) => <li key={candidate.candidateId}><span>{candidate.sourceName}</span><b aria-hidden="true">→</b><span>{candidate.targetName}</span><small>{candidate.platformCode}</small></li>)}</ul>}
          {maintenanceError && <p className="maintenance-error" role="alert">{maintenanceError}</p>}
          {maintenanceResult ? <p className="maintenance-success" role="status">통합메뉴 {maintenanceResult.remainingMenuCount}개로 정리했습니다.</p> : (
            <footer><span>판단이 애매한 메뉴는 자동으로 합치지 않고 확인 대상으로 남깁니다.</span><button className="primary-button" disabled={maintenanceState !== 'idle'} onClick={() => void applyMaintenance()} type="button">{maintenanceState === 'applying' ? '백업 및 정리 중…' : '백업 후 정리 적용'}</button></footer>
          )}
        </section>
      )}
      {projectionPreview && (
        <section className="catalog-projection-panel" aria-label="플랫폼별 가격 구조 미리보기">
          <header>
            <div><span className="eyebrow">저장 전 확인</span><h2>플랫폼별 가격 구조 미리보기</h2></div>
            <button aria-label="가격 구조 미리보기 닫기" className="icon-button" onClick={() => setProjectionPreview(null)} type="button">×</button>
          </header>
          <p>통합메뉴 가격을 실제 플랫폼의 가격행·필수 옵션·분리 메뉴 중 어떤 방식으로 표현할지 보여줍니다. 이 화면은 원본이나 플랫폼 메뉴를 변경하지 않습니다.</p>
          <div className="projection-platform-grid">
            {projectionPreview.platforms.map((platform) => <article className="projection-platform-card" key={platform.platformCode}>
              <strong>{getPlatformLabel(platform.platformCode)}</strong>
              <span>{platform.itemCount}개 대상</span>
              <div><b className="projection-ready">{platform.readyCount} 확인</b><b className="projection-review">{platform.reviewCount} 검토</b>{platform.blockedCount > 0 && <b className="projection-blocked">{platform.blockedCount} 수집 필요</b>}</div>
              <small>{platform.note}</small>
            </article>)}
          </div>
          {projectionGroups.length > 0 && <div className="projection-groups">
            {projectionGroups.map((group) => <section key={group.platformCode}>
              <h3>{getPlatformLabel(group.platformCode)} <small>{group.items.length}개</small></h3>
              <ul>
                {group.items.map((item) => <li key={`${item.platformCode}:${item.menuId}`}>
                  <div className="projection-item-heading"><strong>{item.menuName}</strong><span className={`projection-status ${item.status}`}>{projectionStatusLabels[item.status]}</span></div>
                  <div className="projection-item-meta"><span>{projectionModeLabels[item.mode]}</span><small>{item.summary}</small></div>
                  <div className="projection-variants">{item.variants.map((variant) => <span key={variant.label}><b>{variant.label}</b> {projectionAmount(variant.canonicalAmount)}{variant.priceDelta !== null && variant.priceDelta !== undefined && variant.label !== 'M' ? ` (+${projectionAmount(variant.priceDelta)})` : ''}</span>)}</div>
                  {item.warnings.length > 0 && <small className="projection-warning">{item.warnings[0]}</small>}
                </li>)}
              </ul>
            </section>)}
          </div>}
          {projectionError && <p className="maintenance-error" role="alert">{projectionError}</p>}
        </section>
      )}
      {projectionError && !projectionPreview && <p className="maintenance-error" role="alert">{projectionError}</p>}
      <div className="view-switch" aria-label="통합메뉴 보기 방식"><button className={view === 'menus' ? 'active' : ''} onClick={() => changeView('menus')} type="button">메뉴 보기</button><button className={view === 'options' ? 'active' : ''} onClick={() => changeView('options')} type="button">옵션 보기</button></div>
      {view === 'options' ? <div className="embedded-options"><OptionPage /></div> : (
        <>
          <div className="catalog-toolbar">
            <label className="catalog-search"><span aria-hidden="true">⌕</span><input aria-label="통합 검색" onChange={(event) => setSearch(event.target.value)} placeholder="메뉴명, 플랫폼명, 옵션, 가격 검색" type="search" value={search} /></label>
            <div className="filter-chips">{filterLabels.map((option) => <button className={filter === option.value ? 'active' : ''} key={option.value} onClick={() => setFilter(option.value)} type="button">{option.label}<b>{option.value === 'all' ? items.length : option.value === 'managed' ? items.filter((item) => (item.isManaged ?? 1) === 1).length : option.value === 'excluded' ? items.filter((item) => (item.isManaged ?? 1) === 0).length : items.filter((item) => item.issueCount > 0).length}</b></button>)}</div>
          </div>
          {loading ? <div className="catalog-loading" role="status">통합메뉴 불러오는 중</div> : error ? <div className="catalog-loading error" role="alert">{error}</div> : (
            <div className="menu-workspace">
              <CategoryRail categories={categories} items={items} onSelect={setCategory} selected={category} />
              <MenuListPane items={visible} onSelect={selectMenu} selectedId={selectedId} />
              {creating ? <CreateMenuPanel onCancel={() => setCreating(false)} onCreate={create} /> : <MenuDetailPane item={selected} onClose={() => { if (canLeaveDraft()) setSelectedId(null) }} onDirtyChange={setDetailDirty} onSave={save} />}
            </div>
          )}
        </>
      )}
    </section>
  )
}
