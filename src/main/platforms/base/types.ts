import type {
  PlatformCode,
  PlatformOptionGroupMenuRecord,
  PlatformOptionItemRecord,
  PlatformMenuBindingStatus,
  PlatformInspectionReport,
  SyncPreviewItem
} from '../../../shared/contracts'

export interface PlatformAdapterCapabilities {
  optionCatalog?: boolean
}

export interface PlatformMenuSnapshot {
  platformMenuId: string
  platformMenuName: string
  currentPrice?: number
  platformMenuPriceCount?: number
  platformMenuGroupName?: string
  platformMenuStatus?: string
  platformMenuPriceSummary?: string
  platformMenuBindingLabels?: string[]
  platformMenuBindingSummary?: string
  platformMenuBindingStatus?: PlatformMenuBindingStatus
}

export interface PlatformMenuFetchResult {
  menus: PlatformMenuSnapshot[]
  inspection?: PlatformInspectionReport
}

export interface PlatformOptionGroupSnapshot {
  optionGroupId: string
  optionGroupName: string
  minOrderQuantity?: number | null
  maxOrderQuantity?: number | null
  mappingMenusCount?: number | null
  options: PlatformOptionItemRecord[]
  menus: PlatformOptionGroupMenuRecord[]
}

export interface PlatformAdapter {
  platformCode: PlatformCode
  capabilities?: PlatformAdapterCapabilities
  fetchMenus(): Promise<PlatformMenuSnapshot[]>
  fetchMenusWithInspection?(): Promise<PlatformMenuFetchResult>
  fetchOptionGroups?(): Promise<PlatformOptionGroupSnapshot[]>
  applyMenuUpdate(item: SyncPreviewItem): Promise<void>
}
