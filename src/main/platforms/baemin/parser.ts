import { JSDOM } from 'jsdom'

export const parseBaeminMenus = (html: string) => {
  const document = new JSDOM(html).window.document

  return [...document.querySelectorAll('tr[data-menu-id]')].map((row) => ({
    platformMenuId: row.getAttribute('data-menu-id') ?? '',
    platformMenuName: row.querySelector('.name')?.textContent?.trim() ?? '',
    currentPrice: Number(row.querySelector('.price')?.textContent?.trim() ?? 0)
  }))
}
