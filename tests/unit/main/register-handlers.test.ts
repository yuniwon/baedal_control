import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => {
  const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    registeredHandlers,
    removeHandler: vi.fn((channel: string) => {
      registeredHandlers.delete(channel)
    }),
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers.set(channel, handler)
    })
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: electronMock.removeHandler,
    handle: electronMock.handle
  }
}))

import { registerHandlers } from '../../../src/main/ipc/register-handlers'

describe('registerHandlers', () => {
  beforeEach(() => {
    electronMock.registeredHandlers.clear()
    electronMock.removeHandler.mockClear()
    electronMock.handle.mockClear()
  })

  it('runs only selected items that are still executable in the latest preview', async () => {
    const run = vi.fn().mockResolvedValue({ syncRunId: 'run-1', summary: '성공 1건, 실패 0건' })

    registerHandlers({
      menuRepository: {
        list: vi.fn().mockReturnValue([
          { menuId: 'menu-1', baseName: 'Set 5 테스트', basePrice: 37000, isDirty: 1, isManaged: 1 },
          { menuId: 'menu-2', baseName: '사이다', basePrice: 1800, isDirty: 1, isManaged: 1 }
        ]),
        upsert: vi.fn()
      },
      mappingRepository: {
        listAll: vi.fn().mockReturnValue([
          {
            mappingId: 'menu-1:baemin',
            menuId: 'menu-1',
            platformCode: 'baemin',
            platformMenuId: '69971302',
            platformMenuName: 'Set 5',
            platformMenuCurrentPrice: 37000,
            matchedBy: 'manual',
            isConfirmed: 1
          },
          {
            mappingId: 'menu-2:baemin',
            menuId: 'menu-2',
            platformCode: 'baemin',
            platformMenuId: '69971353',
            platformMenuName: '사이다',
            platformMenuBindingStatus: '가게 연결 없음',
            platformMenuBindingSummary: '연결 가게 없음',
            matchedBy: 'manual',
            isConfirmed: 1
          }
        ]),
        upsert: vi.fn()
      },
      platformMenuRepository: {
        listAll: vi.fn().mockReturnValue([])
      },
      syncRunRepository: {
        list: vi.fn().mockReturnValue([])
      },
      syncRunItemRepository: {
        listForRunIds: vi.fn().mockReturnValue([])
      },
      credentialVault: {
        get: vi.fn(),
        set: vi.fn()
      } as never,
      syncEngine: { run }
    })

    const handler = electronMock.registeredHandlers.get('sync:run-items')

    expect(handler).toBeTypeOf('function')

    const items = [
      {
        platformCode: 'baemin',
        menuId: 'menu-1',
        platformMenuId: '69971302',
        previousName: 'Set 5',
        previousPrice: 37000,
        nextName: 'Set 5 테스트',
        nextPrice: 37000
      },
      {
        platformCode: 'baemin',
        menuId: 'menu-2',
        platformMenuId: '69971353',
        previousName: '사이다',
        previousPrice: 1800,
        nextName: '사이다',
        nextPrice: 1800
      }
    ]

    const result = await handler?.({}, items)

    expect(run).toHaveBeenCalledWith([items[0]])
    expect(result).toEqual({
      syncRunId: 'run-1',
      summary: '성공 1건, 실패 0건 · 제외 1건',
      skippedCount: 1
    })
  })

  it('does not run items that are no longer executable in the latest preview', async () => {
    const run = vi.fn().mockResolvedValue({ syncRunId: 'run-1', summary: '성공 1건, 실패 0건' })

    registerHandlers({
      menuRepository: {
        list: vi.fn().mockReturnValue([
          { menuId: 'menu-2', baseName: '사이다', basePrice: 1800, isDirty: 1, isManaged: 1 }
        ]),
        upsert: vi.fn()
      },
      mappingRepository: {
        listAll: vi.fn().mockReturnValue([
          {
            mappingId: 'menu-2:baemin',
            menuId: 'menu-2',
            platformCode: 'baemin',
            platformMenuId: '69971353',
            platformMenuName: '사이다',
            platformMenuBindingStatus: '가게 연결 없음',
            platformMenuBindingSummary: '연결 가게 없음',
            matchedBy: 'manual',
            isConfirmed: 1
          }
        ]),
        upsert: vi.fn()
      },
      platformMenuRepository: {
        listAll: vi.fn().mockReturnValue([])
      },
      syncRunRepository: {
        list: vi.fn().mockReturnValue([])
      },
      syncRunItemRepository: {
        listForRunIds: vi.fn().mockReturnValue([])
      },
      credentialVault: {
        get: vi.fn(),
        set: vi.fn()
      } as never,
      syncEngine: { run }
    })

    const handler = electronMock.registeredHandlers.get('sync:run-items')
    const items = [
      {
        platformCode: 'baemin',
        menuId: 'menu-2',
        platformMenuId: '69971353',
        previousName: '사이다',
        previousPrice: 1800,
        nextName: '사이다',
        nextPrice: 1800
      }
    ]

    const result = await handler?.({}, items)

    expect(run).not.toHaveBeenCalled()
    expect(result).toEqual({
      syncRunId: null,
      summary: '실행 가능 0건, 제외 1건',
      skippedCount: 1
    })
  })

  it('runs coupangeats items imported through the managed browser session when they remain executable', async () => {
    const run = vi.fn().mockResolvedValue({ syncRunId: 'run-1', summary: '성공 1건, 실패 0건' })

    registerHandlers({
      menuRepository: {
        list: vi.fn().mockReturnValue([
          {
            menuId: 'menu-10',
            baseName: '왕새우갈비 테스트',
            basePrice: 23900,
            isDirty: 1,
            isManaged: 1
          }
        ]),
        upsert: vi.fn()
      },
      mappingRepository: {
        listAll: vi.fn().mockReturnValue([
          {
            mappingId: 'menu-10:coupangeats',
            menuId: 'menu-10',
            platformCode: 'coupangeats',
            platformMenuId: 'ce-10',
            platformMenuName: '왕새우갈비',
            platformMenuCurrentPrice: 23900,
            platformMenuGroupName: '추천메뉴',
            matchedBy: 'manual',
            isConfirmed: 1
          }
        ]),
        upsert: vi.fn()
      },
      platformMenuRepository: {
        listAll: vi.fn().mockReturnValue([])
      },
      platformImportRunRepository: {
        listLatest: vi.fn().mockReturnValue([
          {
            importRunId: 'import-10',
            platformCode: 'coupangeats',
            startedAt: '2026-04-13T04:00:00.000Z',
            finishedAt: '2026-04-13T04:01:00.000Z',
            status: 'completed',
            menuFetchCompleted: 1,
            optionFetchCompleted: 1,
            summaryJson: JSON.stringify({
              platformCode: 'coupangeats',
              fetchedCount: 35,
              fetchMode: 'managed_browser',
              createdMenuCount: 35,
              linkedMappingCount: 35,
              verifiedMappingCount: 0
            })
          }
        ])
      },
      managedChromeSessionProbe: {
        inspect: vi.fn().mockResolvedValue({
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
            }
          ]
        })
      },
      syncRunRepository: {
        list: vi.fn().mockReturnValue([])
      },
      syncRunItemRepository: {
        listForRunIds: vi.fn().mockReturnValue([])
      },
      credentialVault: {
        get: vi.fn(),
        set: vi.fn()
      } as never,
      syncEngine: { run }
    })

    const handler = electronMock.registeredHandlers.get('sync:run-items')
    const items = [
      {
        platformCode: 'coupangeats',
        menuId: 'menu-10',
        platformMenuId: 'ce-10',
        previousName: '왕새우갈비',
        previousPrice: 23900,
        nextName: '왕새우갈비 테스트',
        nextPrice: 23900,
        executionMode: 'managed_browser'
      }
    ]

    const result = await handler?.({}, items)

    expect(run).toHaveBeenCalledWith([
      expect.objectContaining({
        platformCode: 'coupangeats',
        menuId: 'menu-10',
        executionMode: 'managed_browser'
      })
    ])
    expect(result).toEqual({
      syncRunId: 'run-1',
      summary: '성공 1건, 실패 0건'
    })
  })

  it('does not run coupangeats items when the managed browser session is unavailable', async () => {
    const run = vi.fn().mockResolvedValue({ syncRunId: 'run-1', summary: '성공 1건, 실패 0건' })

    registerHandlers({
      menuRepository: {
        list: vi.fn().mockReturnValue([
          {
            menuId: 'menu-11',
            baseName: '왕새우갈비 테스트',
            basePrice: 23900,
            isDirty: 1,
            isManaged: 1
          }
        ]),
        upsert: vi.fn()
      },
      mappingRepository: {
        listAll: vi.fn().mockReturnValue([
          {
            mappingId: 'menu-11:coupangeats',
            menuId: 'menu-11',
            platformCode: 'coupangeats',
            platformMenuId: 'ce-11',
            platformMenuName: '왕새우갈비',
            platformMenuCurrentPrice: 23900,
            platformMenuGroupName: '추천메뉴',
            matchedBy: 'manual',
            isConfirmed: 1
          }
        ]),
        upsert: vi.fn()
      },
      platformMenuRepository: {
        listAll: vi.fn().mockReturnValue([])
      },
      platformImportRunRepository: {
        listLatest: vi.fn().mockReturnValue([
          {
            importRunId: 'import-11',
            platformCode: 'coupangeats',
            startedAt: '2026-04-13T04:00:00.000Z',
            finishedAt: '2026-04-13T04:01:00.000Z',
            status: 'completed',
            menuFetchCompleted: 1,
            optionFetchCompleted: 1,
            summaryJson: JSON.stringify({
              platformCode: 'coupangeats',
              fetchedCount: 35,
              fetchMode: 'managed_browser',
              createdMenuCount: 35,
              linkedMappingCount: 35,
              verifiedMappingCount: 0
            })
          }
        ])
      },
      managedChromeSessionProbe: {
        inspect: vi.fn().mockResolvedValue({
          endpointUrl: 'http://127.0.0.1:39482',
          connected: false,
          error: 'connection_refused',
          tabs: []
        })
      },
      syncRunRepository: {
        list: vi.fn().mockReturnValue([])
      },
      syncRunItemRepository: {
        listForRunIds: vi.fn().mockReturnValue([])
      },
      credentialVault: {
        get: vi.fn(),
        set: vi.fn()
      } as never,
      syncEngine: { run }
    })

    const handler = electronMock.registeredHandlers.get('sync:run-items')
    const items = [
      {
        platformCode: 'coupangeats',
        menuId: 'menu-11',
        platformMenuId: 'ce-11',
        previousName: '왕새우갈비',
        previousPrice: 23900,
        nextName: '왕새우갈비 테스트',
        nextPrice: 23900,
        executionMode: 'managed_browser'
      }
    ]

    const result = await handler?.({}, items)

    expect(run).not.toHaveBeenCalled()
    expect(result).toEqual({
      syncRunId: null,
      summary: '실행 가능 0건, 제외 1건',
      skippedCount: 1
    })
  })

  it('returns saved platform option groups through IPC', async () => {
    registerHandlers({
      menuRepository: {
        list: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      mappingRepository: {
        listAll: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      platformMenuRepository: {
        listAll: vi.fn().mockReturnValue([])
      },
      platformOptionGroupRepository: {
        listAll: vi.fn().mockReturnValue([
          {
            platformCode: 'baemin',
            optionGroupId: 'g1',
            optionGroupName: '사이즈 추가선택',
            minOrderQuantity: 1,
            maxOrderQuantity: 1,
            mappingMenusCount: 2,
            options: [],
            menus: []
          }
        ])
      },
      syncRunRepository: {
        list: vi.fn().mockReturnValue([])
      },
      syncRunItemRepository: {
        listForRunIds: vi.fn().mockReturnValue([])
      },
      credentialVault: {
        get: vi.fn(),
        set: vi.fn()
      } as never
    })

    const handler = electronMock.registeredHandlers.get('platformOptionGroups:list')
    const result = await handler?.({})

    expect(result).toEqual([
      expect.objectContaining({
        platformCode: 'baemin',
        optionGroupId: 'g1',
        optionGroupName: '사이즈 추가선택'
      })
    ])
  })

  it('exposes import run, change, and logical option group lists', async () => {
    registerHandlers({
      menuRepository: {
        list: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      mappingRepository: {
        listAll: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      platformMenuRepository: {
        listAll: vi.fn().mockReturnValue([])
      },
      platformImportRunRepository: {
        listLatest: vi.fn().mockReturnValue([
          {
            importRunId: 'run-1',
            platformCode: 'baemin',
            startedAt: '2026-04-13T00:00:00.000Z',
            finishedAt: null,
            status: 'running',
            menuFetchCompleted: 0,
            optionFetchCompleted: 0
          }
        ])
      },
      platformImportChangeRepository: {
        listLatest: vi.fn().mockReturnValue([
          {
            changeId: 'change-1',
            importRunId: 'run-1',
            platformCode: 'baemin',
            entityType: 'menu',
            entityKey: 'menu-1',
            entityName: '감자피자',
            changeType: 'missing_suspected'
          }
        ])
      },
      logicalOptionGroupService: {
        list: vi.fn().mockReturnValue([
          {
            logicalGroupKey: 'baemin:logical-1',
            platformCode: 'baemin',
            displayName: '사이즈 추가',
            minOrderQuantity: 1,
            maxOrderQuantity: 1,
            optionCount: 2,
            connectedMenuCount: 1,
            sourceGroupCount: 1,
            sampleOptionNames: ['M', 'L'],
            status: 'single',
            sourceGroups: []
          }
        ])
      },
      syncRunRepository: {
        list: vi.fn().mockReturnValue([])
      },
      syncRunItemRepository: {
        listForRunIds: vi.fn().mockReturnValue([])
      },
      credentialVault: {
        get: vi.fn(),
        set: vi.fn()
      } as never
    })

    const importRunsHandler = electronMock.registeredHandlers.get('platformImportRuns:list')
    const importChangesHandler = electronMock.registeredHandlers.get('platformImportChanges:listLatest')
    const logicalGroupsHandler = electronMock.registeredHandlers.get('logicalOptionGroups:list')

    await expect(importRunsHandler?.({}, 10)).resolves.toEqual([
      expect.objectContaining({
        importRunId: 'run-1',
        platformCode: 'baemin'
      })
    ])
    await expect(importChangesHandler?.({}, 25)).resolves.toEqual([
      expect.objectContaining({
        changeId: 'change-1',
        importRunId: 'run-1'
      })
    ])
    await expect(logicalGroupsHandler?.({})).resolves.toEqual([
      expect.objectContaining({
        logicalGroupKey: 'baemin:logical-1',
        displayName: '사이즈 추가'
      })
    ])
  })

  it('normalizes IPC list limits before calling import run and change repositories', async () => {
    const importRunListLatest = vi.fn().mockReturnValue([])
    const importChangeListLatest = vi.fn().mockReturnValue([])

    registerHandlers({
      menuRepository: {
        list: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      mappingRepository: {
        listAll: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      platformMenuRepository: {
        listAll: vi.fn().mockReturnValue([])
      },
      platformImportRunRepository: {
        listLatest: importRunListLatest
      },
      platformImportChangeRepository: {
        listLatest: importChangeListLatest
      },
      syncRunRepository: {
        list: vi.fn().mockReturnValue([])
      },
      syncRunItemRepository: {
        listForRunIds: vi.fn().mockReturnValue([])
      },
      credentialVault: {
        get: vi.fn(),
        set: vi.fn()
      } as never,
      logicalOptionGroupService: {
        list: vi.fn().mockReturnValue([])
      }
    })

    const importRunsHandler = electronMock.registeredHandlers.get('platformImportRuns:list')
    const importChangesHandler = electronMock.registeredHandlers.get('platformImportChanges:listLatest')

    await importRunsHandler?.({}, undefined)
    await importRunsHandler?.({}, null)
    await importRunsHandler?.({}, -1)
    await importRunsHandler?.({}, 999)

    await importChangesHandler?.({}, undefined)
    await importChangesHandler?.({}, null)
    await importChangesHandler?.({}, -10)
    await importChangesHandler?.({}, 500)

    expect(importRunListLatest.mock.calls).toEqual([[50], [50], [50], [200]])
    expect(importChangeListLatest.mock.calls).toEqual([[50], [50], [50], [200]])
  })

  it('returns inspection data together with import errors when platform import fails', async () => {
    const importInspection = {
      platformCode: 'coupangeats',
      steps: [
        {
          kind: 'navigation',
          title: '로그인 페이지',
          detail: '쿠팡이츠 로그인 화면을 열었습니다.',
          recordedAt: '2026-04-13T00:00:00.000Z'
        }
      ]
    }

    const importError = Object.assign(new Error('coupangeats_login_access_denied'), {
      inspection: importInspection
    })

    registerHandlers({
      menuRepository: {
        list: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      mappingRepository: {
        listAll: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      platformMenuRepository: {
        listAll: vi.fn().mockReturnValue([])
      },
      syncRunRepository: {
        list: vi.fn().mockReturnValue([])
      },
      syncRunItemRepository: {
        listForRunIds: vi.fn().mockReturnValue([])
      },
      credentialVault: {
        get: vi.fn().mockReturnValue({ username: 'saved-id', password: 'saved-password' }),
        set: vi.fn()
      } as never,
      platformMenuImporter: {
        importPlatform: vi.fn().mockRejectedValue(importError)
      }
    })

    const handler = electronMock.registeredHandlers.get('settings:import-platform-menus')
    const result = await handler?.({}, { platformCode: 'coupangeats' })

    expect(result).toEqual({
      ok: true,
      importError: 'coupangeats_login_access_denied',
      importInspection
    })
  })

  it('exposes browser inspection snapshots and bridge status through IPC', async () => {
    const listLatest = vi.fn().mockReturnValue([
      {
        snapshotId: 'snap-1',
        platformCode: 'coupangeats',
        source: 'browser_extension',
        pageUrl: 'https://store.coupangeats.com/merchant/menu',
        pageTitle: '메뉴 관리',
        host: 'store.coupangeats.com',
        capturedAt: '2026-04-13T00:00:00.000Z',
        textSnippet: '왕새우갈비 23,900원',
        menuNames: ['왕새우갈비'],
        optionGroupNames: ['도우 선택'],
        buttonLabels: ['저장'],
        inputHints: ['메뉴명', '가격'],
        fields: [],
        apiEvents: []
      }
    ])
    const getStatus = vi.fn().mockReturnValue({
      receiverUrl: 'http://127.0.0.1:39481/inspection-snapshots',
      extensionPath: 'C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector',
      isRunning: true
    })
    const launchManagedChrome = vi.fn().mockReturnValue({
      chromeAvailable: true,
      chromePath: 'C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      chromeProfilePath: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
      managedChromeRunning: true,
      lastLaunchUrl: 'https://store.coupangeats.com/merchant/management/menu/109935',
      chromeError: null
    })
    const inspectManagedChromeSession = vi.fn().mockResolvedValue({
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
        }
      ]
    })
    const captureManagedChromeTab = vi.fn().mockResolvedValue({
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
    const saveSnapshot = vi.fn()

    const dependencies = {
      menuRepository: {
        list: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      mappingRepository: {
        listAll: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      platformMenuRepository: {
        listAll: vi.fn().mockReturnValue([])
      },
      syncRunRepository: {
        list: vi.fn().mockReturnValue([])
      },
      syncRunItemRepository: {
        listForRunIds: vi.fn().mockReturnValue([])
      },
      credentialVault: {
        get: vi.fn(),
        set: vi.fn()
      },
      browserInspectionSnapshotRepository: {
        listLatest,
        save: saveSnapshot
      },
      browserInspectorBridge: {
        getStatus
      },
      managedChromeLauncher: {
        getStatus: vi.fn().mockReturnValue({
          chromeAvailable: true,
          chromePath: 'C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
          chromeProfilePath: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
          managedChromeRunning: false,
          lastLaunchUrl: null,
          chromeError: null
        }),
        launch: launchManagedChrome
      },
      managedChromeSessionProbe: {
        inspect: inspectManagedChromeSession
      },
      managedChromeSnapshotCapturer: {
        captureTab: captureManagedChromeTab
      }
    } as unknown as Parameters<typeof registerHandlers>[0]

    registerHandlers(dependencies)

    const snapshotsHandler = electronMock.registeredHandlers.get('browserInspectionSnapshots:listLatest')
    const statusHandler = electronMock.registeredHandlers.get('browserInspector:getStatus')
    const launchHandler = electronMock.registeredHandlers.get('browserInspector:launchManagedChrome')
    const sessionHandler = electronMock.registeredHandlers.get('browserInspector:getManagedChromeSession')
    const captureHandler = electronMock.registeredHandlers.get('browserInspector:captureManagedChromeTab')

    expect(snapshotsHandler).toBeTypeOf('function')
    expect(statusHandler).toBeTypeOf('function')
    expect(launchHandler).toBeTypeOf('function')
    expect(sessionHandler).toBeTypeOf('function')
    expect(captureHandler).toBeTypeOf('function')

    if (!snapshotsHandler || !statusHandler || !launchHandler || !sessionHandler || !captureHandler) {
      return
    }

    await expect(snapshotsHandler({}, 5)).resolves.toEqual([
      expect.objectContaining({
        snapshotId: 'snap-1',
        platformCode: 'coupangeats',
        menuNames: ['왕새우갈비']
      })
    ])
    await expect(statusHandler({})).resolves.toEqual({
      receiverUrl: 'http://127.0.0.1:39481/inspection-snapshots',
      extensionPath: 'C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector',
      isRunning: true,
      chromeAvailable: true,
      chromePath: 'C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      chromeProfilePath: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
      managedChromeRunning: false,
      lastLaunchUrl: null,
      chromeError: null
    })
    await expect(
      launchHandler({}, { url: 'https://store.coupangeats.com/merchant/management/menu/109935' })
    ).resolves.toEqual({
      receiverUrl: 'http://127.0.0.1:39481/inspection-snapshots',
      extensionPath: 'C:\\dev\\bedal\\browser-extension\\delivery-menu-inspector',
      isRunning: true,
      chromeAvailable: true,
      chromePath: 'C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      chromeProfilePath: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
      managedChromeRunning: true,
      lastLaunchUrl: 'https://store.coupangeats.com/merchant/management/menu/109935',
      chromeError: null
    })
    await expect(sessionHandler({})).resolves.toEqual({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: true,
      error: null,
      tabs: [
        expect.objectContaining({
          tabId: 'tab-1',
          title: '쿠팡이츠 메뉴 관리',
          pageKind: 'menu_list'
        })
      ]
    })
    await expect(captureHandler({}, { tabId: 'tab-1' })).resolves.toEqual(
      expect.objectContaining({
        snapshotId: 'managed-tab-1-2026-04-13T13:05:00.000Z',
        source: 'manual_browser',
        pageKind: 'menu_list'
      })
    )
    expect(listLatest).toHaveBeenCalledWith(5)
    expect(saveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotId: 'managed-tab-1-2026-04-13T13:05:00.000Z',
        source: 'manual_browser'
      })
    )
    expect(getStatus).toHaveBeenCalledTimes(2)
    expect(launchManagedChrome).toHaveBeenCalledWith(
      'https://store.coupangeats.com/merchant/management/menu/109935'
    )
    expect(inspectManagedChromeSession).toHaveBeenCalledTimes(1)
    expect(captureManagedChromeTab).toHaveBeenCalledWith('tab-1')
  })

  it('uses the saved coupangeats credentials for managed chrome auto-login when requested', async () => {
    const launchManagedChrome = vi.fn().mockReturnValue({
      chromeAvailable: true,
      chromePath: 'C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      chromeProfilePath: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
      managedChromeRunning: true,
      lastLaunchUrl: 'https://store.coupangeats.com/merchant/login',
      chromeError: null
    })
    const autoLogin = vi.fn().mockResolvedValue({
      platformCode: 'coupangeats',
      status: 'submitted',
      message: '저장된 쿠팡이츠 계정으로 로그인을 시도했습니다.'
    })

    registerHandlers({
      menuRepository: {
        list: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      mappingRepository: {
        listAll: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      platformMenuRepository: {
        listAll: vi.fn().mockReturnValue([])
      },
      syncRunRepository: {
        list: vi.fn().mockReturnValue([])
      },
      syncRunItemRepository: {
        listForRunIds: vi.fn().mockReturnValue([])
      },
      credentialVault: {
        get: vi.fn().mockImplementation((platformCode: string) =>
          platformCode === 'coupangeats'
            ? { username: 'saved-id', password: 'saved-password' }
            : null
        ),
        set: vi.fn()
      } as never,
      managedChromeLauncher: {
        getStatus: vi.fn().mockReturnValue({
          chromeAvailable: true,
          chromePath: 'C:\\Users\\WON2\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
          chromeProfilePath: 'C:\\Users\\WON2\\AppData\\Roaming\\delivery-menu-sync\\managed-chrome',
          managedChromeRunning: false,
          lastLaunchUrl: null,
          chromeError: null
        }),
        launch: launchManagedChrome
      },
      managedChromeLoginAutomator: {
        getLaunchUrl: vi.fn().mockReturnValue('https://store.coupangeats.com/merchant/login'),
        autoLogin
      }
    } as unknown as Parameters<typeof registerHandlers>[0])

    const launchHandler = electronMock.registeredHandlers.get('browserInspector:launchManagedChrome')

    await expect(
      launchHandler?.({}, { platformCode: 'coupangeats', autoLogin: true })
    ).resolves.toEqual(
      expect.objectContaining({
        chromeAvailable: true,
        managedChromeRunning: true,
        lastLaunchUrl: 'https://store.coupangeats.com/merchant/login',
        managedChromeAutoLoginStatus: 'submitted',
        managedChromeAutoLoginMessage: '저장된 쿠팡이츠 계정으로 로그인을 시도했습니다.'
      })
    )

    expect(launchManagedChrome).toHaveBeenCalledWith('https://store.coupangeats.com/merchant/login')
    expect(autoLogin).toHaveBeenCalledWith('coupangeats', {
      username: 'saved-id',
      password: 'saved-password'
    })
  })

  it('exposes the next action planning report through IPC', async () => {
    const getNextActionPlan = vi.fn().mockResolvedValue({
      task: 'agent-plan-next-actions',
      generatedAt: '2026-04-14T09:40:00.000Z',
      summary: '다음 작업 2건',
      data: {
        total: 2,
        byPriority: { high: 1, medium: 1, low: 0 },
        items: []
      }
    })

    registerHandlers({
      menuRepository: {
        list: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      mappingRepository: {
        listAll: vi.fn().mockReturnValue([]),
        upsert: vi.fn()
      },
      platformMenuRepository: {
        listAll: vi.fn().mockReturnValue([])
      },
      syncRunRepository: {
        list: vi.fn().mockReturnValue([])
      },
      syncRunItemRepository: {
        listForRunIds: vi.fn().mockReturnValue([])
      },
      credentialVault: {
        get: vi.fn(),
        set: vi.fn()
      } as never,
      agentOperationsReportService: {
        getNextActionPlan
      } as never
    })

    const handler = electronMock.registeredHandlers.get('agentReports:getNextActionPlan')

    await expect(
      handler?.({}, { platformCode: 'baemin', reason: 'source_missing_review', limit: 5 })
    ).resolves.toEqual({
      task: 'agent-plan-next-actions',
      generatedAt: '2026-04-14T09:40:00.000Z',
      summary: '다음 작업 2건',
      data: {
        total: 2,
        byPriority: { high: 1, medium: 1, low: 0 },
        items: []
      }
    })

    expect(getNextActionPlan).toHaveBeenCalledWith({
      platformCode: 'baemin',
      reason: 'source_missing_review',
      limit: 5
    })
  })
})
