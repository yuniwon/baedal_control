import type {
  AgentMenuReport,
  AgentMenuRunRecord,
  AgentOptionsReport,
  AgentOverviewFailureRecord,
  AgentOverviewReport,
  AgentPlatformReport,
  AgentReportEnvelope,
  AgentReportFilterInput,
  AgentReviewQueueItem,
  AgentReviewQueueReport,
  LogicalOptionGroupRecord,
  ManagedChromeSessionStatus,
  MenuRecord,
  PlatformCode,
  PlatformImportChangeRecord,
  PlatformImportRunRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord,
  PlatformOptionGroupRecord,
  SyncPreviewItem,
  SyncPreviewNeedsReview,
  SyncPreviewResult,
  SyncRunItemRecord,
  SyncRunRecord
} from '../../shared/contracts'
import { describeSyncFailure } from '../../shared/sync-error-catalog'
import { buildLogicalOptionGroups } from './logical-option-group-service'

interface AgentOperationsReportDependencies {
  menuRepository: { list: () => MenuRecord[]; get: (menuId: string) => MenuRecord | null }
  mappingRepository: {
    listAll: () => PlatformMenuMappingRecord[]
    listForMenu?: (menuId: string) => PlatformMenuMappingRecord[]
  }
  platformMenuRepository: { listAll: () => PlatformMenuCatalogRecord[] }
  platformOptionGroupRepository: { listAll: () => PlatformOptionGroupRecord[] }
  platformImportRunRepository: { listLatest: (limit?: number) => PlatformImportRunRecord[] }
  platformImportChangeRepository: { listLatest: (limit?: number) => PlatformImportChangeRecord[] }
  syncRunRepository: { list: () => SyncRunRecord[] }
  syncRunItemRepository: { listForRunIds: (syncRunIds: string[]) => SyncRunItemRecord[] }
  getSyncPreview: () => Promise<SyncPreviewResult> | SyncPreviewResult
  getManagedChromeSession: () => Promise<ManagedChromeSessionStatus> | ManagedChromeSessionStatus
  buildLogicalOptionGroups?: (groups: PlatformOptionGroupRecord[]) => LogicalOptionGroupRecord[]
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const IMPORT_LOOKBACK_LIMIT = 200

const PLATFORM_LABELS: Record<PlatformCode, string> = {
  baemin: '배민',
  coupangeats: '쿠팡이츠',
  ddangyo: '땡겨요'
}

const clampLimit = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_LIMIT
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)))
}

const buildEnvelope = <TData>(
  task: AgentReportEnvelope<TData>['task'],
  summary: string,
  data: TData
): AgentReportEnvelope<TData> => ({
  task,
  generatedAt: new Date().toISOString(),
  summary,
  data
})

const createEmptyPlatformCounts = () =>
  ({
    baemin: { executable: 0, needsReview: 0 },
    coupangeats: { executable: 0, needsReview: 0 },
    ddangyo: { executable: 0, needsReview: 0 }
  }) satisfies AgentOverviewReport['previewCounts']['byPlatform']

const createEmptyOptionStatusCounts = () =>
  ({
    single: 0,
    merge_candidate: 0,
    shape_conflict: 0,
    missing_suspected: 0,
    absent_confirmed: 0,
    resurfaced: 0
  }) satisfies AgentOptionsReport['byStatus']

const filterPreviewItem = (
  item: Pick<SyncPreviewItem, 'platformCode' | 'menuId' | 'platformMenuId'>,
  filters: AgentReportFilterInput
) => {
  if (filters.platformCode && item.platformCode !== filters.platformCode) {
    return false
  }

  if (filters.menuId && item.menuId !== filters.menuId) {
    return false
  }

  if (filters.platformMenuId && item.platformMenuId !== filters.platformMenuId) {
    return false
  }

  return true
}

const filterNeedsReviewItem = (
  item: SyncPreviewNeedsReview,
  filters: AgentReportFilterInput
) => {
  if (filters.platformCode && item.platformCode !== filters.platformCode) {
    return false
  }

  if (filters.menuId && item.menuId !== filters.menuId) {
    return false
  }

  if (filters.platformMenuId && item.platformMenuId !== filters.platformMenuId) {
    return false
  }

  if (filters.reason && item.reason !== filters.reason) {
    return false
  }

  return true
}

const filterFailureRecord = (
  item: Pick<AgentOverviewFailureRecord, 'platformCode' | 'menuId'>,
  filters: AgentReportFilterInput
) => {
  if (filters.platformCode && item.platformCode !== filters.platformCode) {
    return false
  }

  if (filters.menuId && item.menuId !== filters.menuId) {
    return false
  }

  return true
}

const scopeManagedChromeSession = (
  session: ManagedChromeSessionStatus,
  platformCode?: PlatformCode | null
) => {
  if (!platformCode) {
    return session
  }

  return {
    ...session,
    tabs: session.tabs.filter((tab) => tab.platformCode === platformCode)
  }
}

const parseImportSummary = (summaryJson?: string | null) => {
  if (!summaryJson) {
    return null
  }

  try {
    return JSON.parse(summaryJson) as {
      fetchedCount?: number
      optionGroupCount?: number
    }
  } catch {
    return null
  }
}

const isActiveCatalogPresence = (
  presenceStatus?: PlatformMenuCatalogRecord['presenceStatus'] | PlatformOptionGroupRecord['presenceStatus']
) => presenceStatus === undefined || presenceStatus === 'present' || presenceStatus === 'resurfaced'

export class AgentOperationsReportService {
  constructor(private readonly dependencies: AgentOperationsReportDependencies) {}

  async getOverviewReport(
    filters: AgentReportFilterInput
  ): Promise<AgentReportEnvelope<AgentOverviewReport>> {
    const menus = this.dependencies.menuRepository.list()
    const preview = await this.dependencies.getSyncPreview()
    const limit = clampLimit(filters.limit)
    const previewItems = preview.items.filter((item) => filterPreviewItem(item, filters))
    const needsReviewItems = preview.needsReview.filter((item) => filterNeedsReviewItem(item, filters))
    const latestImports = this.dependencies.platformImportRunRepository
      .listLatest(IMPORT_LOOKBACK_LIMIT)
      .filter((item) => !filters.platformCode || item.platformCode === filters.platformCode)
      .slice(0, limit)
    const recentFailures = this.buildRecentFailures(filters).slice(0, limit)
    const managedChrome = scopeManagedChromeSession(
      await this.dependencies.getManagedChromeSession(),
      filters.platformCode
    )
    const byPlatform = createEmptyPlatformCounts()

    for (const item of previewItems) {
      byPlatform[item.platformCode].executable += 1
    }

    for (const item of needsReviewItems) {
      if (item.platformCode) {
        byPlatform[item.platformCode].needsReview += 1
      }
    }

    const menuCounts = {
      total: menus.length,
      managed: menus.filter((menu) => (menu.isManaged ?? 1) !== 0).length,
      unmanaged: menus.filter((menu) => (menu.isManaged ?? 1) === 0).length,
      dirty: menus.filter((menu) => menu.isDirty !== 0).length
    }

    const data: AgentOverviewReport = {
      menuCounts,
      previewCounts: {
        executable: previewItems.length,
        needsReview: needsReviewItems.length,
        byPlatform
      },
      latestImports,
      recentFailures,
      managedChrome
    }

    return buildEnvelope(
      'agent-report-overview',
      `관리 대상 메뉴 ${menuCounts.managed}개, 실행 가능 ${data.previewCounts.executable}건, 검토 필요 ${data.previewCounts.needsReview}건`,
      data
    )
  }

  async getReviewQueueReport(
    filters: AgentReportFilterInput
  ): Promise<AgentReportEnvelope<AgentReviewQueueReport>> {
    const preview = await this.dependencies.getSyncPreview()
    const menus = this.dependencies.menuRepository.list()
    const mappings = this.dependencies.mappingRepository.listAll()
    const platformMenus = this.dependencies.platformMenuRepository.listAll()
    const limit = clampLimit(filters.limit)
    const menuIndex = new Map(menus.map((menu) => [menu.menuId, menu]))
    const mappingIndex = new Map(
      mappings.map((mapping) => [
        `${mapping.menuId}:${mapping.platformCode}:${mapping.platformMenuId}`,
        mapping
      ])
    )
    const platformMenuIndex = new Map(
      platformMenus.map((menu) => [`${menu.platformCode}:${menu.platformMenuId}`, menu])
    )

    const items = preview.needsReview
      .filter((item) => filterNeedsReviewItem(item, filters))
      .map((item): AgentReviewQueueItem => {
        const menu = menuIndex.get(item.menuId)
        const mapping =
          item.platformCode && item.platformMenuId
            ? mappingIndex.get(`${item.menuId}:${item.platformCode}:${item.platformMenuId}`)
            : undefined
        const platformMenu =
          item.platformCode && item.platformMenuId
            ? platformMenuIndex.get(`${item.platformCode}:${item.platformMenuId}`)
            : undefined

        return {
          menuId: item.menuId,
          menuName: menu?.baseName ?? '(삭제된 기준 메뉴)',
          menuBasePrice: menu?.basePrice ?? 0,
          platformCode: item.platformCode,
          platformMenuId: item.platformMenuId,
          reason: item.reason,
          detail: item.detail,
          platformMenuName: mapping?.platformMenuName ?? platformMenu?.platformMenuName ?? null,
          platformMenuPriceSummary:
            mapping?.platformMenuPriceSummary ?? platformMenu?.platformMenuPriceSummary ?? null
        }
      })

    return buildEnvelope(
      'agent-report-review-queue',
      `검토 필요 ${items.length}건`,
      {
        total: items.length,
        items: items.slice(0, limit)
      }
    )
  }

  async getMenuReport(
    menuId: string,
    filters: AgentReportFilterInput
  ): Promise<AgentReportEnvelope<AgentMenuReport>> {
    const menu = this.dependencies.menuRepository.get(menuId)

    if (!menu) {
      throw new Error(`agent_report_menu_not_found:${menuId}`)
    }

    const preview = await this.dependencies.getSyncPreview()
    const mappings = (this.dependencies.mappingRepository.listForMenu?.(menuId) ??
      this.dependencies.mappingRepository
        .listAll()
        .filter((mapping) => mapping.menuId === menuId))
      .filter((mapping) => !filters.platformCode || mapping.platformCode === filters.platformCode)

    const linkedSourceKeys = new Set(
      mappings.map((mapping) => `${mapping.platformCode}:${mapping.platformMenuId}`)
    )

    const optionGroupsForMenu = this.dependencies.platformOptionGroupRepository
      .listAll()
      .filter((group) =>
        group.menus.some((menuRecord) =>
          linkedSourceKeys.has(`${group.platformCode}:${menuRecord.platformMenuId}`)
        )
      )
    const logicalOptionGroups = this.buildLogicalGroups(optionGroupsForMenu)
    const recentRuns = this.buildRecentRunsForMenu(menuId, filters)

    const data: AgentMenuReport = {
      menu,
      mappings,
      preview: {
        executable: preview.items.filter(
          (item) => item.menuId === menuId && filterPreviewItem(item, filters)
        ),
        needsReview: preview.needsReview.filter(
          (item) => item.menuId === menuId && filterNeedsReviewItem(item, filters)
        )
      },
      logicalOptionGroups,
      recentRuns
    }

    return buildEnvelope('agent-report-menu', `${menu.baseName} 상세 리포트`, data)
  }

  async getOptionsReport(
    filters: AgentReportFilterInput
  ): Promise<AgentReportEnvelope<AgentOptionsReport>> {
    const limit = clampLimit(filters.limit)
    const allGroups = this.buildLogicalGroups(
      this.dependencies.platformOptionGroupRepository
        .listAll()
        .filter((group) => !filters.platformCode || group.platformCode === filters.platformCode)
    )
    const byStatus = createEmptyOptionStatusCounts()

    for (const group of allGroups) {
      byStatus[group.status] += 1
    }

    const data: AgentOptionsReport = {
      total: allGroups.length,
      byStatus,
      groups: allGroups.slice(0, limit)
    }

    return buildEnvelope(
      'agent-report-options',
      `옵션 묶음 ${data.total}개, 통합 가능 ${data.byStatus.merge_candidate}개`,
      data
    )
  }

  async getPlatformReport(
    platformCode: PlatformCode,
    filters: AgentReportFilterInput
  ): Promise<AgentReportEnvelope<AgentPlatformReport>> {
    const limit = clampLimit(filters.limit)
    const scopedFilters = {
      ...filters,
      platformCode
    }
    const latestImport =
      this.dependencies.platformImportRunRepository
        .listLatest(IMPORT_LOOKBACK_LIMIT)
        .find((item) => item.platformCode === platformCode) ?? null
    const latestImportSummary = parseImportSummary(latestImport?.summaryJson)
    const latestChanges = this.dependencies.platformImportChangeRepository
      .listLatest(IMPORT_LOOKBACK_LIMIT)
      .filter((item) => item.platformCode === platformCode)
      .slice(0, limit)
    const reviewQueue = (await this.getReviewQueueReport(scopedFilters)).data.items
    const recentFailures = this.buildRecentFailures(scopedFilters).slice(0, limit)
    const managedChrome = scopeManagedChromeSession(
      await this.dependencies.getManagedChromeSession(),
      platformCode
    )

    const data: AgentPlatformReport = {
      platformCode,
      menuCount:
        latestImportSummary?.fetchedCount ??
        this.dependencies.platformMenuRepository
          .listAll()
          .filter(
            (menu) => menu.platformCode === platformCode && isActiveCatalogPresence(menu.presenceStatus)
          ).length,
      optionGroupCount:
        latestImportSummary?.optionGroupCount ??
        this.dependencies.platformOptionGroupRepository
          .listAll()
          .filter(
            (group) =>
              group.platformCode === platformCode && isActiveCatalogPresence(group.presenceStatus)
          ).length,
      latestImport,
      latestChanges,
      reviewQueue,
      recentFailures,
      managedChrome
    }

    return buildEnvelope(
      'agent-report-platform',
      `${PLATFORM_LABELS[platformCode]} 메뉴 ${data.menuCount}개, 검토 ${reviewQueue.length}건`,
      data
    )
  }

  private buildLogicalGroups(platformGroups: PlatformOptionGroupRecord[]) {
    return (this.dependencies.buildLogicalOptionGroups ?? buildLogicalOptionGroups)(platformGroups)
  }

  private buildRecentFailures(filters: AgentReportFilterInput) {
    const syncRuns = this.dependencies.syncRunRepository.list()
    const syncRunIndex = new Map(syncRuns.map((run) => [run.syncRunId, run]))
    const syncRunItems = this.dependencies.syncRunItemRepository
      .listForRunIds(syncRuns.map((run) => run.syncRunId))
      .filter((item) => item.status !== 'success' && (item.errorCode || item.errorMessage))
      .map((item): AgentOverviewFailureRecord => {
        const descriptor = describeSyncFailure(item.errorCode, item.errorMessage)

        return {
          syncRunId: item.syncRunId,
          syncRunItemId: item.syncRunItemId,
          startedAt: syncRunIndex.get(item.syncRunId)?.startedAt ?? '',
          platformCode: item.platformCode,
          menuId: item.menuId,
          errorCode: item.errorCode,
          errorMessage: item.errorMessage,
          message: descriptor.message,
          action: descriptor.action ?? null,
          retryable: descriptor.retryable
        }
      })
      .filter((item) => filterFailureRecord(item, filters))
      .sort(
        (left, right) =>
          right.startedAt.localeCompare(left.startedAt) ||
          right.syncRunItemId.localeCompare(left.syncRunItemId)
      )

    return syncRunItems
  }

  private buildRecentRunsForMenu(menuId: string, filters: AgentReportFilterInput) {
    const limit = clampLimit(filters.limit)
    const syncRuns = this.dependencies.syncRunRepository.list()
    const items = this.dependencies.syncRunItemRepository.listForRunIds(
      syncRuns.map((run) => run.syncRunId)
    )
    const recentRuns: AgentMenuRunRecord[] = []

    for (const run of syncRuns) {
      const runItems = items.filter(
        (item) =>
          item.syncRunId === run.syncRunId &&
          item.menuId === menuId &&
          (!filters.platformCode || item.platformCode === filters.platformCode)
      )

      if (runItems.length === 0) {
        continue
      }

      recentRuns.push({
        ...run,
        items: runItems
      })
    }

    return recentRuns.slice(0, limit)
  }
}
