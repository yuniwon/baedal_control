import type {
  MenuRecord,
  PlatformCode,
  PlatformImportFetchMode,
  PlatformImportRunRecord,
  PlatformMenuCatalogRecord,
  PlatformMenuMappingRecord,
  SyncPreviewItem,
  SyncPreviewNeedsReview,
  SyncPreviewResult
} from '../../shared/contracts'
import { requiresMultiPriceMenuReview } from '../platforms/base/menu-update-policy'

interface BuildSyncPreviewInput {
  menus: MenuRecord[]
  mappings: PlatformMenuMappingRecord[]
  platformMenus: PlatformMenuCatalogRecord[]
  platformImportRuns?: PlatformImportRunRecord[]
}

const parseImportFetchMode = (summaryJson?: string | null): PlatformImportFetchMode | null => {
  if (!summaryJson) {
    return null
  }

  try {
    const parsed = JSON.parse(summaryJson) as { fetchMode?: unknown }
    return parsed.fetchMode === 'managed_browser' ? 'managed_browser' : null
  } catch {
    return null
  }
}

const buildPlatformFetchModeMap = (platformImportRuns: PlatformImportRunRecord[] = []) => {
  const fetchModes = new Map<PlatformCode, PlatformImportFetchMode>()

  for (const run of platformImportRuns) {
    if (fetchModes.has(run.platformCode)) {
      continue
    }

    const fetchMode = parseImportFetchMode(run.summaryJson)
    if (fetchMode) {
      fetchModes.set(run.platformCode, fetchMode)
    }
  }

  return fetchModes
}

const buildImportedPlatformSet = (platformImportRuns: PlatformImportRunRecord[] = []) =>
  new Set(platformImportRuns.map((run) => run.platformCode))

const buildCatalogPlatformSet = (platformMenus: PlatformMenuCatalogRecord[] = []) =>
  new Set(platformMenus.map((menu) => menu.platformCode))

export const buildSyncPreview = ({
  menus,
  mappings,
  platformMenus,
  platformImportRuns
}: BuildSyncPreviewInput): SyncPreviewResult => {
  const items: SyncPreviewItem[] = []
  const needsReview: SyncPreviewNeedsReview[] = []
  const platformFetchModes = buildPlatformFetchModeMap(platformImportRuns)
  const importedPlatforms = buildImportedPlatformSet(platformImportRuns)
  const catalogPlatforms = buildCatalogPlatformSet(platformMenus)
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
      const nameChanged = mapping.platformMenuName !== menu.baseName
      const priceChanged =
        typeof mapping.platformMenuCurrentPrice === 'number'
          ? mapping.platformMenuCurrentPrice !== menu.basePrice
          : true

      if (!nameChanged && !priceChanged) {
        continue
      }

      if (
        !sourcePlatformMenu &&
        importedPlatforms.has(mapping.platformCode) &&
        catalogPlatforms.has(mapping.platformCode)
      ) {
        needsReview.push({
          menuId: menu.menuId,
          platformCode: mapping.platformCode,
          platformMenuId: mapping.platformMenuId,
          reason: 'source_missing_review',
          detail: 'catalog_missing'
        })
        continue
      }

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
        requiresMultiPriceMenuReview({
          platformCode: mapping.platformCode,
          platformMenuPriceCount: mapping.platformMenuPriceCount ?? null,
          nameChanged,
          priceChanged
        })
      ) {
        needsReview.push({
          menuId: menu.menuId,
          platformCode: mapping.platformCode,
          platformMenuId: mapping.platformMenuId,
          reason: 'price_variant_review',
          detail: '다중 가격 메뉴'
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
        executionMode:
          platformFetchModes.get(mapping.platformCode) === 'managed_browser'
            ? 'managed_browser'
            : undefined,
        platformMenuPriceCount: mapping.platformMenuPriceCount ?? null,
        platformMenuGroupName: mapping.platformMenuGroupName ?? null,
        platformMenuPriceSummary: mapping.platformMenuPriceSummary ?? null,
        platformMenuBindingSummary: mapping.platformMenuBindingSummary ?? null
      })
    }
  }

  return { items, needsReview }
}
