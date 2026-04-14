import type { PlatformMenuPriceVariantRecord } from './contracts'

const formatWon = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

export const buildPlatformMenuPriceSummary = (
  variants?: PlatformMenuPriceVariantRecord[] | null,
  fallbackPrice?: number | null
) => {
  const summaries = (variants ?? [])
    .map((variant) => {
      const parts = variant.channels
        .map((channel) => {
          const amount =
            typeof channel.amount === 'number' && Number.isFinite(channel.amount)
              ? channel.amount
              : null
          const amountText = channel.amountText?.trim() || (amount !== null ? formatWon(amount) : '')
          if (!amountText) {
            return ''
          }

          return `${channel.channelLabel} ${amountText}`
        })
        .filter((part) => part.length > 0)

      const variantLabel = variant.variantLabel?.trim()
      if (variantLabel) {
        parts.unshift(variantLabel)
      }

      return parts.join(' · ')
    })
    .filter((summary) => summary.length > 0)

  if (summaries.length > 0) {
    return summaries.join(' / ')
  }

  if (typeof fallbackPrice === 'number' && Number.isFinite(fallbackPrice)) {
    return formatWon(fallbackPrice)
  }

  return null
}
