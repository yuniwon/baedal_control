import type { PlatformCode, SyncPreviewItem } from '../../../shared/contracts'

export interface PlatformMenuSnapshot {
  platformMenuId: string
  platformMenuName: string
  currentPrice?: number
}

export interface PlatformAdapter {
  platformCode: PlatformCode
  fetchMenus(): Promise<PlatformMenuSnapshot[]>
  applyMenuUpdate(item: SyncPreviewItem): Promise<void>
}
