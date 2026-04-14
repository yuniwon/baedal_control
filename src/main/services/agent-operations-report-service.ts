import type {
  AgentActionPlanItem,
  AgentActionPlanReport,
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

const REVIEW_REASON_LABELS: Record<SyncPreviewNeedsReview['reason'], string> = {
  missing_mapping: '플랫폼 메뉴 연결 필요',
  binding_review: '연결 상태 재확인 필요',
  price_variant_review: '가격 구조 확인 필요',
  source_missing_review: '플랫폼 원본 누락 확인 필요',
  managed_session_write_review: '관리 브라우저 쓰기 환경 확인 필요'
}

const REVIEW_REASON_PRIORITIES: Record<SyncPreviewNeedsReview['reason'], 'high' | 'medium'> = {
  missing_mapping: 'high',
  binding_review: 'medium',
  price_variant_review: 'medium',
  source_missing_review: 'medium',
  managed_session_write_review: 'high'
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

const createEmptyActionPlanPriorityCounts = () =>
  ({
    high: 0,
    medium: 0,
    low: 0
  }) satisfies AgentActionPlanReport['byPriority']

const formatPrice = (value?: number | null) =>
  typeof value === 'number' ? `${new Intl.NumberFormat('ko-KR').format(value)}원` : '가격 미확인'

const buildTaskArgs = (
  task: string,
  filters: {
    platformCode?: PlatformCode | null
    menuId?: string | null
    platformMenuId?: string | null
    reason?: SyncPreviewNeedsReview['reason'] | null
    limit?: number | null
  }
) => {
  const args = [`--task=${task}`]

  if (filters.platformCode) {
    args.push(`--platformCode=${filters.platformCode}`)
  }

  if (filters.menuId) {
    args.push(`--menuId=${filters.menuId}`)
  }

  if (filters.platformMenuId) {
    args.push(`--platformMenuId=${filters.platformMenuId}`)
  }

  if (filters.reason) {
    args.push(`--reason=${filters.reason}`)
  }

  if (typeof filters.limit === 'number') {
    args.push(`--limit=${filters.limit}`)
  }

  return args
}

const PRIORITY_ORDER: Record<AgentActionPlanItem['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2
}

const ACTION_KIND_ORDER: Record<AgentActionPlanItem['kind'], number> = {
  run_executable: 0,
  resolve_review: 1,
  inspect_failures: 2,
  review_options: 3,
  idle: 4
}

const summarizeFailureMessages = (messages: string[]) => {
  const counts = new Map<string, number>()

  for (const message of messages) {
    counts.set(message, (counts.get(message) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ko-KR'))
    .slice(0, 3)
    .map(([message, count]) => `${message} ${count}건`)
}

const formatOptionShapeSummary = (group: LogicalOptionGroupRecord) => {
  const sampleOptions = group.logicalOptions.slice(0, 3).map((option) => {
    const priceLabel = option.optionPrice > 0 ? ` ${formatPrice(option.optionPrice)}` : ''
    return `${option.optionName}${priceLabel}`
  })
  const hiddenOptionCount = Math.max(0, group.logicalOptions.length - sampleOptions.length)

  if (hiddenOptionCount === 0) {
    return sampleOptions.join(', ')
  }

  return `${sampleOptions.join(', ')} 외 ${hiddenOptionCount}개`
}

const buildOptionReviewEvidence = (groups: LogicalOptionGroupRecord[]) => {
  const firstGroup = groups[0]
  const linkedMenuNames = new Set<string>()
  let sourceGroupCount = 0

  for (const group of groups) {
    sourceGroupCount += group.sourceGroupCount

    for (const sourceGroup of group.sourceGroups) {
      for (const linkedMenuName of sourceGroup.linkedMenuNames) {
        linkedMenuNames.add(linkedMenuName)
      }
    }
  }

  return [
    `플랫폼: ${PLATFORM_LABELS[firstGroup.platformCode]}`,
    `구조 ${groups.length}개`,
    `원본 그룹 ${sourceGroupCount}개`,
    `연결 메뉴 ${linkedMenuNames.size}개`,
    ...groups.slice(0, 3).map((group, index) => `구조 ${index + 1}: ${formatOptionShapeSummary(group)}`)
  ]
}

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

  async getNextActionPlan(
    filters: AgentReportFilterInput
  ): Promise<AgentReportEnvelope<AgentActionPlanReport>> {
    const limit = clampLimit(filters.limit)
    const menus = this.dependencies.menuRepository.list()
    const menuIndex = new Map(menus.map((menu) => [menu.menuId, menu]))
    const reviewQueue = (await this.getReviewQueueReport(filters)).data.items
    const preview = await this.dependencies.getSyncPreview()
    const logicalOptionGroups = this.buildLogicalGroups(
      this.dependencies.platformOptionGroupRepository
        .listAll()
        .filter((group) => !filters.platformCode || group.platformCode === filters.platformCode)
    )
    const recentFailures = this.buildRecentFailures(filters)
    const actions: AgentActionPlanItem[] = []

    for (const item of preview.items.filter((previewItem) => filterPreviewItem(previewItem, filters))) {
      const menu = menuIndex.get(item.menuId)
      actions.push({
        id: `run:${item.platformCode}:${item.menuId}:${item.platformMenuId}`,
        kind: 'run_executable',
        priority: 'high',
        platformCode: item.platformCode,
        menuId: item.menuId,
        platformMenuId: item.platformMenuId,
        title: `${PLATFORM_LABELS[item.platformCode]} 메뉴 동기화 실행`,
        detail: `${menu?.baseName ?? item.nextName} 변경사항을 지금 바로 반영할 수 있습니다.`,
        evidence: [
          `기준 메뉴: ${menu?.baseName ?? item.nextName}`,
          `플랫폼 메뉴 ID: ${item.platformMenuId}`,
          `변경 가격: ${formatPrice(item.previousPrice)} -> ${formatPrice(item.nextPrice)}`
        ],
        commands: [
          {
            task: 'sync-run-item',
            args: buildTaskArgs('sync-run-item', {
              platformCode: item.platformCode,
              menuId: item.menuId,
              platformMenuId: item.platformMenuId
            }),
            label: '이 메뉴만 즉시 반영'
          }
        ]
      })
    }

    for (const item of reviewQueue) {
      actions.push({
        id: `review:${item.reason}:${item.platformCode ?? 'unknown'}:${item.menuId}:${item.platformMenuId ?? 'none'}`,
        kind: 'resolve_review',
        priority: REVIEW_REASON_PRIORITIES[item.reason],
        platformCode: item.platformCode ?? null,
        menuId: item.menuId,
        platformMenuId: item.platformMenuId ?? null,
        title: REVIEW_REASON_LABELS[item.reason],
        detail: item.detail ?? `${item.menuName} 항목의 플랫폼 연결 상태를 확인해야 합니다.`,
        evidence: [
          `기준 메뉴: ${item.menuName}`,
          item.platformMenuName ? `플랫폼 메뉴: ${item.platformMenuName}` : '플랫폼 메뉴: 연결 정보 없음',
          item.platformMenuPriceSummary
            ? `플랫폼 가격: ${item.platformMenuPriceSummary}`
            : `기준 가격: ${formatPrice(item.menuBasePrice)}`
        ],
        commands: [
          {
            task: 'agent-report-menu',
            args: buildTaskArgs('agent-report-menu', {
              platformCode: item.platformCode ?? null,
              menuId: item.menuId,
              platformMenuId: item.platformMenuId ?? null,
              limit: 5
            }),
            label: '메뉴 상세 리포트 열기'
          }
        ]
      })
    }

    const groupedShapeConflicts = new Map<string, LogicalOptionGroupRecord[]>()

    for (const group of logicalOptionGroups.filter(
      (item) => item.status === 'merge_candidate' || item.status === 'shape_conflict'
    )) {
      if (group.status === 'shape_conflict') {
        const conflictKey = `${group.platformCode}:${group.displayName}`
        groupedShapeConflicts.set(conflictKey, [...(groupedShapeConflicts.get(conflictKey) ?? []), group])
        continue
      }

      actions.push({
        id: `option:${group.platformCode}:${group.logicalGroupKey}`,
        kind: 'review_options',
        priority: 'low',
        platformCode: group.platformCode,
        title: `${group.displayName} 옵션 구조 검토`,
        detail: '옵션 구조가 같아서 하나의 통합 옵션으로 정리할 후보입니다.',
        evidence: [
          `플랫폼: ${PLATFORM_LABELS[group.platformCode]}`,
          `원본 그룹 ${group.sourceGroupCount}개`,
          `연결 메뉴 ${group.connectedMenuCount}개`,
          `예시 구성: ${formatOptionShapeSummary(group)}`
        ],
        commands: [
          {
            task: 'agent-report-options',
            args: buildTaskArgs('agent-report-options', {
              platformCode: group.platformCode,
              limit: 10
            }),
            label: '옵션 리포트 열기'
          }
        ]
      })
    }

    for (const conflictGroups of groupedShapeConflicts.values()) {
      const primaryGroup = conflictGroups[0]

      actions.push({
        id: `option:${primaryGroup.platformCode}:${primaryGroup.displayName}`,
        kind: 'review_options',
        priority: 'medium',
        platformCode: primaryGroup.platformCode,
        title: `${primaryGroup.displayName} 옵션 구조 검토`,
        detail: `같은 옵션명 아래에 구조 ${conflictGroups.length}개가 있어 통합 전 확인이 필요합니다.`,
        evidence: buildOptionReviewEvidence(conflictGroups),
        commands: [
          {
            task: 'agent-report-options',
            args: buildTaskArgs('agent-report-options', {
              platformCode: primaryGroup.platformCode,
              limit: 10
            }),
            label: '옵션 리포트 열기'
          }
        ]
      })
    }

    const failuresByPlatform = new Map<
      PlatformCode,
      {
        failures: AgentOverviewFailureRecord[]
      }
    >()

    for (const failure of recentFailures) {
      const group = failuresByPlatform.get(failure.platformCode) ?? { failures: [] }
      group.failures.push(failure)
      failuresByPlatform.set(failure.platformCode, group)
    }

    for (const [platformCode, group] of failuresByPlatform.entries()) {
      const latestFailure = group.failures[0]
      const sampleMenuNames = [
        ...new Set(
          group.failures
            .map((failure) => menuIndex.get(failure.menuId)?.baseName)
            .filter((value): value is string => Boolean(value))
        )
      ]

      actions.push({
        id: `failure:${platformCode}`,
        kind: 'inspect_failures',
        priority: 'medium',
        platformCode,
        menuId: latestFailure?.menuId ?? null,
        title: `${PLATFORM_LABELS[platformCode]} 최근 실패 점검`,
        detail: `최근 실패 ${group.failures.length}건이 누적되어 원인 정리가 필요합니다.`,
        evidence: [
          ...summarizeFailureMessages(group.failures.map((failure) => failure.message)),
          sampleMenuNames.length > 0
            ? `관련 메뉴: ${sampleMenuNames.slice(0, 3).join(', ')}`
            : '관련 메뉴 이름을 찾지 못했습니다.',
          latestFailure?.action ? `권장 조치: ${latestFailure.action}` : '권장 조치 없음'
        ],
        commands: [
          {
            task: 'agent-report-platform',
            args: buildTaskArgs('agent-report-platform', {
              platformCode,
              limit: 5
            }),
            label: '플랫폼 리포트 열기'
          }
        ]
      })
    }

    actions.sort(
      (left, right) =>
        PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
        ACTION_KIND_ORDER[left.kind] - ACTION_KIND_ORDER[right.kind] ||
        (left.platformCode ?? '').localeCompare(right.platformCode ?? '') ||
        left.id.localeCompare(right.id)
    )

    const items = actions.slice(0, limit)

    if (items.length === 0) {
      items.push({
        id: 'idle:overview',
        kind: 'idle',
        priority: 'low',
        title: '즉시 처리할 작업이 없습니다.',
        detail: '현재 기준으로 실행 가능한 동기화나 확인이 필요한 항목이 없습니다.',
        evidence: [],
        commands: [
          {
            task: 'agent-report-overview',
            args: buildTaskArgs('agent-report-overview', { limit: 10 }),
            label: '전체 현황 다시 보기'
          }
        ]
      })
    }

    const byPriority = createEmptyActionPlanPriorityCounts()

    for (const item of items) {
      byPriority[item.priority] += 1
    }

    return buildEnvelope(
      'agent-plan-next-actions',
      `다음 작업 ${items.length}건, 즉시 실행 ${byPriority.high}건, 검토 ${byPriority.medium + byPriority.low}건`,
      {
        total: items.length,
        byPriority,
        items
      }
    )
  }

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
