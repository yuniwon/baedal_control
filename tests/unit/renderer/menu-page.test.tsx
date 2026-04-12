import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { listMenus, saveMenu } = vi.hoisted(() => ({
  listMenus: vi.fn().mockResolvedValue([
    { menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 }
  ]),
  saveMenu: vi.fn().mockResolvedValue({ ok: true })
}))

vi.mock('../../../src/renderer/src/lib/api', () => ({
  appApi: {
    menus: {
      list: listMenus,
      save: saveMenu
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
      list: vi.fn()
    },
    sync: {
      preview: vi.fn(),
      run: vi.fn()
    }
  }
}))

import { MenuPage } from '../../../src/renderer/src/pages/MenuPage'

describe('MenuPage', () => {
  it('saves edited menu rows to the local store', async () => {
    render(<MenuPage />)

    const input = await screen.findByDisplayValue('콤비네이션')
    fireEvent.change(input, { target: { value: '직화불고기' } })

    await waitFor(() => {
      expect(saveMenu).toHaveBeenCalledWith(
        expect.objectContaining({
          menuId: 'm1',
          baseName: '직화불고기',
          basePrice: 22900
        })
      )
    })
  })
})
