import { useEffect, useState } from 'react'
import { appApi } from '../lib/api'

type HistoryRun = {
  syncRunId: string
  startedAt: string
  resultSummary: string
}

export const HistoryPage = ({ initialRuns = [] as HistoryRun[] }) => {
  const [runs, setRuns] = useState<HistoryRun[]>(initialRuns)

  useEffect(() => {
    if (initialRuns.length > 0) {
      return
    }

    void appApi.syncRuns.list().then((value) => {
      if (Array.isArray(value)) {
        setRuns(value as HistoryRun[])
      }
    })
  }, [initialRuns])

  return (
    <section className="page">
      <header className="page-header">
        <h1>실행 기록</h1>
        <p>반영 시간과 플랫폼별 결과를 나중에 다시 확인할 수 있습니다.</p>
      </header>

      <div className="history-list">
        {runs.length === 0 ? (
          <article className="history-row">
            <strong>아직 실행 기록이 없습니다.</strong>
            <span>첫 반영을 실행하면 여기에 저장됩니다.</span>
          </article>
        ) : (
          runs.map((run) => (
            <article key={run.syncRunId} className="history-row">
              <strong>{run.startedAt}</strong>
              <span>{run.resultSummary}</span>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
