import type { PlatformCode, PlatformImportRunRecord, PlatformImportRunStatus } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

interface StartPlatformImportRunInput {
  importRunId: string
  platformCode: PlatformCode
}

interface FinishPlatformImportRunInput {
  status: PlatformImportRunStatus
  menuFetchCompleted: number
  optionFetchCompleted: number
  summaryJson?: string | null
}

export class PlatformImportRunRepository {
  constructor(private readonly db: DatabaseConnection) {}

  start(input: StartPlatformImportRunInput) {
    this.db.prepare(`
      insert into platform_import_runs (
        import_run_id,
        platform_code,
        status
      ) values (?, ?, 'running')
    `).run(input.importRunId, input.platformCode)
  }

  finish(importRunId: string, input: FinishPlatformImportRunInput) {
    const result = this.db.prepare(`
      update platform_import_runs
      set
        finished_at = current_timestamp,
        status = ?,
        menu_fetch_completed = ?,
        option_fetch_completed = ?,
        summary_json = ?
      where import_run_id = ?
    `).run(
      input.status,
      input.menuFetchCompleted,
      input.optionFetchCompleted,
      input.summaryJson ?? null,
      importRunId
    )

    if (result.changes === 0) {
      throw new Error(`Platform import run not found: ${importRunId}`)
    }
  }

  listLatest(limit = 20): PlatformImportRunRecord[] {
    return this.db.prepare(`
      select
        import_run_id as importRunId,
        platform_code as platformCode,
        started_at as startedAt,
        finished_at as finishedAt,
        status,
        menu_fetch_completed as menuFetchCompleted,
        option_fetch_completed as optionFetchCompleted,
        summary_json as summaryJson
      from platform_import_runs
      order by started_at desc, rowid desc
      limit ?
    `).all(limit) as unknown as PlatformImportRunRecord[]
  }
}
