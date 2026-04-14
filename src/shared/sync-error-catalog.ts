import type { SyncRunFailureContext } from './contracts'

export interface NormalizedSyncFailure {
  errorCode: string
  errorMessage: string
}

export interface SyncFailureDescriptor {
  errorCode: string
  message: string
  action?: string | null
  retryable: boolean
}

const coupangManagedFailurePattern =
  /^coupangeats_managed_update_failed:([^:]+):(.+)$/u

const baeminApplyFailurePattern =
  /^baemin_menu_(name|price)_apply_failed:([^:]+):(.*)$/u

const baeminRejectedPattern = /^baemin_menu_name_rejected:(.+)$/u

const baeminTimeoutPattern =
  /^baemin_menu_detail_verification_timeout(?::.*)?$/u

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

const describeKnownSyncFailure = (
  errorCode?: string | null,
  errorMessage?: string | null
): SyncFailureDescriptor | null => {
  const detail = errorMessage?.trim() ?? ''

  switch (errorCode) {
    case 'coupangeats_managed_target_not_found':
      return {
        errorCode,
        message:
          '쿠팡이츠 현재 탭에서 수정할 메뉴를 찾지 못했습니다. 메뉴를 다시 가져온 뒤 다시 시도해 주세요.',
        action: '현재 세션으로 다시 가져오기 후 다시 실행해 주세요.',
        retryable: true
      }
    case 'coupangeats_managed_ambiguous_target':
      return {
        errorCode,
        message:
          '쿠팡이츠 현재 탭에서 같은 조건의 메뉴가 여러 개라 자동으로 선택하지 않았습니다. 매핑을 다시 확인해 주세요.',
        action: '매핑 검토에서 연결 메뉴를 다시 확인해 주세요.',
        retryable: false
      }
    case 'coupangeats_managed_editor_not_opened':
      return {
        errorCode,
        message:
          '쿠팡이츠 편집창을 열었지만 메뉴명, 가격, 저장 버튼을 찾지 못했습니다.',
        action: '전용 크롬에서 메뉴 목록 첫 화면을 다시 연 뒤 다시 실행해 주세요.',
        retryable: true
      }
    case 'coupangeats_managed_save_not_observed':
      return {
        errorCode,
        message:
          '쿠팡이츠 저장 후 목록에서 변경 결과를 확인하지 못했습니다. 실제 화면 반영 여부를 확인해 주세요.',
        action: '실제 화면 반영 여부를 확인한 뒤 현재 세션으로 다시 가져오기 해 주세요.',
        retryable: true
      }
    case 'baemin_menu_match_not_found':
      return {
        errorCode,
        message: '검색 결과에서 메뉴를 다시 찾지 못했습니다.',
        action: '배민 메뉴를 다시 가져온 뒤 다시 실행해 주세요.',
        retryable: true
      }
    case 'baemin_menu_match_ambiguous':
      return {
        errorCode,
        message: '검색 결과가 여러 개라 정확히 선택하지 못했습니다.',
        action: '매핑 검토에서 연결 대상을 다시 확인해 주세요.',
        retryable: false
      }
    case 'baemin_menu_name_rejected':
      return {
        errorCode,
        message: detail || '배민이 입력한 메뉴명을 거절했습니다.',
        action: '배민에서 허용되는 메뉴명으로 바꾼 뒤 다시 실행해 주세요.',
        retryable: false
      }
    case 'baemin_menu_name_apply_failed':
    case 'baemin_menu_price_apply_failed': {
      const parts = detail.match(/^([^:]+):(.*)$/u)
      const apiCode = parts?.[1]?.trim() ?? ''
      const serverMessage = parts?.[2]?.trim() || detail || '배민 저장 요청이 실패했습니다.'
      const blockedByForbiddenWord = serverMessage.includes('금칙어')

      return {
        errorCode,
        message: serverMessage,
        action: blockedByForbiddenWord
          ? '기존 메뉴 설명, 구성, 메뉴명에 금칙어가 없는지 확인한 뒤 다시 실행해 주세요.'
          : apiCode.length > 0
            ? `배민 저장 오류(${apiCode})를 확인한 뒤 다시 실행해 주세요.`
            : '배민 상세 화면의 현재 값을 확인한 뒤 다시 실행해 주세요.',
        retryable: !blockedByForbiddenWord
      }
    }
    case 'baemin_menu_detail_verification_timeout':
      return {
        errorCode,
        message: '배민 상세 패널에서 변경된 값을 끝까지 확인하지 못했습니다.',
        action: '실제 화면 반영 여부를 확인한 뒤 다시 가져오기 후 재시도해 주세요.',
        retryable: true
      }
    case 'baemin_multi_price_menu_requires_review':
    case 'ddangyo_multi_price_menu_requires_review':
      return {
        errorCode,
        message: '다중 가격 메뉴라 현재 구조로는 자동 반영을 바로 진행하지 않습니다.',
        action: '메뉴 관리에서 가격 구조를 맞춘 뒤 다시 실행해 주세요.',
        retryable: false
      }
    case 'baemin_multi_price_pickup_amount_requires_review':
      return {
        errorCode,
        message:
          '배민 다중 가격 메뉴의 픽업 가격이 배달 가격과 달라 현재 자동 반영 범위를 벗어납니다.',
        action: '배민 채널별 가격 구조를 다시 맞춘 뒤 다시 실행해 주세요.',
        retryable: false
      }
    case 'baemin_previous_price_missing':
      return {
        errorCode,
        message: '배민 현재 가격 정보를 확인하지 못해 변경 대상을 계산할 수 없었습니다.',
        action: '배민 메뉴를 다시 가져온 뒤 다시 실행해 주세요.',
        retryable: true
      }
    case 'baemin_menu_name_apply_button_timeout':
      return {
        errorCode,
        message: '배민 이름 변경 적용 버튼이 활성화되기를 기다리다 시간 초과가 발생했습니다.',
        action: '상세 패널을 다시 연 뒤 다시 실행해 주세요.',
        retryable: true
      }
    case 'baemin_menu_result_not_rendered':
      return {
        errorCode,
        message: '배민 검색 결과 행을 화면에서 다시 찾지 못했습니다.',
        action: '메뉴 목록을 새로고침하거나 다시 가져온 뒤 다시 실행해 주세요.',
        retryable: true
      }
    default:
      break
  }

  if (errorCode?.startsWith('coupangeats_managed_')) {
    return {
      errorCode,
      message: detail
        ? `쿠팡이츠 현재 탭 반영에 실패했습니다. (${detail})`
        : '쿠팡이츠 현재 탭 반영에 실패했습니다.',
      action: '전용 크롬 메뉴 탭을 새로고침하고 현재 세션으로 다시 가져오기 후 재시도해 주세요.',
      retryable: true
    }
  }

  return null
}

const describeRawSyncFailure = (value?: string | null): SyncFailureDescriptor => {
  const raw = value?.trim() ?? ''
  if (!raw) {
    return {
      errorCode: 'apply_failed',
      message: '반영 중 알 수 없는 오류가 발생했습니다.',
      action: '실행 기록과 현재 화면을 확인해 주세요.',
      retryable: false
    }
  }

  const coupangManagedFailure = raw.match(coupangManagedFailurePattern)
  if (coupangManagedFailure) {
    return describeKnownSyncFailure(
      `coupangeats_managed_${coupangManagedFailure[1]}`,
      coupangManagedFailure[2]
    ) as SyncFailureDescriptor
  }

  const baeminRejected = raw.match(baeminRejectedPattern)
  if (baeminRejected) {
    return describeKnownSyncFailure('baemin_menu_name_rejected', baeminRejected[1]) as SyncFailureDescriptor
  }

  const baeminApplyFailure = raw.match(baeminApplyFailurePattern)
  if (baeminApplyFailure) {
    return describeKnownSyncFailure(
      `baemin_menu_${baeminApplyFailure[1]}_apply_failed`,
      `${baeminApplyFailure[2]}:${baeminApplyFailure[3]}`
    ) as SyncFailureDescriptor
  }

  if (raw === 'baemin_menu_match_not_found' || raw === 'baemin_menu_match_ambiguous') {
    return describeKnownSyncFailure(raw, '') as SyncFailureDescriptor
  }

  if (baeminTimeoutPattern.test(raw)) {
    return describeKnownSyncFailure('baemin_menu_detail_verification_timeout', '') as SyncFailureDescriptor
  }

  if (
    raw === 'baemin_multi_price_menu_requires_review' ||
    raw === 'ddangyo_multi_price_menu_requires_review' ||
    raw === 'baemin_multi_price_pickup_amount_requires_review' ||
    raw === 'baemin_previous_price_missing' ||
    raw.startsWith('baemin_menu_name_apply_button_timeout') ||
    raw.startsWith('baemin_menu_result_not_rendered')
  ) {
    const code = raw.split(':', 1)[0]
    return describeKnownSyncFailure(code, raw.slice(code.length + 1)) as SyncFailureDescriptor
  }

  if (raw.startsWith('page.waitForFunction: Timeout')) {
    return {
      errorCode: 'apply_failed',
      message: '화면 응답을 기다리다 시간 초과가 발생했습니다.',
      action: '잠시 후 다시 실행해 주세요.',
      retryable: true
    }
  }

  if (raw.startsWith('locator.fill: Timeout')) {
    return {
      errorCode: 'apply_failed',
      message: '입력창을 찾지 못했습니다.',
      action: '현재 화면 구조를 확인한 뒤 다시 실행해 주세요.',
      retryable: true
    }
  }

  return {
    errorCode: 'apply_failed',
    message: raw,
    action: '실행 기록과 현재 플랫폼 화면을 함께 확인해 주세요.',
    retryable: false
  }
}

export const normalizeSyncFailure = (error: unknown): NormalizedSyncFailure => {
  const rawMessage = error instanceof Error ? error.message : 'unknown_error'
  const descriptor = describeRawSyncFailure(rawMessage)

  if (descriptor.errorCode === 'apply_failed') {
    return {
      errorCode: descriptor.errorCode,
      errorMessage: rawMessage
    }
  }

  const coupangManagedFailure = rawMessage.match(coupangManagedFailurePattern)
  if (coupangManagedFailure) {
    return {
      errorCode: descriptor.errorCode,
      errorMessage: coupangManagedFailure[2]
    }
  }

  const baeminRejected = rawMessage.match(baeminRejectedPattern)
  if (baeminRejected) {
    return {
      errorCode: descriptor.errorCode,
      errorMessage: baeminRejected[1]
    }
  }

  const baeminApplyFailure = rawMessage.match(baeminApplyFailurePattern)
  if (baeminApplyFailure) {
    return {
      errorCode: descriptor.errorCode,
      errorMessage: `${baeminApplyFailure[2]}:${baeminApplyFailure[3]}`
    }
  }

  const code = descriptor.errorCode
  const detail = rawMessage.startsWith(`${code}:`) ? rawMessage.slice(code.length + 1) : ''

  return {
    errorCode: code,
    errorMessage: detail
  }
}

export const describeSyncFailure = (
  errorCode?: string | null,
  errorMessage?: string | null
): SyncFailureDescriptor => {
  const structured = describeKnownSyncFailure(errorCode, errorMessage)
  if (structured) {
    return structured
  }

  return describeRawSyncFailure(errorMessage)
}

export const formatSyncErrorMessage = (
  errorCode?: string | null,
  errorMessage?: string | null
) => describeSyncFailure(errorCode, errorMessage).message

export const formatSyncFailureAction = (
  errorCode?: string | null,
  errorMessage?: string | null
) => describeSyncFailure(errorCode, errorMessage).action ?? ''

export const formatSyncFailureContext = (
  context?: SyncRunFailureContext | null
): { summary: string; meta?: string | null; detail?: string | null } | null => {
  if (!context) {
    return null
  }

  if (context.kind === 'platform_page_snapshot') {
    const pageKindLabel =
      context.pageKind === 'menu_detail'
        ? '상세 패널'
        : context.pageKind === 'menu_list'
          ? '메뉴 목록'
          : context.pageKind === 'option_list'
            ? '옵션 목록'
            : '현재 화면'

    if (context.status === 'captured') {
      const metaParts = [
        context.operationStage ? `실패 단계 ${context.operationStage}` : null,
        `캡처 시각 ${formatContextDateTime(context.capturedAt)}`
      ].filter((value): value is string => Boolean(value))

      return {
        summary: `실패 당시 화면: ${(context.pageTitle || '플랫폼 화면')} · ${pageKindLabel}`,
        detail: context.visibleTextSnippet ?? null,
        meta: metaParts.join(' · ')
      }
    }

    return {
      summary: context.detail
        ? `실패 당시 화면을 기록하지 못했습니다. (${context.detail})`
        : '실패 당시 화면을 기록하지 못했습니다.',
      meta: null
    }
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
