import { describe, expect, it } from 'vitest'
import {
  pickBaeminCreateWizardAdvanceButtonLabel,
  pickBaeminCreateWizardGroupOptionValue,
  prioritizeBaeminCreateWizardVisibleControlLabels
} from '../../../src/main/platforms/baemin/create-wizard'

describe('baemin create wizard helpers', () => {
  it('prefers 다음 over 적용하기 and 확인 when choosing the next-step button', () => {
    expect(
      pickBaeminCreateWizardAdvanceButtonLabel(['확인', '적용하기', '다음'])
    ).toBe('다음')
  })

  it('prefers a 소스추가-like group option before falling back to the first non-empty value', () => {
    expect(
      pickBaeminCreateWizardGroupOptionValue([
        { value: '', label: '선택하세요' },
        { value: '100', label: '대표메뉴' },
        { value: '200', label: '소스추가' }
      ])
    ).toBe('200')

    expect(
      pickBaeminCreateWizardGroupOptionValue([
        { value: '', label: '선택하세요' },
        { value: '100', label: '대표메뉴' }
      ])
    ).toBe('100')
  })

  it('surfaces create-wizard relevant controls before generic navigation labels', () => {
    expect(
      prioritizeBaeminCreateWizardVisibleControlLabels([
        '홈',
        '전체현황·임시중지',
        '가게관리',
        '메뉴 추가',
        '메뉴',
        '옵션',
        '확인',
        '적용하기',
        '다음',
        '도움 센터',
        '메뉴 추가'
      ])
    ).toEqual([
      '메뉴 추가',
      '다음',
      '적용하기',
      '확인',
      '홈',
      '전체현황·임시중지',
      '가게관리',
      '메뉴',
      '옵션',
      '도움 센터'
    ])
  })
})
