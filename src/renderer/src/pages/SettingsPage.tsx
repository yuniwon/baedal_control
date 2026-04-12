import { useEffect, useState } from 'react'
import { appApi } from '../lib/api'

const platforms = ['baemin', 'coupangeats', 'ddangyo'] as const

export const SettingsPage = () => {
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [credentials, setCredentials] = useState<Record<string, { username: string; password: string }>>({
    baemin: { username: '', password: '' },
    coupangeats: { username: '', password: '' },
    ddangyo: { username: '', password: '' }
  })

  useEffect(() => {
    void appApi.settings.getPlatformCredentialStatus().then((value) => {
      if (Array.isArray(value)) {
        setStatus(
          Object.fromEntries(
            value.map((entry) => {
              const item = entry as { platformCode: string; connected: boolean }
              return [item.platformCode, item.connected]
            })
          )
        )
      }
    })
  }, [])

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
                onClick={() =>
                  void appApi.settings.savePlatformCredential({
                    platformCode: platform,
                    username: credentials[platform].username,
                    password: credentials[platform].password
                  }).then(() =>
                    setStatus((current) => ({ ...current, [platform]: true }))
                  )
                }
              >
                저장
              </button>
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
