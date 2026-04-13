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
})
