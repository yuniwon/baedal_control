import type { SyncPreviewItem } from '../../../shared/contracts'
import type { PlatformCapabilityManifest } from '../../../shared/platform-capabilities'
import type { PlatformCode, PlatformMetadata } from '../../../shared/platforms'
import type {
  PlatformAuthDriver,
  PlatformCatalogReader,
  PlatformPlugin
} from './plugin'
import type { PlatformAdapter } from './types'

export const createLegacyCatalogReader = (
  adapter: PlatformAdapter
): PlatformCatalogReader => ({
  fetchCatalog: async () => {
    const result = adapter.fetchMenusWithInspection
      ? await adapter.fetchMenusWithInspection()
      : { menus: await adapter.fetchMenus() }

    if (result.optionCatalogFetched === true || !adapter.fetchOptionGroups) {
      return result
    }

    return {
      ...result,
      optionGroups: await adapter.fetchOptionGroups(),
      optionCatalogFetched: true
    }
  }
})

export const createLegacyAdapterPlugin = (
  adapter: PlatformAdapter,
  metadata: PlatformMetadata & { code: PlatformCode },
  capabilities: PlatformCapabilityManifest,
  auth: PlatformAuthDriver
): PlatformPlugin => ({
  metadata,
  capabilities,
  auth,
  ...(capabilities.operations.read
    ? { reader: createLegacyCatalogReader(adapter) }
    : {}),
  ...(capabilities.operations.write
    ? {
        writer: {
          apply: (item: SyncPreviewItem) => adapter.applyMenuUpdate(item)
        }
      }
    : {})
})
