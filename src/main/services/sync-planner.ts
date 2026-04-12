import type { MenuRecord, PlatformMenuMappingRecord } from '../../shared/contracts'

interface BuildSyncPreviewInput {
  menus: MenuRecord[]
  mappings: PlatformMenuMappingRecord[]
}

interface SyncPreviewItem {
  platformCode: PlatformMenuMappingRecord['platformCode']
  menuId: string
  platformMenuId: string
  previousName: string
  nextName: string
  nextPrice: number
}

interface SyncPreviewNeedsReview {
  menuId: string
  reason: 'missing_mapping'
}

export const buildSyncPreview = ({
  menus,
  mappings
}: BuildSyncPreviewInput): {
  items: SyncPreviewItem[]
  needsReview: SyncPreviewNeedsReview[]
} => {
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
