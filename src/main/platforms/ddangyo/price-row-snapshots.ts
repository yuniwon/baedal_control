import type { PlatformMenuPriceVariantRecord } from '../../../shared/contracts'

export interface DdangyoPriceRowSnapshot {
  prce_div_contBefore?: string | null
  menu_unitprc?: number | null
  menu_unitprcBefore?: number | null
  pckg_menu_unitprc?: number | null
  pckg_menu_unitprcBefore?: number | null
  sto_menu_unitprc?: number | null
  sto_menu_unitprcBefore?: number | null
}

const findChannelAmount = (
  variant: PlatformMenuPriceVariantRecord | undefined,
  channelCode: 'delivery' | 'pickup' | 'dine_in'
) => variant?.channels.find((channel) => channel.channelCode === channelCode)?.amount ?? null

export const buildDdangyoPriceRowSnapshots = (
  previousVariants?: PlatformMenuPriceVariantRecord[] | null,
  nextVariants?: PlatformMenuPriceVariantRecord[] | null
): DdangyoPriceRowSnapshot[] =>
  (nextVariants ?? []).map((nextVariant, index) => {
    const previousVariant = previousVariants?.[index]
    return {
      prce_div_contBefore: previousVariant?.variantLabel ?? nextVariant.variantLabel ?? null,
      menu_unitprc: findChannelAmount(nextVariant, 'delivery'),
      menu_unitprcBefore: findChannelAmount(previousVariant, 'delivery'),
      pckg_menu_unitprc: findChannelAmount(nextVariant, 'pickup'),
      pckg_menu_unitprcBefore: findChannelAmount(previousVariant, 'pickup'),
      sto_menu_unitprc: findChannelAmount(nextVariant, 'dine_in'),
      sto_menu_unitprcBefore: findChannelAmount(previousVariant, 'dine_in')
    }
  })
