import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.queryByText("배민 · 포테이토골드 -> 포테이토골드피자 · 21,000원")).toBeNull()
    expect(screen.queryByText("금칙어 '!'은 입력할 수 없습니다.")).toBeNull()
    expect(screen.getByText('가져오기 기록')).toBeTruthy()
    expect(screen.getByText('배민 · 일부 실패')).toBeTruthy()
    expect(
      screen.queryByText('메뉴 목록을 끝까지 읽지 못했습니다. 페이지를 다시 가져오거나 수집 검사를 확인해 주세요.')
    ).toBeNull()

    const detailButtons = screen.getAllByRole('button', { name: '상세 보기' })
    fireEvent.click(detailButtons[1])

    expect(screen.getByText("배민 · 포테이토골드 -> 포테이토골드피자 · 21,000원")).toBeTruthy()
    expect(screen.getByText("금칙어 '!'은 입력할 수 없습니다.")).toBeTruthy()
    expect(
      screen.getByText('다음 조치 기존 메뉴 설명, 구성, 메뉴명에 금칙어가 없는지 확인한 뒤 다시 실행해 주세요.')
    ).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: '상세 보기' })[0])
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

    fireEvent.click(await screen.findByRole('button', { name: '상세 보기' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          '쿠팡이츠 편집창을 열었지만 메뉴명, 가격, 저장 버튼을 찾지 못했습니다.'
        )
      ).toBeTruthy()
    })

    expect(
      screen.getByText('다음 조치 전용 크롬에서 메뉴 목록 첫 화면을 다시 연 뒤 다시 실행해 주세요.')
    ).toBeTruthy()
    expect(
      screen.getByText('실패 당시 탭: 쿠팡이츠 메뉴 관리 · 메뉴 35개 · 옵션 그룹 26개')
    ).toBeTruthy()
    expect(screen.getByText('캡처 시각 2026. 04. 14. 10:25')).toBeTruthy()
  })

  it('renders baemin page snapshots captured during a failed write attempt', async () => {
    render(
      <HistoryPage
        initialRuns={[
          {
            syncRunId: 'r3',
            startedAt: '2026-04-14T02:00:00Z',
            triggerType: 'manual',
            resultSummary: '성공 0건, 실패 1건',
            items: [
              {
                syncRunItemId: 'i3',
                syncRunId: 'r3',
                platformCode: 'baemin',
                menuId: 'm3',
                fieldType: 'menu',
                beforeValue: '포테이토골드',
                afterValue: '{"name":"포테이토골드 테스트","price":21000}',
                status: 'failed',
                errorCode: 'apply_failed',
                errorMessage: 'baemin_menu_match_not_found',
                failureContext: {
                  kind: 'platform_page_snapshot',
                  status: 'captured',
                  capturedAt: '2026-04-14T02:05:00.000Z',
                  pageTitle: '배민 메뉴 관리',
                  pageUrl: 'https://self.baemin.com/menu',
                  pageKind: 'menu_detail',
                  operationStage: '상세 패널 반영 확인',
                  visibleTextSnippet:
                    '메뉴 관리 검색 결과 가격 변경 검색 결과가 여러 개라 정확히 선택하지 못했습니다.'
                }
              }
            ]
          }
        ]}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: '상세 보기' }))

    await waitFor(() => {
      expect(screen.getByText('검색 결과에서 메뉴를 다시 찾지 못했습니다.')).toBeTruthy()
    })

    expect(
      screen.getByText('다음 조치 배민 메뉴를 다시 가져온 뒤 다시 실행해 주세요.')
    ).toBeTruthy()
    expect(screen.getByText('실패 당시 화면: 배민 메뉴 관리 · 상세 패널')).toBeTruthy()
    expect(
      screen.getByText(
        '메뉴 관리 검색 결과 가격 변경 검색 결과가 여러 개라 정확히 선택하지 못했습니다.'
      )
    ).toBeTruthy()
    expect(
      screen.getByText('실패 단계 상세 패널 반영 확인 · 캡처 시각 2026. 04. 14. 11:05')
    ).toBeTruthy()
  })
})
