import type { SyncRunItemRecord } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

const parseFailureContext = (value: unknown): SyncRunItemRecord['failureContext'] => {
  if (typeof value !== 'string') {
    return null
  }

  try {
    return JSON.parse(value) as SyncRunItemRecord['failureContext']
  } catch {
    return null
  }
}

export class SyncRunItemRepository {
  constructor(private readonly db: DatabaseConnection) {}

  addItem(record: SyncRunItemRecord) {
    this.ensureTable()
    this.db.prepare(`
      insert into sync_run_items (
        sync_run_item_id,
        sync_run_id,
        platform_code,
        menu_id,
        field_type,
        before_value,
        after_value,
        status,
        error_code,
        error_message,
        failure_context_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.syncRunItemId,
      record.syncRunId,
      record.platformCode,
      record.menuId,
      record.fieldType,
      record.beforeValue,
      record.afterValue,
      record.status,
      record.errorCode,
      record.errorMessage,
      record.failureContext ? JSON.stringify(record.failureContext) : null
    )
  }

  listForRunIds(syncRunIds: string[]): SyncRunItemRecord[] {
    this.ensureTable()
    if (syncRunIds.length === 0) {
      return []
    }

    const placeholders = syncRunIds.map(() => '?').join(', ')
    const rows = this.db.prepare(`
      select
        sync_run_item_id as syncRunItemId,
        sync_run_id as syncRunId,
        platform_code as platformCode,
        menu_id as menuId,
        field_type as fieldType,
        before_value as beforeValue,
        after_value as afterValue,
        status,
        error_code as errorCode,
        error_message as errorMessage,
        failure_context_json as failureContextJson
      from sync_run_items
      where sync_run_id in (${placeholders})
      order by rowid desc
    `).all(...syncRunIds) as unknown as Array<
      SyncRunItemRecord & { failureContextJson?: string | null }
    >

    return rows.map(({ failureContextJson, ...row }) => ({
      ...row,
      failureContext: parseFailureContext(failureContextJson)
    }))
  }

  private ensureTable() {
    this.db.exec(`
      create table if not exists sync_run_items (
        sync_run_item_id text primary key,
        sync_run_id text not null,
        platform_code text not null,
        menu_id text not null,
        field_type text not null,
        before_value text,
        after_value text,
        status text not null,
        error_code text,
        error_message text,
        failure_context_json text
      )
    `)

    const columns = new Set(
      (
        this.db.prepare(`
          select name
          from pragma_table_info('sync_run_items')
        `).all() as Array<{ name: string }>
      ).map((column) => column.name)
    )

    if (!columns.has('failure_context_json')) {
      this.db.exec('alter table sync_run_items add column failure_context_json text')
    }
  }
}
