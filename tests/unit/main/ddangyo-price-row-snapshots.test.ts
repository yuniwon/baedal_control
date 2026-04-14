import { describe, expect, it } from 'vitest'
import { buildDdangyoPriceRowSnapshots } from '../../../src/main/platforms/ddangyo/price-row-snapshots'

describe('buildDdangyoPriceRowSnapshots', () => {
  it('keeps the original before-columns while applying the next variant prices', () => {
    const rows = buildDdangyoPriceRowSnapshots(
      [
        {
          variantLabel: '500ml',
          channels: [
            { channelCode: 'delivery', channelLabel: '배달', amount: 1800, amountText: '1,800원' },
            { channelCode: 'pickup', channelLabel: '포장', amount: 1800, amountText: '1,800원' },
            { channelCode: 'dine_in', channelLabel: '매장식사', amount: 1800, amountText: '1,800원' }
          ]
        },
        {
          variantLabel: '1.25L',
          channels: [
            { channelCode: 'delivery', channelLabel: '배달', amount: 2800, amountText: '2,800원' },
            { channelCode: 'pickup', channelLabel: '포장', amount: 2800, amountText: '2,800원' },
            { channelCode: 'dine_in', channelLabel: '매장식사', amount: 2800, amountText: '2,800원' }
          ]
        }
      ],
      [
        {
          variantLabel: '500ml',
          channels: [
            { channelCode: 'delivery', channelLabel: '배달', amount: 1800, amountText: '1,800원' },
            { channelCode: 'pickup', channelLabel: '포장', amount: 1800, amountText: '1,800원' },
            { channelCode: 'dine_in', channelLabel: '매장식사', amount: 1800, amountText: '1,800원' }
          ]
        },
        {
          variantLabel: '1.25L',
          channels: [
            { channelCode: 'delivery', channelLabel: '배달', amount: 2900, amountText: '2,900원' },
            { channelCode: 'pickup', channelLabel: '포장', amount: 2900, amountText: '2,900원' },
            { channelCode: 'dine_in', channelLabel: '매장식사', amount: 2900, amountText: '2,900원' }
          ]
        }
      ]
    )

    expect(rows).toEqual([
      {
        prce_div_contBefore: '500ml',
        menu_unitprc: 1800,
        menu_unitprcBefore: 1800,
        pckg_menu_unitprc: 1800,
        pckg_menu_unitprcBefore: 1800,
        sto_menu_unitprc: 1800,
        sto_menu_unitprcBefore: 1800
      },
      {
        prce_div_contBefore: '1.25L',
        menu_unitprc: 2900,
        menu_unitprcBefore: 2800,
        pckg_menu_unitprc: 2900,
        pckg_menu_unitprcBefore: 2800,
        sto_menu_unitprc: 2900,
        sto_menu_unitprcBefore: 2800
      }
    ])
  })
})
