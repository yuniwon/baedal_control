import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getCredentialStatus, listImportRuns, preview, activate } = vi.hoisted(() => ({
  getCredentialStatus: vi.fn(),
  listImportRuns: vi.fn(),
  preview: vi.fn(),
  activate: vi.fn()
}))

vi.mock('../../../src/renderer/src/lib/api', () => ({
  appApi: {
    settings: { getPlatformCredentialStatus: getCredentialStatus },
    platformImportRuns: { list: listImportRuns },
    catalogBootstrap: { preview, activate }
  }
}))

import { CatalogOnboardingPage } from '../../../src/renderer/src/pages/CatalogOnboardingPage'

const workspace = {
  workspaceId: 'default',
  displayName: '기본 매장',
  lifecycleState: 'collecting' as const,
  seedMode: null,
  seedPlatformCode: null,
  canonicalVersion: 0
}

describe('CatalogOnboardingPage', () => {
  beforeEach(() => {
    getCredentialStatus.mockResolvedValue([
      { platformCode: 'baemin', connected: true },
      { platformCode: 'ddangyo', connected: true },
      { platformCode: 'coupangeats', connected: true },
      { platformCode: 'yogiyo', connected: true },
      { platformCode: 'deliveryspecial', connected: true },
      { platformCode: 'naverorder', connected: false }
    ])
    listImportRuns.mockResolvedValue([
      { importRunId: 'b-1', platformCode: 'baemin', status: 'completed', menuFetchCompleted: 1, optionFetchCompleted: 1, startedAt: '2026-07-25T00:00:00.000Z' },
      { importRunId: 'd-1', platformCode: 'ddangyo', status: 'completed', menuFetchCompleted: 1, optionFetchCompleted: 1, startedAt: '2026-07-25T00:00:00.000Z' },
      { importRunId: 'y-1', platformCode: 'yogiyo', status: 'completed', menuFetchCompleted: 1, optionFetchCompleted: 1, startedAt: '2026-07-25T00:00:00.000Z' },
      { importRunId: 'c-1', platformCode: 'coupangeats', status: 'partial_failed', menuFetchCompleted: 0, optionFetchCompleted: 0, startedAt: '2026-07-25T00:00:00.000Z' },
      { importRunId: 'ds-1', platformCode: 'deliveryspecial', status: 'completed', menuFetchCompleted: 0, optionFetchCompleted: 0, startedAt: '2026-07-25T00:00:00.000Z' }
    ])
    preview.mockReset()
    activate.mockReset()
  })

  it('enables only connected platforms with a complete latest menu import', async () => {
    render(<CatalogOnboardingPage workspace={workspace} onActivated={vi.fn()} />)

    expect((await screen.findByRole('radio', { name: '배달의민족' }) as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByRole('radio', { name: '땡겨요' }) as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByRole('radio', { name: '요기요' }) as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByRole('radio', { name: '쿠팡이츠' }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: '배달특급' }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: '네이버주문' }) as HTMLInputElement).disabled).toBe(true)
  })

  it('does not activate until every seed row is included or explicitly ignored', async () => {
    preview.mockResolvedValue({
      workspaceId: 'default',
      seedMode: 'platform',
      seedPlatformCode: 'baemin',
      previewFingerprint: 'preview-1',
      draftMenus: [
        {
          menuId: 'menu-1',
          sourcePlatformCode: 'baemin',
          sourcePlatformMenuId: 'source-1',
          baseName: '킹쉬림프피자',
          basePrice: 25900,
          basePriceVariants: null,
          disposition: 'undecided'
        }
      ],
      suggestedMappings: [],
      reviewItems: []
    })

    render(<CatalogOnboardingPage workspace={workspace} onActivated={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: '통합 메뉴 초안 만들기' }))

    expect((await screen.findByRole('button', { name: '통합 메뉴 시작' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: '통합 메뉴에 포함' }))

    await waitFor(() => {
      expect((screen.getByRole('button', { name: '통합 메뉴 시작' }) as HTMLButtonElement).disabled).toBe(false)
    })
  })
})
