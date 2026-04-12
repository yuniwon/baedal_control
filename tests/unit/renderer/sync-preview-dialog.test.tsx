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
          }
        ]}
        onConfirm={onConfirm}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '실행' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
