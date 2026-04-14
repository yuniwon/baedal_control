import type {
  PlatformMenuPriceChannelCode,
  PlatformMenuPriceVariantRecord
} from './contracts'

export interface NormalizedPlatformMenuPriceVariant {
  variantLabel: string | null
  channels: Array<{
    channelCode: PlatformMenuPriceChannelCode
    amount: number | null
  }>
}

export interface PlatformMenuPriceVariantComparison {
  hasVariantData: boolean
  structureMatches: boolean
  amountChanged: boolean
  changed: boolean
}

const channelOrder: Record<PlatformMenuPriceChannelCode, number> = {
  base: 0,
  delivery: 1,
  pickup: 2,
  dine_in: 3
}

const normalizeLabel = (value?: string | null) => {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

const normalizeAmount = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export const normalizePlatformMenuPriceVariants = (
  variants?: PlatformMenuPriceVariantRecord[] | null
): NormalizedPlatformMenuPriceVariant[] =>
  (variants ?? []).map((variant) => ({
    variantLabel: normalizeLabel(variant.variantLabel),
    channels: [...variant.channels]
      .map((channel) => ({
        channelCode: channel.channelCode,
        amount: normalizeAmount(channel.amount)
      }))
      .sort(
        (left, right) =>
          channelOrder[left.channelCode] - channelOrder[right.channelCode]
          || left.channelCode.localeCompare(right.channelCode)
      )
  }))

export const comparePlatformMenuPriceVariants = (
  currentVariants?: PlatformMenuPriceVariantRecord[] | null,
  nextVariants?: PlatformMenuPriceVariantRecord[] | null
): PlatformMenuPriceVariantComparison => {
  const current = normalizePlatformMenuPriceVariants(currentVariants)
  const next = normalizePlatformMenuPriceVariants(nextVariants)

  if (current.length === 0 && next.length === 0) {
    return {
      hasVariantData: false,
      structureMatches: true,
      amountChanged: false,
      changed: false
    }
  }

  if (current.length !== next.length) {
    return {
      hasVariantData: true,
      structureMatches: false,
      amountChanged: false,
      changed: true
    }
  }

  let amountChanged = false

  for (let index = 0; index < current.length; index += 1) {
    const currentVariant = current[index]
    const nextVariant = next[index]

    if (currentVariant.variantLabel !== nextVariant.variantLabel) {
      return {
        hasVariantData: true,
        structureMatches: false,
        amountChanged: false,
        changed: true
      }
    }

    if (currentVariant.channels.length !== nextVariant.channels.length) {
      return {
        hasVariantData: true,
        structureMatches: false,
        amountChanged: false,
        changed: true
      }
    }

    for (let channelIndex = 0; channelIndex < currentVariant.channels.length; channelIndex += 1) {
      const currentChannel = currentVariant.channels[channelIndex]
      const nextChannel = nextVariant.channels[channelIndex]

      if (currentChannel.channelCode !== nextChannel.channelCode) {
        return {
          hasVariantData: true,
          structureMatches: false,
          amountChanged: false,
          changed: true
        }
      }

      if (currentChannel.amount !== nextChannel.amount) {
        amountChanged = true
      }
    }
  }

  return {
    hasVariantData: true,
    structureMatches: true,
    amountChanged,
    changed: amountChanged
  }
}

export const serializePlatformMenuPriceVariants = (
  variants?: PlatformMenuPriceVariantRecord[] | null
) => JSON.stringify(normalizePlatformMenuPriceVariants(variants))
