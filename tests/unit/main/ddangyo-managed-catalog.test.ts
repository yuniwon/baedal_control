import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  buildDdangyoOptionGroupSnapshots,
  DdangyoManagedCatalogReader
} from '../../../src/main/platforms/ddangyo/managed-catalog'

describe('DdangyoManagedCatalogReader', () => {
  it('builds option groups with prices, statuses, selection rules, and exact menu bindings', () => {
    const result = buildDdangyoOptionGroupSnapshots(
      [
        {
          platformMenuId: 'menu-1',
          platformMenuName: '킹쉬림프피자',
          platformMenuGroupName: '피자'
        },
        {
          platformMenuId: 'menu-2',
          platformMenuName: '꾸버스반반피자',
          platformMenuGroupName: '피자'
        }
      ],
      [
        {
          optn_grp_id: '70000008',
          optn_grp_nm: ' 사이즈 변경 ',
          optn_cnt: 2,
          menu_nm: '킹쉬림프피자, 꾸버스반반피자'
        }
      ],
      [
        {
          groupId: '70000008',
          rows: [
            {
              optn_id: '30000054',
              optn_nm: '미디움 ',
              optn_unitprc: 0,
              min_optn_choice_cnt: 1,
              max_optn_choice_cnt: 1,
              ncsr_yn: '1',
              hide_yn: '0',
              sldot_yn: '0'
            },
            {
              optn_id: '30000055',
              optn_nm: '라지',
              optn_unitprc: 4000,
              min_optn_choice_cnt: 1,
              max_optn_choice_cnt: 1,
              ncsr_yn: '1',
              hide_yn: '1',
              sldot_yn: '0'
            }
          ]
        }
      ]
    )

    expect(result.issues).toEqual([])
    expect(result.optionGroups).toEqual([
      {
        optionGroupId: '70000008',
        optionGroupName: '사이즈 변경',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        mappingMenusCount: 2,
        menus: [
          {
            platformMenuId: 'menu-1',
            platformMenuName: '킹쉬림프피자',
            platformMenuGroupName: '피자'
          },
          {
            platformMenuId: 'menu-2',
            platformMenuName: '꾸버스반반피자',
            platformMenuGroupName: '피자'
          }
        ],
        options: [
          {
            optionId: '30000054',
            optionName: '미디움',
            optionPrice: 0,
            itemStatus: '판매중',
            restockedAt: null
          },
          {
            optionId: '30000055',
            optionName: '라지',
            optionPrice: 4000,
            itemStatus: '숨김',
            restockedAt: null
          }
        ]
      }
    ])
  })

  it('marks ambiguous or missing option menu bindings as incomplete', () => {
    const result = buildDdangyoOptionGroupSnapshots(
      [
        { platformMenuId: 'menu-1', platformMenuName: '중복메뉴' },
        { platformMenuId: 'menu-2', platformMenuName: '중복메뉴' }
      ],
      [
        {
          optn_grp_id: 'group-1',
          optn_grp_nm: '추가 선택',
          optn_cnt: 0,
          menu_nm: '중복메뉴, 없는메뉴'
        }
      ],
      [{ groupId: 'group-1', rows: [] }]
    )

    expect(result.optionGroups[0]?.menus).toEqual([])
    expect(result.issues).toEqual([
      'ddangyo_option_binding_ambiguous:group-1:중복메뉴',
      'ddangyo_option_binding_missing:group-1:없는메뉴'
    ])
  })

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

  it('reads the complete option catalog after collecting menus', async () => {
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
          url: 'https://boss.ddangyo.com/#SH0301',
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
      .mockResolvedValueOnce({
        groups: [
          {
            optn_grp_id: 'group-1',
            optn_grp_nm: '추가 선택',
            optn_cnt: 1,
            menu_nm: "콰트로피자 15''"
          }
        ]
      })
      .mockResolvedValueOnce({
        groupId: 'group-1',
        rows: [
          {
            optn_grp_id: 'group-1',
            optn_id: 'option-1',
            optn_nm: '치즈 추가',
            optn_unitprc: 1000,
            min_optn_choice_cnt: 0,
            max_optn_choice_cnt: 1,
            hide_yn: '0',
            sldot_yn: '0'
          }
        ]
      })
    const reader = new DdangyoManagedCatalogReader({ inspect }, { evaluateJson })

    const result = await reader.readCatalog()

    expect(result.optionCatalogFetched).toBe(true)
    expect(result.optionGroups).toHaveLength(1)
    expect(result.optionGroups?.[0]?.menus[0]?.platformMenuId).toBe('10000001')
    expect(result.completeness).toMatchObject({
      menuCatalog: 'complete',
      optionCatalog: 'complete',
      optionBindings: 'complete',
      expectedOptionGroupCount: 1,
      collectedOptionGroupCount: 1,
      issues: []
    })
    expect(evaluateJson).toHaveBeenNthCalledWith(
      4,
      'ddangyo-tab',
      expect.stringContaining("findDataList('_dma_optionList')")
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
