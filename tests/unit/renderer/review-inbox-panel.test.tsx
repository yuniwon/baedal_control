import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listOpen, link, mergeCanonical, resolve } = vi.hoisted(() => ({
  listOpen: vi.fn(),
  link: vi.fn(),
  mergeCanonical: vi.fn(),
  resolve: vi.fn()
}))

vi.mock('../../../src/renderer/src/lib/api', () => ({
  appApi: { catalogReviews: { listOpen, link, mergeCanonical, resolve } }
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

const optionOnlyItem = {
  ...missingItem(10),
  reviewItemId: 'review-option-only',
  fingerprint: 'fingerprint-option-only',
  kind: 'option_only_on_platform' as const,
  title: '국산피클 메뉴가 일반 메뉴가 아닌 옵션으로만 있습니다',
  explanation: '해당 플랫폼에서는 유료 옵션으로 제공되며, 별도 사이드·소스 메뉴는 확인되지 않았습니다.',
  evidenceJson: JSON.stringify({ canonicalName: '국산피클', optionRole: 'paid_add_on' })
}

const generalAliasCandidateItem = {
  ...missingItem(11),
  reviewItemId: 'review-general-alias',
  fingerprint: 'fingerprint-general-alias',
  title: '국산피클 메뉴가 플랫폼에 연결되지 않았습니다',
  evidenceJson: JSON.stringify({
    canonicalName: '국산피클',
    signals: { generalMenuCandidateCount: 1 }
  })
}

const generalCandidateItem = {
  ...missingItem(12),
  reviewItemId: 'review-general-candidate',
  fingerprint: 'fingerprint-general-candidate',
  title: '국산피클 메뉴가 플랫폼에 연결되지 않았습니다',
  evidenceJson: JSON.stringify({
    canonicalName: '국산피클',
    signals: { generalMenuCandidateCount: 1 },
    generalCandidates: [{
      platformMenuId: 'pickle-source',
      platformMenuName: '피클 1개',
      platformMenuCurrentPrice: 500,
      platformMenuGroupName: '사이드'
    }]
  })
}

const canonicalPlatformOnlyItem = {
  ...missingItem(13),
  reviewItemId: 'review-canonical-platform-only',
  fingerprint: 'fingerprint-canonical-platform-only',
  kind: 'canonical_platform_only' as const,
  title: '피클 통합메뉴가 기준 플랫폼에는 없습니다',
  recommendation: 'manual_review' as const,
  canonicalMenuId: 'pickle-platform-only',
  platformCode: null,
  evidenceJson: JSON.stringify({
    canonicalName: '피클',
    platformMappings: [{ platformCode: 'yogiyo', platformMenuName: '피클' }],
    canonicalCandidates: [{ canonicalMenuId: 'pickle', canonicalName: '국산피클', basePrice: 500 }]
  })
}

describe('ReviewInboxPanel', () => {
  beforeEach(() => {
    listOpen.mockResolvedValue([missingItem(1), missingItem(2), missingItem(3)])
    link.mockResolvedValue({ ok: true, mappingId: 'mapping-1', resolvedCount: 1 })
    mergeCanonical.mockResolvedValue({ ok: true, backupPath: null, sourceMenuId: 'pickle-platform-only', targetMenuId: 'pickle', resolvedCount: 1 })
    resolve.mockResolvedValue({ ok: true, resolvedCount: 1 })
  })

  it('groups matching exceptions and keeps raw evidence collapsed', async () => {
    render(<ReviewInboxPanel />)

    expect(await screen.findByText('쿠팡이츠 일반 메뉴 누락 3개')).toBeTruthy()
    expect(screen.getByText('추천 확인').previousElementSibling?.textContent).toBe('3')
    expect(screen.getByText('결정 필요').previousElementSibling?.textContent).toBe('0')
    expect(screen.queryByText('raw-source-1')).toBeNull()
  })

  it('shows the decision path before exposing the primary action', async () => {
    render(<ReviewInboxPanel />)

    expect(await screen.findByText('통합 메뉴')).toBeTruthy()
    expect(screen.getByText('일반 메뉴 대상 플랫폼')).toBeTruthy()
    expect(screen.getByText('일반 메뉴 추가 여부')).toBeTruthy()
    expect(screen.getByRole('button', { name: '플랫폼에 일반 메뉴 추가 대상으로 표시' })).toBeTruthy()
  })

  it('labels option-only presence separately from a general-menu gap', async () => {
    listOpen.mockResolvedValue([optionOnlyItem])

    render(<ReviewInboxPanel />)

    expect(await screen.findByText('쿠팡이츠 옵션 메뉴만 존재 (일반 메뉴 없음) 1개')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /쿠팡이츠 옵션 메뉴만 존재 \(일반 메뉴 없음\) 1개/ }))
    expect(screen.getByText('쿠팡이츠 유료 옵션만 제공')).toBeTruthy()
    expect(screen.getByText('일반 메뉴 추가 여부')).toBeTruthy()
    expect(screen.getByRole('button', { name: '일반 메뉴 추가 대상으로 표시' })).toBeTruthy()
  })

  it('puts a differently named general-menu candidate in its own review lane', async () => {
    listOpen.mockResolvedValue([generalAliasCandidateItem])

    render(<ReviewInboxPanel />)

    expect(await screen.findByText('쿠팡이츠 이름 차이 연결 후보 1개')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /쿠팡이츠 이름 차이 연결 후보 1개/ }))
    expect(screen.getByText('이름 차이 연결 확인')).toBeTruthy()
  })

  it('lets the operator link a concrete general-menu candidate', async () => {
    listOpen.mockResolvedValue([generalCandidateItem])

    render(<ReviewInboxPanel />)

    expect(await screen.findByText('피클 1개')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '이 후보와 연결' }))

    await waitFor(() => {
      expect(link).toHaveBeenCalledWith({
        reviewItemId: 'review-general-candidate',
        sourceEntityId: 'pickle-source'
      })
      expect(screen.queryByText('이름 차이 연결 후보 1개')).toBeNull()
    })
  })

  it('offers a merge action when a platform-only canonical menu has a reference candidate', async () => {
    listOpen.mockResolvedValue([canonicalPlatformOnlyItem])

    render(<ReviewInboxPanel />)

    expect(await screen.findByText('기준 플랫폼 밖 일반 메뉴 1개')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /기준 플랫폼 밖 일반 메뉴 1개/ }))
    expect(screen.getByText('현재 연결된 플랫폼')).toBeTruthy()
    expect(screen.getByRole('button', { name: '이 메뉴와 합치기' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '이 메뉴와 합치기' }))

    await waitFor(() => {
      expect(mergeCanonical).toHaveBeenCalledWith({
        reviewItemId: 'review-canonical-platform-only',
        targetCanonicalMenuId: 'pickle'
      })
      expect(screen.queryByText('기준 플랫폼 밖 일반 메뉴 1개')).toBeNull()
    })
  })

  it('offers one-time and remembered resolution scopes', async () => {
    render(<ReviewInboxPanel />)

    fireEvent.click(await screen.findByRole('button', { name: '이 플랫폼에는 판매하지 않음' }))

    expect(screen.getByLabelText('앞으로 같은 경우에도 적용')).toBeTruthy()
    expect(screen.getByLabelText('결정 이유')).toBeTruthy()
  })

  it('resolves a group together only when the selected recommendations match', async () => {
    render(<ReviewInboxPanel />)

    fireEvent.click(await screen.findByLabelText('쿠팡이츠 일반 메뉴 누락 모두 선택'))
    fireEvent.click(screen.getByRole('button', { name: '이 플랫폼에는 판매하지 않음' }))
    fireEvent.click(screen.getByRole('button', { name: '결정 저장' }))

    await waitFor(() => {
      expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
        reviewItemIds: ['review-1', 'review-2', 'review-3'],
        resolution: 'exclude_platform'
      }))
      expect(screen.queryByText('쿠팡이츠 일반 메뉴 누락 3개')).toBeNull()
    })
  })
})
