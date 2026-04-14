import { useEffect, useState } from 'react'
import { appApi } from '../lib/api'
import { formatSyncSummary } from '../lib/format-sync-summary'
import type {
  PlatformCode,
  PlatformImportRunRecord,
  SyncRunItemRecord,
  SyncRunRecord
} from '../../../shared/contracts'
import {
  formatSyncErrorMessage,
  formatSyncFailureContext
} from '../../../shared/sync-error-catalog'
import { formatDateTimeLabel, getPlatformLabel } from '../lib/menu-source-labels'
import {
  buildPlatformImportRunDescription,
  getPlatformImportStatusLabel
} from '../lib/platform-imports'

type HistoryRun = SyncRunRecord

const platformLabels: Record<PlatformCode, string> = {
  baemin: '배민',
  coupangeats: '쿠팡이츠',
  ddangyo: '땡겨요'
}

const parseAfterValue = (value: string) => {
  try {
    const parsed = JSON.parse(value) as { name?: string; price?: number }
    return {
      name: typeof parsed.name === 'string' ? parsed.name : null,
      price: typeof parsed.price === 'number' ? parsed.price : null
    }
  } catch {
    return {
      name: null,
      price: null
    }
  }
}

const formatPrice = (value: number | null) =>
  typeof value === 'number' ? `${value.toLocaleString('ko-KR')}원` : null

const summarizeItem = (item: SyncRunItemRecord) => {
  const next = parseAfterValue(item.afterValue)
  const label = item.beforeValue ?? next.name ?? item.menuId
  const nameChanged =
    typeof item.beforeValue === 'string' &&
    typeof next.name === 'string' &&
    item.beforeValue !== next.name
  const priceText = formatPrice(next.price)
  const parts = [platformLabels[item.platformCode]]

  if (nameChanged && next.name) {
    parts.push(`${item.beforeValue} -> ${next.name}`)
  } else if (next.name) {
    parts.push(next.name)
  } else if (item.beforeValue) {
    parts.push(item.beforeValue)
  }

  if (priceText) {
    parts.push(priceText)
  }

  return {
    label,
    detail: parts.join(' · ')
  }
}

export const HistoryPage = ({ initialRuns = [] as HistoryRun[] }) => {
  const [runs, setRuns] = useState<HistoryRun[]>(initialRuns)
  const [importRuns, setImportRuns] = useState<PlatformImportRunRecord[]>([])

  useEffect(() => {
    if (initialRuns.length > 0) {
      void appApi.platformImportRuns.list().then((value) => {
        if (Array.isArray(value)) {
          setImportRuns(value as PlatformImportRunRecord[])
        }
      })
      return
    }

    void appApi.syncRuns.list().then((value) => {
      if (Array.isArray(value)) {
        setRuns(value as HistoryRun[])
      }
    })

    void appApi.platformImportRuns.list().then((value) => {
      if (Array.isArray(value)) {
        setImportRuns(value as PlatformImportRunRecord[])
      }
    })
  }, [initialRuns])

  return (
    <section className="page">
      <header className="page-header">
        <h1>실행 기록</h1>
        <p>반영 시간과 플랫폼별 결과를 나중에 다시 확인할 수 있습니다.</p>
      </header>

      <section className="panel">
        <div className="page-header">
          <h2>가져오기 기록</h2>
          <p>플랫폼 수집이 어디까지 진행됐는지 실패 사유까지 함께 남깁니다.</p>
        </div>
        <div className="history-list">
          {importRuns.length === 0 ? (
            <article className="history-row">
              <strong>아직 가져오기 기록이 없습니다.</strong>
              <span>계정을 저장하거나 다시 가져오기를 실행하면 여기에 저장됩니다.</span>
            </article>
          ) : (
            importRuns.map((run) => (
              <article key={run.importRunId} className="history-row">
                <div className="history-summary">
                  <div className="history-summary-copy">
                    <strong>{formatDateTimeLabel(run.finishedAt ?? run.startedAt) || run.startedAt}</strong>
                    <span>{`${getPlatformLabel(run.platformCode)} · ${getPlatformImportStatusLabel(run)}`}</span>
                  </div>
                  <span className={`status-pill ${run.status === 'partial_failed' ? 'failed' : run.status === 'running' ? 'pending' : 'connected'}`}>
                    {getPlatformImportStatusLabel(run)}
                  </span>
                </div>
                <p className={run.status === 'partial_failed' ? 'history-item-error' : 'history-item-detail'}>
                  {buildPlatformImportRunDescription(run)}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <div className="history-list">
        {runs.length === 0 ? (
          <article className="history-row">
            <strong>아직 실행 기록이 없습니다.</strong>
            <span>첫 반영을 실행하면 여기에 저장됩니다.</span>
          </article>
        ) : (
          runs.map((run) => (
            <article key={run.syncRunId} className="history-row">
              <div className="history-summary">
                <div className="history-summary-copy">
                  <strong>{formatDateTimeLabel(run.startedAt) || run.startedAt}</strong>
                  <span>{formatSyncSummary(run.resultSummary)}</span>
                </div>
                <span className={`status-pill ${run.items?.some((item) => item.status === 'failed') ? 'failed' : 'connected'}`}>
                  {run.items?.length ? `메뉴 ${run.items.length}건` : '상세 없음'}
                </span>
              </div>
              {run.items?.length ? (
                <div className="history-item-list">
                  {run.items.map((item) => {
                    const summary = summarizeItem(item)
                    const errorMessage = formatSyncErrorMessage(
                      item.errorCode,
                      item.errorMessage
                    )
                    const failureContext = formatSyncFailureContext(item.failureContext)

                    return (
                      <article key={item.syncRunItemId} className="history-item">
                        <div className="history-item-head">
                          <strong>{summary.label}</strong>
                          <span
                            className={`status-pill ${item.status === 'failed' ? 'failed' : 'connected'}`}
                          >
                            {item.status === 'failed' ? '실패' : '성공'}
                          </span>
                        </div>
                        <span className="history-item-detail">{summary.detail}</span>
                        {errorMessage ? (
                          <p className="history-item-error">{errorMessage}</p>
                        ) : null}
                        {failureContext ? (
                          <div className="history-item-context">
                            <p className="history-item-context-summary">{failureContext.summary}</p>
                            {failureContext.meta ? (
                              <p className="history-item-context-meta">{failureContext.meta}</p>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  )
}
