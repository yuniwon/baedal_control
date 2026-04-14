export const appApiKeys = [
  'menus',
  'mappings',
  'platformOptionGroups',
  'logicalOptionGroups',
  'platformMenus',
  'platformImportRuns',
  'platformImportChanges',
  'agentReports',
  'browserInspectionSnapshots',
  'browserInspector',
  'settings',
  'syncRuns',
  'sync'
] as const

export type AppApiKey = (typeof appApiKeys)[number]

export type PlatformCode = 'baemin' | 'coupangeats' | 'ddangyo'
export type CatalogPresenceStatus =
  | 'present'
  | 'missing_suspected'
  | 'absent_confirmed'
  | 'resurfaced'

export type CatalogEntityType = 'menu' | 'option_group'
export type PlatformImportRunStatus = 'running' | 'completed' | 'partial_failed'
export type PlatformImportFetchMode = 'managed_browser'
export type PlatformImportChangeType =
  | 'created'
  | 'missing_suspected'
  | 'absent_confirmed'
  | 'resurfaced'
  | 'name_changed'
  | 'price_changed'
  | 'option_signature_changed'

export type PlatformMappingStatus = 'active' | 'source_absent'
export type PlatformMenuBindingStatus =
  | '연결 정상'
  | '가게 연결 없음'
  | '다른 가게 연결'
  | '복수 연결'

export type PlatformMenuPriceChannelCode = 'base' | 'delivery' | 'pickup' | 'dine_in'

export interface PlatformMenuPriceChannelRecord {
  channelCode: PlatformMenuPriceChannelCode
  channelLabel: string
  amount?: number | null
  amountText: string
}

export interface PlatformMenuPriceVariantRecord {
  variantLabel?: string | null
  channels: PlatformMenuPriceChannelRecord[]
}

export interface MenuRecord {
  menuId: string
  baseName: string
  basePrice: number
  basePriceVariants?: PlatformMenuPriceVariantRecord[] | null
  isDirty: number
  isManaged?: number
  createdAt?: string
  updatedAt?: string
}

export interface PlatformMenuMappingRecord {
  mappingId: string
  menuId: string
  platformCode: PlatformCode
  platformMenuId: string
  platformMenuName: string
  mappingStatus?: PlatformMappingStatus
  platformMenuCurrentPrice?: number | null
  platformMenuPriceCount?: number | null
  platformMenuGroupName?: string | null
  platformMenuStatus?: string | null
  platformMenuPriceSummary?: string | null
  platformMenuPriceVariants?: PlatformMenuPriceVariantRecord[] | null
  platformMenuBindingSummary?: string | null
  platformMenuBindingStatus?: PlatformMenuBindingStatus | null
  matchedBy: 'auto' | 'manual'
  isConfirmed: number
  lastVerifiedAt?: string | null
}

export interface PlatformMenuCatalogRecord {
  platformCode: PlatformCode
  platformMenuId: string
  platformMenuName: string
  platformMenuCurrentPrice?: number | null
  platformMenuPriceCount?: number | null
  platformMenuGroupName?: string | null
  platformMenuStatus?: string | null
  platformMenuPriceSummary?: string | null
  platformMenuPriceVariants?: PlatformMenuPriceVariantRecord[] | null
  platformMenuBindingSummary?: string | null
  platformMenuBindingStatus?: PlatformMenuBindingStatus | null
  lastSeenImportId?: string | null
  lastSeenAt?: string | null
  missingStreak?: number
  presenceStatus?: CatalogPresenceStatus
  presenceChangedAt?: string | null
}

export interface PlatformOptionItemRecord {
  optionId: string
  optionName: string
  optionPrice?: number | null
  itemStatus?: string | null
  restockedAt?: string | null
}

export interface PlatformOptionGroupMenuRecord {
  platformMenuId: string
  platformMenuName: string
  platformMenuGroupName?: string | null
}

export interface PlatformOptionGroupRecord {
  platformCode: PlatformCode
  optionGroupId: string
  optionGroupName: string
  minOrderQuantity?: number | null
  maxOrderQuantity?: number | null
  mappingMenusCount?: number | null
  options: PlatformOptionItemRecord[]
  menus: PlatformOptionGroupMenuRecord[]
  signatureKey?: string | null
  lastSeenImportId?: string | null
  lastSeenAt?: string | null
  missingStreak?: number
  presenceStatus?: CatalogPresenceStatus
  presenceChangedAt?: string | null
}

export interface PlatformImportRunRecord {
  importRunId: string
  platformCode: PlatformCode
  startedAt: string
  finishedAt?: string | null
  status: PlatformImportRunStatus
  menuFetchCompleted: number
  optionFetchCompleted: number
  summaryJson?: string | null
  errorMessage?: string | null
}

export interface PlatformImportChangeRecord {
  changeId: string
  importRunId: string
  platformCode: PlatformCode
  entityType: CatalogEntityType
  entityKey: string
  entityName: string
  changeType: PlatformImportChangeType
  presenceStatus?: CatalogPresenceStatus | null
  beforeJson?: string | null
  afterJson?: string | null
  createdAt?: string
}

export interface LogicalOptionGroupRecord {
  logicalGroupKey: string
  platformCode: PlatformCode
  displayName: string
  minOrderQuantity?: number | null
  maxOrderQuantity?: number | null
  optionCount: number
  connectedMenuCount: number
  sourceGroupCount: number
  sampleOptionNames: string[]
  logicalOptions: Array<{
    optionName: string
    optionPrice: number
  }>
  status:
    | 'single'
    | 'merge_candidate'
    | 'shape_conflict'
    | 'missing_suspected'
    | 'absent_confirmed'
    | 'resurfaced'
  sourceGroups: Array<{
    optionGroupId: string
    optionGroupName: string
    presenceStatus: CatalogPresenceStatus
    lastSeenAt?: string | null
    linkedMenuCount: number
    linkedMenuNames: string[]
    options: Array<{
      optionName: string
      optionPrice: number
    }>
  }>
}

export interface AgentReportFilterInput {
  platformCode?: PlatformCode | null
  menuId?: string | null
  platformMenuId?: string | null
  reason?: SyncPreviewNeedsReview['reason'] | null
  limit?: number | null
}

export interface AgentReportEnvelope<TData> {
  task:
    | 'agent-plan-next-actions'
    | 'agent-report-overview'
    | 'agent-report-review-queue'
    | 'agent-report-menu'
    | 'agent-report-options'
    | 'agent-report-platform'
  generatedAt: string
  summary: string
  data: TData
}

export interface SyncRunRecord {
  syncRunId: string
  startedAt: string
  finishedAt?: string | null
  triggerType: 'manual'
  resultSummary?: string | null
  items?: SyncRunItemRecord[]
}

export interface SyncRunFailureContext {
  kind: 'managed_browser_snapshot' | 'platform_page_snapshot'
  status: 'captured' | 'tab_not_found' | 'capture_failed'
  capturedAt: string
  snapshotId?: string | null
  operationStage?: string | null
  pageTitle?: string | null
  pageUrl?: string | null
  pageKind?: BrowserInspectionPageKind | null
  menuCount?: number | null
  optionGroupCount?: number | null
  visibleTextSnippet?: string | null
  detail?: string | null
}

export interface SyncRunItemRecord {
  syncRunItemId: string
  syncRunId: string
  platformCode: PlatformCode
  menuId: string
  fieldType: string
  beforeValue: string | null
  afterValue: string
  status: string
  errorCode: string | null
  errorMessage: string | null
  failureContext?: SyncRunFailureContext | null
}

export interface SyncPreviewItem {
  platformCode: PlatformCode
  menuId: string
  platformMenuId: string
  previousName: string
  previousPrice?: number | null
  previousPriceVariants?: PlatformMenuPriceVariantRecord[] | null
  nextName: string
  nextPrice: number
  nextPriceVariants?: PlatformMenuPriceVariantRecord[] | null
  executionMode?: 'managed_browser'
  platformMenuPriceCount?: number | null
  platformMenuGroupName?: string | null
  platformMenuStatus?: string | null
  platformMenuPriceSummary?: string | null
  platformMenuPriceVariants?: PlatformMenuPriceVariantRecord[] | null
  platformMenuBindingSummary?: string | null
}

export interface SyncPreviewNeedsReview {
  menuId: string
  platformCode?: PlatformCode
  platformMenuId?: string
  reason:
    | 'missing_mapping'
    | 'binding_review'
    | 'price_variant_review'
    | 'source_missing_review'
    | 'managed_session_write_review'
  detail?: string
}

export interface SyncPreviewResult {
  items: SyncPreviewItem[]
  needsReview: SyncPreviewNeedsReview[]
}

export interface AgentOverviewFailureRecord {
  syncRunId: string
  syncRunItemId: string
  startedAt: string
  platformCode: PlatformCode
  menuId: string
  errorCode?: string | null
  errorMessage?: string | null
  message: string
  action?: string | null
  retryable: boolean
}

export interface AgentOverviewReport {
  menuCounts: {
    total: number
    managed: number
    unmanaged: number
    dirty: number
  }
  previewCounts: {
    executable: number
    needsReview: number
    byPlatform: Record<PlatformCode, { executable: number; needsReview: number }>
  }
  latestImports: PlatformImportRunRecord[]
  recentFailures: AgentOverviewFailureRecord[]
  managedChrome: ManagedChromeSessionStatus | null
}

export interface AgentReviewQueueItem {
  menuId: string
  menuName: string
  menuBasePrice: number
  platformCode?: PlatformCode
  platformMenuId?: string
  reason: SyncPreviewNeedsReview['reason']
  detail?: string
  platformMenuName?: string | null
  platformMenuPriceSummary?: string | null
}

export interface AgentReviewQueueReport {
  total: number
  items: AgentReviewQueueItem[]
}

export interface AgentMenuRunRecord extends SyncRunRecord {
  items: SyncRunItemRecord[]
}

export interface AgentMenuReport {
  menu: MenuRecord
  mappings: PlatformMenuMappingRecord[]
  preview: {
    executable: SyncPreviewItem[]
    needsReview: SyncPreviewNeedsReview[]
  }
  logicalOptionGroups: LogicalOptionGroupRecord[]
  recentRuns: AgentMenuRunRecord[]
}

export interface AgentOptionsReport {
  total: number
  byStatus: Record<LogicalOptionGroupRecord['status'], number>
  groups: LogicalOptionGroupRecord[]
}

export interface AgentPlatformReport {
  platformCode: PlatformCode
  menuCount: number
  optionGroupCount: number
  latestImport: PlatformImportRunRecord | null
  latestChanges: PlatformImportChangeRecord[]
  reviewQueue: AgentReviewQueueItem[]
  recentFailures: AgentOverviewFailureRecord[]
  managedChrome: ManagedChromeSessionStatus | null
}

export type AgentActionPlanKind =
  | 'run_executable'
  | 'resolve_review'
  | 'review_options'
  | 'inspect_failures'
  | 'idle'

export type AgentActionPlanPriority = 'high' | 'medium' | 'low'

export interface AgentActionPlanCommand {
  task: string
  args: string[]
  label: string
}

export interface AgentActionPlanItem {
  id: string
  kind: AgentActionPlanKind
  priority: AgentActionPlanPriority
  platformCode?: PlatformCode | null
  menuId?: string | null
  platformMenuId?: string | null
  title: string
  detail: string
  evidence: string[]
  commands: AgentActionPlanCommand[]
}

export interface AgentActionPlanReport {
  total: number
  byPriority: Record<AgentActionPlanPriority, number>
  items: AgentActionPlanItem[]
}

export interface PlatformImportSummary {
  platformCode: PlatformCode
  fetchedCount: number
  optionGroupCount?: number
  duplicateMenuCount?: number
  fetchMode?: PlatformImportFetchMode
  createdMenuCount: number
  linkedMappingCount: number
  verifiedMappingCount: number
}

export interface PlatformInspectionField {
  name: string
  value: string
  usage: 'used' | 'ignored' | 'control'
}

export interface PlatformInspectionStep {
  kind: 'navigation' | 'api' | 'result'
  title: string
  recordedAt: string
  detail?: string
  url?: string
  pageTitle?: string
  screenshotDataUrl?: string
  visibleTextSnippet?: string
  fields?: PlatformInspectionField[]
}

export interface PlatformInspectionReport {
  platformCode: PlatformCode
  steps: PlatformInspectionStep[]
}

export interface PlatformImportResult {
  summary: PlatformImportSummary
  inspection?: PlatformInspectionReport
}

export type BrowserInspectionSource = 'browser_extension' | 'manual_browser'
export type BrowserInspectionPageKind = 'menu_list' | 'option_list' | 'menu_detail' | 'unknown'
export type BrowserInspectionCaptureMode = 'viewport' | 'full_scroll'

export interface BrowserInspectionMenuItem {
  name: string
  priceText?: string | null
  categoryName?: string | null
}

export interface BrowserInspectionField {
  name: string
  value: string
  source: 'dom' | 'input' | 'button' | 'text' | 'api'
}

export interface BrowserInspectionApiEvent {
  url: string
  method: string
  status?: number | null
  capturedAt: string
  requestPreview?: string | null
  responsePreview?: string | null
}

export interface BrowserInspectionSnapshot {
  snapshotId: string
  platformCode: PlatformCode
  source: BrowserInspectionSource
  pageUrl: string
  pageTitle: string
  pageKind?: BrowserInspectionPageKind
  captureMode?: BrowserInspectionCaptureMode
  host: string
  capturedAt: string
  textSnippet?: string | null
  menuNames: string[]
  menuItems: BrowserInspectionMenuItem[]
  optionGroupNames: string[]
  buttonLabels: string[]
  inputHints: string[]
  fields: BrowserInspectionField[]
  apiEvents: BrowserInspectionApiEvent[]
  screenshotDataUrl?: string | null
}

export interface BrowserInspectorStatus {
  receiverUrl: string
  extensionPath: string
  isRunning: boolean
  chromeAvailable?: boolean
  chromePath?: string | null
  chromeProfilePath?: string | null
  managedChromeRunning?: boolean
  lastLaunchUrl?: string | null
  chromeError?: string | null
  managedChromeAutoLoginStatus?:
    | 'submitted'
    | 'already_authenticated'
    | 'credential_missing'
    | 'login_tab_not_found'
    | 'unsupported'
    | 'failed'
    | null
  managedChromeAutoLoginMessage?: string | null
  managedChromeAutoLoginPlatformCode?: PlatformCode | null
}

export interface ManagedChromeTabInfo {
  tabId: string
  title: string
  url: string
  type: string
  host: string
  platformCode: PlatformCode | null
  pageKind: BrowserInspectionPageKind
}

export interface ManagedChromeSessionStatus {
  endpointUrl: string
  connected: boolean
  error?: string | null
  tabs: ManagedChromeTabInfo[]
}
