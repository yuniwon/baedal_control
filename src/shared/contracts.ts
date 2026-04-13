export const appApiKeys = [
  'menus',
  'mappings',
  'platformOptionGroups',
  'logicalOptionGroups',
  'platformMenus',
  'platformImportRuns',
  'platformImportChanges',
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

export interface MenuRecord {
  menuId: string
  baseName: string
  basePrice: number
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
    linkedMenuNames: string[]
  }>
}

export interface SyncRunRecord {
  syncRunId: string
  startedAt: string
  finishedAt?: string | null
  triggerType: 'manual'
  resultSummary?: string | null
  items?: SyncRunItemRecord[]
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
}

export interface SyncPreviewItem {
  platformCode: PlatformCode
  menuId: string
  platformMenuId: string
  previousName: string
  previousPrice?: number | null
  nextName: string
  nextPrice: number
  platformMenuPriceCount?: number | null
  platformMenuPriceSummary?: string | null
  platformMenuBindingSummary?: string | null
}

export interface SyncPreviewNeedsReview {
  menuId: string
  platformCode?: PlatformCode
  platformMenuId?: string
  reason: 'missing_mapping' | 'binding_review' | 'price_variant_review'
  detail?: string
}

export interface SyncPreviewResult {
  items: SyncPreviewItem[]
  needsReview: SyncPreviewNeedsReview[]
}

export interface PlatformImportSummary {
  platformCode: PlatformCode
  fetchedCount: number
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
