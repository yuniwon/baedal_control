import type { CatalogIntentRule } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

export class CatalogIntentRuleRepository {
  constructor(private readonly db: DatabaseConnection) {}

  upsert(record: CatalogIntentRule) {
    this.db.prepare(`
      insert into catalog_intent_rules (
        intent_rule_id,
        workspace_id,
        kind,
        scope,
        resolution,
        platform_code,
        canonical_menu_id,
        source_entity_id,
        field_key,
        category_key,
        reason,
        expires_at,
        is_active
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(intent_rule_id) do update set
        workspace_id = excluded.workspace_id,
        kind = excluded.kind,
        scope = excluded.scope,
        resolution = excluded.resolution,
        platform_code = excluded.platform_code,
        canonical_menu_id = excluded.canonical_menu_id,
        source_entity_id = excluded.source_entity_id,
        field_key = excluded.field_key,
        category_key = excluded.category_key,
        reason = excluded.reason,
        expires_at = excluded.expires_at,
        is_active = excluded.is_active,
        updated_at = current_timestamp
    `).run(
      record.intentRuleId,
      record.workspaceId,
      record.kind,
      record.scope,
      record.resolution,
      record.platformCode ?? null,
      record.canonicalMenuId ?? null,
      record.sourceEntityId ?? null,
      record.fieldKey ?? null,
      record.categoryKey ?? null,
      record.reason,
      record.expiresAt ?? null,
      record.isActive
    )
  }

  listActive(workspaceId: string, at = new Date().toISOString()): CatalogIntentRule[] {
    return this.db.prepare(`
      select
        intent_rule_id as intentRuleId,
        workspace_id as workspaceId,
        kind,
        scope,
        resolution,
        platform_code as platformCode,
        canonical_menu_id as canonicalMenuId,
        source_entity_id as sourceEntityId,
        field_key as fieldKey,
        category_key as categoryKey,
        reason,
        expires_at as expiresAt,
        is_active as isActive,
        created_at as createdAt,
        updated_at as updatedAt
      from catalog_intent_rules
      where workspace_id = ?
        and is_active = 1
        and (expires_at is null or expires_at > ?)
      order by created_at asc, intent_rule_id asc
    `).all(workspaceId, at) as unknown as CatalogIntentRule[]
  }
}
