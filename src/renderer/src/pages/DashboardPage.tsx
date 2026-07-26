import { useEffect, useMemo, useState } from 'react'
import type {
  AgentActionPlanItem,
  AgentActionPlanReport,
  AgentReportEnvelope,
  MenuRecord,
  PlatformImportChangeRecord,
  PlatformImportRunRecord,
  PlatformCode,
  SyncPreviewResult
} from '../../../shared/contracts'
import { PLATFORM_CODES } from '../../../shared/platforms'
import { appApi } from '../lib/api'
import { formatSyncSummary } from '../lib/format-sync-summary'
import { SyncPreviewDialog } from '../components/SyncPreviewDialog'
import { ReviewInboxPanel } from '../components/ReviewInboxPanel'
import { formatNeedsReviewLabel, getPlatformLabel } from '../lib/menu-source-labels'
import {
  buildCompactPlatformImportRunDescription,
  formatPlatformImportError,
  getPlatformImportStatusLabel,
  getPlatformImportTone,
  pickLatestImportRuns
} from '../lib/platform-imports'

type PlatformStatus = {
  platformCode: PlatformCode
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

const defaultPlatformStatuses: PlatformStatus[] = PLATFORM_CODES.map((platformCode) => ({
  platformCode,
  name: getPlatformLabel(platformCode),
  connected: false
}))

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
  const [showImportChanges, setShowImportChanges] = useState(false)
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
        <h1>홈</h1>
        <p>지금 처리할 일과 플랫폼 상태만 먼저 보고, 세부 변화는 필요할 때 펼쳐 확인합니다.</p>
      </header>

      <ReviewInboxPanel />

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
          <h2>플랫폼 상태</h2>
          <p>수집이 멈췄는지, 다시 가져와야 하는지만 먼저 확인합니다.</p>
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
        <div className="panel-toolbar dashboard-detail-toolbar">
          <div className="workspace-toolbar-copy">
            <strong>최근 변화</strong>
            <span>가장 최근 수집에서 바뀐 메뉴와 옵션만 필요할 때 펼쳐 확인합니다.</span>
          </div>
          <button
            className="secondary-button"
            onClick={() => setShowImportChanges((current) => !current)}
            type="button"
          >
            {showImportChanges ? '최근 변화 접기' : '최근 변화 보기'}
          </button>
        </div>
        {showImportChanges ? (
          <div className="dashboard-detail-content">
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
          </div>
        ) : null}
      </section>
    </section>
  )
}
