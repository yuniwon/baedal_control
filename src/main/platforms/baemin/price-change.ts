import type { PlatformMenuPriceVariantRecord } from '../../../shared/contracts'

export interface BaeminVisiblePriceInputSnapshot {
  domIndex: number
  placeholder: string
  value: string
  type?: string | null
}

interface BaeminPriceRowInput {
  variantLabel: string | null
  deliveryDomIndex: number
  pickupDomIndex: number | null
}

export interface BaeminPriceInputUpdate {
  domIndex: number
  value: string
}

const normalize = (value?: string | null) => value?.replace(/\s+/g, ' ').trim() ?? ''

const formatAmount = (value: number) => value.toLocaleString('ko-KR')

const findChannelAmount = (
  variant: PlatformMenuPriceVariantRecord,
  channelCode: PlatformMenuPriceVariantRecord['channels'][number]['channelCode']
) => variant.channels.find((channel) => channel.channelCode === channelCode)?.amount ?? null

export const extractBaeminPriceRows = (inputs: BaeminVisiblePriceInputSnapshot[]) => {
  const relevantInputs = inputs.filter(
    (input) =>
      input.type !== 'file'
      && normalize(input.placeholder) !== '메뉴명을 입력해주세요'
  )

  const rows: BaeminPriceRowInput[] = []

  for (let index = 0; index < relevantInputs.length; index += 1) {
    const labelInput = relevantInputs[index]
    const deliveryInput = relevantInputs[index + 1]
    const storeInput = relevantInputs[index + 2]
    const pickupInput = relevantInputs[index + 3]

    if (!labelInput || !deliveryInput) {
      continue
    }

    if (!normalize(labelInput.placeholder).startsWith('예)')) {
      continue
    }

    if (normalize(deliveryInput.placeholder).length > 0) {
      continue
    }

    rows.push({
      variantLabel: normalize(labelInput.value) || null,
      deliveryDomIndex: deliveryInput.domIndex,
      pickupDomIndex:
        pickupInput && normalize(pickupInput.placeholder) === '픽업 가격'
          ? pickupInput.domIndex
          : null
    })

    if (storeInput && pickupInput) {
      index += 3
    } else {
      index += 1
    }
  }

  return rows
}

export const buildBaeminPriceInputUpdates = (
  inputs: BaeminVisiblePriceInputSnapshot[],
  nextVariants?: PlatformMenuPriceVariantRecord[] | null
): BaeminPriceInputUpdate[] => {
  const rows = extractBaeminPriceRows(inputs)
  const variants = nextVariants ?? []

  if (rows.length === 0) {
    throw new Error('baemin_price_change_inputs_not_found')
  }

  if (rows.length !== variants.length) {
    throw new Error('baemin_multi_price_input_row_count_mismatch')
  }

  return rows.map((row, rowIndex) => {
    const variant = variants[rowIndex]
    const deliveryAmount = findChannelAmount(variant, 'delivery') ?? findChannelAmount(variant, 'base')
    const pickupAmount = findChannelAmount(variant, 'pickup')
    const expectedLabel = normalize(variant.variantLabel) || null

    if (row.variantLabel !== expectedLabel) {
      throw new Error('baemin_multi_price_variant_label_mismatch')
    }

    if (typeof deliveryAmount !== 'number' || !Number.isFinite(deliveryAmount)) {
      throw new Error('baemin_multi_price_delivery_amount_missing')
    }

    if (
      typeof pickupAmount === 'number'
      && Number.isFinite(pickupAmount)
      && pickupAmount !== deliveryAmount
    ) {
      throw new Error('baemin_multi_price_pickup_amount_requires_review')
    }

    return {
      domIndex: row.deliveryDomIndex,
      value: formatAmount(deliveryAmount)
    }
  })
}
