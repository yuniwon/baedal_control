import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseBaeminMenus } from '../../../src/main/platforms/baemin/parser'

describe('parseBaeminMenus', () => {
  it('extracts platform menu id and name from the fixture', () => {
    const html = readFileSync('tests/fixtures/platforms/baemin/menu-list.html', 'utf8')
    const menus = parseBaeminMenus(html)

    expect(menus[0]).toEqual(
      expect.objectContaining({
        platformMenuId: 'bm-1',
        platformMenuName: '콤비네이션'
      })
    )
  })
})
