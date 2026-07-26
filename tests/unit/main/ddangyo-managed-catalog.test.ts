import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { DdangyoManagedCatalogReader } from '../../../src/main/platforms/ddangyo/managed-catalog'

describe('DdangyoManagedCatalogReader', () => {
  it('reads every returned menu group from the authenticated managed tab', async () => {
    const html = readFileSync(
      join(process.cwd(), 'tests', 'fixtures', 'platforms', 'ddangyo', 'menu-list.html'),
      'utf8'
    )
    const inspect = vi.fn().mockResolvedValue({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: true,
      error: null,
      tabs: [
        {
          tabId: 'ddangyo-tab',
          title: '땡겨요 사장님라운지',
          url: 'https://boss.ddangyo.com/',
          type: 'page',
          host: 'boss.ddangyo.com',
          platformCode: 'ddangyo',
          pageKind: 'unknown'
        }
      ]
    })
    const evaluateJson = vi
      .fn()
      .mockResolvedValueOnce({ groupCount: 1, ungrouped: null })
      .mockResolvedValueOnce({ groupName: '피자', html })
    const reader = new DdangyoManagedCatalogReader(
      { inspect },
      { evaluateJson }
    )

    const menus = await reader.read()

    expect(menus).toHaveLength(2)
    expect(menus.every((menu) => menu.platformMenuGroupName === '피자')).toBe(true)
    expect(evaluateJson).toHaveBeenNthCalledWith(
      1,
      'ddangyo-tab',
      expect.stringContaining('메뉴관리')
    )
    expect(evaluateJson.mock.calls[0]?.[1]).toContain(
      'dismissSafeNoticeDialogsInDocument(document)'
    )
    expect(evaluateJson).toHaveBeenNthCalledWith(
      2,
      'ddangyo-tab',
      expect.stringContaining('groupIndex = 0')
    )
  })

  it('fails without evaluating a script when no authenticated tab exists', async () => {
    const evaluateJson = vi.fn()
    const reader = new DdangyoManagedCatalogReader(
      {
        inspect: vi.fn().mockResolvedValue({
          endpointUrl: 'http://127.0.0.1:39482',
          connected: true,
          error: null,
          tabs: []
        })
      },
      { evaluateJson }
    )

    await expect(reader.read()).rejects.toThrow('ddangyo_managed_tab_not_found')
    expect(evaluateJson).not.toHaveBeenCalled()
  })
})
