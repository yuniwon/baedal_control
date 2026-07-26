import { describe, expect, it } from 'vitest'
import { PlatformAdapterRegistry } from '../../../src/main/platforms/base/registry'

describe('PlatformAdapterRegistry', () => {
  it('exposes legacy adapters through narrow reader and writer views', async () => {
    const registry = new PlatformAdapterRegistry()
    const applyMenuUpdate = () => Promise.resolve()
    registry.register('baemin', {
      platformCode: 'baemin',
      fetchMenus: () => Promise.resolve([]),
      applyMenuUpdate
    })

    expect(registry.get('baemin')).toBeDefined()
    await expect(registry.getReader('baemin').fetchCatalog()).resolves.toEqual({ menus: [] })
    expect(registry.getWriter('baemin').apply).toBeDefined()
  })
})
