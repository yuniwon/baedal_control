import { describe, expect, it } from 'vitest'
import type { MenuRecord, PlatformMenuMappingRecord } from '../../../src/shared/contracts'
import { buildCatalogPublicationPreview } from '../../../src/shared/catalog-publication'

const menu: Pick<MenuRecord, 'menuId' | 'baseName' | 'basePrice' | 'basePriceVariants'> = {
  menuId: 'menu-1',
  baseName: '새 피자',
  basePrice: 22000,
  basePriceVariants: null
}

describe('buildCatalogPublicationPreview', () => {
  it('separates automatic, manual, and blocked creation targets', () => {
    const preview = buildCatalogPublicationPreview({
      menu,
      targetPlatformCodes: ['baemin', 'yogiyo', 'naverorder'],
      mappings: []
    })

    expect(preview.items.map((item) => [item.platformCode, item.disposition])).toEqual([
      ['baemin', 'manual'],
      ['yogiyo', 'manual'],
      ['naverorder', 'blocked']
    ])
    expect(preview.summary).toMatchObject({ total: 3, automatic: 0, manual: 2, blocked: 1 })
  })

  it('does not plan a duplicate creation for an existing confirmed mapping', () => {
    const mapping: PlatformMenuMappingRecord = {
      mappingId: 'mapping-1',
      menuId: menu.menuId,
      platformCode: 'baemin',
      platformMenuId: 'source-1',
      platformMenuName: '새 피자',
      matchedBy: 'manual',
      isConfirmed: 1,
      mappingStatus: 'active'
    }
    const preview = buildCatalogPublicationPreview({
      menu,
      targetPlatformCodes: ['baemin'],
      mappings: [mapping]
    })

    expect(preview.items[0]).toMatchObject({
      disposition: 'already_connected',
      canAutoCreate: false
    })
  })
})
