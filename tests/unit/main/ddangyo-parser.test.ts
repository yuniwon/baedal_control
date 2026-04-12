import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDdangyoMenus } from '../../../src/main/platforms/ddangyo/parser'

describe('parseDdangyoMenus', () => {
  it('extracts menu rows from the fixture', () => {
    const html = readFileSync('tests/fixtures/platforms/ddangyo/menu-list.html', 'utf8')
    const menus = parseDdangyoMenus(html)

    expect(menus[0]).toEqual(
      expect.objectContaining({
        platformMenuId: 'dd-1',
        platformMenuName: '콤비네이션'
      })
    )
  })
})
