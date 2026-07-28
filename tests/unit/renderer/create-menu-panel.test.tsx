import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CreateMenuPanel } from '../../../src/renderer/src/components/menu-workspace/CreateMenuPanel'

describe('CreateMenuPanel', () => {
  it('persists only after valid explicit confirmation', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    const cancel = vi.fn()
    render(<CreateMenuPanel onCancel={cancel} onCreate={create} />)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(cancel).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('메뉴명'), { target: { value: '새 피자' } })
    fireEvent.change(screen.getByLabelText('기준 가격'), { target: { value: '22000' } })
    fireEvent.click(screen.getByRole('button', { name: '메뉴 만들기' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toMatchObject({ baseName: '새 피자', basePrice: 22000 })
  })
})
