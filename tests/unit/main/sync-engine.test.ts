import { describe, expect, it, vi } from 'vitest'
import { SyncEngine } from '../../../src/main/services/sync-engine'

describe('SyncEngine', () => {
  it('continues to the next platform when one adapter fails', async () => {
    const adapterRegistry = {
      get: (platformCode: string) => ({
        applyMenuUpdate: vi.fn().mockImplementation(() => {
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

    expect(result.summary).toBe('1 succeeded, 1 failed')
  })
})
