import type {
  CatalogPresenceStatus,
  PlatformCode,
  PlatformMappingStatus,
  SyncPreviewNeedsReview
} from '../../../shared/contracts'

type MenuSourceStatusInput = {
  mappingStatus?: PlatformMappingStatus | null
  presenceStatus?: CatalogPresenceStatus | null
  platformMenuBindingStatus?: string | null
}

export const getPlatformLabel = (platformCode: PlatformCode) =>
  platformCode === 'baemin' ? '배민' : platformCode === 'coupangeats' ? '쿠팡이츠' : '땡겨요'

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul'
})

export const formatDateTimeLabel = (value?: string | null) => {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return dateTimeFormatter.format(parsed)
}

export const describeMenuSourceStatus = (source: MenuSourceStatusInput) => {
  if (source.mappingStatus === 'source_absent' || source.presenceStatus === 'absent_confirmed') {
    return { label: '플랫폼에 없음', tone: 'danger' as const }
  }

  if (source.presenceStatus === 'missing_suspected') {
    return { label: '원본 누락 의심', tone: 'warning' as const }
  }

  if (source.presenceStatus === 'resurfaced') {
    return { label: '재등장', tone: 'info' as const }
  }

  if (source.platformMenuBindingStatus && source.platformMenuBindingStatus !== '연결 정상') {
    return { label: '연결 끊김', tone: 'warning' as const }
  }

  return { label: '확인됨', tone: 'success' as const }
}

export const isSourceMissingReview = (source: MenuSourceStatusInput) =>
  source.mappingStatus === 'source_absent' ||
  source.presenceStatus === 'missing_suspected' ||
  source.presenceStatus === 'absent_confirmed'

export const isSourcePlatformAbsent = (source: MenuSourceStatusInput) =>
  source.mappingStatus === 'source_absent' || source.presenceStatus === 'absent_confirmed'

export const isSourceMissingSuspected = (source: MenuSourceStatusInput) =>
  source.presenceStatus === 'missing_suspected'

export const isSourceResurfaced = (source: MenuSourceStatusInput) =>
  source.presenceStatus === 'resurfaced'

export const formatNeedsReviewLabel = (item: SyncPreviewNeedsReview) => {
  if (item.reason === 'missing_mapping') {
    return '매핑 필요'
  }

  if (item.reason === 'price_variant_review') {
    return item.detail ? `가격 구조 검토 필요 · ${item.detail}` : '가격 구조 검토 필요'
  }

  if (item.reason === 'source_missing_review') {
    return item.detail ? `원본 메뉴 확인 필요 · ${item.detail}` : '원본 메뉴 확인 필요'
  }

  if (item.reason === 'managed_session_write_review') {
    return item.detail ? `현재 세션 반영 경로 필요 · ${item.detail}` : '현재 세션 반영 경로 필요'
  }

  return item.detail ? `가게 연결 검토 필요 · ${item.detail}` : '가게 연결 검토 필요'
}
