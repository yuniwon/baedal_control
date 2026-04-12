import { JSDOM } from 'jsdom'

export const parseCoupangEatsMenus = (html: string) => {
  const document = new JSDOM(html).window.document

  return [...document.querySelectorAll('.menu-row[data-menu-id]')].map((row) => ({
    platformMenuId: row.getAttribute('data-menu-id') ?? '',
    platformMenuName: row.querySelector('.menu-name')?.textContent?.trim() ?? '',
    currentPrice: Number(row.querySelector('.menu-price')?.textContent?.trim() ?? 0)
  }))
}
