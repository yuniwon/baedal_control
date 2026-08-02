export type { PlatformCode } from './platforms'
import type { PlatformCode } from './platforms'

export const appApiKeys = [
  'menus',
  'mappings',
  'platformOptionGroups',
  'logicalOptionGroups',
  'platformMenus',
  'platformSessions',
  'platformAuthPreferences',
  'platformImportRuns',
  'platformImportChanges',
  'catalogWorkspace',
  'catalogBootstrap',
  'catalogReviews',
  'catalogMaintenance',
  'agentReports',
  'browserInspectionSnapshots',
  'browserInspector',
  'settings',
  'syncRuns',
  'sync'
] as const

export type AppApiKey = (typeof appApiKeys)[number]

export type CatalogLifecycleState = 'collecting' | 'reviewing' | 'active'
export type CatalogSeedMode = 'platform' | 'blank' | 'legacy'
export type CatalogReviewState = 'open' | 'resolved' | 'deferred' | 'blocked'
export type CatalogReviewRecommendation =
  | 'add_to_platform'
  | 'add_to_canonical'
  | 'align_to_canonical'
  | 'keep_platform_value'
  | 'merge_canonical_only'
  | 'ignore_source'
  | 'manual_review'
export type CatalogReviewKind =
  | 'missing_on_platform'
  | 'option_only_on_platform'
  | 'option_candidate_on_platform'
  | 'canonical_platform_only'
  | 'unmatched_platform_menu'
  | 'price_outlier'
  | 'option_price_outlier'
  | 'price_policy_pattern'
  | 'variant_shape_conflict'
  | 'duplicate_option_group'
  | 'option_shape_conflict'
  | 'legacy_noise_candidate'
  | 'external_drift'
  | 'lossy_projection'
  | 'authentication_required'

export interface CatalogWorkspaceRecord {
  workspaceId: string
  displayName: string
  lifecycleState: CatalogLifecycleState
  seedMode: CatalogSeedMode | null
  seedPlatformCode: PlatformCode | null
  canonicalVersion: number
  activatedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface CatalogMergeCandidate {
  candidateId: string
  sourceMenuId: string
  sourceName: string
  targetMenuId: string
  targetName: string
  platformCode: PlatformCode
  reason: string
  mergeKind?: 'reference_match' | 'size_sibling'
}

export interface CatalogMaintenancePreview {
  referencePlatformCode: PlatformCode
  menuCount: number
  safeMerges: CatalogMergeCandidate[]
  hiddenMenuIds: string[]
}

export interface CatalogMaintenanceApplyInput {
  referencePlatformCode: PlatformCode
  acceptedCandidateIds: string[]
  excludeHiddenOnlyMenus: boolean
}

export interface CatalogMaintenanceResult {
  backupPath: string | null
  mergedMenuCount: number
  excludedMenuCount: number
  normalizedCategoryCount: number
  refreshedReferencePriceCount: number
  remainingMenuCount: number
}

export type CatalogProjectionMode =
  | 'price_rows'
  | 'required_size_option'
  | 'separate_menus'
  | 'single_menu'
  | 'unverified'

export type CatalogProjectionStatus = 'ready' | 'review' | 'blocked'

export interface CatalogProjectionVariant {
  label: string
  canonicalAmount: number | null
  sourceAmount?: number | null
  priceDelta?: number | null
  derived: boolean
}

export interface CatalogProjectionItem {
  menuId: string
  menuName: string
  platformCode: PlatformCode
  mode: CatalogProjectionMode
  status: CatalogProjectionStatus
  summary: string
  variants: CatalogProjectionVariant[]
  sourceMenuIds: string[]
  sourceOptionGroupIds: string[]
  warnings: string[]
}

export interface CatalogProjectionPlatformSummary {
  platformCode: PlatformCode
  itemCount: number
  readyCount: number
  reviewCount: number
  blockedCount: number
  note: string
}

export interface CatalogProjectionPreview {
  referencePlatformCode: PlatformCode
  generatedAt: string
  menuCount: number
  items: CatalogProjectionItem[]
  platforms: CatalogProjectionPlatformSummary[]
}

export interface CatalogReviewItem {
  reviewItemId: string
  workspaceId: string
  fingerprint: string
  kind: CatalogReviewKind
  state: CatalogReviewState
  confidence: number
  title: string
  explanation: string
  recommendation: CatalogReviewRecommendation | null
  evidenceJson: string
  canonicalMenuId?: string | null
  platformCode?: PlatformCode | null
  sourceEntityId?: string | null
  intentRuleId?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface CatalogIntentRule {
  intentRuleId: string
  workspaceId: string
  kind: CatalogReviewKind
  scope: 'entity' | 'platform' | 'category' | 'field' | 'workspace'
  resolution:
    | 'apply_recommendation'
    | 'keep_platform_value'
    | 'exclude_platform'
    | 'defer'
    | 'ignore_source'
    | 'merge_canonical_only'
  platformCode?: PlatformCode | null
  canonicalMenuId?: string | null
  sourceEntityId?: string | null
  fieldKey?: string | null
  categoryKey?: string | null
  reason: string
  expiresAt?: string | null
  isActive: number
  createdAt?: string
  updatedAt?: string
}

export type PlatformSessionState =
  | 'unknown'
  | 'checking'
  | 'ready'
  | 'expired'
  | 'credential_required'
  | 'challenge_required'
  | 'credential_rejected'
  | 'locked_out_risk'
  | 'unsupported'
  | 'error'

export interface PlatformSessionStateRecord {
  workspaceId: string
  platformCode: PlatformCode
  state: PlatformSessionState
  detailCode?: string | null
  credentialRevision?: string | null
  lastAttemptAt?: string | null
  lastReadyAt?: string | null
  updatedAt?: string
}

export interface PlatformAuthPreferenceRecord {
  workspaceId: string
  platformCode: PlatformCode
  autoClickLoginButtonConsented: boolean
  consentUpdatedAt: string | null
  updatedAt?: string
}

export interface PlatformAuthProbe {
  state: PlatformSessionState
  detailCode?: string | null
  authenticatedStoreKey?: string | null
}

export interface CanonicalMenuProjectionInput {
  menu: MenuRecord
  mappings: PlatformMenuMappingRecord[]
  targetPlatformCode: PlatformCode
}

export interface PlatformProjectionResult {
  disposition: 'exact' | 'transformed' | 'lossy' | 'unsupported' | 'unverified'
  projectedMenu: SyncPreviewItem | null
  issues: string[]
}

export interface PlatformWriteVerification {
  status: 'verified' | 'mismatch' | 'unknown'
  issues: string[]
}

export type CatalogPresenceStatus =
  | 'present'
  | 'missing_suspected'
  | 'absent_confirmed'
  | 'resurfaced'

export type CatalogEntityType = 'menu' | 'option_group'
export type PlatformImportRunStatus = 'running' | 'completed' | 'partial_failed'
export type PlatformImportFetchMode =
  | 'embedded_browser'
  | 'managed_browser'
  | 'api_capture'
  | 'dom_fallback'
export type PlatformCatalogCompletenessState = 'complete' | 'incomplete' | 'unknown'

export interface PlatformCatalogCompleteness {
  menuCatalog: PlatformCatalogCompletenessState
  optionCatalog: PlatformCatalogCompletenessState
  optionBindings: PlatformCatalogCompletenessState
  expectedMenuCount?: number
  collectedMenuCount: number
  expectedOptionGroupCount?: number
  collectedOptionGroupCount: number
  issues: string[]
}
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

export interface CatalogBootstrapDraftMenu {
  menuId: string
  sourcePlatformCode: PlatformCode | null
  sourcePlatformMenuId: string | null
  baseName: string
  basePrice: number
  basePriceVariants: PlatformMenuPriceVariantRecord[] | null
  disposition: 'include' | 'ignore' | 'undecided'
}

export interface CatalogBootstrapPreviewInput {
  workspaceId: string
  seedMode: Exclude<CatalogSeedMode, 'legacy'>
  seedPlatformCode: PlatformCode | null
}

export interface CatalogBootstrapPreview {
  workspaceId: string
  seedMode: Exclude<CatalogSeedMode, 'legacy'>
  seedPlatformCode: PlatformCode | null
  previewFingerprint: string
  draftMenus: CatalogBootstrapDraftMenu[]
  suggestedMappings: PlatformMenuMappingRecord[]
  reviewItems: CatalogReviewItem[]
}

export interface CatalogBootstrapActivationInput {
  workspaceId: string
  seedMode: Exclude<CatalogSeedMode, 'legacy'>
  seedPlatformCode: PlatformCode | null
  previewFingerprint: string
  menus: MenuRecord[]
  ignoredSourceEntityIds: string[]
  confirmedMappings: PlatformMenuMappingRecord[]
  remainingReviewItems: CatalogReviewItem[]
}

export interface CatalogReviewResolutionInput {
  reviewItemIds: string[]
  resolution: CatalogIntentRule['resolution']
  remember: boolean
  scope: CatalogIntentRule['scope']
  reason: string
  expiresAt?: string | null
}

export interface CatalogReviewLinkInput {
  reviewItemId: string
  sourceEntityId: string
}

export interface CatalogReviewCanonicalMergeInput {
  reviewItemId: string
  targetCanonicalMenuId: string
}

export interface CatalogReviewCanonicalMergeResult {
  ok: true
  backupPath: string | null
  sourceMenuId: string
  targetMenuId: string
  resolvedCount: number
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
  visiblePasswordInputCount?: number
  loginMarkerDetected?: boolean
  logoutMarkerDetected?: boolean
  managementMarkerDetected?: boolean
}

export interface BrowserInspectorStatus {
  receiverUrl: string
  extensionPath: string
  isRunning: boolean
  chromeAvailable?: boolean
  chromePath?: string | null
  chromeProfilePath?: string | null
  passwordManagerLoginReady?: boolean
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
