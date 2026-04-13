import type { PlatformImportChangeRecord } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'
import { withSavepoint } from '../db/savepoint'

export class PlatformImportChangeRepository {
  constructor(private readonly db: DatabaseConnection) {}

  replaceForRun(importRunId: string, changes: PlatformImportChangeRecord[]) {
    withSavepoint(this.db, () => {
      this.db.prepare(`
        delete from platform_import_changes
        where import_run_id = ?
      `).run(importRunId)

      const statement = this.db.prepare(`
        insert into platform_import_changes (
          change_id,
          import_run_id,
          platform_code,
          entity_type,
          entity_key,
          entity_name,
          change_type,
          presence_status,
          before_json,
          after_json
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const change of changes) {
        statement.run(
          change.changeId,
          importRunId,
          change.platformCode,
          change.entityType,
          change.entityKey,
          change.entityName,
          change.changeType,
          change.presenceStatus ?? null,
          change.beforeJson ?? null,
          change.afterJson ?? null
        )
      }
    })
  }

  listLatest(limit = 50): PlatformImportChangeRecord[] {
    return this.db.prepare(`
      select
        change_id as changeId,
        import_run_id as importRunId,
        platform_code as platformCode,
        entity_type as entityType,
        entity_key as entityKey,
        entity_name as entityName,
        change_type as changeType,
        presence_status as presenceStatus,
        before_json as beforeJson,
        after_json as afterJson,
        created_at as createdAt
      from platform_import_changes
      order by created_at desc, rowid desc
      limit ?
    `).all(limit) as unknown as PlatformImportChangeRecord[]
  }
}
