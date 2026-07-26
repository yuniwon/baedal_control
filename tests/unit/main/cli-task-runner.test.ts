import { describe, expect, it, vi } from 'vitest'
import { CliTaskRunner } from '../../../src/main/services/cli-task-runner'

describe('CliTaskRunner', () => {
  it('returns null when no task argument is provided', async () => {
    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn()
    })

    await expect(runner.run([])).resolves.toBeNull()
  })

  it('returns filtered preview items for sync-preview', async () => {
    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn().mockResolvedValue({
        items: [
          {
            platformCode: 'ddangyo',
            menuId: 'menu-1',
            platformMenuId: '10000039',
            previousName: '칠성사이다',
            previousPrice: 1800,
            nextName: '칠성사이다',
            nextPrice: 1800
          },
          {
            platformCode: 'baemin',
            menuId: 'menu-2',
            platformMenuId: '59707679',
            previousName: '쉬림프골드',
            previousPrice: 21000,
            nextName: '쉬림프골드 검증',
            nextPrice: 21000
          }
        ],
        needsReview: [
          {
            menuId: 'menu-1',
            platformCode: 'ddangyo',
            platformMenuId: '10000040',
            reason: 'price_variant_review',
            detail: '다중 가격 메뉴'
          }
        ]
      })
    })

    await expect(
      runner.run(['--task=sync-preview', '--platformCode=ddangyo', '--menuId=menu-1'])
    ).resolves.toEqual({
      exitCode: 0,
      payload: {
        task: 'sync-preview',
        items: [
          expect.objectContaining({
            platformCode: 'ddangyo',
            menuId: 'menu-1',
            platformMenuId: '10000039'
          })
        ],
        needsReview: [
          expect.objectContaining({
            platformCode: 'ddangyo',
            menuId: 'menu-1'
          })
        ]
      }
    })
  })

  it('runs only the matched executable preview items for sync-run-item', async () => {
    const run = vi.fn().mockResolvedValue({
      syncRunId: 'sync-1',
      summary: '성공 1건, 실패 0건'
    })
    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn().mockResolvedValue({
        items: [
          {
            platformCode: 'ddangyo',
            menuId: 'menu-1',
            platformMenuId: '10000039',
            previousName: '칠성사이다',
            previousPrice: 1800,
            nextName: '칠성사이다',
            nextPrice: 1800
          },
          {
            platformCode: 'ddangyo',
            menuId: 'menu-2',
            platformMenuId: '10000041',
            previousName: '콜라',
            previousPrice: 1800,
            nextName: '콜라',
            nextPrice: 1900
          }
        ],
        needsReview: []
      }),
      syncEngine: { run }
    })

    await expect(
      runner.run(['--task=sync-run-item', '--platformCode=ddangyo', '--platformMenuId=10000039'])
    ).resolves.toEqual({
      exitCode: 0,
      payload: {
        task: 'sync-run-item',
        executedCount: 1,
        needsReview: [],
        result: {
          syncRunId: 'sync-1',
          summary: '성공 1건, 실패 0건'
        }
      }
    })

    expect(run).toHaveBeenCalledWith([
      expect.objectContaining({
        platformCode: 'ddangyo',
        platformMenuId: '10000039'
      })
    ])
  })

  it('blocks import-platform when credentials are missing', async () => {
    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn(),
      platformMenuImporter: {
        importPlatform: vi.fn()
      },
      hasCredential: vi.fn().mockReturnValue(false)
    })

    await expect(
      runner.run(['--task=import-platform', '--platformCode=ddangyo'])
    ).resolves.toEqual({
      exitCode: 1,
      payload: {
        task: 'import-platform',
        error: 'credential_not_found'
      }
    })
  })

  it('imports Yogiyo through the CLI task path used for unattended rereads', async () => {
    const importPlatform = vi.fn().mockResolvedValue({
      summary: {
        platformCode: 'yogiyo',
        fetchedCount: 71,
        optionGroupCount: 18,
        createdMenuCount: 0,
        linkedMappingCount: 0,
        verifiedMappingCount: 0
      }
    })
    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn(),
      platformMenuImporter: { importPlatform },
      hasCredential: vi.fn().mockReturnValue(true)
    })

    await expect(
      runner.run(['--task=import-platform', '--platformCode=yogiyo'])
    ).resolves.toEqual({
      exitCode: 0,
      payload: {
        task: 'import-platform',
        platformCode: 'yogiyo',
        summary: expect.objectContaining({ fetchedCount: 71, optionGroupCount: 18 })
      }
    })
    expect(importPlatform).toHaveBeenCalledWith('yogiyo')
  })

  it('restores the platform session before an unattended import', async () => {
    const connect = vi.fn().mockResolvedValue({ state: 'ready' })
    const importPlatform = vi.fn().mockResolvedValue({
      summary: { platformCode: 'deliveryspecial', fetchedCount: 47 }
    })
    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn(),
      platformMenuImporter: { importPlatform } as never,
      platformSessionOrchestrator: { connect } as never,
      hasCredential: vi.fn().mockReturnValue(true)
    })

    const result = await runner.run([
      '--task=import-platform',
      '--platformCode=deliveryspecial'
    ])

    expect(result).toMatchObject({ exitCode: 0 })
    expect(connect).toHaveBeenCalledWith('deliveryspecial')
    expect(importPlatform).toHaveBeenCalledWith('deliveryspecial')
  })

  it('imports Coupang through its browser password-manager strategy without app credentials', async () => {
    const connect = vi.fn().mockResolvedValue({ state: 'ready' })
    const importPlatform = vi.fn().mockResolvedValue({
      summary: { platformCode: 'coupangeats', fetchedCount: 38 }
    })
    const hasCredential = vi.fn(() => {
      throw new Error('coupang credential must not be read')
    })
    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn(),
      platformMenuImporter: { importPlatform } as never,
      platformSessionOrchestrator: { connect } as never,
      requiresApplicationCredential: vi.fn().mockReturnValue(false),
      hasCredential
    })

    await expect(
      runner.run(['--task=import-platform', '--platformCode=coupangeats'])
    ).resolves.toMatchObject({ exitCode: 0 })
    expect(hasCredential).not.toHaveBeenCalled()
    expect(connect).toHaveBeenCalledWith('coupangeats')
    expect(importPlatform).toHaveBeenCalledWith('coupangeats')
  })

  it('returns immediately when an unattended import cannot restore its session', async () => {
    const importPlatform = vi.fn()
    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn(),
      platformMenuImporter: { importPlatform },
      platformSessionOrchestrator: {
        connect: vi.fn().mockResolvedValue({ state: 'challenge_required' })
      } as never,
      hasCredential: vi.fn().mockReturnValue(true)
    })

    await expect(
      runner.run(['--task=import-platform', '--platformCode=deliveryspecial'])
    ).resolves.toEqual({
      exitCode: 1,
      payload: {
        task: 'import-platform',
        platformCode: 'deliveryspecial',
        error: 'platform_session_not_ready:challenge_required'
      }
    })
    expect(importPlatform).not.toHaveBeenCalled()
  })

  it('returns a failed CLI result instead of leaving Electron open when import throws', async () => {
    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn(),
      platformMenuImporter: {
        importPlatform: vi.fn().mockRejectedValue(new Error('deliveryspecial_catalog_page_not_ready'))
      },
      hasCredential: vi.fn().mockReturnValue(true)
    })

    await expect(
      runner.run(['--task=import-platform', '--platformCode=deliveryspecial'])
    ).resolves.toEqual({
      exitCode: 1,
      payload: {
        task: 'import-platform',
        platformCode: 'deliveryspecial',
        error: 'deliveryspecial_catalog_page_not_ready'
      }
    })
  })

  it('returns a read-only create-menu inspection report for the requested platform', async () => {
    const inspectCreateMenuFlow = vi.fn().mockResolvedValue({
      platformCode: 'baemin',
      steps: [
        {
          kind: 'navigation',
          title: '새 메뉴 추가 1단계',
          recordedAt: '2026-04-14T06:00:00.000Z'
        }
      ]
    })

    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn(),
      platformFlowInspector: {
        inspectCreateMenuFlow
      }
    })

    await expect(
      runner.run(['--task=inspect-create-menu-flow', '--platformCode=baemin'])
    ).resolves.toEqual({
      exitCode: 0,
      payload: {
        task: 'inspect-create-menu-flow',
        platformCode: 'baemin',
        inspection: {
          platformCode: 'baemin',
          steps: [
            expect.objectContaining({
              title: '새 메뉴 추가 1단계'
            })
          ]
        }
      }
    })

    expect(inspectCreateMenuFlow).toHaveBeenCalledWith('baemin')
  })

  it('parses reason and limit filters for agent reports', async () => {
    const getOverviewReport = vi.fn().mockResolvedValue({
      task: 'agent-report-overview',
      generatedAt: '2026-04-14T00:00:00.000Z',
      summary: 'ok',
      data: {}
    })

    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn().mockResolvedValue({ items: [], needsReview: [] }),
      agentOperationsReportService: {
        getOverviewReport,
        getReviewQueueReport: vi.fn(),
        getMenuReport: vi.fn(),
        getOptionsReport: vi.fn(),
        getPlatformReport: vi.fn()
      }
    })

    const result = await runner.run([
      '--task=agent-report-overview',
      '--platformCode=baemin',
      '--reason=source_missing_review',
      '--limit=3'
    ])

    expect(getOverviewReport).toHaveBeenCalledWith({
      platformCode: 'baemin',
      menuId: null,
      platformMenuId: null,
      reason: 'source_missing_review',
      limit: 3
    })
    expect(result?.exitCode).toBe(0)
  })

  it('requires menuId for agent-report-menu', async () => {
    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn().mockResolvedValue({ items: [], needsReview: [] }),
      agentOperationsReportService: {
        getOverviewReport: vi.fn(),
        getReviewQueueReport: vi.fn(),
        getMenuReport: vi.fn(),
        getOptionsReport: vi.fn(),
        getPlatformReport: vi.fn()
      }
    })

    await expect(runner.run(['--task=agent-report-menu'])).resolves.toEqual({
      exitCode: 1,
      payload: { task: 'agent-report-menu', error: 'menu_id_required' }
    })
  })

  it('forwards filters to agent-plan-next-actions', async () => {
    const getNextActionPlan = vi.fn().mockResolvedValue({
      task: 'agent-plan-next-actions',
      generatedAt: '2026-04-14T00:00:00.000Z',
      summary: '다음 작업 2건',
      data: {
        total: 2,
        byPriority: { high: 1, medium: 1, low: 0 },
        items: []
      }
    })

    const runner = new CliTaskRunner({
      getSyncPreview: vi.fn().mockResolvedValue({ items: [], needsReview: [] }),
      agentOperationsReportService: {
        getOverviewReport: vi.fn(),
        getReviewQueueReport: vi.fn(),
        getMenuReport: vi.fn(),
        getOptionsReport: vi.fn(),
        getPlatformReport: vi.fn(),
        getNextActionPlan
      } as never
    })

    await expect(
      runner.run([
        '--task=agent-plan-next-actions',
        '--platformCode=baemin',
        '--reason=source_missing_review',
        '--limit=2'
      ])
    ).resolves.toEqual({
      exitCode: 0,
      payload: {
        task: 'agent-plan-next-actions',
        generatedAt: '2026-04-14T00:00:00.000Z',
        summary: '다음 작업 2건',
        data: {
          total: 2,
          byPriority: { high: 1, medium: 1, low: 0 },
          items: []
        }
      }
    })

    expect(getNextActionPlan).toHaveBeenCalledWith({
      platformCode: 'baemin',
      menuId: null,
      platformMenuId: null,
      reason: 'source_missing_review',
      limit: 2
    })
  })
})
