import type {
  MenuRecord,
  PlatformMenuMappingRecord,
  SyncPreviewItem,
  SyncPreviewNeedsReview,
  SyncPreviewResult
} from '../../shared/contracts'

interface BuildSyncPreviewInput {
  menus: MenuRecord[]
  mappings: PlatformMenuMappingRecord[]
}

export const buildSyncPreview = ({
  menus,
  mappings
}: BuildSyncPreviewInput): SyncPreviewResult => {
  const items: SyncPreviewItem[] = []
  const needsReview: SyncPreviewNeedsReview[] = []

  for (const menu of menus.filter((entry) => entry.isDirty)) {
    const relatedMappings = mappings.filter(
      (mapping) => mapping.menuId === menu.menuId && mapping.isConfirmed
    )

    if (relatedMappings.length === 0) {
      needsReview.push({ menuId: menu.menuId, reason: 'missing_mapping' })
      continue
    }

    for (const mapping of relatedMappings) {
      items.push({
        platformCode: mapping.platformCode,
        menuId: menu.menuId,
        platformMenuId: mapping.platformMenuId,
        previousName: mapping.platformMenuName,
        nextName: menu.baseName,
        nextPrice: menu.basePrice
      })
    }
  }

  return { items, needsReview }
}
