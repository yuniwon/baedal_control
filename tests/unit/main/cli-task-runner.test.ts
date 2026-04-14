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
})
