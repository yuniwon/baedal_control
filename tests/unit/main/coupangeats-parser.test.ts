import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCoupangEatsMenus } from '../../../src/main/platforms/coupangeats/parser'

describe('parseCoupangEatsMenus', () => {
  it('extracts menu rows from the fixture', () => {
    const html = readFileSync('tests/fixtures/platforms/coupangeats/menu-list.html', 'utf8')
    const menus = parseCoupangEatsMenus(html)

    expect(menus[0]).toEqual(
      expect.objectContaining({
        platformMenuId: 'ce-1',
        platformMenuName: '콤비네이션'
      })
    )
  })
})
