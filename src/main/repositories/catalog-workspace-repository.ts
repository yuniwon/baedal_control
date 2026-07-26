import type { CatalogWorkspaceRecord } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

export class CatalogWorkspaceRepository {
  constructor(private readonly db: DatabaseConnection) {}

  getDefault(): CatalogWorkspaceRecord {
    const row = this.db.prepare(`
      select
        workspace_id as workspaceId,
        display_name as displayName,
        lifecycle_state as lifecycleState,
        seed_mode as seedMode,
        seed_platform_code as seedPlatformCode,
        canonical_version as canonicalVersion,
        activated_at as activatedAt,
        created_at as createdAt,
        updated_at as updatedAt
      from catalog_workspaces
      where workspace_id = 'default'
    `).get() as CatalogWorkspaceRecord | undefined

    if (!row) {
      throw new Error('catalog_workspace_missing:default')
    }

    return row
  }

  save(record: CatalogWorkspaceRecord) {
    this.db.prepare(`
      insert into catalog_workspaces (
        workspace_id,
        display_name,
        lifecycle_state,
        seed_mode,
        seed_platform_code,
        canonical_version,
        activated_at
      ) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(workspace_id) do update set
        display_name = excluded.display_name,
        lifecycle_state = excluded.lifecycle_state,
        seed_mode = excluded.seed_mode,
        seed_platform_code = excluded.seed_platform_code,
        canonical_version = excluded.canonical_version,
        activated_at = excluded.activated_at,
        updated_at = current_timestamp
    `).run(
      record.workspaceId,
      record.displayName,
      record.lifecycleState,
      record.seedMode,
      record.seedPlatformCode,
      record.canonicalVersion,
      record.activatedAt ?? null
    )
  }
}
