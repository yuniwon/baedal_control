import { describe, expect, it } from 'vitest'
import { buildLogicalOptionGroups } from '../../../src/main/services/logical-option-group-service'

describe('buildLogicalOptionGroups', () => {
  it('groups same-shape option bundles linked to different menus as merge candidates', () => {
    const groups = buildLogicalOptionGroups([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 선택',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        options: [
          { optionId: 'm', optionName: 'M', optionPrice: 0 },
          { optionId: 'l', optionName: 'L', optionPrice: 3000 }
        ],
        menus: [
          {
            platformMenuId: 'menu-a',
            platformMenuName: '불고기피자'
          }
        ],
        presenceStatus: 'present'
      },
      {
        platformCode: 'baemin',
        optionGroupId: 'g-2',
        optionGroupName: '사이즈 선택',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        options: [
          { optionId: 'm2', optionName: 'M', optionPrice: 0 },
          { optionId: 'l2', optionName: 'L', optionPrice: 3000 }
        ],
        menus: [
          {
            platformMenuId: 'menu-b',
            platformMenuName: '새우피자'
          }
        ],
        presenceStatus: 'present'
      }
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      status: 'merge_candidate',
      sourceGroupCount: 2,
      connectedMenuCount: 2
    })
  })

  it('ignores persisted signatureKey values when grouping', () => {
    const groups = buildLogicalOptionGroups([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 선택',
        options: [
          { optionId: 'm', optionName: 'M', optionPrice: 0 },
          { optionId: 'l', optionName: 'L', optionPrice: 3000 }
        ],
        menus: [{ platformMenuId: 'menu-a', platformMenuName: '메뉴 A' }],
        signatureKey: 'persisted-a',
        presenceStatus: 'present'
      },
      {
        platformCode: 'baemin',
        optionGroupId: 'g-2',
        optionGroupName: '사이즈 선택',
        options: [
          { optionId: 'm2', optionName: 'M', optionPrice: 0 },
          { optionId: 'l2', optionName: 'L', optionPrice: 3000 }
        ],
        menus: [{ platformMenuId: 'menu-b', platformMenuName: '메뉴 B' }],
        signatureKey: 'persisted-b',
        presenceStatus: 'present'
      }
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      status: 'merge_candidate',
      sourceGroupCount: 2
    })
  })

  it('uses canonicalized data for displayName and sampleOptionNames', () => {
    const groups = buildLogicalOptionGroups([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '  추가   선택 ',
        options: [
          { optionId: 'b', optionName: '  L  ', optionPrice: 3000 },
          { optionId: 'a', optionName: '  M  ', optionPrice: 0 }
        ],
        menus: [{ platformMenuId: 'menu-a', platformMenuName: '메뉴 A' }],
        presenceStatus: 'present'
      },
      {
        platformCode: 'baemin',
        optionGroupId: 'g-2',
        optionGroupName: '추가 선택',
        options: [
          { optionId: 'c', optionName: 'M', optionPrice: 0 },
          { optionId: 'd', optionName: 'L', optionPrice: 3000 }
        ],
        menus: [{ platformMenuId: 'menu-b', platformMenuName: '메뉴 B' }],
        presenceStatus: 'present'
      }
    ])

    expect(groups[0]).toMatchObject({
      displayName: '추가 선택',
      sampleOptionNames: ['L', 'M'],
      logicalOptions: [
        { optionName: 'L', optionPrice: 3000 },
        { optionName: 'M', optionPrice: 0 }
      ]
    })
  })

  it('includes logical option rows and source-level option rows for downstream UI', () => {
    const groups = buildLogicalOptionGroups([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '소스 선택',
        minOrderQuantity: 0,
        maxOrderQuantity: 2,
        options: [
          { optionId: 'a', optionName: '갈릭소스', optionPrice: 500 },
          { optionId: 'b', optionName: '핫소스', optionPrice: 200 }
        ],
        menus: [
          { platformMenuId: 'menu-a', platformMenuName: '메뉴 A' },
          { platformMenuId: 'menu-b', platformMenuName: '메뉴 B' }
        ],
        presenceStatus: 'present'
      }
    ])

    expect(groups[0]).toMatchObject({
      logicalOptions: [
        { optionName: '갈릭소스', optionPrice: 500 },
        { optionName: '핫소스', optionPrice: 200 }
      ],
      sourceGroups: [
        {
          optionGroupName: '소스 선택',
          linkedMenuCount: 2,
          options: [
            { optionName: '갈릭소스', optionPrice: 500 },
            { optionName: '핫소스', optionPrice: 200 }
          ]
        }
      ]
    })
  })

  it('lets missing_suspected outrank merge_candidate', () => {
    const groups = buildLogicalOptionGroups([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '토핑 추가',
        options: [{ optionId: 'a', optionName: '치즈', optionPrice: 1000 }],
        menus: [{ platformMenuId: 'menu-a', platformMenuName: '메뉴 A' }],
        presenceStatus: 'present'
      },
      {
        platformCode: 'baemin',
        optionGroupId: 'g-2',
        optionGroupName: '토핑 추가',
        options: [{ optionId: 'b', optionName: '치즈', optionPrice: 1000 }],
        menus: [{ platformMenuId: 'menu-b', platformMenuName: '메뉴 B' }],
        presenceStatus: 'missing_suspected'
      }
    ])

    expect(groups[0]).toMatchObject({
      status: 'missing_suspected'
    })
  })

  it('lets absent_confirmed outrank missing_suspected', () => {
    const groups = buildLogicalOptionGroups([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '토핑 추가',
        options: [{ optionId: 'a', optionName: '치즈', optionPrice: 1000 }],
        menus: [{ platformMenuId: 'menu-a', platformMenuName: '메뉴 A' }],
        presenceStatus: 'missing_suspected'
      },
      {
        platformCode: 'baemin',
        optionGroupId: 'g-2',
        optionGroupName: '토핑 추가',
        options: [{ optionId: 'b', optionName: '치즈', optionPrice: 1000 }],
        menus: [{ platformMenuId: 'menu-b', platformMenuName: '메뉴 B' }],
        presenceStatus: 'absent_confirmed'
      }
    ])

    expect(groups[0]).toMatchObject({
      status: 'absent_confirmed'
    })
  })

  it('lets resurfaced outrank merge_candidate while staying below missing and absent statuses', () => {
    const resurfacedGroups = buildLogicalOptionGroups([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '토핑 추가',
        options: [{ optionId: 'a', optionName: '치즈', optionPrice: 1000 }],
        menus: [{ platformMenuId: 'menu-a', platformMenuName: '메뉴 A' }],
        presenceStatus: 'resurfaced'
      },
      {
        platformCode: 'baemin',
        optionGroupId: 'g-2',
        optionGroupName: '토핑 추가',
        options: [{ optionId: 'b', optionName: '치즈', optionPrice: 1000 }],
        menus: [{ platformMenuId: 'menu-b', platformMenuName: '메뉴 B' }],
        presenceStatus: 'present'
      }
    ])

    expect(resurfacedGroups[0]).toMatchObject({
      status: 'resurfaced'
    })
  })

  it('produces deterministic ordering for logical groups and source groups', () => {
    const groups = buildLogicalOptionGroups([
      {
        platformCode: 'coupangeats',
        optionGroupId: 'g-2',
        optionGroupName: 'B 그룹',
        options: [{ optionId: 'b', optionName: 'B', optionPrice: 0 }],
        menus: [{ platformMenuId: 'menu-b', platformMenuName: '메뉴 B' }],
        presenceStatus: 'present'
      },
      {
        platformCode: 'baemin',
        optionGroupId: 'g-9',
        optionGroupName: 'Z 그룹',
        options: [{ optionId: 'z', optionName: 'Z', optionPrice: 0 }],
        menus: [{ platformMenuId: 'menu-z', platformMenuName: '메뉴 Z' }],
        presenceStatus: 'present'
      },
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: 'A 그룹',
        options: [{ optionId: 'a', optionName: 'A', optionPrice: 0 }],
        menus: [{ platformMenuId: 'menu-a', platformMenuName: '메뉴 A' }],
        presenceStatus: 'present'
      }
    ])

    expect(groups.map((group) => `${group.platformCode}:${group.displayName}:${group.logicalGroupKey}`)).toEqual([
      expect.stringMatching(/^baemin:A 그룹:/),
      expect.stringMatching(/^baemin:Z 그룹:/),
      expect.stringMatching(/^coupangeats:B 그룹:/)
    ])
    expect(groups[0].sourceGroups.map((group) => group.optionGroupId)).toEqual(['g-1'])
  })

  it('marks same-named option groups with different compositions as shape_conflict', () => {
    const groups = buildLogicalOptionGroups([
      {
        platformCode: 'baemin',
        optionGroupId: 'g-1',
        optionGroupName: '사이즈 선택',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        options: [
          { optionId: 'a', optionName: 'M', optionPrice: 0 },
          { optionId: 'b', optionName: 'L', optionPrice: 3000 }
        ],
        menus: [{ platformMenuId: 'menu-a', platformMenuName: '메뉴 A' }],
        presenceStatus: 'present'
      },
      {
        platformCode: 'baemin',
        optionGroupId: 'g-2',
        optionGroupName: '사이즈 선택',
        minOrderQuantity: 1,
        maxOrderQuantity: 1,
        options: [
          { optionId: 'c', optionName: 'R', optionPrice: 0 },
          { optionId: 'd', optionName: 'L', optionPrice: 2000 }
        ],
        menus: [{ platformMenuId: 'menu-b', platformMenuName: '메뉴 B' }],
        presenceStatus: 'present'
      }
    ])

    expect(groups).toHaveLength(2)
    expect(groups.every((group) => group.status === 'shape_conflict')).toBe(true)
  })
})
