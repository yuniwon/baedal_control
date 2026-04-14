import { describe, expect, it } from 'vitest'
import {
  extractBaeminForbiddenCharacters,
  getBaeminNameChangeBlockerMessage,
  getBaeminNameChangeBlockerMessageFromVisibleText,
  refineBaeminNameApplyFailureMessage
} from '../../../src/main/platforms/baemin/detail-guard'

describe('getBaeminNameChangeBlockerMessage', () => {
  it('returns a friendly blocker message when menu description contains a forbidden exclamation mark', () => {
    const message = getBaeminNameChangeBlockerMessage({
      data: {
        menuDesc:
          '최고의 조합 감자와 베이컨 그리고 엣지 속에는 고구마, 위에는 체다치즈가 듬뿍! 고소함의 끝을 보여드립니다'
      }
    })

    expect(message).toBe("기존 메뉴 설명에 금칙어 '!'가 있어 이름 변경 저장이 막힙니다.")
  })

  it('returns null when the menu detail has no blocked text', () => {
    const message = getBaeminNameChangeBlockerMessage({
      data: {
        menuDesc: '고소한 감자와 베이컨이 올라간 메뉴입니다'
      }
    })

    expect(message).toBeNull()
  })

  it('checks alternate description fields from related detail responses', () => {
    const message = getBaeminNameChangeBlockerMessage({
      data: {
        menuDescription: '체다치즈가 듬뿍! 들어간 인기 메뉴'
      }
    })

    expect(message).toBe("기존 메뉴 설명에 금칙어 '!'가 있어 이름 변경 저장이 막힙니다.")
  })

  it('detects blocked description text from the opened detail panel', () => {
    const message = getBaeminNameChangeBlockerMessageFromVisibleText(
      '포테이토골드 변경 구성 최고의 조합 감자와 베이컨 설명 최고의 조합 감자와 베이컨 그리고 엣지 속에는 고구마, 위에는 체다치즈가 듬뿍! 고소함의 끝을 보여드립니다 옵션 변경'
    )

    expect(message).toBe("기존 메뉴 설명에 금칙어 '!'가 있어 이름 변경 저장이 막힙니다.")
  })

  it('returns null when the opened detail panel text is clean', () => {
    const message = getBaeminNameChangeBlockerMessageFromVisibleText(
      '포테이토골드 변경 구성 최고의 조합 감자와 베이컨 설명 최고의 조합 감자와 베이컨 그리고 엣지 속에는 고구마가 들어갑니다 옵션 변경'
    )

    expect(message).toBeNull()
  })

  it('detects blocked text in the composition field as well as description', () => {
    const message = getBaeminNameChangeBlockerMessage({
      data: {
        menuComposition: '체다치즈가 듬뿍! 들어간 인기 메뉴'
      }
    })

    expect(message).toBe("기존 메뉴 구성에 금칙어 '!'가 있어 이름 변경 저장이 막힙니다.")
  })

  it('checks nested detail fields when the blocked text is stored under a nested description key', () => {
    const message = getBaeminNameChangeBlockerMessage(
      {
        data: {
          menuDetail: {
            detailDescription: '도우 끝에 치즈가 가득? 들어간 메뉴'
          }
        }
      },
      ['?']
    )

    expect(message).toBe("기존 메뉴 설명에 금칙어 '?'가 있어 이름 변경 저장이 막힙니다.")
  })
})

describe('extractBaeminForbiddenCharacters', () => {
  it('extracts forbidden characters from baemin apply failure messages', () => {
    expect(
      extractBaeminForbiddenCharacters(
        "baemin_menu_name_apply_failed:EXTERNAL_API_ERROR_40045:금칙어 '?'은 입력할 수 없습니다."
      )
    ).toEqual(['?'])
  })
})

describe('refineBaeminNameApplyFailureMessage', () => {
  it('returns a field-specific blocker message when baemin reports a forbidden character and the detail payload contains it', () => {
    const message = refineBaeminNameApplyFailureMessage(
      "baemin_menu_name_apply_failed:EXTERNAL_API_ERROR_40045:금칙어 '?'은 입력할 수 없습니다.",
      {
        data: {
          menuDetail: {
            detailDescription: '도우 끝에 치즈가 가득? 들어간 메뉴'
          }
        }
      },
      '구성 치즈크러스트 설명 도우 끝에 치즈가 가득? 들어간 메뉴 옵션 변경'
    )

    expect(message).toBe("기존 메뉴 설명에 금칙어 '?'가 있어 이름 변경 저장이 막힙니다.")
  })

  it('falls back to the original failure message when the forbidden character cannot be found in detail text', () => {
    const message = refineBaeminNameApplyFailureMessage(
      "baemin_menu_name_apply_failed:EXTERNAL_API_ERROR_40045:금칙어 '?'은 입력할 수 없습니다.",
      {
        data: {
          menuDesc: '고소한 감자와 베이컨이 올라간 메뉴입니다'
        }
      },
      '구성 치즈크러스트 설명 고소한 감자와 베이컨이 올라간 메뉴 옵션 변경'
    )

    expect(message).toBe(
      "baemin_menu_name_apply_failed:EXTERNAL_API_ERROR_40045:금칙어 '?'은 입력할 수 없습니다."
    )
  })
})
