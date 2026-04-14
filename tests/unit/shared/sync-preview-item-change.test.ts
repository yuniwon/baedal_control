import { describe, expect, it } from 'vitest'
import type { SyncPreviewItem } from '../../../src/shared/contracts'
import { summarizeSyncPreviewItemChange } from '../../../src/shared/sync-preview-item-change'

describe('summarizeSyncPreviewItemChange', () => {
  it('describes a scalar name and price change', () => {
    const item: SyncPreviewItem = {
      platformCode: 'baemin',
      menuId: 'menu-1',
      platformMenuId: 'platform-1',
      previousName: '콤비네이션',
      previousPrice: 23900,
      nextName: '직화불고기',
      nextPrice: 24900
    }

    const result = summarizeSyncPreviewItemChange(item)

    expect(result.changeLabels).toEqual(['이름', '가격'])
    expect(result.headline).toBe('이름, 가격 변경')
    expect(result.detailLines).toEqual([
      '이름: 콤비네이션 -> 직화불고기',
      '가격: 23,900원 -> 24,900원'
    ])
    expect(result.targetSummary).toBe('24,900원')
  })

  it('describes a variant price-structure change without scalar no-op wording', () => {
    const item: SyncPreviewItem = {
      platformCode: 'baemin',
      menuId: 'menu-2',
      platformMenuId: 'platform-2',
      previousName: '칠성사이다',
      previousPrice: 1800,
      previousPriceVariants: [
        {
          variantLabel: '500ml',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
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
              amount: 2600,
              amountText: '2,600원'
            }
          ]
        }
      ],
      nextName: '칠성사이다',
      nextPrice: 1800,
      nextPriceVariants: [
        {
          variantLabel: '500ml',
          channels: [
            {
              channelCode: 'delivery',
              channelLabel: '배달',
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
              amount: 2800,
              amountText: '2,800원'
            }
          ]
        }
      ]
    }

    const result = summarizeSyncPreviewItemChange(item)

    expect(result.changeLabels).toEqual(['가격 구조'])
    expect(result.headline).toBe('가격 구조 변경')
    expect(result.detailLines).toEqual([
      '가격 구조: 500ml · 배달 1,800원 / 1.25L · 배달 2,600원 -> 500ml · 배달 1,800원 / 1.25L · 배달 2,800원'
    ])
    expect(result.targetSummary).toBe('500ml · 배달 1,800원 / 1.25L · 배달 2,800원')
  })
})
