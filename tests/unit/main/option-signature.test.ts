import { describe, expect, it } from 'vitest'
import { buildOptionSignature } from '../../../src/main/services/option-signature'

describe('buildOptionSignature', () => {
  it('returns the same signature for the same logical group with different option order', () => {
    const first = buildOptionSignature({
      optionGroupName: '사이즈 선택',
      minOrderQuantity: 1,
      maxOrderQuantity: 1,
      options: [
        { optionId: 'l', optionName: 'L', optionPrice: 3000 },
        { optionId: 'm', optionName: 'M', optionPrice: 0 }
      ]
    })

    const second = buildOptionSignature({
      optionGroupName: '사이즈 선택',
      minOrderQuantity: 1,
      maxOrderQuantity: 1,
      options: [
        { optionId: 'm', optionName: 'M', optionPrice: 0 },
        { optionId: 'l', optionName: 'L', optionPrice: 3000 }
      ]
    })

    expect(first).toBe(second)
  })

  it('treats linked menus as irrelevant to the signature', () => {
    const first = buildOptionSignature({
      optionGroupName: '추가 선택',
      minOrderQuantity: 0,
      maxOrderQuantity: 2,
      options: [{ optionId: 'cheese-a', optionName: '치즈', optionPrice: 1000 }]
    })

    const second = buildOptionSignature({
      optionGroupName: '추가 선택',
      minOrderQuantity: 0,
      maxOrderQuantity: 2,
      options: [{ optionId: 'cheese-b', optionName: '치즈', optionPrice: 1000 }]
    })

    expect(first).toBe(second)
  })

  it('distinguishes the same option name with a different price', () => {
    const first = buildOptionSignature({
      optionGroupName: '토핑',
      options: [{ optionId: 'cheese-a', optionName: '치즈', optionPrice: 1000 }]
    })

    const second = buildOptionSignature({
      optionGroupName: '토핑',
      options: [{ optionId: 'cheese-b', optionName: '치즈', optionPrice: 1500 }]
    })

    expect(first).not.toBe(second)
  })

  it('normalizes whitespace in the group and option names', () => {
    const first = buildOptionSignature({
      optionGroupName: '  추가   선택 ',
      minOrderQuantity: 1,
      maxOrderQuantity: 2,
      options: [
        { optionId: 'dae-a', optionName: '  대  ', optionPrice: 0 },
        { optionId: 'so-a', optionName: '  소   ', optionPrice: 0 }
      ]
    })

    const second = buildOptionSignature({
      optionGroupName: '추가 선택',
      minOrderQuantity: 1,
      maxOrderQuantity: 2,
      options: [
        { optionId: 'so-b', optionName: '소', optionPrice: 0 },
        { optionId: 'dae-b', optionName: '대', optionPrice: 0 }
      ]
    })

    expect(first).toBe(second)
  })

  it('treats null, undefined, and 0 option prices as the same normalized signature', () => {
    const zeroPrice = buildOptionSignature({
      optionGroupName: '토핑',
      options: [{ optionId: 'cheese-zero', optionName: '치즈', optionPrice: 0 }]
    })

    const nullPrice = buildOptionSignature({
      optionGroupName: '토핑',
      options: [{ optionId: 'cheese-null', optionName: '치즈', optionPrice: null }]
    })

    const undefinedPrice = buildOptionSignature({
      optionGroupName: '토핑',
      options: [{ optionId: 'cheese-undefined', optionName: '치즈' }]
    })

    expect(nullPrice).toBe(zeroPrice)
    expect(undefinedPrice).toBe(zeroPrice)
  })
})
