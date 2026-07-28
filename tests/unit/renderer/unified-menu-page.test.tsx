import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { save, previewMaintenance, applyMaintenance } = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue(undefined),
  previewMaintenance: vi.fn().mockResolvedValue({
    referencePlatformCode: 'baemin',
    menuCount: 120,
    safeMerges: [{
      candidateId: 'merge:m2:m1',
      sourceMenuId: 'm2',
      sourceName: '치즈 피자 M',
      targetMenuId: 'm1',
      targetName: '치즈피자',
      platformCode: 'yogiyo',
      reason: '안전 일치'
    }],
    hiddenMenuIds: ['hidden-1']
  }),
  applyMaintenance: vi.fn().mockResolvedValue({
    backupPath: 'backup.db',
    mergedMenuCount: 1,
    excludedMenuCount: 1,
    normalizedCategoryCount: 2,
    refreshedReferencePriceCount: 1,
    remainingMenuCount: 118
  })
}))
vi.mock('../../../src/renderer/src/lib/api', () => ({
  appApi: {
    menus: {
      list: vi.fn().mockResolvedValue([
        { menuId: 'm1', baseName: '킹쉬림프 피자', basePrice: 25900, isDirty: 0, isManaged: 1 },
        { menuId: 'm2', baseName: '치즈 피자', basePrice: 19900, isDirty: 0, isManaged: 1 }
      ]),
      save,
      delete: vi.fn().mockResolvedValue({ ok: true })
    },
    mappings: { list: vi.fn().mockResolvedValue([
      { mappingId: 'x', menuId: 'm1', platformCode: 'baemin', platformMenuId: 'raw-1', platformMenuName: '킹쉬림프', platformMenuGroupName: '피자', matchedBy: 'auto', isConfirmed: 1 }
    ]) },
    platformMenus: { list: vi.fn().mockResolvedValue([]) },
    platformOptionGroups: { list: vi.fn().mockResolvedValue([]) },
    logicalOptionGroups: { list: vi.fn().mockResolvedValue([]) },
    catalogMaintenance: { preview: previewMaintenance, apply: applyMaintenance }
  }
}))

import { UnifiedMenuPage } from '../../../src/renderer/src/pages/UnifiedMenuPage'

describe('UnifiedMenuPage', () => {
  beforeEach(() => {
    save.mockClear()
    previewMaintenance.mockClear()
    applyMaintenance.mockClear()
  })

  it('uses a compact list and saves an explicit local draft only once', async () => {
    render(<UnifiedMenuPage />)

    expect(await screen.findByRole('button', { name: /킹쉬림프 피자/ })).toBeTruthy()
    expect(screen.queryByDisplayValue('킹쉬림프 피자')).toBeNull()
    expect(screen.queryByText('raw-1')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /킹쉬림프 피자/ }))
    const name = await screen.findByLabelText('기준 메뉴명')
    fireEvent.change(name, { target: { value: '킹쉬림프 피자 수정' } })
    expect(save).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '변경 저장' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0]).toMatchObject({ menuId: 'm1', baseName: '킹쉬림프 피자 수정' })
  })

  it('filters one search field across canonical and platform names', async () => {
    render(<UnifiedMenuPage />)
    const search = await screen.findByRole('searchbox', { name: '통합 검색' })
    fireEvent.change(search, { target: { value: '킹쉬림프' } })
    expect(screen.getByRole('button', { name: /킹쉬림프 피자/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /치즈 피자/ })).toBeNull()
  })

  it('previews and explicitly applies safe catalog repairs', async () => {
    render(<UnifiedMenuPage />)

    fireEvent.click(await screen.findByRole('button', { name: '데이터 정리' }))
    expect(await screen.findByText('확정 병합 1개')).toBeTruthy()
    expect(screen.getByText('숨김 메뉴 제외 1개')).toBeTruthy()
    expect(screen.getByText(/치즈 피자 M/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '백업 후 정리 적용' }))
    await waitFor(() => expect(applyMaintenance).toHaveBeenCalledWith({
      referencePlatformCode: 'baemin',
      acceptedCandidateIds: ['merge:m2:m1'],
      excludeHiddenOnlyMenus: true
    }))
    expect(await screen.findByText('통합메뉴 118개로 정리했습니다.')).toBeTruthy()
  })
})
