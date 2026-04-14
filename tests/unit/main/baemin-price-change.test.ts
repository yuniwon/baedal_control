import { describe, expect, it } from 'vitest'
import {
  buildBaeminPriceInputUpdates,
  extractBaeminPriceRows
} from '../../../src/main/platforms/baemin/price-change'

describe('extractBaeminPriceRows', () => {
  it('groups visible baemin price modal inputs into variant rows', () => {
    const rows = extractBaeminPriceRows([
      {
        domIndex: 0,
        placeholder: '메뉴명을 입력해주세요',
        value: '',
        type: 'text'
      },
      {
        domIndex: 1,
        placeholder: '예) 1~2인분',
        value: '500ml',
        type: 'text'
      },
      {
        domIndex: 2,
        placeholder: '',
        value: '1,800',
        type: 'text'
      },
      {
        domIndex: 3,
        placeholder: '매장 가격',
        value: '',
        type: 'text'
      },
      {
        domIndex: 4,
        placeholder: '픽업 가격',
        value: '',
        type: 'text'
      },
      {
        domIndex: 5,
        placeholder: '예) 1~2인분',
        value: '1.25L',
        type: 'text'
      },
      {
        domIndex: 6,
        placeholder: '',
        value: '2,800',
        type: 'text'
      },
      {
        domIndex: 7,
        placeholder: '매장 가격',
        value: '',
        type: 'text'
      },
      {
        domIndex: 8,
        placeholder: '픽업 가격',
        value: '',
        type: 'text'
      }
    ])

    expect(rows).toEqual([
      {
        variantLabel: '500ml',
        deliveryDomIndex: 2,
        pickupDomIndex: 4
      },
      {
        variantLabel: '1.25L',
        deliveryDomIndex: 6,
        pickupDomIndex: 8
      }
    ])
  })
})

describe('buildBaeminPriceInputUpdates', () => {
  it('builds delivery input updates for matching baemin multi-price variants', () => {
    const updates = buildBaeminPriceInputUpdates(
      [
        {
          domIndex: 1,
          placeholder: '예) 1~2인분',
          value: '500ml',
          type: 'text'
        },
        {
          domIndex: 2,
          placeholder: '',
          value: '1,800',
          type: 'text'
        },
        {
          domIndex: 3,
          placeholder: '매장 가격',
          value: '',
          type: 'text'
        },
        {
          domIndex: 4,
          placeholder: '픽업 가격',
          value: '',
          type: 'text'
        },
        {
          domIndex: 5,
          placeholder: '예) 1~2인분',
          value: '1.25L',
          type: 'text'
        },
        {
          domIndex: 6,
          placeholder: '',
          value: '2,800',
          type: 'text'
        },
        {
          domIndex: 7,
          placeholder: '매장 가격',
          value: '',
          type: 'text'
        },
        {
          domIndex: 8,
          placeholder: '픽업 가격',
          value: '',
          type: 'text'
        }
      ],
      [
        {
          variantLabel: '500ml',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 1800,
              amountText: '1,800원'
            },
            {
              channelCode: 'pickup',
              channelLabel: '픽업',
              amount: 1800,
              amountText: '1,800원'
            }
          ]
        },
        {
          variantLabel: '1.25L',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
              amount: 3000,
              amountText: '3,000원'
            },
            {
              channelCode: 'pickup',
              channelLabel: '픽업',
              amount: 3000,
              amountText: '3,000원'
            }
          ]
        }
      ]
    )

    expect(updates).toEqual([
      {
        domIndex: 2,
        value: '1,800'
      },
      {
        domIndex: 6,
        value: '3,000'
      }
    ])
  })

  it('rejects baemin multi-price updates when pickup amount diverges from delivery amount', () => {
    expect(() =>
      buildBaeminPriceInputUpdates(
        [
          {
            domIndex: 1,
            placeholder: '예) 1~2인분',
            value: '1.25L',
            type: 'text'
          },
          {
            domIndex: 2,
            placeholder: '',
            value: '2,800',
            type: 'text'
          },
          {
            domIndex: 3,
            placeholder: '매장 가격',
            value: '',
            type: 'text'
          },
          {
            domIndex: 4,
            placeholder: '픽업 가격',
            value: '',
            type: 'text'
          }
        ],
        [
          {
            variantLabel: '1.25L',
            channels: [
              {
                channelCode: 'delivery',
                channelLabel: '배달',
                amount: 3000,
                amountText: '3,000원'
              },
              {
                channelCode: 'pickup',
                channelLabel: '픽업',
                amount: 3200,
                amountText: '3,200원'
              }
            ]
          }
        ]
      )
    ).toThrow('baemin_multi_price_pickup_amount_requires_review')
  })
})
