import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const initialMappings = [
  {
    mappingId: 'm1:baemin',
    menuId: 'm1',
    platformCode: 'baemin',
    platformMenuId: 'p-11',
    platformMenuName: '콤비네이션피자',
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
    platformMenuId: 'p-22',
    platformMenuName: '콤비네이션 라지',
    platformMenuPriceVariants: [
      {
        variantLabel: null,
        channels: [
          {
            channelCode: 'delivery',
            channelLabel: '배달',
            amount: 23900,
            amountText: '23,900원'
          }
        ]
      }
    ],
    platformMenuBindingSummary: '[음식배달] 꾸버스피자 봉담점',
    platformMenuBindingStatus: '연결 정상',
    matchedBy: 'auto',
    isConfirmed: 1
  }
]

const mappingsAfterReassign = [
  {
    mappingId: 'm1:baemin',
    menuId: 'm1',
    platformCode: 'baemin',
    platformMenuId: 'p-22',
    platformMenuName: '콤비네이션 라지',
    platformMenuPriceVariants: [
      {
        variantLabel: null,
        channels: [
          {
            channelCode: 'delivery',
            channelLabel: '배달',
            amount: 23900,
            amountText: '23,900원'
          }
        ]
      }
    ],
    platformMenuBindingSummary: '[음식배달] 꾸버스피자 봉담점',
    platformMenuBindingStatus: '연결 정상',
    matchedBy: 'manual',
    isConfirmed: 1
  }
]

const { listMenus, listMappings, listPlatformMenus, saveMapping, deleteMapping } = vi.hoisted(
  () => ({
    listMenus: vi.fn(),
    listMappings: vi.fn(),
    listPlatformMenus: vi.fn(),
    saveMapping: vi.fn().mockResolvedValue({ ok: true }),
    deleteMapping: vi.fn().mockResolvedValue({ ok: true })
  })
)

vi.mock('../../../src/renderer/src/lib/api', () => ({
  appApi: {
    menus: {
      list: listMenus,
      save: vi.fn()
    },
    mappings: {
      list: listMappings,
      save: saveMapping,
      delete: deleteMapping
    },
    platformMenus: {
      list: listPlatformMenus
    },
    settings: {
      getPlatformCredentialStatus: vi.fn(),
      listPlatformCredentials: vi.fn(),
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

import { MappingPage } from '../../../src/renderer/src/pages/MappingPage'

describe('MappingPage', () => {
  beforeEach(() => {
    listMenus.mockReset()
    listMappings.mockReset()
    listPlatformMenus.mockReset()
    saveMapping.mockClear()
    deleteMapping.mockClear()

    listMenus.mockResolvedValue([
      { menuId: 'm1', baseName: '콤비네이션', basePrice: 22900, isDirty: 0, isManaged: 1 },
      { menuId: 'm2', baseName: '라지 피자', basePrice: 23900, isDirty: 0, isManaged: 1 },
      { menuId: 'm3', baseName: '제외 메뉴', basePrice: 1000, isDirty: 0, isManaged: 0 }
    ])

    listPlatformMenus.mockResolvedValue([
      {
        platformCode: 'baemin',
        platformMenuId: 'p-11',
        platformMenuName: '콤비네이션피자',
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
        platformCode: 'baemin',
        platformMenuId: 'p-22',
        platformMenuName: '콤비네이션 라지',
        platformMenuPriceVariants: [
          {
            variantLabel: null,
            channels: [
              {
                channelCode: 'delivery',
                channelLabel: '배달',
                amount: 23900,
                amountText: '23,900원'
              }
            ]
          }
        ],
        platformMenuBindingSummary: '[음식배달] 꾸버스피자 봉담점',
        platformMenuBindingStatus: '연결 정상'
      }
    ])
  })

  it('hides excluded menus and keeps the original automatic candidate reusable after reassignment', async () => {
    listMappings
      .mockResolvedValueOnce(initialMappings)
      .mockResolvedValueOnce(mappingsAfterReassign)
      .mockResolvedValueOnce(initialMappings)

    render(<MappingPage />)

    expect(await screen.findByLabelText('m1-baemin-search')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '콤비네이션' })).toBeTruthy()
    expect(screen.queryByText('제외 메뉴')).toBeNull()

    fireEvent.change(screen.getByLabelText('m1-baemin-search'), {
      target: { value: '라지' }
    })
    const row = screen
      .getByLabelText('m1-baemin-search')
      .closest('[data-platform-row="m1:baemin"]')

    expect(row).toBeTruthy()
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: /콤비네이션 라지 선택/ })
    )

    await waitFor(() => {
      expect(deleteMapping).toHaveBeenCalledWith('m2:baemin')
      expect(saveMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          mappingId: 'm1:baemin',
          menuId: 'm1',
          platformCode: 'baemin',
          platformMenuId: 'p-22',
          platformMenuName: '콤비네이션 라지',
          platformMenuPriceVariants: [
            {
              variantLabel: null,
              channels: [
                {
                  channelCode: 'delivery',
                  channelLabel: '배달',
                  amount: 23900,
                  amountText: '23,900원'
                }
              ]
            }
          ]
        })
      )
    })

    fireEvent.change(screen.getByLabelText('m1-baemin-search'), {
      target: { value: '콤비네이션피자' }
    })
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: /콤비네이션피자 선택/ })
    )

    await waitFor(() => {
      expect(saveMapping).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mappingId: 'm1:baemin',
          menuId: 'm1',
          platformCode: 'baemin',
          platformMenuId: 'p-11',
          platformMenuName: '콤비네이션피자',
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
          ]
        })
      )
    })

    expect(screen.queryByText(/ID p-11/)).toBeNull()
  })

  it('clears the current mapping', async () => {
    listMappings.mockResolvedValue(initialMappings)

    render(<MappingPage />)

    fireEvent.click(await screen.findByLabelText('m1-baemin-clear'))

    await waitFor(() => {
      expect(deleteMapping).toHaveBeenCalledWith('m1:baemin')
    })
  })

  it('filters mapping groups by the page-level search box', async () => {
    listMappings.mockResolvedValue(initialMappings)

    render(<MappingPage />)

    expect(await screen.findByRole('heading', { name: '콤비네이션' })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('기준 메뉴 또는 현재 연결 검색'), {
      target: { value: '라지' }
    })

    expect(screen.queryByRole('heading', { name: '콤비네이션' })).toBeNull()
    expect(screen.getByRole('heading', { name: '라지 피자' })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('기준 메뉴 또는 현재 연결 검색'), {
      target: { value: '없는 검색어' }
    })

    expect(screen.getByText('조건에 맞는 기준 메뉴가 없습니다.')).toBeTruthy()
  })

  it('keeps mapping details collapsed until the operator opens them', async () => {
    listMappings.mockResolvedValue(initialMappings)

    render(<MappingPage />)

    expect(await screen.findByRole('heading', { name: '매핑' })).toBeTruthy()
    expect(screen.queryByText('[음식배달] 꾸버스피자 봉담점')).toBeNull()
    expect(screen.queryByText('기본 · 배달 22,900원')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '상세 보기' }))

    expect(screen.getAllByText('[음식배달] 꾸버스피자 봉담점').length).toBeGreaterThan(0)
    expect(screen.getAllByText('기본 · 배달 22,900원').length).toBeGreaterThan(0)
  })
})
