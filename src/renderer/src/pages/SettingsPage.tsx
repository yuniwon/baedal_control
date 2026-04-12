import { useEffect, useState } from 'react'
import type { PlatformImportSummary } from '../../../shared/contracts'
import { appApi } from '../lib/api'

const platforms = ['baemin', 'coupangeats', 'ddangyo'] as const

export const SettingsPage = () => {
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [credentials, setCredentials] = useState<Record<string, { username: string; password: string }>>({
    baemin: { username: '', password: '' },
    coupangeats: { username: '', password: '' },
    ddangyo: { username: '', password: '' }
  })
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({})
  const [messages, setMessages] = useState<Record<string, string>>({})

  useEffect(() => {
    void appApi.settings.listPlatformCredentials().then((value) => {
      if (Array.isArray(value)) {
        const nextStatus: Record<string, boolean> = {}
        const nextCredentials = {
          baemin: { username: '', password: '' },
          coupangeats: { username: '', password: '' },
          ddangyo: { username: '', password: '' }
        }

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
  }, [])

  const buildSuccessMessage = (summary?: PlatformImportSummary) => {
    if (!summary) {
      return '계정을 저장했습니다.'
    }

    return `메뉴 ${summary.fetchedCount}개를 가져와 ${summary.linkedMappingCount}개 연결했습니다.`
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>계정 연결</h1>
        <p>각 사장님 사이트 계정을 PC에만 저장하고, 다음 실행부터 바로 사용합니다.</p>
      </header>

      <div className="credential-list">
        {platforms.map((platform) => (
          <section key={platform} className="credential-row">
            <div>
              <strong>{platform === 'baemin' ? '배민' : platform === 'coupangeats' ? '쿠팡이츠' : '땡겨요'}</strong>
              <div className="status-pill">{status[platform] ? '저장됨' : '미저장'}</div>
            </div>
            <div className="credential-form">
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
              <button
                className="secondary-button"
                disabled={isSaving[platform]}
                onClick={() => {
                  setIsSaving((current) => ({ ...current, [platform]: true }))
                  setMessages((current) => ({ ...current, [platform]: '' }))

                  void appApi.settings
                    .savePlatformCredential({
                      platformCode: platform,
                      username: credentials[platform].username,
                      password: credentials[platform].password
                    })
                    .then((result) => {
                      setStatus((current) => ({ ...current, [platform]: true }))
                      setMessages((current) => ({
                        ...current,
                        [platform]:
                          result.importError ??
                          buildSuccessMessage(result.importSummary)
                      }))
                    })
                    .finally(() =>
                      setIsSaving((current) => ({ ...current, [platform]: false }))
                    )
                }}
              >
                {isSaving[platform] ? '저장 중' : '저장'}
              </button>
            </div>
            {messages[platform] ? <p>{messages[platform]}</p> : null}
          </section>
        ))}
      </div>
    </section>
  )
}
