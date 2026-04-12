import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { listSyncRuns } = vi.hoisted(() => ({
  listSyncRuns: vi.fn().mockResolvedValue([
    {
      syncRunId: 'r1',
      startedAt: '2026-04-12T10:00:00Z',
      resultSummary: '3 succeeded, 0 failed'
    }
  ])
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
      savePlatformCredential: vi.fn()
    },
    syncRuns: {
      list: listSyncRuns
    },
    sync: {
      preview: vi.fn(),
      run: vi.fn()
    }
  }
}))

import { HistoryPage } from '../../../src/renderer/src/pages/HistoryPage'

describe('HistoryPage', () => {
  it('shows the latest run summary from the local history store', async () => {
    render(<HistoryPage />)

    await waitFor(() => {
      expect(screen.getByText('3 succeeded, 0 failed')).toBeTruthy()
    })
  })
})
