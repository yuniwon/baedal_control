import { useEffect, useState } from 'react'
import type {
  BrowserInspectionSnapshot,
  BrowserInspectorStatus,
  ManagedChromeSessionStatus,
  PlatformImportRunRecord,
  PlatformSessionState,
  PlatformSessionStateRecord,
  PlatformInspectionField,
  PlatformInspectionReport
} from '../../../shared/contracts'
import { PLATFORM_CODES, inferPlatformCodeFromHost } from '../../../shared/platforms'
import type { PlatformCode } from '../../../shared/platforms'
import { appApi } from '../lib/api'
import {
  buildCompactPlatformImportRunDescription,
  buildPlatformImportRunDescription,
  buildPlatformImportRunTitle,
  formatPlatformImportError,
  getPlatformImportStatusLabel,
  getPlatformImportTone,
  pickLatestImportRuns
} from '../lib/platform-imports'
import { formatDateTimeLabel, getPlatformLabel } from '../lib/menu-source-labels'

const platforms = PLATFORM_CODES
type PlatformKey = PlatformCode
type CredentialFormState = Record<PlatformKey, { username: string; password: string }>
const emptyCredentials = Object.fromEntries(
  platforms.map((platformCode) => [platformCode, { username: '', password: '' }])
) as CredentialFormState
type LatestImportState = Partial<Record<PlatformKey, PlatformImportRunRecord>>
type PlatformSessionStateMap = Partial<Record<PlatformKey, PlatformSessionStateRecord>>
type ImportResponse = {
  ok: true
  sessionState?: PlatformSessionStateRecord
  importSummary?: import('../../../shared/contracts').PlatformImportSummary
  importInspection?: PlatformInspectionReport
  importError?: string
}

const getManagedChromePageLabel = (
  pageKind: BrowserInspectionSnapshot['pageKind']
) =>
  pageKind === 'menu_list'
    ? '메뉴 페이지'
    : pageKind === 'option_list'
      ? '옵션 페이지'
      : pageKind === 'unknown'
        ? '일반 페이지'
        : pageKind

const buildManagedChromeTabTitle = (
  platformCode: PlatformKey | null,
  pageKind: BrowserInspectionSnapshot['pageKind'],
  fallbackTitle: string
) => {
  if (pageKind === 'menu_list' || pageKind === 'option_list') {
    return `${platformCode ? getPlatformLabel(platformCode) : '알 수 없는 플랫폼'} ${getManagedChromePageLabel(pageKind)}`
  }

  return fallbackTitle
}

const inferManagedChromePlatformCode = (url?: string | null): PlatformKey | null => {
  if (!url) {
    return null
  }
  try {
    return inferPlatformCodeFromHost(new URL(url).host)
  } catch {
    return null
  }
}

const getPlatformSessionLabel = (state: PlatformSessionState) => {
  switch (state) {
    case 'ready':
      return '연결됨'
    case 'expired':
      return '세션 만료'
    case 'credential_required':
      return '로그인 정보 필요'
    case 'challenge_required':
      return '추가 인증 필요'
    case 'credential_rejected':
    case 'locked_out_risk':
      return '로그인 정보 확인 필요'
    case 'unsupported':
      return '자동 연결 불가'
    case 'checking':
      return '연결 확인 중'
    case 'error':
      return '연결 오류'
    default:
      return '연결 확인 전'
  }
}

const getPlatformSessionTone = (state: PlatformSessionState) =>
  state === 'ready'
    ? 'connected'
    : state === 'challenge_required' || state === 'credential_required' || state === 'expired'
      ? 'pending'
      : state === 'unknown' || state === 'checking'
        ? ''
        : 'failed'

const getPlatformSessionGuidance = (
  platform: PlatformKey,
  record?: PlatformSessionStateRecord
) => {
  if (!record) return null
  const label = getPlatformLabel(platform)
  switch (record.detailCode) {
    case 'otp_required':
      return `${label}에서 OTP 인증을 완료한 뒤 인증 완료 확인을 눌러 주세요.`
    case 'captcha_required':
      return `${label}에서 CAPTCHA를 완료한 뒤 인증 완료 확인을 눌러 주세요.`
    case 'account_selection_required':
      return 'Chrome에서 사용할 쿠팡이츠 계정을 선택한 뒤 인증 완료 확인을 눌러 주세요.'
    case 'password_manager_unlock_or_account_selection_required':
      return 'Chrome 비밀번호 관리자의 잠금을 해제하거나 계정을 선택한 뒤 인증 완료 확인을 눌러 주세요.'
    case 'password_manager_auto_click_consent_required':
      return '아래에서 로그인 버튼 1회 자동 클릭을 허용해 주세요.'
    case 'login_click_already_attempted':
      return '로그인 버튼은 이미 한 번 눌렀습니다. Chrome에서 상태를 확인한 뒤 인증 완료 확인을 눌러 주세요.'
    case 'managed_login_rejected':
      return `${label}에서 로그인 오류를 확인해 주세요. 계정 보호를 위해 자동 재시도하지 않습니다.`
    case 'google_chrome_profile_required':
      return '설치된 Google Chrome과 전용 프로필을 확인해 주세요.'
    case 'password_manager_login_not_confirmed':
      return 'Chrome에서 로그인 결과를 확인한 뒤 인증 완료 확인을 눌러 주세요.'
    case 'managed_chrome_session_unavailable':
      return '전용 Chrome 연결 상태를 확인한 뒤 인증 화면 열기를 눌러 주세요.'
    case 'password_manager_login_page_unavailable':
    case 'password_manager_document_identity_unavailable':
      return '로그인 화면을 안전하게 확인하지 못해 자동 클릭을 중단했습니다. Chrome에서 직접 확인해 주세요.'
    default:
      return record.state === 'challenge_required' ? '추가 인증이 필요합니다.' : null
  }
}

export const SettingsPage = () => {
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [credentials, setCredentials] = useState<CredentialFormState>(emptyCredentials)
  const [isSubmitting, setIsSubmitting] = useState<Record<string, boolean>>({})
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [inspections, setInspections] = useState<Record<string, PlatformInspectionReport | undefined>>({})
  const [expandedInspections, setExpandedInspections] = useState<Record<string, boolean>>({})
  const [expandedImportSummaries, setExpandedImportSummaries] = useState<Record<string, boolean>>({})
  const [latestImports, setLatestImports] = useState<LatestImportState>({})
  const [browserInspectionStatus, setBrowserInspectionStatus] = useState<BrowserInspectorStatus | null>(
    null
  )
  const [browserInspectionSnapshots, setBrowserInspectionSnapshots] = useState<
    BrowserInspectionSnapshot[]
  >([])
  const [isLaunchingManagedChrome, setIsLaunchingManagedChrome] = useState(false)
  const [managedChromeSession, setManagedChromeSession] = useState<ManagedChromeSessionStatus | null>(
    null
  )
  const [browserInspectionMessage, setBrowserInspectionMessage] = useState('')
  const [capturingManagedChromeTabId, setCapturingManagedChromeTabId] = useState<string | null>(null)
  const [showBrowserDiagnostics, setShowBrowserDiagnostics] = useState(false)
  const [platformSessions, setPlatformSessions] = useState<PlatformSessionStateMap>({})
  const [isSessionSubmitting, setIsSessionSubmitting] = useState<Record<string, boolean>>({})
  const [coupangAutoClickConsented, setCoupangAutoClickConsented] = useState(false)
  const [isCoupangPreferenceSaving, setIsCoupangPreferenceSaving] = useState(false)
  const [legacyCoupangCredentialStored, setLegacyCoupangCredentialStored] = useState(false)

  const refreshLatestImports = () =>
    appApi.platformImportRuns.list().then((value) => {
      if (Array.isArray(value)) {
        setLatestImports(pickLatestImportRuns(value as PlatformImportRunRecord[]))
      }
    })

  const refreshBrowserInspection = () =>
    Promise.all([
      appApi.browserInspector.getStatus(),
      appApi.browserInspectionSnapshots.listLatest(20),
      appApi.browserInspector.getManagedChromeSession()
    ]).then(([statusValue, snapshotsValue, sessionValue]) => {
      setBrowserInspectionStatus(statusValue)
      setBrowserInspectionSnapshots(Array.isArray(snapshotsValue) ? snapshotsValue : [])
      setManagedChromeSession(sessionValue)
    })

  useEffect(() => {
    void appApi.settings.listPlatformCredentials().then((value) => {
      if (Array.isArray(value)) {
        const nextStatus: Record<string, boolean> = {}
        const nextCredentials: CredentialFormState = { ...emptyCredentials }

        value.forEach((entry) => {
          const item = entry as {
            platformCode: string
            connected: boolean
            username: string
            password: string
          }

          nextStatus[item.platformCode] = item.connected
          nextCredentials[item.platformCode as keyof typeof nextCredentials] = {
            username: item.username ?? '',
            password: item.password ?? ''
          }
        })

        setCredentials(nextCredentials)
        setStatus(
          nextStatus
        )
      }
    })

    void refreshLatestImports()
    void refreshBrowserInspection()
    void appApi.platformAuthPreferences.list().then((records) => {
      const preference = records.find((record) => record.platformCode === 'coupangeats')
      setCoupangAutoClickConsented(Boolean(preference?.autoClickLoginButtonConsented))
    })
    void appApi.settings
      .getLegacyPlatformCredentialStatus('coupangeats')
      .then(({ stored }) => setLegacyCoupangCredentialStored(stored))
      .catch(() => undefined)
    void appApi.platformSessions.list().then((records) => {
      setPlatformSessions(
        Object.fromEntries(records.map((record) => [record.platformCode, record])) as PlatformSessionStateMap
      )

      const checkableRecords = records.filter((record) =>
        ['unknown', 'ready', 'expired', 'error'].includes(record.state)
      )
      void Promise.all(
        checkableRecords.map((record) =>
          appApi.platformSessions.check(record.platformCode).then((checkedRecord) => {
            setPlatformSessions((current) => ({
              ...current,
              [checkedRecord.platformCode]: checkedRecord
            }))
          }).catch(() => undefined)
        )
      )
    })
  }, [])

  const runSessionAction = (
    platform: PlatformKey,
    action: () => Promise<PlatformSessionStateRecord>
  ) => {
    setIsSessionSubmitting((current) => ({ ...current, [platform]: true }))
    void action()
      .then((record) => {
        setPlatformSessions((current) => ({ ...current, [platform]: record }))
      })
      .finally(() => {
        setIsSessionSubmitting((current) => ({ ...current, [platform]: false }))
      })
  }

  const updateCoupangAutoClickConsent = (consented: boolean) => {
    setIsCoupangPreferenceSaving(true)
    void appApi.platformAuthPreferences
      .setAutoClickConsent('coupangeats', consented)
      .then((record) => {
        setCoupangAutoClickConsented(record.autoClickLoginButtonConsented)
        setMessages((current) => ({
          ...current,
          coupangeats: record.autoClickLoginButtonConsented
            ? '로그인 버튼을 필요한 경우 정확히 한 번 자동으로 누르도록 허용했습니다.'
            : '로그인 버튼 자동 클릭 허용을 해제했습니다.'
        }))
      })
      .finally(() => setIsCoupangPreferenceSaving(false))
  }

  const clearLegacyCoupangCredential = () => {
    void appApi.settings.clearLegacyPlatformCredential('coupangeats').then(() => {
      setLegacyCoupangCredentialStored(false)
      setMessages((current) => ({
        ...current,
        coupangeats: '앱에 남아 있던 기존 쿠팡이츠 로그인 정보를 삭제했습니다.'
      }))
    })
  }

  const buildSuccessMessage = (summary?: import('../../../shared/contracts').PlatformImportSummary) => {
    if (!summary) {
      return '계정을 저장했습니다.'
    }

    const subject =
      typeof summary.optionGroupCount === 'number'
        ? `메뉴 ${summary.fetchedCount}개와 옵션 그룹 ${summary.optionGroupCount}개`
        : `메뉴 ${summary.fetchedCount}개`
    const suffix = [
      typeof summary.duplicateMenuCount === 'number' && summary.duplicateMenuCount > 0
        ? `중복 ${summary.duplicateMenuCount}건을 정리했습니다.`
        : null,
      summary.fetchMode === 'managed_browser'
        ? '현재 로그인된 전용 크롬 세션에서 읽었습니다.'
        : null
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')

    if (summary.createdMenuCount > 0 || summary.linkedMappingCount > 0) {
      return `${subject}를 가져왔습니다. 새 메뉴 ${summary.createdMenuCount}개, 새 연결 ${summary.linkedMappingCount}개를 반영했습니다.${suffix ? ` ${suffix}` : ''}`
    }

    if (summary.verifiedMappingCount > 0) {
      return `${subject}를 다시 확인했습니다. 기존 연결 ${summary.verifiedMappingCount}개를 유지했습니다.${suffix ? ` ${suffix}` : ''}`
    }

    return `${subject}를 다시 확인했습니다.${suffix ? ` ${suffix}` : ''}`
  }

  const buildErrorMessage = (platform: PlatformKey, value: string) => {
    if (value.startsWith('platform_session_not_ready:')) {
      return value.endsWith('challenge_required')
        ? '추가 인증을 마친 뒤 인증 완료 확인을 눌러 주세요.'
        : '로그인 연결을 확인한 뒤 메뉴를 다시 읽어 주세요.'
    }

    const formatted = formatPlatformImportError(platform, value)
    if (formatted && formatted !== value) {
      return formatted
    }

    return `메뉴를 가져오지 못했습니다. ${value}`
  }

  const getUsageLabel = (usage: PlatformInspectionField['usage']) =>
    usage === 'used' ? '사용' : usage === 'ignored' ? '제외' : '제어'

  const buildBrowserSnapshotSummary = (snapshot: BrowserInspectionSnapshot) =>
    `메뉴 후보 ${snapshot.menuNames.length}개 · 옵션 그룹 ${snapshot.optionGroupNames.length}개 · 버튼 ${snapshot.buttonLabels.length}개 · 입력 ${snapshot.inputHints.length}개 · API ${snapshot.apiEvents.length}건`

  const launchManagedChrome = (options?: { url?: string; platformCode?: PlatformKey }) => {
    setIsLaunchingManagedChrome(true)
    setBrowserInspectionMessage('')

    const platformCode =
      options?.platformCode ?? inferManagedChromePlatformCode(options?.url) ?? 'coupangeats'

    void appApi.browserInspector
      .launchManagedChrome({
        ...(options?.url ? { url: options.url } : {}),
        platformCode,
        autoLogin: true
      })
      .then((statusValue) => {
        setBrowserInspectionStatus(statusValue)
        if (statusValue.managedChromeAutoLoginMessage) {
          setBrowserInspectionMessage(statusValue.managedChromeAutoLoginMessage)
        }
        return appApi.browserInspector.getManagedChromeSession()
      })
      .then((sessionValue) => {
        setManagedChromeSession(sessionValue)
      })
      .finally(() => {
        setIsLaunchingManagedChrome(false)
      })
  }

  const findLatestSnapshotForTab = (tab: ManagedChromeSessionStatus['tabs'][number]) => {
    const exactMatch = browserInspectionSnapshots.find((snapshot) => snapshot.pageUrl === tab.url)
    if (exactMatch) {
      return {
        snapshot: exactMatch,
        statusLabel: '현재 URL 캡처 있음'
      }
    }

    const sameKindMatch = browserInspectionSnapshots.find(
      (snapshot) => snapshot.platformCode === tab.platformCode && snapshot.pageKind === tab.pageKind
    )

    if (sameKindMatch) {
      return {
        snapshot: sameKindMatch,
        statusLabel: '같은 유형 캡처 있음'
      }
    }

    return null
  }

  const captureManagedChromeTab = (tab: ManagedChromeSessionStatus['tabs'][number]) => {
    setCapturingManagedChromeTabId(tab.tabId)
    setBrowserInspectionMessage('')

    void appApi.browserInspector
      .captureManagedChromeTab({ tabId: tab.tabId })
      .then(() => refreshBrowserInspection())
      .then(() => {
        setBrowserInspectionMessage(
          `${buildManagedChromeTabTitle(
            tab.platformCode as PlatformKey | null,
            tab.pageKind,
            tab.title
          )}를 읽어 최근 검사 기록에 저장했습니다.`
        )
      })
      .catch((error) => {
        setBrowserInspectionMessage(
          `현재 탭을 읽지 못했습니다. ${error instanceof Error ? error.message : 'unknown_error'}`
        )
      })
      .finally(() => {
        setCapturingManagedChromeTabId(null)
      })
  }

  const latestMenuSnapshot = browserInspectionSnapshots.find((snapshot) => snapshot.pageKind === 'menu_list')
  const latestOptionSnapshot = browserInspectionSnapshots.find(
    (snapshot) => snapshot.pageKind === 'option_list'
  )
  const latestMenuUrl =
    latestMenuSnapshot?.pageUrl ??
    managedChromeSession?.tabs.find((tab) => tab.pageKind === 'menu_list')?.url
  const latestOptionUrl =
    latestOptionSnapshot?.pageUrl ??
    managedChromeSession?.tabs.find((tab) => tab.pageKind === 'option_list')?.url
  const chromeStatusLabel = browserInspectionStatus?.managedChromeRunning
    ? '전용 프로필 실행 중'
    : browserInspectionStatus?.chromeAvailable
      ? '전용 크롬 준비됨'
      : '크롬 확인 필요'

  const runImport = (
    platform: PlatformKey,
    request: Promise<ImportResponse>,
    options?: { savedCredential?: boolean }
  ) => {
    setIsSubmitting((current) => ({ ...current, [platform]: true }))
    setMessages((current) => ({ ...current, [platform]: '' }))

    void request
      .then((result) => {
        if (result.sessionState) {
          setPlatformSessions((current) => ({
            ...current,
            [platform]: result.sessionState as PlatformSessionStateRecord
          }))
        }
        if (options?.savedCredential) {
          setStatus((current) => ({ ...current, [platform]: true }))
        }

        setMessages((current) => ({
          ...current,
          [platform]:
            (result.importError ? buildErrorMessage(platform, result.importError) : undefined) ??
            buildSuccessMessage(result.importSummary)
        }))
        setInspections((current) => ({
          ...current,
          [platform]: result.importInspection
        }))
        if (result.importInspection?.steps.length) {
          setExpandedInspections((current) => ({ ...current, [platform]: true }))
        }
        void refreshLatestImports()
      })
      .finally(() =>
        setIsSubmitting((current) => ({ ...current, [platform]: false }))
      )
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>가져오기</h1>
        <p>계정을 저장한 뒤 메뉴와 옵션을 다시 읽어옵니다. 자세한 화면 기록은 필요할 때만 펼쳐 확인합니다.</p>
      </header>

      <div className="credential-list">
        {platforms.map((platform) => {
          const sessionState = platformSessions[platform]?.state ?? 'unknown'
          const sessionRecord = platformSessions[platform]
          const isChallenge = sessionState === 'challenge_required'
          const isCredentialRejected =
            sessionState === 'credential_rejected' || sessionState === 'locked_out_risk'
          const isUnsupported = sessionState === 'unsupported'
          const usesApplicationCredential = platform !== 'coupangeats'
          const canImport = usesApplicationCredential
            ? Boolean(status[platform])
            : sessionState === 'ready'
          const sessionGuidance = getPlatformSessionGuidance(platform, sessionRecord)

          return (
          <section
            key={platform}
            className="credential-row"
            data-testid={`platform-auth-${platform}`}
          >
            <div className="credential-main">
              <div className="credential-head">
                <div className="credential-title">
                  <strong>{getPlatformLabel(platform)}</strong>
                  <div className={`status-pill ${getPlatformSessionTone(sessionState)}`}>
                    {getPlatformSessionLabel(sessionState)}
                  </div>
                </div>
                <div className="credential-action-row">
                  {isChallenge ? (
                    <>
                      <button
                        className="secondary-button"
                        disabled={isSessionSubmitting[platform]}
                        onClick={() =>
                          runSessionAction(platform, () => appApi.platformSessions.connect(platform))
                        }
                        type="button"
                      >
                        인증 화면 열기
                      </button>
                      <button
                        className="primary-button"
                        disabled={isSessionSubmitting[platform]}
                        onClick={() =>
                          runSessionAction(platform, () =>
                            appApi.platformSessions.resumeAfterUserAction(platform)
                          )
                        }
                        type="button"
                      >
                        인증 완료 확인
                      </button>
                    </>
                  ) : sessionState === 'ready' ? (
                    <button
                      className="secondary-button"
                      disabled={isSessionSubmitting[platform]}
                      onClick={() =>
                        runSessionAction(platform, () => appApi.platformSessions.check(platform))
                      }
                      type="button"
                    >
                      연결 확인
                    </button>
                  ) : !isCredentialRejected && !isUnsupported ? (
                    <button
                      className="secondary-button"
                      disabled={isSessionSubmitting[platform]}
                      onClick={() =>
                        runSessionAction(platform, () => appApi.platformSessions.connect(platform))
                      }
                      type="button"
                    >
                      {`${getPlatformLabel(platform)} 로그인 열기`}
                    </button>
                  ) : null}
                  {usesApplicationCredential && !isChallenge && !isUnsupported ? <button
                    className={status[platform] ? 'secondary-button' : 'primary-button'}
                    disabled={isSubmitting[platform]}
                    onClick={() =>
                      runImport(
                        platform,
                        appApi.settings.savePlatformCredential({
                          platformCode: platform,
                          username: credentials[platform].username,
                          password: credentials[platform].password
                        }),
                        { savedCredential: true }
                      )
                    }
                  >
                    {isCredentialRejected
                      ? '로그인 정보 수정'
                      : isSubmitting[platform]
                      ? '저장 중'
                      : status[platform]
                        ? '저장'
                        : '저장하고 읽기'}
                  </button> : null}
                  {canImport && !isChallenge && !isCredentialRejected && !isUnsupported ? (
                    <button
                      className="primary-button"
                      disabled={isSubmitting[platform]}
                      onClick={() =>
                        runImport(
                          platform,
                          appApi.settings.importPlatformMenus({
                            platformCode: platform
                          })
                        )
                      }
                    >
                      {isSubmitting[platform] ? '읽는 중' : '다시 읽기'}
                    </button>
                  ) : null}
                </div>
              </div>
              {sessionGuidance ? <p className="credential-message">{sessionGuidance}</p> : null}
              {usesApplicationCredential ? <div className="credential-form">
                <input
                  placeholder="아이디"
                  value={credentials[platform].username}
                  onChange={(event) =>
                    setCredentials((current) => ({
                      ...current,
                      [platform]: { ...current[platform], username: event.target.value }
                    }))
                  }
                />
                <input
                  placeholder="비밀번호"
                  type="password"
                  value={credentials[platform].password}
                  onChange={(event) =>
                    setCredentials((current) => ({
                      ...current,
                      [platform]: { ...current[platform], password: event.target.value }
                    }))
                  }
                />
              </div> : (
                <div className="credential-password-manager">
                  <p className="credential-message">
                    쿠팡이츠 로그인 정보는 앱에 저장하지 않습니다. 전용 Google Chrome 프로필과 Chrome 비밀번호 관리자를 사용합니다.
                  </p>
                  <p className="credential-message">
                    처음 한 번 전용 Chrome에서 직접 로그인하고 로그인 정보를 Chrome 비밀번호 관리자에 저장해 주세요. 이후에는 저장된 입력값이 채워졌는지만 확인합니다.
                  </p>
                  <label className="credential-consent">
                    <input
                      type="checkbox"
                      checked={coupangAutoClickConsented}
                      disabled={isCoupangPreferenceSaving}
                      onChange={(event) => updateCoupangAutoClickConsent(event.target.checked)}
                    />
                    <span>쿠팡이츠 로그인 버튼 1회 자동 클릭 허용</span>
                  </label>
                  {legacyCoupangCredentialStored ? (
                    <button
                      className="secondary-button table-button"
                      type="button"
                      onClick={clearLegacyCoupangCredential}
                    >
                      앱에 남은 기존 쿠팡이츠 로그인 정보 삭제
                    </button>
                  ) : null}
                </div>
              )}
              {latestImports[platform] ? (
                <div className="credential-import-summary">
                  <div className="credential-import-summary-head">
                    <div className="credential-import-summary-copy">
                      <strong>{buildPlatformImportRunTitle(latestImports[platform])}</strong>
                      <span>{buildCompactPlatformImportRunDescription(latestImports[platform])}</span>
                    </div>
                    <div className="credential-import-summary-actions">
                      <span className={`status-pill ${getPlatformImportTone(latestImports[platform])}`}>
                        {getPlatformImportStatusLabel(latestImports[platform])}
                      </span>
                      <button
                        className="secondary-button table-button"
                        onClick={() =>
                          setExpandedImportSummaries((current) => ({
                            ...current,
                            [platform]: !current[platform]
                          }))
                        }
                        type="button"
                      >
                        {expandedImportSummaries[platform] ? '최근 결과 접기' : '최근 결과 보기'}
                      </button>
                    </div>
                  </div>
                  {expandedImportSummaries[platform] ? (
                    <p>{buildPlatformImportRunDescription(latestImports[platform])}</p>
                  ) : null}
                </div>
              ) : null}
              {messages[platform] ? <p className="credential-message">{messages[platform]}</p> : null}
              {inspections[platform]?.steps.length ? (
                <button
                  className="secondary-button inspection-toggle"
                  onClick={() =>
                    setExpandedInspections((current) => ({
                      ...current,
                      [platform]: !current[platform]
                    }))
                  }
                  type="button"
                >
                  {expandedInspections[platform] ? '읽은 화면 접기' : '읽은 화면 보기'}
                </button>
              ) : null}
            </div>
            {inspections[platform]?.steps.length && expandedInspections[platform] ? (
              <section className="inspection-panel">
                <h2>읽은 화면</h2>
                <p className="credential-message">
                  최근 가져오기에서 어떤 화면을 읽었는지와 실제로 쓴 값만 확인할 수 있습니다.
                </p>
                <div className="inspection-list">
                  {inspections[platform]?.steps.map((step, index) => (
                    <article
                      key={`${platform}-${step.recordedAt}-${step.title}-${index}`}
                      className="inspection-step"
                    >
                      <div className="inspection-header">
                        <strong>{step.title}</strong>
                        <span className="status-pill">{step.kind === 'navigation' ? '화면' : step.kind === 'api' ? 'API' : '결과'}</span>
                      </div>
                      {step.detail ? <p>{step.detail}</p> : null}
                      {step.url ? <p>{step.url}</p> : null}
                      {step.pageTitle ? <p>{step.pageTitle}</p> : null}
                      {step.screenshotDataUrl ? (
                        <img
                          className="inspection-image"
                          src={step.screenshotDataUrl}
                          alt={`${step.title} 화면`}
                        />
                      ) : null}
                      {step.visibleTextSnippet ? (
                        <pre className="inspection-snippet">{step.visibleTextSnippet}</pre>
                      ) : null}
                      {step.fields?.length ? (
                        <div className="inspection-field-list">
                          {step.fields.map((field) => (
                            <div
                              key={`${step.title}-${field.name}`}
                              className="inspection-field-row"
                            >
                              <div className="inspection-field-copy">
                                <strong>{field.name}</strong>
                                <span>{field.value}</span>
                              </div>
                              <span className={`field-pill ${field.usage}`}>
                                {getUsageLabel(field.usage)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </section>
          )
        })}
      </div>

      <section className="panel diagnostics-panel">
        <div className="browser-inspection-head">
          <div className="browser-inspection-copy">
            <h2>문제 해결</h2>
            <p>
              자동 수집이 막히거나 화면 구조를 직접 확인해야 할 때만 브라우저 진단을 엽니다.
            </p>
          </div>
          <div className="browser-inspection-actions">
            <button
              className="secondary-button"
              onClick={() => setShowBrowserDiagnostics((current) => !current)}
              type="button"
            >
              {showBrowserDiagnostics ? '브라우저 진단 접기' : '브라우저 진단 보기'}
            </button>
            {!showBrowserDiagnostics ? (
              <>
                <span
                  className={`status-pill ${
                    browserInspectionStatus?.managedChromeRunning
                      ? 'connected'
                      : browserInspectionStatus?.chromeAvailable
                        ? 'pending'
                        : 'failed'
                  }`}
                >
                  {chromeStatusLabel}
                </span>
                <span
                  className={`status-pill ${
                    browserInspectionStatus?.isRunning ? 'connected' : 'failed'
                  }`}
                >
                  {browserInspectionStatus?.isRunning ? '수신 대기 중' : '연결 꺼짐'}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {showBrowserDiagnostics ? (
        <section className="panel browser-inspection-section">
          <div className="browser-inspection-head">
            <div className="browser-inspection-copy">
              <h2>브라우저 검사</h2>
              <p>
                자동 로그인이 막히는 플랫폼은 확장프로그램으로 현재 화면과 API 흔적을 읽어와
                메뉴 구조를 확인합니다.
              </p>
            </div>
            <div className="browser-inspection-actions">
              <div className="browser-inspection-launch-group">
                <button
                  className="secondary-button table-button"
                  type="button"
                  onClick={() => void refreshBrowserInspection()}
                >
                  검사 기록 새로고침
                </button>
                <button
                  className="secondary-button table-button"
                  type="button"
                  disabled={isLaunchingManagedChrome}
                  onClick={() => launchManagedChrome()}
                >
                  {isLaunchingManagedChrome ? '크롬 여는 중' : '전용 크롬 열기'}
                </button>
                <button
                  className="secondary-button table-button"
                  type="button"
                  disabled={isLaunchingManagedChrome}
                  onClick={() => launchManagedChrome({ platformCode: 'baemin' })}
                >
                  배민 메뉴 열기
                </button>
                <button
                  className="secondary-button table-button"
                  type="button"
                  disabled={isLaunchingManagedChrome || !latestMenuUrl}
                  onClick={() => launchManagedChrome({ url: latestMenuUrl })}
                >
                  마지막 메뉴 페이지
                </button>
                <button
                  className="secondary-button table-button"
                  type="button"
                  disabled={isLaunchingManagedChrome || !latestOptionUrl}
                  onClick={() => launchManagedChrome({ url: latestOptionUrl })}
                >
                  마지막 옵션 페이지
                </button>
              </div>
              <span
                className={`status-pill ${
                  browserInspectionStatus?.managedChromeRunning
                    ? 'connected'
                    : browserInspectionStatus?.chromeAvailable
                      ? 'pending'
                      : 'failed'
                }`}
              >
                {chromeStatusLabel}
              </span>
              <span
                className={`status-pill ${
                  browserInspectionStatus?.isRunning ? 'connected' : 'failed'
                }`}
              >
                {browserInspectionStatus?.isRunning ? '수신 대기 중' : '연결 꺼짐'}
              </span>
            </div>
          </div>

          <p className="browser-inspection-summary">
            전용 크롬은 일반 사용 크롬과 분리된 프로필로 열립니다. 확장프로그램을 항상 같은 상태로
            유지해서 캡처와 반자동 조작을 같은 환경에서 반복할 수 있습니다. 배민과 쿠팡이츠는
            저장된 계정이 있으면 로그인 탭을 자동 제출할 수 있고, 쿠팡이츠는 이 전용 크롬에
            로그인해 두면 다시 가져오기가 현재 세션을 재사용해 메뉴와 옵션을 읽을 수 있습니다.
          </p>

          <div className="browser-inspection-meta">
            <div className="browser-inspection-meta-item">
              <strong>수신 주소</strong>
              <span>{browserInspectionStatus?.receiverUrl || '로컬 수신기를 시작하지 못했습니다.'}</span>
            </div>
            <div className="browser-inspection-meta-item">
              <strong>확장프로그램 폴더</strong>
              <span>{browserInspectionStatus?.extensionPath || '확장프로그램 경로를 아직 확인하지 못했습니다.'}</span>
            </div>
            <div className="browser-inspection-meta-item">
              <strong>크롬 실행 파일</strong>
              <span>
                {browserInspectionStatus?.chromePath ||
                  browserInspectionStatus?.chromeError ||
                  '아직 찾지 못했습니다.'}
              </span>
            </div>
            <div className="browser-inspection-meta-item">
              <strong>전용 프로필</strong>
              <span>{browserInspectionStatus?.chromeProfilePath || '아직 준비되지 않았습니다.'}</span>
            </div>
            <div className="browser-inspection-meta-item">
              <strong>마지막 실행 페이지</strong>
              <span>{browserInspectionStatus?.lastLaunchUrl || '아직 열지 않았습니다.'}</span>
            </div>
            <div className="browser-inspection-meta-item">
              <strong>빠른 열기 기준</strong>
              <span>
                메뉴 페이지 {latestMenuUrl ? '준비됨' : '없음'} · 옵션 페이지{' '}
                {latestOptionUrl ? '준비됨' : '없음'}
              </span>
            </div>
          </div>

          <div className="browser-inspection-session">
            <div className="browser-inspection-session-head">
              <div className="browser-inspection-copy">
                <h2>현재 전용 크롬 탭</h2>
                <p>앱이 전용 크롬의 현재 로그인 세션을 읽어온 결과입니다.</p>
              </div>
              <div className="browser-inspection-actions">
                <span className={`status-pill ${managedChromeSession?.connected ? 'connected' : 'failed'}`}>
                  {managedChromeSession?.connected ? `탭 ${managedChromeSession.tabs.length}개 연결됨` : '세션 연결 안 됨'}
                </span>
              </div>
            </div>
            <div className="browser-inspection-meta">
              <div className="browser-inspection-meta-item">
                <strong>디버깅 주소</strong>
                <span>{managedChromeSession?.endpointUrl || 'http://127.0.0.1:39482'}</span>
              </div>
              <div className="browser-inspection-meta-item">
                <strong>세션 상태</strong>
                <span>{managedChromeSession?.connected ? '탭 목록 읽기 성공' : managedChromeSession?.error || '아직 확인하지 못했습니다.'}</span>
              </div>
            </div>
            {browserInspectionMessage ? (
              <p className="browser-inspection-summary browser-inspection-message">
                {browserInspectionMessage}
              </p>
            ) : null}
            <div className="browser-inspection-snapshot-list">
              {managedChromeSession?.tabs.length ? (
                managedChromeSession.tabs.map((tab) => {
                  const latestSnapshotMatch = findLatestSnapshotForTab(tab)

                  return (
                    <article key={tab.tabId} className="browser-inspection-snapshot-card">
                      <div className="browser-inspection-snapshot-head">
                        <div>
                          <strong>
                            {buildManagedChromeTabTitle(
                              tab.platformCode as PlatformKey | null,
                              tab.pageKind,
                              tab.title
                            )}
                          </strong>
                          <p>{tab.host || 'host 없음'}</p>
                        </div>
                        <span className="status-pill">{getManagedChromePageLabel(tab.pageKind)}</span>
                      </div>
                      <div className="browser-inspection-tab-meta">
                        <span
                          className={`status-pill ${latestSnapshotMatch ? 'connected' : 'pending'}`}
                        >
                          {latestSnapshotMatch ? latestSnapshotMatch.statusLabel : '저장된 캡처 없음'}
                        </span>
                        <span className="browser-inspection-summary">
                          {latestSnapshotMatch?.snapshot
                            ? `최근 캡처 ${formatDateTimeLabel(latestSnapshotMatch.snapshot.capturedAt)}`
                            : '앱에서 바로 읽어 최신 화면을 저장할 수 있습니다.'}
                        </span>
                      </div>
                      <p className="browser-inspection-summary">
                        {(tab.platformCode ?? 'unknown')} · {tab.type}
                      </p>
                      {tab.title ? <p className="browser-inspection-summary">{tab.title}</p> : null}
                      <p className="browser-inspection-summary">{tab.url}</p>
                      <div className="browser-inspection-card-actions">
                        <button
                          className="secondary-button table-button"
                          type="button"
                          disabled={capturingManagedChromeTabId === tab.tabId}
                          onClick={() => captureManagedChromeTab(tab)}
                        >
                          {capturingManagedChromeTabId === tab.tabId ? '읽는 중' : '현재 탭 읽기'}
                        </button>
                      </div>
                    </article>
                  )
                })
              ) : (
                <div className="browser-inspection-empty">
                  <strong>아직 읽은 탭이 없습니다.</strong>
                  <span>전용 크롬이 열려 있어도 디버깅 포트에 붙지 못하면 목록이 비어 있을 수 있습니다.</span>
                </div>
              )}
            </div>
          </div>

          <div className="browser-inspection-snapshot-list">
            {browserInspectionSnapshots.length ? (
              browserInspectionSnapshots.map((snapshot) => (
                <article
                  key={snapshot.snapshotId}
                  className="browser-inspection-snapshot-card"
                >
                  <div className="browser-inspection-snapshot-head">
                    <div>
                      <strong>{snapshot.pageTitle}</strong>
                      <p>{snapshot.host}</p>
                    </div>
                    <span className="status-pill">{snapshot.platformCode}</span>
                  </div>
                  <p className="browser-inspection-summary">{buildBrowserSnapshotSummary(snapshot)}</p>
                  <p className="browser-inspection-summary">{snapshot.menuNames.join(', ') || '메뉴 후보 없음'}</p>
                  {snapshot.textSnippet ? (
                    <pre className="inspection-snippet">{snapshot.textSnippet}</pre>
                  ) : null}
                  {snapshot.apiEvents[0]?.url ? (
                    <div className="browser-inspection-api-list">
                      <strong>최근 API</strong>
                      <span>{snapshot.apiEvents[0].url}</span>
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="browser-inspection-empty">
                <strong>아직 저장된 검사 기록이 없습니다.</strong>
                <span>사장님 사이트를 일반 브라우저로 연 뒤 확장프로그램에서 전체 캡처 보내기를 실행하면 바로 쌓입니다.</span>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </section>
  )
}
