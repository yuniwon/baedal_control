import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { listSyncRuns, listPlatformImportRuns } = vi.hoisted(() => ({
  listSyncRuns: vi.fn().mockResolvedValue([
    {
      syncRunId: 'r1',
      startedAt: '2026-04-12T10:00:00Z',
      resultSummary: '3 succeeded, 0 failed',
      items: [
        {
          syncRunItemId: 'i1',
          syncRunId: 'r1',
          platformCode: 'baemin',
          menuId: 'm1',
          fieldType: 'menu',
          beforeValue: '포테이토골드',
          afterValue: '{"name":"포테이토골드피자","price":21000}',
          status: 'failed',
          errorCode: 'apply_failed',
          errorMessage:
            "baemin_menu_name_apply_failed:EXTERNAL_API_ERROR_40045:금칙어 '!'은 입력할 수 없습니다."
        }
      ]
    }
  ]),
  listPlatformImportRuns: vi.fn().mockResolvedValue([
    {
      importRunId: 'import-1',
      platformCode: 'baemin',
      startedAt: '2026-04-13T00:35:00Z',
      finishedAt: '2026-04-13T00:36:00Z',
      status: 'partial_failed',
      menuFetchCompleted: 1,
      optionFetchCompleted: 0,
      summaryJson: null,
      errorMessage: 'baemin_menu_page_collection_incomplete:2/3'
    }
  ])
}))

vi.mock('../../../src/renderer/src/lib/api', () => ({
  appApi: {
    menus: {
      list: vi.fn(),
      save: vi.fn()
    },
    mappings: {
      list: vi.fn(),
      save: vi.fn()
    },
    settings: {
      getPlatformCredentialStatus: vi.fn(),
      savePlatformCredential: vi.fn()
    },
    syncRuns: {
      list: listSyncRuns
    },
    platformImportRuns: {
      list: listPlatformImportRuns
    },
    sync: {
      preview: vi.fn(),
      run: vi.fn(),
      runItems: vi.fn()
    }
  }
}))

import { HistoryPage } from '../../../src/renderer/src/pages/HistoryPage'

describe('HistoryPage', () => {
  it('shows the latest run summary from the local history store in Korean copy', async () => {
    render(<HistoryPage />)

    await waitFor(() => {
      expect(screen.getByText('성공 3건, 실패 0건')).toBeTruthy()
    })

    expect(screen.getByText('2026. 04. 12. 19:00')).toBeTruthy()
    expect(screen.getByText('메뉴 1건')).toBeTruthy()
    expect(screen.getByText("배민 · 포테이토골드 -> 포테이토골드피자 · 21,000원")).toBeTruthy()
    expect(screen.getByText("금칙어 '!'은 입력할 수 없습니다.")).toBeTruthy()
    expect(screen.getByText('가져오기 기록')).toBeTruthy()
    expect(screen.getByText('배민 · 일부 실패')).toBeTruthy()
    expect(screen.getByText('메뉴 목록을 끝까지 읽지 못했습니다. 페이지를 다시 가져오거나 수집 검사를 확인해 주세요.')).toBeTruthy()
  })

  it('renders coupangeats managed-browser failures with action-focused Korean guidance', async () => {
    render(
      <HistoryPage
        initialRuns={[
          {
            syncRunId: 'r2',
            startedAt: '2026-04-14T01:00:00Z',
            triggerType: 'manual',
            resultSummary: '성공 0건, 실패 1건',
            items: [
              {
                syncRunItemId: 'i2',
                syncRunId: 'r2',
                platformCode: 'coupangeats',
                menuId: 'm2',
                fieldType: 'menu',
                beforeValue: '불고기피자',
                afterValue: '{"name":"불고기피자","price":19900}',
                status: 'failed',
                errorCode: 'coupangeats_managed_editor_not_opened',
                errorMessage: 'menu_editor_controls_not_found',
                failureContext: {
                  kind: 'managed_browser_snapshot',
                  status: 'captured',
                  capturedAt: '2026-04-14T01:25:00.000Z',
                  snapshotId: 'managed-tab-1',
                  pageTitle: '쿠팡이츠 메뉴 관리',
                  pageUrl: 'https://store.coupangeats.com/merchant/management/menu/109935',
                  pageKind: 'menu_list',
                  menuCount: 35,
                  optionGroupCount: 26,
                  detail: null
                }
              }
            ]
          }
        ]}
      />
    )

    await waitFor(() => {
      expect(
        screen.getByText(
          '쿠팡이츠 편집창을 열었지만 메뉴명, 가격, 저장 버튼을 찾지 못했습니다.'
        )
      ).toBeTruthy()
    })

    expect(
      screen.getByText('실패 당시 탭: 쿠팡이츠 메뉴 관리 · 메뉴 35개 · 옵션 그룹 26개')
    ).toBeTruthy()
    expect(screen.getByText('캡처 시각 2026. 04. 14. 10:25')).toBeTruthy()
  })
})
