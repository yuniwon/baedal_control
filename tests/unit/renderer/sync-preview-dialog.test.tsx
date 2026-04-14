import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SyncPreviewDialog } from '../../../src/renderer/src/components/SyncPreviewDialog'

describe('SyncPreviewDialog', () => {
  it('renders shared change summaries and runs sync when the operator confirms', () => {
    const onConfirm = vi.fn()

    render(
      <SyncPreviewDialog
        items={[
          {
            platformCode: 'baemin',
            menuId: 'm1',
            platformMenuId: 'b1',
            previousName: '콤비네이션',
            previousPrice: 23900,
            nextName: '직화불고기',
            nextPrice: 23900
          },
          {
            platformCode: 'coupangeats',
            menuId: 'm2',
            platformMenuId: 'c1',
            previousName: '사이다',
            previousPrice: 1800,
            previousPriceVariants: [
              {
                variantLabel: '500ml',
                channels: [
                  {
                    channelCode: 'delivery',
                    channelLabel: '배달',
                    amount: 1800,
                    amountText: '1,800원'
                  }
                ]
              },
              {
                variantLabel: '1.25L',
                channels: [
                  {
                    channelCode: 'delivery',
                    channelLabel: '배달',
                    amount: 2600,
                    amountText: '2,600원'
                  }
                ]
              }
            ],
            nextName: '사이다',
            nextPrice: 1800,
            nextPriceVariants: [
              {
                variantLabel: '500ml',
                channels: [
                  {
                    channelCode: 'delivery',
                    channelLabel: '배달',
                    amount: 1800,
                    amountText: '1,800원'
                  }
                ]
              },
              {
                variantLabel: '1.25L',
                channels: [
                  {
                    channelCode: 'delivery',
                    channelLabel: '배달',
                    amount: 2800,
                    amountText: '2,800원'
                  }
                ]
              }
            ],
            executionMode: 'managed_browser'
          }
        ]}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByRole('heading', { name: '반영 확인' })).toBeTruthy()
    expect(screen.getByText('배민 · 이름 변경')).toBeTruthy()
    expect(screen.getByText('반영값 23,900원')).toBeTruthy()
    expect(screen.getByText('이름: 콤비네이션 -> 직화불고기')).toBeTruthy()
    expect(screen.getAllByText(/가격 구조 변경/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '상세 보기' })).toBeTruthy()
    expect(
      screen.queryByText(
        '가격 구조: 500ml · 배달 1,800원 / 1.25L · 배달 2,600원 -> 500ml · 배달 1,800원 / 1.25L · 배달 2,800원'
      )
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '상세 보기' }))
    expect(
      screen.getByText(
        '가격 구조: 500ml · 배달 1,800원 / 1.25L · 배달 2,600원 -> 500ml · 배달 1,800원 / 1.25L · 배달 2,800원'
      )
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '접기' })).toBeTruthy()
    expect(screen.getByText('현재 탭')).toBeTruthy()
    expect(screen.queryByText('가격 유지')).toBeNull()
    fireEvent.click(screen.getByLabelText('사이다 선택'))
    fireEvent.click(screen.getByRole('button', { name: '선택 1건 반영' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({
        platformCode: 'baemin',
        menuId: 'm1'
      })
    ])
  })
})
