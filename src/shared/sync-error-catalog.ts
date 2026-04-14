import type { SyncRunFailureContext } from './contracts'

export interface NormalizedSyncFailure {
  errorCode: string
  errorMessage: string
}

const coupangManagedFailurePattern =
  /^coupangeats_managed_update_failed:([^:]+):(.+)$/u

const formatContextDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return [
    date.getFullYear().toString().padStart(4, '0'),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getDate().toString().padStart(2, '0')
  ].join('. ') +
    `. ${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`
}

const formatLegacySyncErrorMessage = (value?: string | null) => {
  if (!value) {
    return ''
  }

  if (value === 'baemin_menu_match_not_found') {
    return '검색 결과에서 메뉴를 다시 찾지 못했습니다.'
  }

  if (value === 'baemin_menu_match_ambiguous') {
    return '검색 결과가 여러 개라 정확히 선택하지 못했습니다.'
  }

  const rejectedPrefix = 'baemin_menu_name_rejected:'
  if (value.startsWith(rejectedPrefix)) {
    return value.slice(rejectedPrefix.length)
  }

  const applyFailureMatch = value.match(
    /^baemin_menu_(name|price)_apply_failed:[^:]+:(.+)$/u
  )
  if (applyFailureMatch) {
    return applyFailureMatch[2]
  }

  if (value.startsWith('page.waitForFunction: Timeout')) {
    return '배민 화면 응답을 기다리다 시간 초과가 발생했습니다.'
  }

  if (value.startsWith('locator.fill: Timeout')) {
    return '배민 검색 입력창을 찾지 못했습니다.'
  }

  return value
}

export const normalizeSyncFailure = (error: unknown): NormalizedSyncFailure => {
  const rawMessage = error instanceof Error ? error.message : 'unknown_error'
  const coupangManagedFailure = rawMessage.match(coupangManagedFailurePattern)

  if (coupangManagedFailure) {
    return {
      errorCode: `coupangeats_managed_${coupangManagedFailure[1]}`,
      errorMessage: coupangManagedFailure[2]
    }
  }

  return {
    errorCode: 'apply_failed',
    errorMessage: rawMessage
  }
}

export const formatSyncErrorMessage = (
  errorCode?: string | null,
  errorMessage?: string | null
) => {
  switch (errorCode) {
    case 'coupangeats_managed_target_not_found':
      return '쿠팡이츠 현재 탭에서 수정할 메뉴를 찾지 못했습니다. 메뉴를 다시 가져온 뒤 다시 시도해 주세요.'
    case 'coupangeats_managed_ambiguous_target':
      return '쿠팡이츠 현재 탭에서 같은 조건의 메뉴가 여러 개라 자동으로 선택하지 않았습니다. 매핑을 다시 확인해 주세요.'
    case 'coupangeats_managed_editor_not_opened':
      return '쿠팡이츠 편집창을 열었지만 메뉴명, 가격, 저장 버튼을 찾지 못했습니다.'
    case 'coupangeats_managed_save_not_observed':
      return '쿠팡이츠 저장 후 목록에서 변경 결과를 확인하지 못했습니다. 실제 화면 반영 여부를 확인해 주세요.'
    default:
      break
  }

  if (errorCode?.startsWith('coupangeats_managed_')) {
    return errorMessage
      ? `쿠팡이츠 현재 탭 반영에 실패했습니다. (${errorMessage})`
      : '쿠팡이츠 현재 탭 반영에 실패했습니다.'
  }

  return formatLegacySyncErrorMessage(errorMessage)
}

export const formatSyncFailureContext = (
  context?: SyncRunFailureContext | null
): { summary: string; meta?: string | null } | null => {
  if (!context) {
    return null
  }

  if (context.kind === 'managed_browser_snapshot') {
    if (context.status === 'captured') {
      const parts = [
        context.pageTitle || '현재 탭',
        typeof context.menuCount === 'number' ? `메뉴 ${context.menuCount}개` : null,
        typeof context.optionGroupCount === 'number'
          ? `옵션 그룹 ${context.optionGroupCount}개`
          : null
      ].filter((value): value is string => Boolean(value))

      return {
        summary: `실패 당시 탭: ${parts.join(' · ')}`,
        meta: `캡처 시각 ${formatContextDateTime(context.capturedAt)}`
      }
    }

    if (context.status === 'tab_not_found') {
      return {
        summary: '실패 당시 현재 탭을 찾지 못했습니다.',
        meta: null
      }
    }

    return {
      summary: context.detail
        ? `실패 당시 현재 탭을 다시 읽지 못했습니다. (${context.detail})`
        : '실패 당시 현재 탭을 다시 읽지 못했습니다.',
      meta: null
    }
  }

  return null
}
