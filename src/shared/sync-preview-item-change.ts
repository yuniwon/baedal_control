import type { SyncPreviewItem } from './contracts'
import { buildPlatformMenuPriceSummary } from './platform-menu-price-summary'
import { comparePlatformMenuPriceVariants } from './platform-menu-price-variants'

export interface SyncPreviewItemChangeSummary {
  changeLabels: string[]
  headline: string
  detailLines: string[]
  targetSummary: string | null
}

const formatPrice = (value?: number | null) =>
  typeof value === 'number' ? `${value.toLocaleString('ko-KR')}원` : '가격 미확인'

export const summarizeSyncPreviewItemChange = (
  item: SyncPreviewItem
): SyncPreviewItemChangeSummary => {
  const nameChanged = item.previousName !== item.nextName
  const variantComparison = comparePlatformMenuPriceVariants(
    item.previousPriceVariants,
    item.nextPriceVariants
  )
  const scalarPriceChanged =
    typeof item.previousPrice === 'number' ? item.previousPrice !== item.nextPrice : true
  const priceChanged = variantComparison.hasVariantData ? variantComparison.changed : scalarPriceChanged
  const previousPriceSummary = variantComparison.hasVariantData
    ? buildPlatformMenuPriceSummary(item.previousPriceVariants, item.previousPrice)
    : formatPrice(item.previousPrice)
  const nextPriceSummary = variantComparison.hasVariantData
    ? buildPlatformMenuPriceSummary(item.nextPriceVariants, item.nextPrice)
    : formatPrice(item.nextPrice)
  const changeLabels: string[] = []
  const detailLines: string[] = []

  if (nameChanged) {
    changeLabels.push('이름')
    detailLines.push(`이름: ${item.previousName} -> ${item.nextName}`)
  }

  if (priceChanged) {
    const priceLabel = variantComparison.hasVariantData ? '가격 구조' : '가격'
    changeLabels.push(priceLabel)
    detailLines.push(
      `${priceLabel}: ${previousPriceSummary ?? '가격 미확인'} -> ${nextPriceSummary ?? '가격 미확인'}`
    )
  }

  return {
    changeLabels,
    headline: changeLabels.length > 0 ? `${changeLabels.join(', ')} 변경` : '변경 없음',
    detailLines,
    targetSummary: nextPriceSummary ?? null
  }
}
