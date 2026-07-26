import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const {
  listMenus,
  getPlatformCredentialStatus,
  listSyncRuns,
  listImportRuns,
  listImportChanges,
  getNextActionPlan,
  previewSync,
  runSync,
  runSelectedSync
} = vi.hoisted(() => ({
  listMenus: vi.fn().mockResolvedValue([
    { menuId: 'menu-1', baseName: '콰트로피자 15인치', basePrice: 32900, isDirty: 0, isManaged: 1 },
    { menuId: 'menu-2', baseName: '메뉴 검토용 피자', basePrice: 23900, isDirty: 0, isManaged: 1 }
  ]),
  getPlatformCredentialStatus: vi.fn().mockResolvedValue([
    { platformCode: 'baemin', connected: true },
    { platformCode: 'coupangeats', connected: false },
    { platformCode: 'ddangyo', connected: false }
  ]),
  listSyncRuns: vi.fn().mockResolvedValue([
    {
      syncRunId: 'run-1',
      startedAt: '2026-04-13 14:00',
      resultSummary: '1 succeeded, 0 failed'
    }
  ]),
  listImportRuns: vi.fn().mockResolvedValue([
    {
      importRunId: 'run-1',
      platformCode: 'baemin',
      startedAt: '2026-04-13 13:50',
      finishedAt: '2026-04-13 13:55',
      status: 'completed',
      menuFetchCompleted: 1,
      optionFetchCompleted: 1,
      summaryJson: JSON.stringify({
        platformCode: 'baemin',
        fetchedCount: 46,
        createdMenuCount: 0,
        linkedMappingCount: 0,
        verifiedMappingCount: 46
      }),
      errorMessage: null
    },
    {
      importRunId: 'run-2',
      platformCode: 'coupangeats',
      startedAt: '2026-04-13 13:40',
      finishedAt: '2026-04-13 13:41',
      status: 'partial_failed',
      menuFetchCompleted: 0,
      optionFetchCompleted: 0,
      summaryJson: null,
      errorMessage: 'credential_not_found'
    },
    {
      importRunId: 'run-3',
      platformCode: 'ddangyo',
      startedAt: '2026-04-13 13:30',
      finishedAt: null,
      status: 'running',
      menuFetchCompleted: 0,
      optionFetchCompleted: 0,
      summaryJson: null,
      errorMessage: null
    },
    {
      importRunId: 'run-0',
      platformCode: 'baemin',
      startedAt: '2026-04-12 13:50',
      finishedAt: '2026-04-12 13:55',
      status: 'completed',
      menuFetchCompleted: 1,
      optionFetchCompleted: 1,
      errorMessage: null
    }
  ]),
  getNextActionPlan: vi.fn().mockResolvedValue({
    task: 'agent-plan-next-actions',
    generatedAt: '2026-04-14T09:40:00.000Z',
    summary: '다음 작업 3건',
    data: {
      total: 3,
      byPriority: {
        high: 1,
        medium: 2,
        low: 0
      },
      items: [
        {
          id: 'run:baemin:menu-1:59707517',
          kind: 'run_executable',
          priority: 'high',
          platformCode: 'baemin',
          menuId: 'menu-1',
          platformMenuId: '59707517',
          title: '배민 메뉴 동기화 실행',
          detail: '콰트로피자 15인치 변경사항을 지금 바로 반영할 수 있습니다.',
          evidence: ['기준 메뉴: 콰트로피자 15인치'],
          commands: [
            {
              task: 'sync-run-item',
              args: ['--task=sync-run-item', '--platformCode=baemin', '--menuId=menu-1'],
              label: '이 메뉴만 즉시 반영'
            }
          ]
        },
        {
          id: 'review:coupang:menu-2',
          kind: 'resolve_review',
          priority: 'medium',
          platformCode: 'coupangeats',
          menuId: 'menu-2',
          platformMenuId: 'ce-1',
          title: '연결 상태 재확인 필요',
          detail: '가게 연결 없음',
          evidence: ['플랫폼 메뉴: 메뉴 검토용 피자'],
          commands: [
            {
              task: 'agent-report-menu',
              args: ['--task=agent-report-menu', '--platformCode=coupangeats', '--menuId=menu-2'],
              label: '메뉴 상세 리포트 열기'
            }
          ]
        },
        {
          id: 'failure:baemin',
          kind: 'inspect_failures',
          priority: 'medium',
          platformCode: 'baemin',
          title: '배민 최근 실패 점검',
          detail: '최근 실패 3건이 누적되어 원인 정리가 필요합니다.',
          evidence: [
            '검색 결과에서 메뉴를 다시 찾지 못했습니다. 2건',
            '입력창을 찾지 못했습니다. 1건'
          ],
          commands: [
            {
              task: 'agent-report-platform',
              args: ['--task=agent-report-platform', '--platformCode=baemin'],
              label: '플랫폼 리포트 열기'
            }
          ]
        }
      ]
    }
  }),
  previewSync: vi.fn().mockResolvedValue({
    items: [
      {
        platformCode: 'baemin',
        menuId: 'menu-1',
        platformMenuId: '59707517',
        previousName: '콰트로피자 15\'\'',
        nextName: '콰트로피자 15\'\'',
        nextPrice: 32900
      },
      {
        platformCode: 'coupangeats',
        menuId: 'menu-2',
        platformMenuId: 'ce-1',
        previousName: '메뉴 검토용 피자',
        previousPrice: 23900,
        nextName: '메뉴 검토용 피자',
        nextPrice: 23900,
        executionMode: 'managed_browser'
      }
    ],
    needsReview: [
      {
        menuId: 'menu-2',
        platformCode: 'baemin',
        platformMenuId: 'p-2',
        reason: 'source_missing_review'
      }
    ]
  }),
  runSync: vi.fn().mockResolvedValue({
    summary: '배민 1건 반영 완료'
  }),
  runSelectedSync: vi.fn().mockResolvedValue({
    summary: '배민 1건 반영 완료'
  }),
  listImportChanges: vi.fn().mockResolvedValue([
    {
      changeId: 'c-1',
      importRunId: 'run-1',
      platformCode: 'baemin',
      entityType: 'menu',
      entityKey: 'menu-1',
      entityName: '감자피자',
      changeType: 'created'
    },
    {
      changeId: 'c-2',
      importRunId: 'run-1',
      platformCode: 'baemin',
      entityType: 'menu',
      entityKey: 'menu-2',
      entityName: '새 메뉴',
      changeType: 'missing_suspected'
    },
    {
      changeId: 'c-3',
      importRunId: 'run-1',
      platformCode: 'baemin',
      entityType: 'menu',
      entityKey: 'menu-3',
      entityName: '없음 메뉴',
      changeType: 'absent_confirmed'
    },
    {
      changeId: 'c-4',
      importRunId: 'run-1',
      platformCode: 'baemin',
      entityType: 'option_group',
      entityKey: 'group-1',
      entityName: '옵션그룹',
      changeType: 'missing_suspected'
    },
    {
      changeId: 'c-5',
      importRunId: 'run-1',
      platformCode: 'baemin',
      entityType: 'menu',
      entityKey: 'menu-4',
      entityName: '재등장 메뉴',
      changeType: 'resurfaced'
    },
    {
      changeId: 'c-6',
      importRunId: 'run-0',
      platformCode: 'baemin',
      entityType: 'menu',
      entityKey: 'menu-0',
      entityName: '이전 수집 메뉴',
      changeType: 'created'
    }
  ])
}))

vi.mock('../../../src/renderer/src/lib/api', () => ({
  appApi: {
    menus: {
      list: listMenus,
      save: vi.fn(),
      delete: vi.fn()
    },
    mappings: {
      list: vi.fn(),
      save: vi.fn(),
      delete: vi.fn()
    },
    settings: {
      getPlatformCredentialStatus,
      listPlatformCredentials: vi.fn(),
      savePlatformCredential: vi.fn(),
      importPlatformMenus: vi.fn()
    },
    syncRuns: {
      list: listSyncRuns
    },
    platformImportRuns: {
      list: listImportRuns
    },
    platformImportChanges: {
      listLatest: listImportChanges
    },
    agentReports: {
      getNextActionPlan
    },
    sync: {
      preview: previewSync,
      run: runSync,
      runItems: runSelectedSync
    },
    platformMenus: {
      list: vi.fn()
    }
  }
}))

import { DashboardPage } from '../../../src/renderer/src/pages/DashboardPage'

describe('DashboardPage', () => {
  it('shows status rows for all six delivery platforms', async () => {
    render(<DashboardPage />)

    expect(await screen.findByText(/^배민 ·/)).toBeTruthy()
    expect(screen.getByText(/^요기요 ·/)).toBeTruthy()
    expect(screen.getByText(/^쿠팡이츠 ·/)).toBeTruthy()
    expect(screen.getByText(/^땡겨요 ·/)).toBeTruthy()
    expect(screen.getByText(/^배달특급 ·/)).toBeTruthy()
    expect(screen.getByText(/^네이버주문 ·/)).toBeTruthy()
  })

  it('keeps the home screen focused and opens recent import changes on demand', async () => {
    render(<DashboardPage />)

    expect(await screen.findByRole('heading', { name: '홈' })).toBeTruthy()
    expect(await screen.findByText('1 / 6')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('성공 1건, 실패 0건')).toBeTruthy()
    expect(screen.getByRole('button', { name: '반영 미리보기' })).toBeTruthy()
    expect(screen.getByText('플랫폼 상태')).toBeTruthy()
    expect(screen.getByRole('button', { name: '최근 변화 보기' })).toBeTruthy()
    expect(screen.queryByText('이번 가져오기 변경점')).toBeNull()
    expect(screen.getByText('원본 메뉴 확인 필요')).toBeTruthy()
    expect(screen.queryByText('새 메뉴 2개')).toBeNull()
    expect(screen.getByText('배민 · 메뉴 검토용 피자')).toBeTruthy()
    expect(screen.queryByText(/menu-2/)).toBeNull()
    expect(screen.getByText('배민 · 메뉴 46개 확인 · 기존 연결 46개 유지')).toBeTruthy()
    expect(screen.getByText('쿠팡이츠 · 계정 정보를 다시 확인해 주세요.')).toBeTruthy()
    expect(screen.getByText('땡겨요 · 가져오기를 진행하고 있습니다.')).toBeTruthy()
    expect(screen.getByText('다음 작업')).toBeTruthy()
    expect(screen.getByText('지금 할 일')).toBeTruthy()
    expect(screen.getByText('배민 메뉴 동기화 실행')).toBeTruthy()
    expect(screen.getByText('연결 상태 재확인 필요')).toBeTruthy()
    expect(screen.getByText('배민 최근 실패 점검')).toBeTruthy()
    expect(screen.getByText('검색 결과에서 메뉴를 다시 찾지 못했습니다. 2건')).toBeTruthy()
    expect(screen.getByText('이 메뉴만 즉시 반영')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '최근 변화 보기' }))

    expect(await screen.findByText('이번 가져오기 변경점')).toBeTruthy()
    expect(screen.getByText('새 메뉴 1개')).toBeTruthy()
    expect(screen.getByText('누락 의심 메뉴 1개')).toBeTruthy()
    expect(screen.getByText('플랫폼에 없음 메뉴 1개')).toBeTruthy()
    expect(screen.getByText('누락 의심 옵션 1개')).toBeTruthy()
    expect(screen.getByText('재등장 항목 1개')).toBeTruthy()
  })

  it('opens a preview first and only runs sync after confirmation', async () => {
    render(<DashboardPage />)

    fireEvent.click(await screen.findByRole('button', { name: '반영 미리보기' }))

    await waitFor(() => {
      expect(previewSync).toHaveBeenCalled()
    })
  })

  it('does not mix historical change rows when there is no latest import run', async () => {
    listImportRuns.mockResolvedValueOnce([])

    render(<DashboardPage />)

    fireEvent.click(await screen.findByRole('button', { name: '최근 변화 보기' }))

    expect(await screen.findByText('최근 가져오기 변경점이 없습니다.')).toBeTruthy()
    expect(screen.queryByText('새 메뉴 1개')).toBeNull()
  })
})
