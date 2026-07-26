import type {
  PlatformCode,
  PlatformImportRunRecord,
  PlatformImportSummary
} from '../../../shared/contracts'
import { formatDateTimeLabel, getPlatformLabel } from './menu-source-labels'

type LatestImportState = Partial<Record<PlatformCode, PlatformImportRunRecord>>

export const parseImportSummary = (value?: string | null) => {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Partial<PlatformImportSummary>

    if (
      typeof parsed.platformCode === 'string' &&
      typeof parsed.fetchedCount === 'number' &&
      typeof parsed.createdMenuCount === 'number' &&
      typeof parsed.linkedMappingCount === 'number' &&
      typeof parsed.verifiedMappingCount === 'number'
    ) {
      return parsed as PlatformImportSummary
    }
  } catch {
    return null
  }

  return null
}

export const pickLatestImportRuns = (runs: PlatformImportRunRecord[]) =>
  runs.reduce<LatestImportState>((latest, run) => {
    const current = latest[run.platformCode]
    const currentTime = new Date(current?.finishedAt ?? current?.startedAt ?? 0).getTime()
    const nextTime = new Date(run.finishedAt ?? run.startedAt).getTime()

    if (!current || nextTime > currentTime) {
      latest[run.platformCode] = run
    }

    return latest
  }, {})

export const formatPlatformImportError = (
  platformCode: PlatformCode,
  value?: string | null
) => {
  if (!value) {
    return ''
  }

  if (value === 'credential_not_found') {
    return '계정 정보를 다시 확인해 주세요.'
  }

  if (value === 'coupangeats_login_access_denied') {
    return '쿠팡이츠가 자동화 브라우저 로그인을 차단했습니다. 전용 크롬에서 로그인한 뒤 다시 가져오기를 실행해 주세요.'
  }

  if (value === 'coupangeats_login_script_error') {
    return '쿠팡이츠 로그인 화면이 오류로 멈췄습니다. 잠시 후 다시 시도해 주세요.'
  }

  if (value === 'coupangeats_managed_session_unavailable') {
    return '로그인된 쿠팡이츠 전용 Chrome 메뉴 화면을 읽지 못했습니다. 로그인 상태와 메뉴 화면을 확인해 주세요.'
  }

  if (value === 'coupangeats_management_app_blank') {
    return '쿠팡이츠 관리 화면이 빈 페이지로 열렸습니다. 로그인 뒤 초기 데이터 호출에 실패했습니다.'
  }

  if (value === 'coupangeats_menu_page_not_loaded') {
    return '쿠팡이츠 관리 화면은 열렸지만 메뉴 목록 구조를 찾지 못했습니다.'
  }

  if (value.startsWith('playwright_install_failed:')) {
    return '브라우저 엔진 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
  }

  if (value.startsWith('page.goto: Timeout')) {
    return '로그인 페이지를 여는 중 시간 초과가 발생했습니다.'
  }

  if (value.startsWith('page.fill: Timeout') || value.startsWith('locator.fill: Timeout')) {
    if (
      value.includes('input[name="email"]') ||
      value.includes('input[name="mbrId"]') ||
      value.includes('#loginId')
    ) {
      return '로그인 아이디 입력창을 찾지 못했습니다. 화면 구조를 다시 확인해 주세요.'
    }

    return '로그인 입력창을 찾지 못했습니다. 화면 구조를 다시 확인해 주세요.'
  }

  if (value.startsWith('page.waitForSelector: Timeout')) {
    return '다음 단계 화면을 기다리다 시간 초과가 발생했습니다.'
  }

  if (value.startsWith('page.waitForFunction: Timeout')) {
    return '화면 응답을 기다리다 시간 초과가 발생했습니다.'
  }

  if (value.startsWith('page.waitForURL: Timeout')) {
    return '로그인 후 이동 화면을 기다리다 시간 초과가 발생했습니다.'
  }

  if (platformCode === 'baemin') {
    if (/^baemin_menu_page_collection_incomplete:\d+\/\d+$/u.test(value)) {
      return '메뉴 목록을 끝까지 읽지 못했습니다. 페이지를 다시 가져오거나 수집 검사를 확인해 주세요.'
    }

    if (/^baemin_option_group_page_collection_incomplete:\d+\/\d+$/u.test(value)) {
      return '옵션 목록을 끝까지 읽지 못했습니다. 옵션 탭 수집 검사를 다시 확인해 주세요.'
    }

    if (value === 'baemin_menu_page_timeout') {
      return '메뉴 목록 응답을 기다리다 시간 초과가 발생했습니다.'
    }

    if (value.startsWith('baemin_menu_search_input_not_found:')) {
      return '배민 메뉴 검색 입력창을 찾지 못했습니다.'
    }
  }

  return value
}

export const getPlatformImportTone = (run?: PlatformImportRunRecord) => {
  if (!run) {
    return 'pending'
  }

  if (run.status === 'partial_failed') {
    return 'failed'
  }

  if (run.status === 'running') {
    return 'pending'
  }

  return 'connected'
}

export const getPlatformImportStatusLabel = (run?: PlatformImportRunRecord) => {
  if (!run) {
    return '대기'
  }

  if (run.status === 'partial_failed') {
    return '일부 실패'
  }

  if (run.status === 'running') {
    return '진행 중'
  }

  return '완료'
}

export const buildPlatformImportRunDescription = (run?: PlatformImportRunRecord) => {
  if (!run) {
    return null
  }

  const summary = parseImportSummary(run.summaryJson)
  const formattedError = formatPlatformImportError(run.platformCode, run.errorMessage)

  if (summary) {
    const parts = [
      `메뉴 ${summary.fetchedCount}개 확인`,
      ...(typeof summary.optionGroupCount === 'number'
        ? [`옵션 그룹 ${summary.optionGroupCount}개 확인`]
        : []),
      `새 메뉴 ${summary.createdMenuCount}개`,
      `새 연결 ${summary.linkedMappingCount}개`,
      `기존 연결 ${summary.verifiedMappingCount}개`,
      ...(typeof summary.duplicateMenuCount === 'number' && summary.duplicateMenuCount > 0
        ? [`중복 ${summary.duplicateMenuCount}건 정리`]
        : []),
      ...(summary.fetchMode === 'managed_browser' ? ['현재 세션 읽기'] : [])
    ]

    return parts.join(' · ')
  }

  if (formattedError) {
    return formattedError
  }

  if (run.status === 'running') {
    return '가져오기를 진행하고 있습니다.'
  }

  if (run.status === 'partial_failed') {
    return '가져오기 일부 단계가 실패했습니다. 수집 검사와 실행 기록을 확인해 주세요.'
  }

  return '최근 가져오기 기록이 있습니다.'
}

export const buildCompactPlatformImportRunDescription = (run?: PlatformImportRunRecord) => {
  if (!run) {
    return null
  }

  const summary = parseImportSummary(run.summaryJson)
  if (summary) {
    const parts = [
      `메뉴 ${summary.fetchedCount}개 확인`,
      ...(typeof summary.optionGroupCount === 'number'
        ? [`옵션 그룹 ${summary.optionGroupCount}개 확인`]
        : [])
    ]

    if (summary.createdMenuCount > 0) {
      parts.push(`새 메뉴 ${summary.createdMenuCount}개`)
    }

    if (summary.linkedMappingCount > 0) {
      parts.push(`새 연결 ${summary.linkedMappingCount}개`)
    }

    if (summary.verifiedMappingCount > 0) {
      parts.push(`기존 연결 ${summary.verifiedMappingCount}개 유지`)
    }

    if (typeof summary.duplicateMenuCount === 'number' && summary.duplicateMenuCount > 0) {
      parts.push(`중복 ${summary.duplicateMenuCount}건 정리`)
    }

    if (summary.fetchMode === 'managed_browser') {
      parts.push('현재 세션 읽기')
    }

    return parts.join(' · ')
  }

  return buildPlatformImportRunDescription(run)
}

export const buildPlatformImportRunLabel = (run?: PlatformImportRunRecord) => {
  if (!run) {
    return ''
  }

  return `${getPlatformLabel(run.platformCode)} · ${buildPlatformImportRunDescription(run)}`
}

export const buildPlatformImportRunTitle = (run?: PlatformImportRunRecord) => {
  if (!run) {
    return ''
  }

  return `마지막 가져오기 ${formatDateTimeLabel(run.finishedAt ?? run.startedAt) || run.finishedAt || run.startedAt}`
}
