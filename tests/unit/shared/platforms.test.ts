import { describe, expect, it } from 'vitest'

import {
  PLATFORM_CODES,
  PLATFORM_METADATA,
  getPlatformLabel,
  isPlatformCode
} from '../../../src/shared/platforms'

describe('platform registry', () => {
  it('keeps all six supported platforms in a stable display order', () => {
    expect(PLATFORM_CODES).toEqual([
      'baemin',
      'yogiyo',
      'coupangeats',
      'ddangyo',
      'deliveryspecial',
      'naverorder'
    ])
  })

  it('provides labels and official management hosts for every platform', () => {
    expect(getPlatformLabel('deliveryspecial')).toBe('배달특급')
    expect(getPlatformLabel('naverorder')).toBe('네이버주문')

    for (const platformCode of PLATFORM_CODES) {
      expect(PLATFORM_METADATA[platformCode].managementHosts.length).toBeGreaterThan(0)
      expect(PLATFORM_METADATA[platformCode].loginUrl).toMatch(/^https:\/\//u)
    }
  })

  it('recognizes only supported platform codes', () => {
    expect(isPlatformCode('yogiyo')).toBe(true)
    expect(isPlatformCode('unknown')).toBe(false)
    expect(isPlatformCode(null)).toBe(false)
  })
})
