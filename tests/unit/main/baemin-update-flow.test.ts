import { describe, expect, it } from 'vitest'
import { pickBaeminSearchResult } from '../../../src/main/platforms/baemin/update-flow'

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
