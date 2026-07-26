import { describe, expect, it } from 'vitest'

import { PlatformPluginRegistry } from '../../../src/main/platforms/base/plugin-registry'
import type { PlatformPlugin } from '../../../src/main/platforms/base/plugin'
import { PLATFORM_CAPABILITIES } from '../../../src/shared/platform-capabilities'
import { PLATFORM_METADATA } from '../../../src/shared/platforms'

const fakePlugin: PlatformPlugin = {
  metadata: { code: 'baemin', ...PLATFORM_METADATA.baemin },
  capabilities: PLATFORM_CAPABILITIES.baemin,
  auth: {
    probe: async () => ({ state: 'ready' })
  },
  reader: {
    fetchCatalog: async () => ({ menus: [] })
  }
}

describe('PlatformPluginRegistry', () => {
  it('registers a plugin without a core platform switch', () => {
    const registry = new PlatformPluginRegistry()
    registry.register(fakePlugin)

    expect(registry.get(fakePlugin.metadata.code)).toBe(fakePlugin)
  })

  it('rejects duplicate plugin registration', () => {
    const registry = new PlatformPluginRegistry()
    registry.register(fakePlugin)

    expect(() => registry.register(fakePlugin)).toThrow('platform_plugin_duplicate:baemin')
  })

  it('replaces a registered plugin after credentials change', () => {
    const registry = new PlatformPluginRegistry()
    const replacement = {
      ...fakePlugin,
      auth: { probe: async () => ({ state: 'ready' as const }) }
    }

    registry.register(fakePlugin)
    registry.replace(replacement)

    expect(registry.get('baemin')).toBe(replacement)
  })

  it('exposes narrow reader and writer lookups', () => {
    const registry = new PlatformPluginRegistry()
    registry.register(fakePlugin)

    expect(registry.getReader('baemin')).toBe(fakePlugin.reader)
    expect(() => registry.getWriter('baemin')).toThrow('platform_write_unavailable:baemin')
  })
})
