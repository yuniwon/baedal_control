export const appApiKeys = ['menus', 'mappings', 'settings', 'syncRuns', 'sync'] as const

export type AppApiKey = (typeof appApiKeys)[number]

export type PlatformCode = 'baemin' | 'coupangeats' | 'ddangyo'

export interface MenuRecord {
  menuId: string
  baseName: string
  basePrice: number
  isDirty: number
  createdAt?: string
  updatedAt?: string
}

export interface PlatformMenuMappingRecord {
  mappingId: string
  menuId: string
  platformCode: PlatformCode
  platformMenuId: string
  platformMenuName: string
  matchedBy: 'auto' | 'manual'
  isConfirmed: number
  lastVerifiedAt?: string | null
}

export interface SyncRunRecord {
  syncRunId: string
  startedAt: string
  finishedAt?: string | null
  triggerType: 'manual'
  resultSummary?: string | null
}

export interface SyncPreviewItem {
  platformCode: PlatformCode
  menuId: string
  platformMenuId: string
  previousName: string
  nextName: string
  nextPrice: number
}

export interface SyncPreviewNeedsReview {
  menuId: string
  reason: 'missing_mapping'
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
}
