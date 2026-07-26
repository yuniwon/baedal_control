import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listOpen, resolve } = vi.hoisted(() => ({
  listOpen: vi.fn(),
  resolve: vi.fn()
}))

vi.mock('../../../src/renderer/src/lib/api', () => ({
  appApi: { catalogReviews: { listOpen, resolve } }
}))

import { ReviewInboxPanel } from '../../../src/renderer/src/components/ReviewInboxPanel'

const missingItem = (index: number) => ({
  reviewItemId: `review-${index}`,
  workspaceId: 'default',
  fingerprint: `fingerprint-${index}`,
  kind: 'missing_on_platform' as const,
  state: 'open' as const,
  confidence: 1,
  title: `누락 메뉴 ${index}`,
  explanation: '의도적인 미판매인지 누락인지 결정이 필요합니다.',
  recommendation: 'add_to_platform' as const,
  evidenceJson: JSON.stringify({ sourceEntityIds: [`raw-source-${index}`] }),
  canonicalMenuId: `menu-${index}`,
  platformCode: 'coupangeats' as const,
  sourceEntityId: null,
  intentRuleId: null
})

describe('ReviewInboxPanel', () => {
  beforeEach(() => {
    listOpen.mockResolvedValue([missingItem(1), missingItem(2), missingItem(3)])
    resolve.mockResolvedValue({ ok: true, resolvedCount: 1 })
  })

  it('groups matching exceptions and keeps raw evidence collapsed', async () => {
    render(<ReviewInboxPanel />)

    expect(await screen.findByText('쿠팡이츠 누락 메뉴 3개')).toBeTruthy()
    expect(screen.getByText('추천 확인').previousElementSibling?.textContent).toBe('3')
    expect(screen.getByText('결정 필요').previousElementSibling?.textContent).toBe('0')
    expect(screen.queryByText('raw-source-1')).toBeNull()
  })

  it('offers one-time and remembered resolution scopes', async () => {
    render(<ReviewInboxPanel />)

    fireEvent.click(await screen.findByRole('button', { name: '의도적으로 제외' }))

    expect(screen.getByLabelText('앞으로 같은 경우에도 적용')).toBeTruthy()
    expect(screen.getByLabelText('결정 이유')).toBeTruthy()
  })

  it('resolves a group together only when the selected recommendations match', async () => {
    render(<ReviewInboxPanel />)

    fireEvent.click(await screen.findByLabelText('쿠팡이츠 누락 메뉴 모두 선택'))
    fireEvent.click(screen.getByRole('button', { name: '의도적으로 제외' }))
    fireEvent.click(screen.getByRole('button', { name: '결정 저장' }))

    await waitFor(() => {
      expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
        reviewItemIds: ['review-1', 'review-2', 'review-3'],
        resolution: 'exclude_platform'
      }))
      expect(screen.queryByText('쿠팡이츠 누락 메뉴 3개')).toBeNull()
    })
  })
})
