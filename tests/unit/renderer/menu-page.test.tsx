import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const {
  listMenus,
  listMappings,
  listPlatformMenus,
  listPlatformOptionGroups,
  saveMenu,
  deleteMenu
} = vi.hoisted(() => ({
  listMenus: vi.fn().mockResolvedValue([
    { menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0, isManaged: 1 },
    { menuId: 'm2', baseName: '핫소스', basePrice: 200, isDirty: 0, isManaged: 1 },
    { menuId: 'm3', baseName: '새 메뉴', basePrice: 0, isDirty: 1, isManaged: 1 },
    { menuId: 'm4', baseName: '테스트 메뉴', basePrice: 10000, isDirty: 0, isManaged: 1 }
  ]),
  listMappings: vi.fn().mockResolvedValue([
    {
      mappingId: 'm1:baemin',
      menuId: 'm1',
      platformCode: 'baemin',
      platformMenuId: 'p-11',
      platformMenuName: '콤비네이션',
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
      matchedBy: 'auto',
      isConfirmed: 1
    },
    {
      mappingId: 'm2:baemin',
      menuId: 'm2',
      platformCode: 'baemin',
      platformMenuId: 'p-12',
      platformMenuName: '핫소스',
      platformMenuStatus: '판매중',
      platformMenuBindingSummary: '연결 가게 없음',
      platformMenuBindingStatus: '가게 연결 없음',
      matchedBy: 'auto',
      isConfirmed: 1
    },
    {
      mappingId: 'm4:baemin',
      menuId: 'm4',
      platformCode: 'baemin',
      platformMenuId: 'p-41',
      platformMenuName: '테스트 메뉴',
      platformMenuGroupName: '배민 우선 카테고리',
      platformMenuStatus: '판매중',
      platformMenuBindingSummary: '연결 가게 없음',
      platformMenuBindingStatus: '가게 연결 없음',
      matchedBy: 'auto',
      isConfirmed: 1
    },
    {
      mappingId: 'm4:coupangeats',
      menuId: 'm4',
      platformCode: 'coupangeats',
      platformMenuId: 'cp-41',
      platformMenuName: '테스트 메뉴',
      platformMenuGroupName: '쿠팡 우선 카테고리',
      platformMenuStatus: '판매중',
      platformMenuBindingSummary: '[쿠팡이츠] 연결 정상',
      platformMenuBindingStatus: '연결 정상',
      matchedBy: 'auto',
      isConfirmed: 1
    }
  ]),
  listPlatformMenus: vi.fn().mockResolvedValue([
    {
      platformCode: 'baemin',
      platformMenuId: 'p-11',
      platformMenuName: '콤비네이션',
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
      presenceStatus: 'present',
      lastSeenAt: '2026-04-13T00:00:00Z'
    },
    {
      platformCode: 'baemin',
      platformMenuId: 'p-12',
      platformMenuName: '핫소스',
      platformMenuStatus: '판매중',
      platformMenuBindingSummary: '연결 가게 없음',
      platformMenuBindingStatus: '가게 연결 없음',
      presenceStatus: 'missing_suspected',
      lastSeenAt: '2026-04-12T00:00:00Z'
    },
    {
      platformCode: 'baemin',
      platformMenuId: 'p-41',
      platformMenuName: '테스트 메뉴',
      platformMenuGroupName: '배민 우선 카테고리',
      platformMenuStatus: '판매중',
      platformMenuBindingSummary: '연결 가게 없음',
      platformMenuBindingStatus: '가게 연결 없음',
      presenceStatus: 'absent_confirmed',
      lastSeenAt: '2026-04-10T00:00:00Z'
    },
    {
      platformCode: 'coupangeats',
      platformMenuId: 'cp-41',
      platformMenuName: '테스트 메뉴',
      platformMenuGroupName: '쿠팡 우선 카테고리',
      platformMenuStatus: '판매중',
      platformMenuBindingSummary: '[쿠팡이츠] 연결 정상',
      platformMenuBindingStatus: '연결 정상',
      presenceStatus: 'resurfaced',
      lastSeenAt: '2026-04-11T00:00:00Z'
    }
  ]),
  listPlatformOptionGroups: vi.fn().mockResolvedValue([
    {
      platformCode: 'baemin',
      optionGroupId: 'g-11',
      optionGroupName: '사이즈 추가선택',
      minOrderQuantity: 1,
      maxOrderQuantity: 1,
      mappingMenusCount: 1,
      options: [
        {
          optionId: 'o-11',
          optionName: 'M 사이즈',
          optionPrice: 0,
          itemStatus: 'ACTIVE',
          restockedAt: null
        },
        {
          optionId: 'o-12',
          optionName: 'L 사이즈',
          optionPrice: 4000,
          itemStatus: 'ACTIVE',
          restockedAt: null
        }
      ],
      menus: [
        {
          platformMenuId: 'p-11',
          platformMenuName: '콤비네이션',
          platformMenuGroupName: '숨김 메뉴'
        }
      ]
    }
  ]),
  saveMenu: vi.fn().mockResolvedValue({ ok: true }),
  deleteMenu: vi.fn().mockResolvedValue({ ok: true })
}))

vi.mock('../../../src/renderer/src/lib/api', () => ({
  appApi: {
    menus: {
      list: listMenus,
      save: saveMenu,
      delete: deleteMenu
    },
    mappings: {
      list: listMappings,
      save: vi.fn()
    },
    platformOptionGroups: {
      list: listPlatformOptionGroups
    },
    platformMenus: {
      list: listPlatformMenus
    },
    settings: {
      getPlatformCredentialStatus: vi.fn(),
      savePlatformCredential: vi.fn()
    },
    syncRuns: {
      list: vi.fn()
    },
    sync: {
      preview: vi.fn(),
      run: vi.fn()
    }
  }
}))

import { MenuPage } from '../../../src/renderer/src/pages/MenuPage'

describe('MenuPage', () => {
  it('groups menus by derived category names', async () => {
    render(<MenuPage />)

    expect(await screen.findByRole('heading', { name: '숨김 메뉴' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '배민 우선 카테고리' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '미분류' })).toBeTruthy()
    expect(screen.getAllByText('메뉴 1개').length).toBe(2)
    expect(screen.getByText('메뉴 2개')).toBeTruthy()
    expect(screen.getByDisplayValue('콤비네이션')).toBeTruthy()
    expect(screen.getByDisplayValue('핫소스')).toBeTruthy()
    expect(screen.getByDisplayValue('새 메뉴')).toBeTruthy()
    expect(screen.getByDisplayValue('테스트 메뉴')).toBeTruthy()
  })

  it('shows source metadata alongside the imported menu', async () => {
    render(<MenuPage />)

    expect((await screen.findAllByText('배민')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/ID p-11/)).toBeNull()
    expect(screen.getByText('확인됨')).toBeTruthy()
    expect(screen.getAllByText(/숨김 메뉴/).length).toBeGreaterThan(0)
    expect(screen.getByText('배달 22,900원')).toBeTruthy()
    expect(screen.getByText(/기본 · 배달 22,900원/)).toBeTruthy()
    expect(screen.getByText(/\[음식배달\] 꾸버스피자 봉담점/)).toBeTruthy()
    expect(screen.getByText(/마지막 확인 2026\. 04\. 13\. 09:00/)).toBeTruthy()
  })

  it('shows option group summaries for linked platform menus', async () => {
    render(<MenuPage />)

    expect(await screen.findByText('옵션그룹 1개')).toBeTruthy()
    expect(screen.getByText(/사이즈 추가선택/)).toBeTruthy()
    expect(screen.getByText(/필수 1~1/)).toBeTruthy()
    expect(screen.getByText(/M 사이즈, L 사이즈/)).toBeTruthy()
  })

  it('saves edited menu rows to the local store', async () => {
    render(<MenuPage />)

    const input = await screen.findByDisplayValue('콤비네이션')
    fireEvent.change(input, { target: { value: '직화불고기' } })

    await waitFor(() => {
      expect(saveMenu).toHaveBeenCalledWith(
        expect.objectContaining({
          menuId: 'm1',
          baseName: '직화불고기',
          basePrice: 22900
        })
      )
    })
  })

  it('filters menus that need store-binding review', async () => {
    render(<MenuPage />)

    expect(await screen.findByDisplayValue('콤비네이션')).toBeTruthy()
    expect(screen.getByDisplayValue('핫소스')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /가게 연결 검토 필요/ }))

    expect(screen.queryByDisplayValue('콤비네이션')).toBeNull()
    expect(screen.getByDisplayValue('핫소스')).toBeTruthy()
    expect(screen.getAllByText(/연결 가게 없음/).length).toBeGreaterThan(0)
  })

  it('filters menus by source presence state', async () => {
    render(<MenuPage />)

    expect(await screen.findByDisplayValue('콤비네이션')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /원본 누락 의심/ }))
    expect(screen.queryByDisplayValue('콤비네이션')).toBeNull()
    expect(screen.getByDisplayValue('핫소스')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /플랫폼에 없음/ }))
    expect(screen.queryByDisplayValue('콤비네이션')).toBeNull()
    expect(screen.getByDisplayValue('테스트 메뉴')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /재등장/ }))
    expect(screen.queryByDisplayValue('콤비네이션')).toBeNull()
    expect(screen.getByDisplayValue('테스트 메뉴')).toBeTruthy()
  })

  it('filters menus by the search box using base and platform menu names', async () => {
    render(<MenuPage />)

    expect(await screen.findByDisplayValue('콤비네이션')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('기준 메뉴 또는 플랫폼 메뉴 검색'), {
      target: { value: '핫소스' }
    })

    expect(screen.queryByDisplayValue('콤비네이션')).toBeNull()
    expect(screen.getByLabelText('m2-name')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('기준 메뉴 또는 플랫폼 메뉴 검색'), {
      target: { value: '없는 메뉴' }
    })

    expect(screen.getByText('조건에 맞는 메뉴가 없습니다.')).toBeTruthy()
  })

  it('lets the user exclude a menu from management', async () => {
    render(<MenuPage />)

    const row = (await screen.findByLabelText('m1-name')).closest('tr')
    expect(row).toBeTruthy()
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '관리 제외' }))

    await waitFor(() => {
      expect(saveMenu).toHaveBeenCalledWith(
        expect.objectContaining({
          menuId: 'm1',
          isManaged: 0
        })
      )
    })

    expect(await screen.findByRole('button', { name: '다시 포함' })).toBeTruthy()
  })

  it('deletes an unlinked menu row instead of forcing management exclusion', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))

    render(<MenuPage />)

    fireEvent.click(await screen.findByLabelText('m3-delete'))

    await waitFor(() => {
      expect(deleteMenu).toHaveBeenCalledWith('m3')
    })

    expect(screen.queryByDisplayValue('새 메뉴')).toBeNull()
  })
})
