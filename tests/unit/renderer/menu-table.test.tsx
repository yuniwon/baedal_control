import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MenuTable } from '../../../src/renderer/src/components/MenuTable'

describe('MenuTable', () => {
  it('uses compact fixed-width columns for actions and price', () => {
    const onChange = vi.fn()
    const onDelete = vi.fn()
    const { container } = render(
      <MenuTable
        menus={[{ menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0 }]}
        onChange={onChange}
        onDelete={onDelete}
      />
    )

    expect(container.querySelector('.menu-table-manage-col')).toBeTruthy()
    expect(container.querySelector('.menu-table-price-col')).toBeTruthy()
    expect(screen.getByLabelText('m1-price').className).toContain('menu-price-input')
  })

  it('edits menu name and price inline and lets the user delete unlinked menus', () => {
    const onChange = vi.fn()
    const onDelete = vi.fn()

    render(
      <MenuTable
        menus={[
          {
            menuId: 'm1',
            baseName: '콤비네이션',
            basePrice: 22900,
            isDirty: 0,
            sources: [
              {
                platformCode: 'baemin',
                platformMenuId: 'p-11',
                platformMenuName: '콤비네이션',
                mappingStatus: 'active',
                presenceStatus: 'present',
                lastSeenAt: '2026-04-13T00:00:00Z',
                platformMenuGroupName: '숨김 메뉴',
                platformMenuStatus: '판매중',
                platformMenuPriceSummary: '배달 22,900원',
                platformMenuPriceVariants: [
                  {
                    variantLabel: null,
                    channels: [
                      {
                        channelCode: 'delivery',
                        channelLabel: '배달',
                        amount: 22900,
                        amountText: '22,900원'
                      }
                    ]
                  }
                ],
                platformMenuBindingSummary: '[음식배달] 꾸버스피자 봉담점',
                platformMenuBindingStatus: '연결 정상'
              }
            ]
          },
          { menuId: 'm2', baseName: '새 메뉴', basePrice: 0, isDirty: 1 }
        ]}
        onChange={onChange}
        onDelete={onDelete}
      />
    )

    fireEvent.change(screen.getByDisplayValue('콤비네이션'), { target: { value: '직화불고기' } })
    fireEvent.change(screen.getByDisplayValue('22900'), { target: { value: '23900' } })
    fireEvent.click(screen.getByLabelText('m2-delete'))

    expect(onChange).toHaveBeenLastCalledWith('m1', { baseName: '직화불고기', basePrice: 23900 })
    expect(onDelete).toHaveBeenCalledWith('m2')
    expect(screen.queryByLabelText('m1-delete')).toBeNull()
    expect(screen.queryByText(/ID p-11/)).toBeNull()
    expect(screen.getByText('확인됨')).toBeTruthy()
    expect(screen.getByText('배민')).toBeTruthy()
    expect(screen.getByText('숨김 메뉴')).toBeTruthy()
    expect(screen.getByText(/기본 · 배달 22,900원/)).toBeTruthy()
    expect(screen.getByText(/마지막 확인 2026\. 04\. 13\. 09:00/)).toBeTruthy()
  })

  it('renders source-missing status chips distinctly', () => {
    const onChange = vi.fn()
    const onDelete = vi.fn()
    const { container } = render(
      <MenuTable
        menus={[
          {
            menuId: 'm3',
            baseName: '핫소스',
            basePrice: 200,
            isDirty: 0,
            sources: [
              {
                platformCode: 'baemin',
                platformMenuId: 'p-12',
                platformMenuName: '핫소스',
                mappingStatus: 'source_absent',
                presenceStatus: 'absent_confirmed',
                platformMenuBindingStatus: '가게 연결 없음'
              }
            ]
          }
        ]}
        onChange={onChange}
        onDelete={onDelete}
      />
    )

    expect(screen.getByText('플랫폼에 없음')).toBeTruthy()
    expect(container.querySelector('.source-item-danger')).toBeTruthy()
  })
})
