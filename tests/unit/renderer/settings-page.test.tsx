import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { listPlatformCredentials, savePlatformCredential } = vi.hoisted(() => ({
  listPlatformCredentials: vi.fn().mockResolvedValue([
    { platformCode: 'baemin', connected: true, username: 'owner-id', password: 'pw1' },
    { platformCode: 'coupangeats', connected: false, username: '', password: '' },
    { platformCode: 'ddangyo', connected: false, username: '', password: '' }
  ]),
  savePlatformCredential: vi.fn().mockResolvedValue({
    ok: true,
    importSummary: {
      platformCode: 'baemin',
      fetchedCount: 4,
      createdMenuCount: 4,
      linkedMappingCount: 4
    }
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
      savePlatformCredential
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

import { SettingsPage } from '../../../src/renderer/src/pages/SettingsPage'

describe('SettingsPage', () => {
  it('reloads saved platform credentials when the page mounts again', async () => {
    render(<SettingsPage />)

    expect(await screen.findByDisplayValue('owner-id')).toBeTruthy()
    expect(screen.getByDisplayValue('pw1')).toBeTruthy()
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

    expect(await screen.findByText('메뉴 4개를 가져와 4개 연결했습니다.')).toBeTruthy()
  })
})
