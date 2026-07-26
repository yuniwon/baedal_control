import type { PlatformCode } from '../../../shared/contracts'
import type { PlatformAdapter } from './types'
import { createLegacyCatalogReader } from './legacy-adapter-plugin'

export class PlatformAdapterRegistry {
  private readonly adapters = new Map<PlatformCode, PlatformAdapter>()

  register(platformCode: PlatformCode, adapter: PlatformAdapter) {
    this.adapters.set(platformCode, adapter)
  }

  get(platformCode: PlatformCode) {
    const adapter = this.adapters.get(platformCode)
    if (!adapter) {
      throw new Error(`adapter_missing:${platformCode}`)
    }

    return adapter
  }

  getReader(platformCode: PlatformCode) {
    return createLegacyCatalogReader(this.get(platformCode))
  }

  getWriter(platformCode: PlatformCode) {
    const adapter = this.get(platformCode)
    return {
      apply: (item: Parameters<PlatformAdapter['applyMenuUpdate']>[0]) =>
        adapter.applyMenuUpdate(item)
    }
  }
}
