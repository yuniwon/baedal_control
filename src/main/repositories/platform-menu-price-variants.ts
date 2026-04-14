import type { PlatformMenuPriceVariantRecord } from '../../shared/contracts'

export const stringifyPlatformMenuPriceVariants = (
  variants?: PlatformMenuPriceVariantRecord[] | null
) => {
  if (!variants?.length) {
    return null
  }

  return JSON.stringify(variants)
}

export const parsePlatformMenuPriceVariants = (
  value?: string | null
): PlatformMenuPriceVariantRecord[] | null => {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as PlatformMenuPriceVariantRecord[]) : null
  } catch {
    return null
  }
}
