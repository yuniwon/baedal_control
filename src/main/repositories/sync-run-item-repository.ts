import type { DatabaseConnection } from '../db/connection'

interface SyncRunItemRecord {
  syncRunItemId: string
  syncRunId: string
  platformCode: string
  menuId: string
  fieldType: string
  beforeValue: string | null
  afterValue: string
  status: string
  errorCode: string | null
  errorMessage: string | null
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
        error_message
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      record.errorMessage
    )
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
        error_message text
      )
    `)
  }
}
