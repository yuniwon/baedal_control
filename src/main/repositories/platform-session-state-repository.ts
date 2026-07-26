import type { PlatformCode, PlatformSessionStateRecord } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

const selectColumns = `
  workspace_id as workspaceId,
  platform_code as platformCode,
  state,
  detail_code as detailCode,
  credential_revision as credentialRevision,
  last_attempt_at as lastAttemptAt,
  last_ready_at as lastReadyAt,
  updated_at as updatedAt
`

export class PlatformSessionStateRepository {
  constructor(private readonly db: DatabaseConnection) {}

  get(workspaceId: string, platformCode: PlatformCode): PlatformSessionStateRecord | null {
    return (this.db.prepare(`
      select ${selectColumns}
      from platform_session_states
      where workspace_id = ? and platform_code = ?
    `).get(workspaceId, platformCode) as PlatformSessionStateRecord | undefined) ?? null
  }

  list(workspaceId: string): PlatformSessionStateRecord[] {
    return this.db.prepare(`
      select ${selectColumns}
      from platform_session_states
      where workspace_id = ?
      order by platform_code asc
    `).all(workspaceId) as unknown as PlatformSessionStateRecord[]
  }

  save(record: PlatformSessionStateRecord) {
    this.db.prepare(`
      insert into platform_session_states (
        workspace_id,
        platform_code,
        state,
        detail_code,
        credential_revision,
        last_attempt_at,
        last_ready_at
      ) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(workspace_id, platform_code) do update set
        state = excluded.state,
        detail_code = excluded.detail_code,
        credential_revision = excluded.credential_revision,
        last_attempt_at = excluded.last_attempt_at,
        last_ready_at = excluded.last_ready_at,
        updated_at = current_timestamp
    `).run(
      record.workspaceId,
      record.platformCode,
      record.state,
      record.detailCode ?? null,
      record.credentialRevision ?? null,
      record.lastAttemptAt ?? null,
      record.lastReadyAt ?? null
    )
  }
}
