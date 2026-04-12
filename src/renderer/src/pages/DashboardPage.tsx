import { useState } from 'react'
import type { SyncPreviewResult } from '../../../shared/contracts'
import { appApi } from '../lib/api'
import { SyncPreviewDialog } from '../components/SyncPreviewDialog'

const platformStatuses = [
  { name: '배민', status: '연결 대기' },
  { name: '쿠팡이츠', status: '연결 대기' },
  { name: '땡겨요', status: '연결 대기' }
]

export const DashboardPage = () => {
  const [preview, setPreview] = useState<SyncPreviewResult | null>(null)
  const [summary, setSummary] = useState('')

  return (
    <section className="page">
      <header className="page-header">
        <h1>대시보드</h1>
        <p>저장한 메뉴를 확인하고 배달앱 반영 준비 상태를 점검합니다.</p>
      </header>

      <div className="summary-grid">
        <article className="summary-card">
          <strong>{preview?.items.length ?? 0}</strong>
          <span>변경 예정 메뉴</span>
        </article>
        <article className="summary-card">
          <strong>{summary || '준비 전'}</strong>
          <span>마지막 반영</span>
        </article>
        <article className="summary-card">
          <strong>3개</strong>
          <span>연동 대상 플랫폼</span>
        </article>
      </div>

      <section className="panel">
        <div className="inline-actions">
          <button
            className="primary-button"
            onClick={() =>
              void appApi.sync.preview().then((value) => setPreview(value as SyncPreviewResult))
            }
          >
            전체 반영
          </button>
          <span>변경 예정 내용은 실행 전에 다시 확인합니다.</span>
        </div>
      </section>

      {preview ? (
        <SyncPreviewDialog
          items={preview.items}
          onConfirm={() =>
            void appApi.sync.run().then((result) => {
              const next = result as { summary?: string }
              setSummary(next.summary ?? '')
            })
          }
        />
      ) : null}

      {preview?.needsReview.length ? (
        <section className="panel">
          <div className="page-header">
            <h2>검토 필요</h2>
            <p>아직 연결되지 않은 메뉴는 매핑 검토에서 먼저 연결해야 합니다.</p>
          </div>
          <div className="history-list">
            {preview.needsReview.map((item) => (
              <article key={item.menuId} className="history-row">
                <strong>{item.menuId}</strong>
                <span>{item.reason}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="status-list">
        {platformStatuses.map((platform) => (
          <article key={platform.name} className="status-row">
            <strong>{platform.name}</strong>
            <span className="status-pill">{platform.status}</span>
          </article>
        ))}
      </section>
    </section>
  )
}
