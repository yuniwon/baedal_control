import { describe, expect, it } from 'vitest'
import { PlatformAdapterRegistry } from '../../../src/main/platforms/base/registry'

describe('PlatformAdapterRegistry', () => {
  it('returns a registered adapter by platform code', () => {
    const registry = new PlatformAdapterRegistry()
    registry.register('baemin', {
      platformCode: 'baemin',
      fetchMenus: () => Promise.resolve([]),
      applyMenuUpdate: () => Promise.resolve()
    })

    expect(registry.get('baemin')).toBeDefined()
  })
})
