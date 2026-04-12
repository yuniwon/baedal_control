import type { PlatformCode } from '../../../shared/contracts'
import type { PlatformAdapter } from './types'

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
}
