import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { save } = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue(undefined) }))
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
    logicalOptionGroups: { list: vi.fn().mockResolvedValue([]) }
  }
}))

import { UnifiedMenuPage } from '../../../src/renderer/src/pages/UnifiedMenuPage'

describe('UnifiedMenuPage', () => {
  beforeEach(() => save.mockClear())

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
})
