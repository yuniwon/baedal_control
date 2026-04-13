import type { PlatformOptionGroupRecord } from '../../shared/contracts'

type OptionSignatureInput = Pick<
  PlatformOptionGroupRecord,
  'optionGroupName' | 'minOrderQuantity' | 'maxOrderQuantity' | 'options'
>

export interface NormalizedOptionSignature {
  optionGroupName: string
  minOrderQuantity: number | null
  maxOrderQuantity: number | null
  options: Array<{
    optionName: string
    optionPrice: number
  }>
}

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ')

const compareNormalizedOptions = (
  left: { optionName: string; optionPrice: number },
  right: { optionName: string; optionPrice: number }
) => {
  const nameComparison = left.optionName.localeCompare(right.optionName, 'ko-KR')

  if (nameComparison !== 0) {
    return nameComparison
  }

  return left.optionPrice - right.optionPrice
}

export const buildNormalizedOptionSignature = (
  group: OptionSignatureInput
): NormalizedOptionSignature => ({
  optionGroupName: normalizeWhitespace(group.optionGroupName),
  minOrderQuantity: group.minOrderQuantity ?? null,
  maxOrderQuantity: group.maxOrderQuantity ?? null,
  options: group.options
    .map((option) => ({
      optionName: normalizeWhitespace(option.optionName),
      optionPrice: option.optionPrice ?? 0
    }))
    .sort(compareNormalizedOptions)
})

export const buildOptionSignature = (group: OptionSignatureInput) => {
  return JSON.stringify(buildNormalizedOptionSignature(group))
}
