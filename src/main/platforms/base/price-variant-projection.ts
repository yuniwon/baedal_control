import type {
  PlatformCode,
  PlatformMenuPriceChannelCode,
  PlatformMenuPriceVariantRecord
} from '../../../shared/contracts'

const allowedChannelsByPlatform: Record<PlatformCode, PlatformMenuPriceChannelCode[]> = {
  baemin: ['delivery', 'pickup'],
  coupangeats: ['base'],
  ddangyo: ['delivery', 'pickup', 'dine_in']
}

export const projectPlatformPriceVariants = (
  platformCode: PlatformCode,
  variants?: PlatformMenuPriceVariantRecord[] | null
): PlatformMenuPriceVariantRecord[] | null => {
  const allowedChannels = new Set(allowedChannelsByPlatform[platformCode])
  const projected: PlatformMenuPriceVariantRecord[] = []

  for (const variant of variants ?? []) {
    const channels = variant.channels.filter((channel) => allowedChannels.has(channel.channelCode))
    if (channels.length === 0) {
      continue
    }

    projected.push({
      variantLabel: variant.variantLabel?.trim() || null,
      channels
    })
  }

  return projected.length > 0 ? projected : null
}
