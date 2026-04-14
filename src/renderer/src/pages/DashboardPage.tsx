import { useEffect, useMemo, useState } from 'react'
import type {
  AgentActionPlanItem,
  AgentActionPlanReport,
  AgentReportEnvelope,
  MenuRecord,
  PlatformImportChangeRecord,
  PlatformImportRunRecord,
  SyncPreviewResult
} from '../../../shared/contracts'
import { appApi } from '../lib/api'
import { formatSyncSummary } from '../lib/format-sync-summary'
import { SyncPreviewDialog } from '../components/SyncPreviewDialog'
import { formatNeedsReviewLabel, getPlatformLabel } from '../lib/menu-source-labels'
import {
  buildCompactPlatformImportRunDescription,
  formatPlatformImportError,
  getPlatformImportStatusLabel,
  getPlatformImportTone,
  pickLatestImportRuns
} from '../lib/platform-imports'

type PlatformStatus = {
  platformCode: 'baemin' | 'coupangeats' | 'ddangyo'
  name: string
  connected: boolean
}

type SyncRunSummary = {
  syncRunId: string
  startedAt: string
  resultSummary?: string
}

type ImportChangeSummary = {
  label: string
  count: number
}

const getActionPriorityLabel = (priority: AgentActionPlanItem['priority']) => {
  if (priority === 'high') {
    return '즉시'
  }

  if (priority === 'medium') {
    return '검토'
  }

  return '참고'
}

const defaultPlatformStatuses: PlatformStatus[] = [
  { platformCode: 'baemin', name: '배민', connected: false },
  { platformCode: 'coupangeats', name: '쿠팡이츠', connected: false },
  { platformCode: 'ddangyo', name: '땡겨요', connected: false }
]

const getImportChangeLabel = (change: PlatformImportChangeRecord) => {
  const entityLabel = change.entityType === 'menu' ? '메뉴' : '옵션'

  if (change.changeType === 'created') {
    return change.entityType === 'menu' ? '새 메뉴' : '새 옵션'
  }

  if (change.changeType === 'missing_suspected') {
    return `누락 의심 ${entityLabel}`
  }

  if (change.changeType === 'absent_confirmed') {
    return `플랫폼에 없음 ${entityLabel}`
  }

  if (change.changeType === 'resurfaced') {
    return `재등장 ${entityLabel === '메뉴' ? '항목' : '옵션'}`
  }

  if (change.changeType === 'option_signature_changed') {
    return '옵션 변경'
  }

  return `${entityLabel} 변경`
}

const summarizeImportChanges = (changes: PlatformImportChangeRecord[]) => {
  const counts = new Map<string, number>()

  for (const change of changes) {
    const label = getImportChangeLabel(change)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([label, count]): ImportChangeSummary => ({ label, count }))
    .sort((left, right) => {
      const priority = (label: string) => {
        if (label.startsWith('새 메뉴')) return 0
        if (label.startsWith('누락 의심 메뉴')) return 1
        if (label.startsWith('플랫폼에 없음 메뉴')) return 2
        if (label.startsWith('누락 의심 옵션')) return 3
        if (label.startsWith('플랫폼에 없음 옵션')) return 4
        if (label.startsWith('재등장')) return 5
        return 6
      }

      return priority(left.label) - priority(right.label) || left.label.localeCompare(right.label, 'ko-KR')
    })
}

export const DashboardPage = () => {
  const [previewSummary, setPreviewSummary] = useState<SyncPreviewResult | null>(null)
  const [nextActionPlan, setNextActionPlan] = useState<AgentReportEnvelope<AgentActionPlanReport> | null>(
    null
  )
  const [previewDialog, setPreviewDialog] = useState<SyncPreviewResult | null>(null)
  const [summary, setSummary] = useState('아직 반영한 기록이 없습니다.')
  const [platformStatuses, setPlatformStatuses] = useState<PlatformStatus[]>(defaultPlatformStatuses)
  const [importChanges, setImportChanges] = useState<PlatformImportChangeRecord[]>([])
  const [menuNamesById, setMenuNamesById] = useState<Record<string, string>>({})
  const [latestImports, setLatestImports] = useState<
    Partial<Record<PlatformStatus['platformCode'], PlatformImportRunRecord>>
  >({})

  useEffect(() => {
    void appApi.menus.list().then((value) => {
      if (!Array.isArray(value)) {
        return
      }

      setMenuNamesById(
        (value as MenuRecord[]).reduce<Record<string, string>>((result, menu) => {
          const baseName = menu.baseName?.trim()
          if (baseName) {
            result[menu.menuId] = baseName
          }
          return result
        }, {})
      )
    })

    void appApi.settings.getPlatformCredentialStatus().then((value) => {
      if (!Array.isArray(value)) {
        return
      }

      setPlatformStatuses(
        defaultPlatformStatuses.map((platform) => {
          const matched = value.find(
            (entry) =>
              typeof entry === 'object' &&
              entry &&
              'platformCode' in entry &&
              (entry as { platformCode?: string }).platformCode === platform.platformCode
          ) as { connected?: boolean } | undefined

          return {
            ...platform,
            connected: Boolean(matched?.connected)
          }
        })
      )
    })

    void appApi.syncRuns.list().then((value) => {
      if (!Array.isArray(value) || value.length === 0) {
        return
      }

      const latestRun = value[0] as SyncRunSummary
      if (latestRun.resultSummary) {
        setSummary(formatSyncSummary(latestRun.resultSummary))
      }
    })

    void appApi.sync.preview().then((value) => {
      setPreviewSummary(value as SyncPreviewResult)
    })

    void appApi.agentReports.getNextActionPlan({ limit: 5 }).then((value) => {
      setNextActionPlan(value as AgentReportEnvelope<AgentActionPlanReport>)
    })

    void Promise.all([appApi.platformImportRuns.list(), appApi.platformImportChanges.listLatest(200)]).then(
      ([runValue, changeValue]) => {
        const runs = Array.isArray(runValue) ? (runValue as PlatformImportRunRecord[]) : []
        const changes = Array.isArray(changeValue)
          ? (changeValue as PlatformImportChangeRecord[])
          : []
        const latestImportRunId = runs[0]?.importRunId

        setLatestImports(pickLatestImportRuns(runs))
        setImportChanges(
          latestImportRunId
            ? changes.filter((change) => change.importRunId === latestImportRunId)
            : []
        )
      }
    )
  }, [])

  const connectedPlatformCount = useMemo(
    () => platformStatuses.filter((platform) => platform.connected).length,
    [platformStatuses]
  )
  const importChangeSummaries = useMemo(
    () => summarizeImportChanges(importChanges),
    [importChanges]
  )
  const buildLatestImportLabel = (run?: PlatformImportRunRecord) => {
    if (!run) {
      return '아직 가져오기 기록이 없습니다.'
    }

    const compactDescription = buildCompactPlatformImportRunDescription(run)
    return compactDescription ?? formatPlatformImportError(run.platformCode, run.errorMessage)
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>대시보드</h1>
        <p>저장한 메뉴를 확인하고 배달앱 반영 준비 상태를 점검합니다.</p>
      </header>

      <div className="summary-grid">
        <article className="summary-card">
          <strong>{previewSummary?.items.length ?? 0}</strong>
          <span>변경 예정 메뉴</span>
        </article>
        <article className="summary-card">
          <strong>{summary}</strong>
          <span>마지막 반영</span>
        </article>
        <article className="summary-card">
          <strong>{`${connectedPlatformCount} / ${platformStatuses.length}`}</strong>
          <span>연결된 플랫폼</span>
        </article>
        <article className="summary-card">
          <strong>{nextActionPlan?.data.byPriority.high ?? 0}</strong>
          <span>다음 작업</span>
        </article>
      </div>

      <section className="panel">
        <div className="inline-actions">
          <button
            className="primary-button"
            onClick={() =>
              void appApi.sync.preview().then((value) => {
                const nextPreview = value as SyncPreviewResult
                setPreviewSummary(nextPreview)
                setPreviewDialog(nextPreview)
              })
            }
          >
            반영 미리보기
          </button>
          <span>변경 예정 내용은 실행 전에 다시 확인합니다.</span>
        </div>
      </section>

      {nextActionPlan ? (
        <section className="panel">
          <div className="page-header">
            <h2>지금 할 일</h2>
            <p>{nextActionPlan.summary}</p>
          </div>
          <div className="action-plan-list">
            {nextActionPlan.data.items.map((item) => (
              <article key={item.id} className="action-plan-row">
                <div className="action-plan-head">
                  <div className="action-plan-copy">
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span className={`action-priority-pill ${item.priority}`}>
                    {getActionPriorityLabel(item.priority)}
                  </span>
                </div>
                {item.evidence.length ? (
                  <ul className="action-plan-evidence-list">
                    {item.evidence.map((evidence) => (
                      <li key={`${item.id}:${evidence}`}>{evidence}</li>
                    ))}
                  </ul>
                ) : null}
                {item.commands[0] ? (
                  <div className="action-plan-command">
                    <strong>{item.commands[0].label}</strong>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {previewDialog ? (
        <SyncPreviewDialog
          items={previewDialog.items}
          onConfirm={(selectedItems) =>
            void appApi.sync.runItems(selectedItems).then((result) => {
              const next = result as { summary?: string }
              setSummary(formatSyncSummary(next.summary) || '아직 반영한 기록이 없습니다.')
              void appApi.sync.preview().then((value) => {
                setPreviewSummary(value as SyncPreviewResult)
              })
              setPreviewDialog(null)
            })
          }
        />
      ) : null}

      {previewSummary?.needsReview.length ? (
        <section className="panel">
          <div className="page-header">
            <h2>검토 필요</h2>
            <p>매핑이 없거나 가게 연결이 애매한 메뉴는 먼저 확인한 뒤 반영합니다.</p>
          </div>
          <div className="history-list">
            {previewSummary.needsReview.map((item) => (
              <article key={item.menuId} className="history-row">
                <strong>
                  {item.platformCode
                    ? `${getPlatformLabel(item.platformCode)} · ${
                        menuNamesById[item.menuId] ?? '기준 메뉴'
                      }`
                    : menuNamesById[item.menuId] ?? '기준 메뉴'}
                </strong>
                <span>{formatNeedsReviewLabel(item)}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="page-header">
          <h2>플랫폼 최근 가져오기</h2>
          <p>플랫폼별 마지막 수집 상태를 짧게 다시 확인합니다.</p>
        </div>
        <div className="status-list">
          {defaultPlatformStatuses.map((platform) => {
            const latestRun = latestImports[platform.platformCode]
            const detail = buildLatestImportLabel(latestRun)

            return (
              <article key={`import-${platform.platformCode}`} className="status-row">
                <div className="status-row-copy">
                  <strong>{platform.name}</strong>
                  <span>{`${platform.name} · ${detail}`}</span>
                </div>
                <span className={`status-pill ${getPlatformImportTone(latestRun)}`}>
                  {getPlatformImportStatusLabel(latestRun)}
                </span>
              </article>
            )
          })}
        </div>
      </section>

      <section className="panel">
        <div className="page-header">
          <h2>이번 가져오기 변경점</h2>
          <p>가장 최근 수집 1회에서 바뀐 메뉴와 옵션만 짧게 다시 확인합니다.</p>
        </div>
        {importChangeSummaries.length ? (
          <div className="change-summary-list">
            {importChangeSummaries.map((item) => (
              <article key={item.label} className="change-summary-row">
                <strong>{`${item.label} ${item.count}개`}</strong>
              </article>
            ))}
          </div>
        ) : (
          <p className="source-empty">최근 가져오기 변경점이 없습니다.</p>
        )}
      </section>

      <section className="status-list">
        {platformStatuses.map((platform) => (
          <article key={platform.name} className="status-row">
            <strong>{platform.name}</strong>
            <span className={`status-pill ${platform.connected ? 'connected' : 'pending'}`}>
              {platform.connected ? '연결됨' : '연결 대기'}
            </span>
          </article>
        ))}
      </section>
    </section>
  )
}
