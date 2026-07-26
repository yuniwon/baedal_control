import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PlatformCode } from '../../../src/shared/contracts'
import {
  MappingReviewTable,
  type MappingCandidate
} from '../../../src/renderer/src/components/MappingReviewTable'

describe('MappingReviewTable', () => {
  it('groups rows by base menu and highlights the current candidate', () => {
    const onSelectCandidate = vi.fn()
    const onClear = vi.fn()
    const catalog: Record<PlatformCode, MappingCandidate[]> = {
      baemin: [
        {
          currentMappingId: 'm1:baemin',
          currentMenuId: 'm1',
          currentBaseName: '콤비네이션',
          platformCode: 'baemin',
          platformMenuId: 'p-11',
          platformMenuName: '콤비네이션피자',
          platformMenuGroupName: '숨김 메뉴',
          platformMenuStatus: '숨김',
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
        },
        {
          currentMappingId: 'm2:baemin',
          currentMenuId: 'm2',
          currentBaseName: '라지 피자',
          platformCode: 'baemin',
          platformMenuId: 'p-22',
          platformMenuName: '콤비네이션 라지',
          platformMenuStatus: '판매중',
          platformMenuBindingSummary: '[음식배달] 꾸버스피자 봉담점',
          platformMenuBindingStatus: '연결 정상'
        }
      ],
      yogiyo: [],
      coupangeats: [],
      ddangyo: [],
      deliveryspecial: [],
      naverorder: []
    }

    render(
      <MappingReviewTable
        catalog={catalog}
        showDetails={false}
        rows={[
          {
            menuId: 'm1',
            baseName: '콤비네이션',
            platformCode: 'baemin',
            platformMenuName: '콤비네이션피자',
            platformMenuId: 'p-11',
            platformMenuGroupName: '숨김 메뉴',
            platformMenuStatus: '숨김',
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
            platformMenuBindingStatus: '연결 정상',
            duplicateNameCount: 2
          },
          {
            menuId: 'm1',
            baseName: '콤비네이션',
            platformCode: 'coupangeats'
          }
        ]}
        onSelectCandidate={onSelectCandidate}
        onClear={onClear}
      />
    )

    expect(screen.getByRole('heading', { name: '콤비네이션' })).toBeTruthy()
    expect(screen.getAllByText('배민').length).toBeGreaterThan(0)
    expect(screen.getByText('쿠팡이츠')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('m1-baemin-search'), {
      target: { value: '라지' }
    })
    const row = screen.getByLabelText('m1-baemin-search').closest('[data-platform-row="m1:baemin"]')

    expect(row).toBeTruthy()
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: /콤비네이션 라지 선택/ })
    )
    fireEvent.change(screen.getByLabelText('m1-baemin-search'), {
      target: { value: '콤비네이션피자' }
    })
    fireEvent.click(screen.getByLabelText('m1-baemin-clear'))

    expect(onSelectCandidate).toHaveBeenCalledWith(
      'm1',
      'baemin',
      expect.objectContaining({ platformMenuId: 'p-22' })
    )
    expect(
      within(row as HTMLElement).getByRole('button', { name: /콤비네이션피자 선택/ })
    ).toBeTruthy()
    expect(
      within(row as HTMLElement)
        .getByRole('button', { name: /콤비네이션피자 선택/ })
        .className
    ).toContain('active')
    expect(screen.getAllByText(/현재 연결/).length).toBeGreaterThan(0)
    expect(onClear).toHaveBeenCalledWith('m1', 'baemin')
    expect(screen.queryByText(/ID p-11/)).toBeNull()
    expect(screen.getAllByText(/숨김 메뉴/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/연결 정상/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/기본 · 배달 22,900원/)).toBeNull()
    expect(screen.getByText(/이름 중복 2개/)).toBeTruthy()
  })
})
