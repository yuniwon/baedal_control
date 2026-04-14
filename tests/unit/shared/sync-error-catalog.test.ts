import { describe, expect, it } from 'vitest'
import {
  describeSyncFailure,
  formatSyncFailureAction,
  normalizeSyncFailure
} from '../../../src/shared/sync-error-catalog'

describe('sync-error-catalog', () => {
  it('normalizes baemin apply failures into structured codes', () => {
    expect(
      normalizeSyncFailure(
        new Error(
          "baemin_menu_name_apply_failed:EXTERNAL_API_ERROR_40045:금칙어 '!'은 입력할 수 없습니다."
        )
      )
    ).toEqual({
      errorCode: 'baemin_menu_name_apply_failed',
      errorMessage: "EXTERNAL_API_ERROR_40045:금칙어 '!'은 입력할 수 없습니다."
    })
  })

  it('describes legacy raw baemin failures stored under apply_failed', () => {
    expect(
      describeSyncFailure(
        'apply_failed',
        "baemin_menu_name_apply_failed:EXTERNAL_API_ERROR_40045:금칙어 '!'은 입력할 수 없습니다."
      )
    ).toEqual(
      expect.objectContaining({
        message: "금칙어 '!'은 입력할 수 없습니다.",
        action: '기존 메뉴 설명, 구성, 메뉴명에 금칙어가 없는지 확인한 뒤 다시 실행해 주세요.',
        retryable: false
      })
    )
  })

  it('returns action-focused guidance for coupangeats managed browser errors', () => {
    expect(
      formatSyncFailureAction(
        'coupangeats_managed_editor_not_opened',
        'menu_editor_controls_not_found'
      )
    ).toBe('전용 크롬에서 메뉴 목록 첫 화면을 다시 연 뒤 다시 실행해 주세요.')
  })

  it('keeps baemin name rejection messages operator-friendly', () => {
    expect(describeSyncFailure('baemin_menu_name_rejected', "'배민'은(는) 입력할 수 없어요.")).toEqual(
      expect.objectContaining({
        message: "'배민'은(는) 입력할 수 없어요.",
        action: '배민에서 허용되는 메뉴명으로 바꾼 뒤 다시 실행해 주세요.',
        retryable: false
      })
    )
  })
})
