import type { PlatformMenuPriceVariantRecord } from '../../../shared/contracts'

export const formatPlatformMenuPriceVariantLine = (
  variant: PlatformMenuPriceVariantRecord
) => {
  const parts = variant.channels.map(
    (channel) => `${channel.channelLabel} ${channel.amountText}`
  )
  const label = variant.variantLabel?.trim() || '기본'

  return [label, ...parts].join(' · ')
}

export const flattenPlatformMenuPriceVariants = (
  variants?: PlatformMenuPriceVariantRecord[] | null
) =>
  (variants ?? []).map((variant) => formatPlatformMenuPriceVariantLine(variant))
