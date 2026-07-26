import { describe, expect, it } from 'vitest'
import {
  buildCompactPlatformImportRunDescription,
  buildPlatformImportRunDescription,
  formatPlatformImportError
} from '../../../src/renderer/src/lib/platform-imports'

describe('formatPlatformImportError', () => {
  it('formats coupangeats access-denied and script errors into friendly Korean messages', () => {
    expect(formatPlatformImportError('coupangeats', 'coupangeats_login_access_denied')).toBe(
      '쿠팡이츠가 자동화 브라우저 로그인을 차단했습니다. 전용 크롬에서 로그인한 뒤 다시 가져오기를 실행해 주세요.'
    )

    expect(formatPlatformImportError('coupangeats', 'coupangeats_login_script_error')).toBe(
      '쿠팡이츠 로그인 화면이 오류로 멈췄습니다. 잠시 후 다시 시도해 주세요.'
    )

    expect(formatPlatformImportError('coupangeats', 'coupangeats_managed_session_unavailable')).toBe(
      '로그인된 쿠팡이츠 전용 Chrome 메뉴 화면을 읽지 못했습니다. 로그인 상태와 메뉴 화면을 확인해 주세요.'
    )
  })

  it('builds import descriptions with option counts, duplicate cleanup, and managed-browser mode', () => {
    const run = {
      importRunId: 'run-coupang-1',
      platformCode: 'coupangeats' as const,
      startedAt: '2026-04-13T14:30:00.000Z',
      finishedAt: '2026-04-13T14:31:00.000Z',
      status: 'completed' as const,
      menuFetchCompleted: 1,
      optionFetchCompleted: 1,
      summaryJson: JSON.stringify({
        platformCode: 'coupangeats',
        fetchedCount: 35,
        optionGroupCount: 26,
        duplicateMenuCount: 7,
        fetchMode: 'managed_browser',
        createdMenuCount: 35,
        linkedMappingCount: 35,
        verifiedMappingCount: 0
      }),
      errorMessage: null
    }

    expect(buildPlatformImportRunDescription(run)).toBe(
      '메뉴 35개 확인 · 옵션 그룹 26개 확인 · 새 메뉴 35개 · 새 연결 35개 · 기존 연결 0개 · 중복 7건 정리 · 현재 세션 읽기'
    )

    expect(buildCompactPlatformImportRunDescription(run)).toBe(
      '메뉴 35개 확인 · 옵션 그룹 26개 확인 · 새 메뉴 35개 · 새 연결 35개 · 중복 7건 정리 · 현재 세션 읽기'
    )
  })
})
