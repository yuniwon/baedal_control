import type { SyncRunRecord } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

export class SyncRunRepository {
  constructor(private readonly db: DatabaseConnection) {}

  create(record: SyncRunRecord) {
    this.db.prepare(`
      insert into sync_runs (sync_run_id, started_at, finished_at, trigger_type, result_summary)
      values (?, ?, ?, ?, ?)
    `).run(
      record.syncRunId,
      record.startedAt,
      record.finishedAt ?? null,
      record.triggerType,
      record.resultSummary ?? null
    )
  }

  update(record: { syncRunId: string; finishedAt: string; resultSummary: string }) {
    this.db.prepare(`
      update sync_runs
      set finished_at = ?, result_summary = ?
      where sync_run_id = ?
    `).run(record.finishedAt, record.resultSummary, record.syncRunId)
  }

  list(): SyncRunRecord[] {
    return this.db.prepare(`
      select
        sync_run_id as syncRunId,
        started_at as startedAt,
        finished_at as finishedAt,
        trigger_type as triggerType,
        result_summary as resultSummary
      from sync_runs
      order by started_at desc
    `).all() as unknown as SyncRunRecord[]
  }
}
