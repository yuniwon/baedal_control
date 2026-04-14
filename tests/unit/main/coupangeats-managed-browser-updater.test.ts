import { describe, expect, it, vi } from 'vitest'

import { CoupangEatsManagedBrowserUpdater } from '../../../src/main/platforms/coupangeats/managed-browser-updater'

describe('CoupangEatsManagedBrowserUpdater', () => {
  it('selects the coupangeats menu tab and executes the managed-browser update script', async () => {
    const inspect = vi.fn().mockResolvedValue({
      endpointUrl: 'http://127.0.0.1:39482',
      connected: true,
      error: null,
      tabs: [
        {
          tabId: 'tab-menu',
          title: '쿠팡이츠 메뉴 관리',
          url: 'https://store.coupangeats.com/merchant/management/menu/109935',
          type: 'page',
          host: 'store.coupangeats.com',
          platformCode: 'coupangeats',
          pageKind: 'menu_list'
        }
      ]
    })
    const evaluate = vi.fn().mockResolvedValue({
      status: 'saved',
      message: 'updated'
    })

    const updater = new CoupangEatsManagedBrowserUpdater({
      managedChromeSessionProbe: { inspect },
      managedChromeScriptRunner: { evaluateJson: evaluate },
      loadManagedBrowserScript: async () =>
        'export const applyManagedBrowserMenuUpdate = async (payload) => ({ status: "saved", payload })'
    })

    await expect(
      updater.applyMenuUpdate({
        platformCode: 'coupangeats',
        menuId: 'm1',
        platformMenuId: 'ce-1',
        previousName: '왕새우갈비',
        previousPrice: 23900,
        nextName: '왕새우갈비 수정',
        nextPrice: 24900,
        platformMenuGroupName: '추천메뉴',
        executionMode: 'managed_browser'
      })
    ).resolves.toBeUndefined()

    expect(inspect).toHaveBeenCalledTimes(1)
    expect(evaluate).toHaveBeenCalledWith(
      'tab-menu',
      expect.stringContaining('applyManagedBrowserMenuUpdate')
    )
    expect(evaluate).toHaveBeenCalledWith(
      'tab-menu',
      expect.stringContaining('"previousName":"왕새우갈비"')
    )
    expect(evaluate).toHaveBeenCalledWith(
      'tab-menu',
      expect.stringContaining('"platformMenuId":"ce-1"')
    )
  })

  it('fails clearly when no coupangeats menu tab is available', async () => {
    const updater = new CoupangEatsManagedBrowserUpdater({
      managedChromeSessionProbe: {
        inspect: vi.fn().mockResolvedValue({
          endpointUrl: 'http://127.0.0.1:39482',
          connected: true,
          error: null,
          tabs: []
        })
      },
      managedChromeScriptRunner: {
        evaluateJson: vi.fn()
      },
      loadManagedBrowserScript: async () =>
        'export const applyManagedBrowserMenuUpdate = async () => ({ status: "saved" })'
    })

    await expect(
      updater.applyMenuUpdate({
        platformCode: 'coupangeats',
        menuId: 'm1',
        platformMenuId: 'ce-1',
        previousName: '왕새우갈비',
        previousPrice: 23900,
        nextName: '왕새우갈비 수정',
        nextPrice: 24900,
        executionMode: 'managed_browser'
      })
    ).rejects.toThrow('coupangeats_managed_menu_tab_not_found')
  })
})
