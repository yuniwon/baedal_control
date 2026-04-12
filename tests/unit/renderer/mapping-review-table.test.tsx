import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MappingReviewTable } from '../../../src/renderer/src/components/MappingReviewTable'

describe('MappingReviewTable', () => {
  it('confirms the typed platform menu name on blur', () => {
    const onConfirm = vi.fn()

    render(
      <MappingReviewTable
        rows={[
          {
            menuId: 'm1',
            baseName: '콤비네이션',
            platformCode: 'baemin',
            platformMenuName: '콤비네이션피자'
          }
        ]}
        onConfirm={onConfirm}
      />
    )

    fireEvent.blur(screen.getByDisplayValue('콤비네이션피자'), {
      target: { value: '콤비네이션 라지' }
    })

    expect(onConfirm).toHaveBeenCalledWith('m1', 'baemin', '콤비네이션 라지')
  })
})
