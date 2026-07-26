import { describe, expect, it } from 'vitest'

import { getEligibleCatalogSeedPlatforms } from '../../../src/shared/platforms'

describe('catalog seed platform selection', () => {
  it('offers every complete platform and does not prefer Baemin globally', () => {
    expect(
      getEligibleCatalogSeedPlatforms({
        baemin: 'incomplete',
        yogiyo: 'complete',
        coupangeats: 'complete',
        ddangyo: 'unknown',
        deliveryspecial: 'complete',
        naverorder: 'complete'
      })
    ).toEqual(['yogiyo', 'coupangeats', 'deliveryspecial', 'naverorder'])
  })

  it('excludes platforms whose latest catalog is incomplete or unknown', () => {
    expect(
      getEligibleCatalogSeedPlatforms({
        baemin: 'unknown',
        yogiyo: 'incomplete',
        coupangeats: 'unknown',
        ddangyo: 'incomplete',
        deliveryspecial: 'unknown',
        naverorder: 'incomplete'
      })
    ).toEqual([])
  })
})
