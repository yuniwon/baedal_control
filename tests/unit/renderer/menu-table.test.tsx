import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MenuTable } from '../../../src/renderer/src/components/MenuTable'

describe('MenuTable', () => {
  it('edits menu name and price inline', () => {
    const onChange = vi.fn()

    render(
      <MenuTable
        menus={[{ menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 }]}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByDisplayValue('콤비네이션'), { target: { value: '직화불고기' } })
    fireEvent.change(screen.getByDisplayValue('22900'), { target: { value: '23900' } })

    expect(onChange).toHaveBeenLastCalledWith('m1', { baseName: '직화불고기', basePrice: 23900 })
  })
})
