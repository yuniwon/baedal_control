import { JSDOM } from 'jsdom'
import type { PlatformMenuPriceVariantRecord } from '../../../shared/contracts'
import type { PlatformMenuSnapshot } from '../base/types'

const ddangyoPriceChannelLabels = ['배달', '포장', '매장식사'] as const
const ddangyoMenuItemSelector = '#mf_wfm_contents_wfm_tabcontents_gen_menu > li'
const ddangyoMenuIdSelector = '[id$="_spa_menuId"]'
const ddangyoMenuNameSelector = '[id$="_tbx_menuNm"]'
const ddangyoPriceContainerSelector = '[id$="_gen_menuPrc"]'
const ddangyoMenuStatusSelector = [
  '[id$="_hdn_menuStatus"]',
  '[id$="_spa_menuStatus"]',
  '[id$="_tbx_menuStatus"]',
  '[id$="_saleStatus"]',
  '[id$="_menuStatus"]'
].join(', ')

interface ParsedPriceVariant {
  label?: string
  channels: PlatformMenuPriceVariantRecord['channels']
  firstPrice?: number
}

export const parseDdangyoMenus = (
  html: string,
  groupName?: string
): PlatformMenuSnapshot[] => {
  const document = new JSDOM(html).window.document

  return [...document.querySelectorAll(ddangyoMenuItemSelector)]
    .map((item) => parseDdangyoMenuItem(item, groupName))
    .filter((item): item is PlatformMenuSnapshot => Boolean(item))
}

const parseDdangyoMenuItem = (
  item: Element,
  groupName?: string
): PlatformMenuSnapshot | null => {
  const platformMenuId = item.querySelector(ddangyoMenuIdSelector)?.textContent?.trim() ?? ''
  const platformMenuName = item.querySelector(ddangyoMenuNameSelector)?.textContent?.trim() ?? ''

  if (!platformMenuId || !platformMenuName) {
    return null
  }

  const priceContainer = item.querySelector(ddangyoPriceContainerSelector)
  const priceLines = priceContainer ? collectLeafTexts(priceContainer) : []
  const variants = buildPriceVariants(priceLines)
  const currentPrice = variants.find((variant) => typeof variant.firstPrice === 'number')?.firstPrice ?? 0
  const platformMenuStatus = resolveMenuStatus(item)
  const platformMenuPriceSummary = formatPriceSummary(variants)
  const platformMenuPriceCount = variants.length > 0 ? variants.length : undefined
  const platformMenuPriceVariants = variants.map((variant) => ({
    variantLabel: variant.label ?? null,
    channels: variant.channels
  }))

  return {
    platformMenuId,
    platformMenuName,
    currentPrice,
    ...(platformMenuPriceCount ? { platformMenuPriceCount } : {}),
    ...(platformMenuPriceVariants.length > 0 ? { platformMenuPriceVariants } : {}),
    ...(groupName ? { platformMenuGroupName: groupName } : {}),
    ...(platformMenuStatus ? { platformMenuStatus } : {}),
    ...(platformMenuPriceSummary ? { platformMenuPriceSummary } : {})
  }
}

const collectLeafTexts = (root: Element) => {
  const values: string[] = []

  const visit = (element: Element) => {
    const children = [...element.children]
    if (children.length === 0) {
      const text = normalizeText(element.textContent)
      if (text) {
        values.push(text)
      }
      return
    }

    children.forEach(visit)
  }

  visit(root)

  return values
}

const buildPriceVariants = (lines: string[]) => {
  const variants: ParsedPriceVariant[] = []
  let current: ParsedPriceVariant | null = null

  const commit = () => {
    if (!current || current.channels.length === 0) {
      current = null
      return
    }

    variants.push(current)
    current = null
  }

  for (const line of lines) {
    const channelPrice = parseChannelPrice(line)

    if (channelPrice) {
      current ??= { channels: [] }
      current.channels.push({
        channelCode: resolveChannelCode(channelPrice.channel),
        channelLabel: channelPrice.channel,
        amount: channelPrice.price,
        amountText: formatWon(channelPrice.price)
      })
      current.firstPrice ??= channelPrice.price
      continue
    }

    commit()
    current = {
      label: line,
      channels: []
    }
  }

  commit()

  return variants
}

const parseChannelPrice = (line: string) => {
  const normalized = normalizeText(line)
  const match = normalized.match(/^(배달|포장|매장식사)\s*:?\s*([0-9][0-9,]*)원$/)

  if (!match) {
    return null
  }

  const price = Number(match[2].replaceAll(',', ''))
  if (!Number.isFinite(price)) {
    return null
  }

  return {
    channel: match[1] as (typeof ddangyoPriceChannelLabels)[number],
    price
  }
}

const resolveMenuStatus = (item: Element) => {
  const statusElement = item.querySelector(ddangyoMenuStatusSelector)
  const statusValue =
    item.getAttribute('data-menu-status') ??
    item.getAttribute('data-status') ??
    (statusElement && 'value' in statusElement
      ? String((statusElement as HTMLInputElement).value)
      : statusElement?.textContent) ??
    ''
  const normalized = normalizeText(statusValue).toUpperCase().replaceAll('-', '_')

  if (['HIDDEN', 'HIDE', 'NOT_EXPOSE', 'INACTIVE'].includes(normalized)) {
    return '숨김'
  }
  if (['SOLD_OUT', 'SOLDOUT', 'OUT_OF_STOCK', 'PAUSE'].includes(normalized)) {
    return '품절'
  }
  if (['ON_SALE', 'SALE', 'NORMAL', 'ACTIVE', 'EXPOSE'].includes(normalized)) {
    return '판매중'
  }

  return normalized ? normalizeText(statusValue) : '판매중'
}

const formatPriceSummary = (variants: ParsedPriceVariant[]) =>
  variants
    .map((variant) => {
      const parts = variant.channels.map(
        (channel) => `${channel.channelLabel} ${channel.amountText}`
      )
      if (variant.label) {
        parts.unshift(variant.label)
      }

      return parts.join(' · ')
    })
    .filter((summary) => summary.length > 0)
    .join(' / ')

const formatWon = (price: number) => `${price.toLocaleString('ko-KR')}원`

const resolveChannelCode = (
  label: (typeof ddangyoPriceChannelLabels)[number]
): PlatformMenuPriceVariantRecord['channels'][number]['channelCode'] => {
  if (label === '배달') {
    return 'delivery'
  }

  if (label === '포장') {
    return 'pickup'
  }

  return 'dine_in'
}

const normalizeText = (value: string | null | undefined) =>
  value?.replace(/\s+/g, ' ').trim() ?? ''
