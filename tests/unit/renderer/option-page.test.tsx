import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { listLogicalOptionGroups } = vi.hoisted(() => ({
  listLogicalOptionGroups: vi.fn().mockResolvedValue([
    {
      logicalGroupKey: 'baemin:same',
      platformCode: 'baemin',
      displayName: '사이즈 선택',
      minOrderQuantity: 1,
      maxOrderQuantity: 1,
      optionCount: 2,
      connectedMenuCount: 2,
      sourceGroupCount: 2,
      sampleOptionNames: ['M', 'L'],
      logicalOptions: [
        { optionName: 'M', optionPrice: 0 },
        { optionName: 'L', optionPrice: 3000 }
      ],
      status: 'merge_candidate',
      sourceGroups: [
        {
          optionGroupId: 'g-1',
          optionGroupName: '사이즈 선택',
          presenceStatus: 'present',
          linkedMenuCount: 1,
          linkedMenuNames: ['불고기피자'],
          options: [
            { optionName: 'M', optionPrice: 0 },
            { optionName: 'L', optionPrice: 3000 }
          ],
          lastSeenAt: '2026-04-13T00:00:00Z'
        },
        {
          optionGroupId: 'g-2',
          optionGroupName: '사이즈 선택',
          presenceStatus: 'present',
          linkedMenuCount: 1,
          linkedMenuNames: ['새우피자'],
          options: [
            { optionName: 'M', optionPrice: 0 },
            { optionName: 'L', optionPrice: 3000 }
          ],
          lastSeenAt: '2026-04-13T00:00:00Z'
        }
      ]
    },
    {
      logicalGroupKey: 'baemin:conflict-1',
      platformCode: 'baemin',
      displayName: '도우 선택',
      minOrderQuantity: 1,
      maxOrderQuantity: 1,
      optionCount: 2,
      connectedMenuCount: 1,
      sourceGroupCount: 1,
      sampleOptionNames: ['씬', '오리지널'],
      logicalOptions: [
        { optionName: '씬', optionPrice: 0 },
        { optionName: '오리지널', optionPrice: 2000 }
      ],
      status: 'shape_conflict',
      sourceGroups: [
        {
          optionGroupId: 'g-4',
          optionGroupName: '도우 선택',
          presenceStatus: 'present',
          linkedMenuCount: 1,
          linkedMenuNames: ['콰트로피자'],
          options: [
            { optionName: '씬', optionPrice: 0 },
            { optionName: '오리지널', optionPrice: 2000 }
          ],
          lastSeenAt: '2026-04-13T00:00:00Z'
        }
      ]
    },
    {
      logicalGroupKey: 'baemin:missing',
      platformCode: 'baemin',
      displayName: '토핑 추가',
      minOrderQuantity: 0,
      maxOrderQuantity: 3,
      optionCount: 3,
      connectedMenuCount: 4,
      sourceGroupCount: 1,
      sampleOptionNames: ['치즈', '베이컨', '올리브'],
      logicalOptions: [
        { optionName: '치즈', optionPrice: 1000 },
        { optionName: '베이컨', optionPrice: 1500 },
        { optionName: '올리브', optionPrice: 700 }
      ],
      status: 'missing_suspected',
      sourceGroups: [
        {
          optionGroupId: 'g-3',
          optionGroupName: '토핑 추가',
          presenceStatus: 'missing_suspected',
          linkedMenuCount: 4,
          linkedMenuNames: ['콤비네이션', '포테이토', '불고기', '페퍼로니'],
          options: [
            { optionName: '치즈', optionPrice: 1000 },
            { optionName: '베이컨', optionPrice: 1500 },
            { optionName: '올리브', optionPrice: 700 }
          ],
          lastSeenAt: '2026-04-12T00:00:00Z'
        }
      ]
    }
  ])
}))

vi.mock('../../../src/renderer/src/lib/api', () => ({
  appApi: {
    menus: {
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue({ ok: true })
    },
    mappings: {
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true })
    },
    platformMenus: {
      list: vi.fn().mockResolvedValue([])
    },
    platformOptionGroups: {
      list: vi.fn().mockResolvedValue([])
    },
    logicalOptionGroups: {
      list: listLogicalOptionGroups
    },
    platformImportRuns: {
      list: vi.fn().mockResolvedValue([])
    },
    platformImportChanges: {
      listLatest: vi.fn().mockResolvedValue([])
    },
    settings: {
      getPlatformCredentialStatus: vi.fn().mockResolvedValue([]),
      listPlatformCredentials: vi.fn().mockResolvedValue([]),
      savePlatformCredential: vi.fn().mockResolvedValue({ ok: true }),
      importPlatformMenus: vi.fn().mockResolvedValue({ ok: true })
    },
    syncRuns: {
      list: vi.fn().mockResolvedValue([])
    },
    sync: {
      preview: vi.fn().mockResolvedValue({ items: [], needsReview: [] }),
      run: vi.fn().mockResolvedValue({ summary: '성공 0건, 실패 0건' }),
      runItems: vi.fn().mockResolvedValue({ summary: '성공 0건, 실패 0건' })
    }
  }
}))

import { OptionPage } from '../../../src/renderer/src/pages/OptionPage'

describe('OptionPage', () => {
  it('keeps raw source-link details collapsed until the operator opens them', async () => {
    render(<OptionPage />)

    expect(await screen.findByRole('heading', { name: '옵션' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '사이즈 선택' })).toBeTruthy()
    expect(screen.getByText('통합 가능')).toBeTruthy()
    expect(
      screen.getByText((_, element) => element?.textContent?.replace(/\s+/g, '') === 'L+3,000원')
    ).toBeTruthy()
    expect(
      screen.getByText((_, element) => element?.textContent?.replace(/\s+/g, '') === 'M무료')
    ).toBeTruthy()
    expect(screen.queryByText(/불고기피자/)).toBeNull()
    expect(screen.queryByText(/새우피자/)).toBeNull()
    expect(screen.queryByText('콤비네이션, 포테이토, 불고기 외 1개')).toBeNull()
    expect(screen.queryByText(/^g-1$/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '원본 연결 보기' }))

    expect(screen.getByText(/불고기피자/)).toBeTruthy()
    expect(screen.getByText(/새우피자/)).toBeTruthy()
    expect(screen.getByText('콤비네이션, 포테이토, 불고기 외 1개')).toBeTruthy()
  })

  it('filters option bundles by status', async () => {
    render(<OptionPage />)

    expect(await screen.findByRole('heading', { name: '토핑 추가' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /원본 누락 의심/ }))

    expect(screen.getByRole('heading', { name: '토핑 추가' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '사이즈 선택' })).toBeNull()
  })

  it('filters option bundles by shape conflicts and search text', async () => {
    render(<OptionPage />)

    expect(await screen.findByRole('heading', { name: '도우 선택' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /구성 다름/ }))

    expect(screen.getByRole('heading', { name: '도우 선택' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '사이즈 선택' })).toBeNull()

    fireEvent.change(screen.getByPlaceholderText('옵션명, 가격 또는 연결 메뉴 검색'), {
      target: { value: '콰트로' }
    })

    expect(screen.getByRole('heading', { name: '도우 선택' })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('옵션명, 가격 또는 연결 메뉴 검색'), {
      target: { value: '없는 검색어' }
    })
    expect(screen.getByText('조건에 맞는 옵션 묶음이 없습니다.')).toBeTruthy()
  })
})
