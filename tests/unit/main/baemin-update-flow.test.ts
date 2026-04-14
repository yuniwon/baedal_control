import { describe, expect, it } from 'vitest'
import {
  pickBaeminRenderedSearchResult,
  pickBaeminSearchResult
} from '../../../src/main/platforms/baemin/update-flow'

describe('pickBaeminSearchResult', () => {
  it('prefers the exact platform menu id before falling back to text heuristics', () => {
    const picked = pickBaeminSearchResult(
      [
        {
          platformMenuId: '59707679',
          buttonText: '쉬림프골드\n배달21,000원',
          contextText: '쉬림프골드\n배달21,000원\n메뉴가 숨겨졌어요.'
        },
        {
          platformMenuId: '59707680',
          buttonText: '쉬림프골드\n배달21,000원',
          contextText:
            '쉬림프골드\n배달21,000원\n[음식배달] 꾸버스피자 봉담점\n메뉴가 숨겨졌어요.'
        }
      ],
      {
        platformMenuId: '59707680',
        previousName: '쉬림프골드',
        platformMenuBindingSummary: null,
        platformMenuPriceSummary: '배달 21,000원'
      }
    )

    expect(picked.platformMenuId).toBe('59707680')
  })

  it('chooses the candidate whose context includes the saved binding summary', () => {
    const picked = pickBaeminSearchResult(
      [
        {
          buttonText: '숨김\n쉬림프골드\nL\n배달25,000원\n픽업25,000원\nM\n배달21,000원\n픽업21,000원',
          contextText:
            '숨김\n쉬림프골드\nL\n배달25,000원\n픽업25,000원\nM\n배달21,000원\n픽업21,000원\n메뉴가 숨겨졌어요.\n숨김 해제'
        },
        {
          buttonText: '숨김\n쉬림프골드\nL\n배달25,000원\n픽업25,000원\nM\n배달21,000원\n픽업21,000원',
          contextText:
            '숨김\n쉬림프골드\nL\n배달25,000원\n픽업25,000원\nM\n배달21,000원\n픽업21,000원\n[음식배달] 꾸버스피자 봉담점\n메뉴가 숨겨졌어요.\n숨김 해제'
        }
      ],
      {
        previousName: '쉬림프골드',
        platformMenuBindingSummary: '[음식배달] 꾸버스피자 봉담점',
        platformMenuPriceSummary:
          'L · 배달 25,000원 · 픽업 25,000원 / M · 배달 21,000원 · 픽업 21,000원'
      }
    )

    expect(picked.contextText).toContain('[음식배달] 꾸버스피자 봉담점')
  })

  it('prefers the candidate without a binding label when the saved mapping has no binding summary', () => {
    const picked = pickBaeminSearchResult(
      [
        {
          buttonText: '숨김\n쉬림프골드\nL\n배달25,000원\n픽업25,000원\nM\n배달21,000원\n픽업21,000원',
          contextText:
            '숨김\n쉬림프골드\nL\n배달25,000원\n픽업25,000원\nM\n배달21,000원\n픽업21,000원\n[음식배달] 꾸버스피자 봉담점\n메뉴가 숨겨졌어요.\n숨김 해제'
        },
        {
          buttonText: '숨김\n쉬림프골드\nL\n배달25,000원\n픽업25,000원\nM\n배달21,000원\n픽업21,000원',
          contextText:
            '숨김\n쉬림프골드\nL\n배달25,000원\n픽업25,000원\nM\n배달21,000원\n픽업21,000원\n메뉴가 숨겨졌어요.\n숨김 해제'
        }
      ],
      {
        previousName: '쉬림프골드',
        platformMenuBindingSummary: null,
        platformMenuPriceSummary:
          'L · 배달 25,000원 · 픽업 25,000원 / M · 배달 21,000원 · 픽업 21,000원'
      }
    )

    expect(picked.contextText).not.toContain('[음식배달]')
  })

  it('throws when multiple candidates are still indistinguishable', () => {
    expect(() =>
      pickBaeminSearchResult(
        [
          {
            buttonText: '불고기피자\n배달19,900원',
            contextText: '불고기피자\n배달19,900원\n메뉴가 숨겨졌어요.'
          },
          {
            buttonText: '불고기피자\n배달19,900원',
            contextText: '불고기피자\n배달19,900원\n메뉴가 숨겨졌어요.'
          }
        ],
        {
          previousName: '불고기피자',
          platformMenuBindingSummary: null,
          platformMenuPriceSummary: '배달 19,900원'
        }
      )
    ).toThrow('baemin_menu_match_ambiguous')
  })

  it('matches a hidden unbound single-price menu using no-binding summary and compacted price text', () => {
    const picked = pickBaeminSearchResult(
      [
        {
          buttonText: 'Set 5(피자L+훈제치킨+콜라) 배달38,000원 픽업38,000원',
          contextText:
            'Set 5(피자L+훈제치킨+콜라) 배달38,000원 픽업38,000원 [음식배달] 꾸버스피자 봉담점'
        },
        {
          buttonText: '숨김 Set 5 배달37,000원 픽업37,000원',
          contextText: '숨김 Set 5 배달37,000원 픽업37,000원 메뉴가 숨겨졌어요. 숨김 해제'
        }
      ],
      {
        previousName: 'Set 5',
        platformMenuBindingSummary: '연결 가게 없음',
        platformMenuPriceSummary: '배달 37,000원 · 픽업 37,000원'
      }
    )

    expect(picked.contextText).toContain('배달37,000원')
    expect(picked.contextText).not.toContain('[음식배달]')
  })
})

describe('pickBaeminRenderedSearchResult', () => {
  it('returns the rendered row candidate so callers can click the actual dom index instead of the raw api order', () => {
    const picked = pickBaeminRenderedSearchResult(
      [
        {
          dataIndex: 39,
          buttonText: '코카콜라 제로\n1.25L\n배달2,800원\n픽업2,800원',
          contextText:
            '코카콜라 제로\n1.25L\n배달2,800원\n픽업2,800원\n[음식배달] 꾸버스피자 봉담점'
        },
        {
          dataIndex: 40,
          buttonText: '칠성사이다\n500ml\n배달1,800원\n픽업1,800원\n1.25L\n배달2,800원\n픽업2,800원',
          contextText:
            '칠성사이다\n500ml\n배달1,800원\n픽업1,800원\n1.25L\n배달2,800원\n픽업2,800원\n[음식배달] 꾸버스피자 봉담점'
        }
      ],
      {
        previousName: '칠성사이다',
        platformMenuBindingSummary: '[음식배달] 꾸버스피자 봉담점',
        platformMenuPriceSummary:
          '500ml · 배달 1,800원 · 픽업 1,800원 / 1.25L · 배달 2,800원 · 픽업 2,800원'
      }
    )

    expect(picked.dataIndex).toBe(40)
    expect(picked.contextText).toContain('칠성사이다')
  })
})
