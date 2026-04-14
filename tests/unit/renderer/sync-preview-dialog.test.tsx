import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SyncPreviewDialog } from '../../../src/renderer/src/components/SyncPreviewDialog'

describe('SyncPreviewDialog', () => {
  it('runs sync when the operator confirms', () => {
    const onConfirm = vi.fn()

    render(
      <SyncPreviewDialog
        items={[
          {
            platformCode: 'baemin',
            menuId: 'm1',
            platformMenuId: 'b1',
            previousName: '콤비네이션',
            nextName: '직화불고기',
            nextPrice: 23900
          },
          {
            platformCode: 'coupangeats',
            menuId: 'm2',
            platformMenuId: 'c1',
            previousName: '사이다',
            nextName: '사이다',
            nextPrice: 1800,
            executionMode: 'managed_browser'
          }
        ]}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByText('현재 탭 반영')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('사이다 선택'))
    fireEvent.click(screen.getByRole('button', { name: '선택 1건 실행' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({
        platformCode: 'baemin',
        menuId: 'm1'
      })
    ])
  })
})
