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
      status: 'merge_candidate',
      sourceGroups: [
        {
          optionGroupId: 'g-1',
          optionGroupName: '사이즈 선택',
          presenceStatus: 'present',
          linkedMenuNames: ['불고기피자'],
          lastSeenAt: '2026-04-13T00:00:00Z'
        },
        {
          optionGroupId: 'g-2',
          optionGroupName: '사이즈 선택',
          presenceStatus: 'present',
          linkedMenuNames: ['새우피자'],
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
      connectedMenuCount: 1,
      sourceGroupCount: 1,
      sampleOptionNames: ['치즈', '베이컨', '올리브'],
      status: 'missing_suspected',
      sourceGroups: [
        {
          optionGroupId: 'g-3',
          optionGroupName: '토핑 추가',
          presenceStatus: 'missing_suspected',
          linkedMenuNames: ['콤비네이션'],
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
  it('renders logical option bundles without exposing raw option-group IDs', async () => {
    render(<OptionPage />)

    expect(await screen.findByRole('heading', { name: '옵션 관리' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '사이즈 선택' })).toBeTruthy()
    expect(screen.getByText('통합 가능')).toBeTruthy()
    expect(screen.getByText(/불고기피자/)).toBeTruthy()
    expect(screen.getByText(/새우피자/)).toBeTruthy()
    expect(screen.queryByText(/^g-1$/)).toBeNull()
  })

  it('filters option bundles by status', async () => {
    render(<OptionPage />)

    expect(await screen.findByRole('heading', { name: '토핑 추가' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /원본 누락 의심/ }))

    expect(screen.getByRole('heading', { name: '토핑 추가' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '사이즈 선택' })).toBeNull()
  })
})
