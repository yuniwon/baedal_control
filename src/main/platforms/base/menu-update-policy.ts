import type { PlatformCode } from '../../../shared/contracts'

export type MultiPriceMenuUpdatePolicy =
  | 'price_change_requires_review'
  | 'all_changes_require_review'

interface PlatformMenuUpdatePolicy {
  multiPriceMenuUpdatePolicy: MultiPriceMenuUpdatePolicy
  requiredExecutionMode?: 'managed_browser'
  supportsStructuredVariantPriceWrite?: boolean
}

const platformMenuUpdatePolicies: Record<PlatformCode, PlatformMenuUpdatePolicy> = {
  baemin: {
    multiPriceMenuUpdatePolicy: 'price_change_requires_review',
    supportsStructuredVariantPriceWrite: true
  },
  coupangeats: {
    multiPriceMenuUpdatePolicy: 'price_change_requires_review',
    requiredExecutionMode: 'managed_browser'
  },
  ddangyo: {
    multiPriceMenuUpdatePolicy: 'price_change_requires_review',
    supportsStructuredVariantPriceWrite: true
  }
}

export const getPlatformMenuUpdatePolicy = (platformCode: PlatformCode) =>
  platformMenuUpdatePolicies[platformCode]

export const getRequiredMenuWriteExecutionMode = (platformCode: PlatformCode) =>
  getPlatformMenuUpdatePolicy(platformCode).requiredExecutionMode ?? null

export const requiresMultiPriceMenuReview = ({
  platformCode,
  platformMenuPriceCount,
  nameChanged,
  priceChanged
}: {
  platformCode: PlatformCode
  platformMenuPriceCount?: number | null
  nameChanged: boolean
  priceChanged: boolean
}) => {
  if ((platformMenuPriceCount ?? 0) <= 1) {
    return false
  }

  const { multiPriceMenuUpdatePolicy } = getPlatformMenuUpdatePolicy(platformCode)

  if (multiPriceMenuUpdatePolicy === 'all_changes_require_review') {
    return nameChanged || priceChanged
  }

  return priceChanged
}
