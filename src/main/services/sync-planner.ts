import type {
  MenuRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord,
  SyncPreviewItem,
  SyncPreviewNeedsReview,
  SyncPreviewResult
} from '../../shared/contracts'

interface BuildSyncPreviewInput {
  menus: MenuRecord[]
  mappings: PlatformMenuMappingRecord[]
  platformMenus: PlatformMenuCatalogRecord[]
}

export const buildSyncPreview = ({
  menus,
  mappings,
  platformMenus
}: BuildSyncPreviewInput): SyncPreviewResult => {
  const items: SyncPreviewItem[] = []
  const needsReview: SyncPreviewNeedsReview[] = []
  const platformMenusByKey = new Map(
    platformMenus.map((platformMenu) => [
      `${platformMenu.platformCode}:${platformMenu.platformMenuId}`,
      platformMenu
    ])
  )

  for (const menu of menus.filter((entry) => entry.isDirty && (entry.isManaged ?? 1))) {
    const relatedMappings = mappings.filter(
      (mapping) => mapping.menuId === menu.menuId && mapping.isConfirmed
    )

    if (relatedMappings.length === 0) {
      needsReview.push({ menuId: menu.menuId, reason: 'missing_mapping' })
      continue
    }

    for (const mapping of relatedMappings) {
      const sourcePlatformMenu = platformMenusByKey.get(
        `${mapping.platformCode}:${mapping.platformMenuId}`
      )
      const sourcePresenceStatus = sourcePlatformMenu?.presenceStatus

      if (
        mapping.mappingStatus === 'source_absent' ||
        sourcePresenceStatus === 'missing_suspected' ||
        sourcePresenceStatus === 'absent_confirmed'
      ) {
        needsReview.push({
          menuId: menu.menuId,
          platformCode: mapping.platformCode,
          platformMenuId: mapping.platformMenuId,
          reason: 'source_missing_review',
          detail: sourcePresenceStatus ?? mapping.mappingStatus
        })
        continue
      }

      const priceChanged =
        typeof mapping.platformMenuCurrentPrice === 'number'
          ? mapping.platformMenuCurrentPrice !== menu.basePrice
          : true

      if (
        mapping.platformMenuBindingStatus &&
        mapping.platformMenuBindingStatus !== '연결 정상'
      ) {
        needsReview.push({
          menuId: menu.menuId,
          platformCode: mapping.platformCode,
          platformMenuId: mapping.platformMenuId,
          reason: 'binding_review',
          detail: mapping.platformMenuBindingStatus
        })
        continue
      }

      if (
        mapping.platformCode === 'baemin' &&
        priceChanged &&
        (mapping.platformMenuPriceCount ?? 0) > 1
      ) {
        needsReview.push({
          menuId: menu.menuId,
          platformCode: mapping.platformCode,
          platformMenuId: mapping.platformMenuId,
          reason: 'price_variant_review',
          detail: '사이즈별 가격 메뉴'
        })
        continue
      }

      items.push({
        platformCode: mapping.platformCode,
        menuId: menu.menuId,
        platformMenuId: mapping.platformMenuId,
        previousName: mapping.platformMenuName,
        previousPrice: mapping.platformMenuCurrentPrice ?? null,
        nextName: menu.baseName,
        nextPrice: menu.basePrice,
        platformMenuPriceCount: mapping.platformMenuPriceCount ?? null,
        platformMenuPriceSummary: mapping.platformMenuPriceSummary ?? null,
        platformMenuBindingSummary: mapping.platformMenuBindingSummary ?? null
      })
    }
  }

  return { items, needsReview }
}
