import { describe, expect, it } from 'vitest'
import { suggestMappings } from '../../../src/main/services/mapping-suggester'

describe('suggestMappings', () => {
  it('auto-matches close menu names above the threshold', () => {
    const result = suggestMappings(
      [{ menuId: 'm1', baseName: '콤비네이션 피자' }],
      [{ platformMenuId: 'p1', platformMenuName: '콤비네이션피자' }]
    )

    expect(result[0]).toEqual(
      expect.objectContaining({
        menuId: 'm1',
        platformMenuId: 'p1',
        matchedBy: 'auto'
      })
    )
  })
})
