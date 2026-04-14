import type {
  ManagedChromeSessionStatus,
  MenuRecord,
  PlatformImportRunRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord,
  SyncPreviewItem
} from '../../shared/contracts'
import { buildPlatformMenuPriceSummary } from '../../shared/platform-menu-price-summary'
import { buildSyncPreview } from './sync-planner'

interface SyncSuccessReconcilerDependencies {
  menuRepository: {
    get: (menuId: string) => MenuRecord | null
    list: () => MenuRecord[]
    setDirty: (menuId: string, isDirty: number) => void
  }
  mappingRepository: {
    listAll: () => PlatformMenuMappingRecord[]
    listForMenu: (menuId: string) => PlatformMenuMappingRecord[]
    upsert: (record: PlatformMenuMappingRecord) => void
  }
  platformMenuRepository: {
    listAll: () => PlatformMenuCatalogRecord[]
    upsert: (record: PlatformMenuCatalogRecord) => void
  }
  platformImportRunRepository?: {
    listLatest: (limit?: number) => PlatformImportRunRecord[]
  }
  managedChromeSessionProvider?: () =>
    | Promise<ManagedChromeSessionStatus | null>
    | ManagedChromeSessionStatus
    | null
}

export class SyncSuccessReconciler {
  constructor(private readonly deps: SyncSuccessReconcilerDependencies) {}

  async reconcile(item: SyncPreviewItem) {
    const menu = this.deps.menuRepository.get(item.menuId)
    if (!menu) {
      return
    }

    const mapping = this.deps
      .mappingRepository
      .listForMenu(item.menuId)
      .find(
        (entry) =>
          entry.platformCode === item.platformCode && entry.platformMenuId === item.platformMenuId
      )

    if (mapping) {
      this.deps.mappingRepository.upsert({
        ...mapping,
        platformMenuName: item.nextName,
        platformMenuCurrentPrice: this.resolveCurrentPrice(item, mapping.platformMenuCurrentPrice),
        platformMenuPriceCount:
          item.nextPriceVariants?.length
          ?? mapping.platformMenuPriceCount
          ?? (typeof item.nextPrice === 'number' ? 1 : null),
        platformMenuPriceSummary: buildPlatformMenuPriceSummary(
          item.nextPriceVariants,
          this.resolveCurrentPrice(item, mapping.platformMenuCurrentPrice)
        ),
        platformMenuPriceVariants: item.nextPriceVariants ?? mapping.platformMenuPriceVariants ?? null,
        mappingStatus: 'active'
      })
    }

    const platformMenu = this.deps
      .platformMenuRepository
      .listAll()
      .find(
        (entry) =>
          entry.platformCode === item.platformCode && entry.platformMenuId === item.platformMenuId
      )

    if (platformMenu) {
      this.deps.platformMenuRepository.upsert({
        ...platformMenu,
        platformMenuName: item.nextName,
        platformMenuCurrentPrice: this.resolveCurrentPrice(item, platformMenu.platformMenuCurrentPrice),
        platformMenuPriceCount:
          item.nextPriceVariants?.length
          ?? platformMenu.platformMenuPriceCount
          ?? (typeof item.nextPrice === 'number' ? 1 : null),
        platformMenuPriceSummary: buildPlatformMenuPriceSummary(
          item.nextPriceVariants,
          this.resolveCurrentPrice(item, platformMenu.platformMenuCurrentPrice)
        ),
        platformMenuPriceVariants:
          item.nextPriceVariants ?? platformMenu.platformMenuPriceVariants ?? null,
        missingStreak: 0,
        presenceStatus: 'present'
      })
    }

    const managedChromeSession = this.deps.managedChromeSessionProvider
      ? await this.deps.managedChromeSessionProvider()
      : null
    const preview = buildSyncPreview({
      menus: this.deps.menuRepository.list(),
      mappings: this.deps.mappingRepository.listAll(),
      platformMenus: this.deps.platformMenuRepository.listAll(),
      platformImportRuns: this.deps.platformImportRunRepository?.listLatest(50) ?? [],
      managedChromeSession
    })

    const hasRemainingWork =
      preview.items.some((previewItem) => previewItem.menuId === item.menuId)
      || preview.needsReview.some((previewItem) => previewItem.menuId === item.menuId)

    if (!hasRemainingWork) {
      this.deps.menuRepository.setDirty(item.menuId, 0)
    }
  }

  private resolveCurrentPrice(item: SyncPreviewItem, previousPrice?: number | null) {
    if (typeof item.nextPrice === 'number' && Number.isFinite(item.nextPrice)) {
      return item.nextPrice
    }

    if (typeof previousPrice === 'number' && Number.isFinite(previousPrice)) {
      return previousPrice
    }

    return null
  }
}
