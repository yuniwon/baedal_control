import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const {
  listPlatformCredentials,
  savePlatformCredential,
  importPlatformMenus,
  listPlatformImportRuns,
  listBrowserInspectionSnapshots,
  getBrowserInspectorStatus,
  launchManagedChrome,
  getManagedChromeSession,
  captureManagedChromeTab
} = vi.hoisted(() => ({
  listPlatformCredentials: vi.fn().mockResolvedValue([
    { platformCode: 'baemin', connected: true, username: 'owner-id', password: 'pw1' },
    { platformCode: 'coupangeats', connected: false, username: '', password: '' },
    { platformCode: 'ddangyo', connected: false, username: '', password: '' }
  ]),
  listPlatformImportRuns: vi.fn().mockResolvedValue([
    {
      importRunId: 'run-baemin-1',
      platformCode: 'baemin',
      startedAt: '2026-04-13T00:30:00.000Z',
      finishedAt: '2026-04-13T00:31:00.000Z',
      status: 'completed',
      menuFetchCompleted: 1,
      optionFetchCompleted: 1,
      summaryJson: JSON.stringify({
        platformCode: 'baemin',
        fetchedCount: 4,
        createdMenuCount: 0,
        linkedMappingCount: 0,
        verifiedMappingCount: 4
      })
    }
  ]),
  savePlatformCredential: vi.fn().mockResolvedValue({
    ok: true,
    importSummary: {
      platformCode: 'baemin',
      fetchedCount: 4,
      createdMenuCount: 4,
      linkedMappingCount: 4,
      verifiedMappingCount: 0
    },
    importInspection: {
      platformCode: 'baemin',
      steps: [
        {
          kind: 'navigation',
          title: '메뉴 페이지',
          detail: '메뉴 목록 화면으로 이동했습니다.',
          recordedAt: '2026-04-13T00:00:00.000Z',
          url: 'https://self.baemin.com/menu',
          pageTitle: '배민셀프서비스',
          visibleTextSnippet: '첫 번째 메뉴 11,000원',
          screenshotDataUrl: 'data:image/png;base64,ZmFrZQ=='
        },
        {
          kind: 'api',
          title: '메뉴 API 1페이지 감지',
          recordedAt: '2026-04-13T00:00:01.000Z',
          fields: [
            { name: 'content[0].menuId', value: '59707517', usage: 'used' },
            { name: 'content[0].reviewCount', value: '12', usage: 'ignored' }
          ]
        }
      ]
    }
  }),
  importPlatformMenus: vi.fn().mockResolvedValue({
    ok: true,
    importSummary: {
      platformCode: 'baemin',
      fetchedCount: 4,
      createdMenuCount: 0,
      linkedMappingCount: 0,
      verifiedMappingCount: 4
    }
  }),
  listBrowserInspectionSnapshots: vi.fn().mockResolvedValue([
    {
      snapshotId: 'snap-1',
      platformCode: 'coupangeats',
      source: 'browser_extension',
      pageUrl: 'https://store.coupangeats.com/merchant/menu',
      pageTitle: '쿠팡이츠 메뉴 관리',
      pageKind: 'menu_list',
      host: 'store.coupangeats.com',
      capturedAt: '2026-04-13T00:00:00.000Z',
      textSnippet: '왕새우갈비 23,900원 도우 선택',
      menuNames: ['왕새우갈비', '핫소스'],
      optionGroupNames: ['도우 선택'],
      buttonLabels: ['저장', '메뉴 추가'],
      inputHints: ['메뉴명', '가격'],
      fields: [
        { name: '메뉴명', value: '왕새우갈비', source: 'input' },
        { name: '가격', value: '23900', source: 'input' }
      ],
      apiEvents: [
        {
          url: 'https://store.coupangeats.com/api/menus',
          method: 'GET',
          status: 200,
          capturedAt: '2026-04-13T00:00:00.000Z',
          responsePreview: '{"menus":[{"name":"왕새우갈비"}]}'
        }
      ]
    }
  ]),
  getBrowserInspectorStatus: vi.fn().mockResolvedValue({
    receiverUrl: 'http://127.0.0.1:39481/inspection-snapshots',
    extensionPath: 'C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector',
    isRunning: true,
    chromeAvailable: true,
    chromePath: 'C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    chromeProfilePath: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
    managedChromeRunning: false,
    lastLaunchUrl: null,
    chromeError: null
  }),
  launchManagedChrome: vi.fn().mockResolvedValue({
    receiverUrl: 'http://127.0.0.1:39481/inspection-snapshots',
    extensionPath: 'C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector',
    isRunning: true,
    chromeAvailable: true,
    chromePath: 'C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    chromeProfilePath: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
    managedChromeRunning: true,
    lastLaunchUrl: 'https://store.coupangeats.com/merchant/menu',
    chromeError: null,
    managedChromeAutoLoginStatus: 'submitted',
    managedChromeAutoLoginMessage: '저장된 쿠팡이츠 계정으로 로그인을 시도했습니다.'
  }),
  getManagedChromeSession: vi.fn().mockResolvedValue({
    endpointUrl: 'http://127.0.0.1:39482',
    connected: true,
    error: null,
    tabs: [
      {
        tabId: 'tab-1',
        title: '쿠팡이츠 메뉴 관리',
        url: 'https://store.coupangeats.com/merchant/management/menu/109935',
        type: 'page',
        host: 'store.coupangeats.com',
        platformCode: 'coupangeats',
        pageKind: 'menu_list'
      },
      {
        tabId: 'tab-2',
        title: '쿠팡이츠 옵션 관리',
        url: 'https://store.coupangeats.com/merchant/management/menu/109935/options',
        type: 'page',
        host: 'store.coupangeats.com',
        platformCode: 'coupangeats',
        pageKind: 'option_list'
      }
    ]
  }),
  captureManagedChromeTab: vi.fn().mockResolvedValue({
    snapshotId: 'managed-tab-1-2026-04-13T13:05:00.000Z',
    platformCode: 'coupangeats',
    source: 'manual_browser',
    pageUrl: 'https://store.coupangeats.com/merchant/management/menu/109935',
    pageTitle: '쿠팡이츠 사장님 포털',
    pageKind: 'menu_list',
    captureMode: 'full_scroll',
    host: 'store.coupangeats.com',
    capturedAt: '2026-04-13T13:05:00.000Z',
    textSnippet: '왕새우갈비 23,900원',
    menuNames: ['왕새우갈비'],
    menuItems: [],
    optionGroupNames: [],
    buttonLabels: ['저장'],
    inputHints: ['메뉴명'],
    fields: [],
    apiEvents: [],
    screenshotDataUrl: 'data:image/png;base64,ZmFrZQ=='
  })
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
      listPlatformCredentials,
      savePlatformCredential,
      importPlatformMenus
    },
    syncRuns: {
      list: vi.fn()
    },
    sync: {
      preview: vi.fn(),
      run: vi.fn()
    },
    platformImportRuns: {
      list: listPlatformImportRuns
    },
    platformImportChanges: {
      listLatest: vi.fn()
    },
    browserInspectionSnapshots: {
      listLatest: listBrowserInspectionSnapshots
    },
    browserInspector: {
      getStatus: getBrowserInspectorStatus,
      launchManagedChrome,
      getManagedChromeSession,
      captureManagedChromeTab
    }
  }
}))

import { SettingsPage } from '../../../src/renderer/src/pages/SettingsPage'

describe('SettingsPage', () => {
  it('reloads saved platform credentials when the page mounts again', async () => {
    render(<SettingsPage />)

    expect(await screen.findByDisplayValue('owner-id')).toBeTruthy()
    expect(screen.getByDisplayValue('pw1')).toBeTruthy()
  })

  it('keeps browser diagnostics hidden until the operator opens advanced tools', async () => {
    render(<SettingsPage />)

    expect(await screen.findByRole('heading', { name: '가져오기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '브라우저 진단 보기' })).toBeTruthy()
    expect(screen.queryByText('브라우저 검사')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '브라우저 진단 보기' }))

    expect(await screen.findByText('브라우저 검사')).toBeTruthy()
  })

  it('shows the automatic import result after saving credentials', async () => {
    render(<SettingsPage />)

    const saveButtons = await screen.findAllByRole('button', { name: '저장' })
    fireEvent.click(saveButtons[0])

    await waitFor(() => {
      expect(savePlatformCredential).toHaveBeenCalledWith({
        platformCode: 'baemin',
        username: 'owner-id',
        password: 'pw1'
      })
    })

    expect(await screen.findByText('메뉴 4개를 가져왔습니다. 새 메뉴 4개, 새 연결 4개를 반영했습니다.')).toBeTruthy()
  })

  it('shows the latest import summary for a saved platform when the page mounts', async () => {
    render(<SettingsPage />)

    expect(await screen.findByText('마지막 가져오기 2026. 04. 13. 09:31')).toBeTruthy()
    expect(screen.getByText('메뉴 4개 확인 · 새 메뉴 0개 · 새 연결 0개 · 기존 연결 4개')).toBeTruthy()
  })

  it('shows managed-browser import details when the latest coupangeats import used the current session', async () => {
    listPlatformImportRuns.mockResolvedValueOnce([
      {
        importRunId: 'run-coupang-1',
        platformCode: 'coupangeats',
        startedAt: '2026-04-13T04:30:00.000Z',
        finishedAt: '2026-04-13T04:31:00.000Z',
        status: 'completed',
        menuFetchCompleted: 1,
        optionFetchCompleted: 1,
        summaryJson: JSON.stringify({
          platformCode: 'coupangeats',
          fetchedCount: 35,
          optionGroupCount: 26,
          duplicateMenuCount: 7,
          fetchMode: 'managed_browser',
          createdMenuCount: 35,
          linkedMappingCount: 35,
          verifiedMappingCount: 0
        })
      }
    ])

    render(<SettingsPage />)

    expect(await screen.findByText('메뉴 35개 확인 · 옵션 그룹 26개 확인 · 새 메뉴 35개 · 새 연결 35개 · 기존 연결 0개 · 중복 7건 정리 · 현재 세션 읽기')).toBeTruthy()
  })

  it('shows the latest partial failure reason for a platform import', async () => {
    listPlatformImportRuns.mockResolvedValueOnce([
      {
        importRunId: 'run-baemin-fail',
        platformCode: 'baemin',
        startedAt: '2026-04-13T00:34:00.000Z',
        finishedAt: '2026-04-13T00:35:00.000Z',
        status: 'partial_failed',
        menuFetchCompleted: 1,
        optionFetchCompleted: 0,
        summaryJson: null,
        errorMessage: 'baemin_menu_page_collection_incomplete:2/3'
      }
    ])

    render(<SettingsPage />)

    expect(await screen.findByText('일부 실패')).toBeTruthy()
    expect(screen.getByText('메뉴 목록을 끝까지 읽지 못했습니다. 페이지를 다시 가져오거나 수집 검사를 확인해 주세요.')).toBeTruthy()
  })

  it('allows re-importing menus without overwriting saved credentials', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: '다시 가져오기' }))

    await waitFor(() => {
      expect(importPlatformMenus).toHaveBeenCalledWith({ platformCode: 'baemin' })
    })

    expect(await screen.findByText('메뉴 4개를 다시 확인했습니다. 기존 연결 4개를 유지했습니다.')).toBeTruthy()
  })

  it('shows inspection steps with page and field details after saving credentials', async () => {
    render(<SettingsPage />)

    const saveButtons = await screen.findAllByRole('button', { name: '저장' })
    fireEvent.click(saveButtons[0])

    expect(await screen.findByText('수집 검사')).toBeTruthy()
    expect((await screen.findAllByText('메뉴 페이지')).length).toBeGreaterThan(0)
    expect(screen.getByText('https://self.baemin.com/menu')).toBeTruthy()
    expect(screen.getByText('첫 번째 메뉴 11,000원')).toBeTruthy()
    expect(screen.getByText('content[0].menuId')).toBeTruthy()
    expect(screen.getByText('content[0].reviewCount')).toBeTruthy()
  })

  it('lets the user collapse the inspection panel after reviewing it', async () => {
    render(<SettingsPage />)

    const saveButtons = await screen.findAllByRole('button', { name: '저장' })
    fireEvent.click(saveButtons[0])

    expect(await screen.findByRole('button', { name: '수집 검사 접기' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '수집 검사 접기' }))

    expect(screen.getByRole('button', { name: '수집 검사 보기' })).toBeTruthy()
    expect(screen.queryByText('수집 검사')).toBeNull()
  })

  it('shows browser inspection instructions and the latest captured merchant snapshot', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: '브라우저 진단 보기' }))

    expect(await screen.findByText('브라우저 검사')).toBeTruthy()
    expect(screen.getByText('수신 대기 중')).toBeTruthy()
    expect(screen.getByText('http://127.0.0.1:39481/inspection-snapshots')).toBeTruthy()
    expect(
      screen.getByText('C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector')
    ).toBeTruthy()
    expect((await screen.findAllByText('쿠팡이츠 메뉴 관리')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('store.coupangeats.com')).length).toBeGreaterThan(0)
    expect(screen.getByText('메뉴 후보 2개 · 옵션 그룹 1개 · 버튼 2개 · 입력 2개 · API 1건')).toBeTruthy()
    expect(screen.getByText('왕새우갈비, 핫소스')).toBeTruthy()
    expect(screen.getByText('https://store.coupangeats.com/api/menus')).toBeTruthy()
  })

  it('launches managed chrome from the browser inspection panel', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: '브라우저 진단 보기' }))
    fireEvent.click(await screen.findByRole('button', { name: '전용 크롬 열기' }))

    await waitFor(() => {
      expect(launchManagedChrome).toHaveBeenCalledWith({
        platformCode: 'coupangeats',
        autoLogin: true
      })
    })

    expect(await screen.findByText('전용 프로필 실행 중')).toBeTruthy()
    expect(
      screen.getByText('저장된 쿠팡이츠 계정으로 로그인을 시도했습니다.')
    ).toBeTruthy()
    expect(
      screen.getByText('C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
    ).toBeTruthy()
  })

  it('launches baemin managed chrome login from the browser inspection panel', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: '브라우저 진단 보기' }))
    fireEvent.click(await screen.findByRole('button', { name: '배민 메뉴 열기' }))

    await waitFor(() => {
      expect(launchManagedChrome).toHaveBeenCalledWith({
        platformCode: 'baemin',
        autoLogin: true
      })
    })
  })

  it('shows the currently detected managed chrome tabs', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: '브라우저 진단 보기' }))

    expect(await screen.findByText('현재 전용 크롬 탭')).toBeTruthy()
    expect(screen.getByText('쿠팡이츠 메뉴 페이지')).toBeTruthy()
    expect(screen.getByText('쿠팡이츠 옵션 페이지')).toBeTruthy()
    expect(screen.getByText('http://127.0.0.1:39482')).toBeTruthy()
  })

  it('captures the currently detected managed chrome tab from the app', async () => {
    render(<SettingsPage />)

    fireEvent.click(await screen.findByRole('button', { name: '브라우저 진단 보기' }))
    const captureButtons = await screen.findAllByRole('button', { name: '현재 탭 읽기' })
    fireEvent.click(captureButtons[0])

    await waitFor(() => {
      expect(captureManagedChromeTab).toHaveBeenCalledWith({ tabId: 'tab-1' })
    })

    expect(
      await screen.findByText('쿠팡이츠 메뉴 페이지를 읽어 최근 검사 기록에 저장했습니다.')
    ).toBeTruthy()
  })
})
