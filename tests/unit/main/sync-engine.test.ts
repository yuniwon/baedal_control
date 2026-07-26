import { describe, expect, it, vi } from 'vitest'
import { SyncEngine } from '../../../src/main/services/sync-engine'

describe('SyncEngine', () => {
  it('continues to the next platform when one adapter fails', async () => {
    const adapterRegistry = {
      getWriter: (platformCode: string) => ({
        apply: vi.fn().mockImplementation(() => {
          if (platformCode === 'coupangeats') {
            throw new Error('save_failed')
          }
        })
      })
    }

    const engine = new SyncEngine(adapterRegistry as never, {
      create: vi.fn(),
      finish: vi.fn(),
      addItem: vi.fn()
    } as never)

    const result = await engine.run([
      {
        platformCode: 'baemin',
        menuId: 'm1',
        platformMenuId: 'b1',
        previousName: '콤비네이션',
        nextName: '직화불고기',
        nextPrice: 23900
      },
      {
        platformCode: 'coupangeats',
        menuId: 'm1',
        platformMenuId: 'c1',
        previousName: '콤비네이션',
        nextName: '직화불고기',
        nextPrice: 23900
      }
    ])

    expect(result.summary).toBe('성공 1건, 실패 1건')
  })

  it('stores structured coupangeats managed-browser failure details in the run log', async () => {
    const addItem = vi.fn()
    const failureContextCollector = {
      capture: vi.fn().mockResolvedValue({
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
      })
    }
    const engine = new SyncEngine(
      {
        getWriter: () => ({
          apply: vi
            .fn()
            .mockRejectedValue(
              new Error(
                'coupangeats_managed_update_failed:editor_not_opened:menu_editor_controls_not_found'
              )
            )
        })
      } as never,
      {
        create: vi.fn(),
        finish: vi.fn(),
        addItem
      } as never,
      failureContextCollector as never
    )

    await engine.run([
      {
        platformCode: 'coupangeats',
        menuId: 'm1',
        platformMenuId: 'c1',
        previousName: '콤비네이션',
        nextName: '직화불고기',
        nextPrice: 23900
      }
    ])

    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        platformCode: 'coupangeats',
        status: 'failed',
        errorCode: 'coupangeats_managed_editor_not_opened',
        errorMessage: 'menu_editor_controls_not_found',
        failureContext: expect.objectContaining({
          kind: 'managed_browser_snapshot',
          status: 'captured',
          snapshotId: 'managed-tab-1',
          menuCount: 35,
          optionGroupCount: 26
        })
      })
    )
    expect(failureContextCollector.capture).toHaveBeenCalledTimes(1)
  })

  it('reconciles local dirty state after a successful platform write', async () => {
    const reconcile = vi.fn().mockResolvedValue(undefined)
    const engine = new SyncEngine(
      {
        getWriter: () => ({
          apply: vi.fn().mockResolvedValue(undefined)
        })
      } as never,
      {
        create: vi.fn(),
        finish: vi.fn(),
        addItem: vi.fn()
      } as never,
      undefined,
      { reconcile }
    )

    const item = {
      platformCode: 'ddangyo' as const,
      menuId: 'm1',
      platformMenuId: '10000039',
      previousName: '칠성사이다',
      previousPrice: 1800,
      nextName: '칠성사이다',
      nextPrice: 1800,
      nextPriceVariants: [
        {
          variantLabel: '500ml',
          channels: [
            {
              channelCode: 'delivery' as const,
              channelLabel: '배달',
              amount: 1800,
              amountText: '1,800원'
            }
          ]
        }
      ]
    }

    await engine.run([item])

    expect(reconcile).toHaveBeenCalledWith(item)
  })
})
