import { JSDOM } from 'jsdom'
import type { PlatformMenuSnapshot } from '../base/types'

const formatWon = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('ko-KR')}원` : null

export const parseCoupangEatsMenus = (html: string): PlatformMenuSnapshot[] => {
  const document = new JSDOM(html).window.document

  return [...document.querySelectorAll('.menu-row[data-menu-id]')].map((row) => {
    const currentPrice = Number(row.querySelector('.menu-price')?.textContent?.trim() ?? 0)
    const priceText = formatWon(currentPrice)

    return {
      platformMenuId: row.getAttribute('data-menu-id') ?? '',
      platformMenuName: row.querySelector('.menu-name')?.textContent?.trim() ?? '',
      currentPrice,
      ...(priceText
        ? {
            platformMenuPriceCount: 1,
            platformMenuPriceSummary: priceText,
            platformMenuPriceVariants: [
              {
                variantLabel: null,
                channels: [
                  {
                    channelCode: 'base',
                    channelLabel: '기본가',
                    amount: currentPrice,
                    amountText: priceText
                  }
                ]
              }
            ]
          }
        : {})
    }
  })
}
