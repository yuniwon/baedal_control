import { describe, expect, it, vi } from 'vitest'

import { createLegacyAdapterPlugin } from '../../../src/main/platforms/base/legacy-adapter-plugin'
import type { PlatformAdapter } from '../../../src/main/platforms/base/types'
import { PLATFORM_CAPABILITIES } from '../../../src/shared/platform-capabilities'
import { PLATFORM_METADATA } from '../../../src/shared/platforms'

const auth = { probe: async () => ({ state: 'ready' as const }) }

const createAdapter = (overrides: Partial<PlatformAdapter> = {}): PlatformAdapter => ({
  platformCode: 'baemin',
  fetchMenus: async () => [],
  applyMenuUpdate: async () => undefined,
  ...overrides
})

describe('createLegacyAdapterPlugin', () => {
  it('maps an inspected catalog to the plugin reader', async () => {
    const fetchResult = {
      menus: [{ platformMenuId: 'm-1', platformMenuName: '고구마피자' }],
      rawMenuCount: 1
    }
    const adapter = createAdapter({
      fetchMenusWithInspection: vi.fn().mockResolvedValue(fetchResult)
    })
    const plugin = createLegacyAdapterPlugin(
      adapter,
      { code: 'baemin', ...PLATFORM_METADATA.baemin },
      PLATFORM_CAPABILITIES.baemin,
      auth
    )

    await expect(plugin.reader?.fetchCatalog()).resolves.toEqual(fetchResult)
  })

  it('preserves separately fetched option groups in one catalog result', async () => {
    const optionGroups = [{
      optionGroupId: 'size',
      optionGroupName: '사이즈',
      options: [],
      menus: []
    }]
    const adapter = createAdapter({
      fetchMenus: vi.fn().mockResolvedValue([
        { platformMenuId: 'm-1', platformMenuName: '고구마피자' }
      ]),
      fetchOptionGroups: vi.fn().mockResolvedValue(optionGroups)
    })
    const plugin = createLegacyAdapterPlugin(
      adapter,
      { code: 'baemin', ...PLATFORM_METADATA.baemin },
      PLATFORM_CAPABILITIES.baemin,
      auth
    )

    await expect(plugin.reader?.fetchCatalog()).resolves.toMatchObject({
      optionCatalogFetched: true,
      optionGroups
    })
  })

  it('omits a writer when the manifest says writes are unverified', () => {
    const plugin = createLegacyAdapterPlugin(
      createAdapter({ platformCode: 'yogiyo' }),
      { code: 'yogiyo', ...PLATFORM_METADATA.yogiyo },
      PLATFORM_CAPABILITIES.yogiyo,
      auth
    )

    expect(plugin.writer).toBeUndefined()
  })
})
