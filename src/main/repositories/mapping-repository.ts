import type { PlatformMenuMappingRecord } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

export class MappingRepository {
  constructor(private readonly db: DatabaseConnection) {}

  upsert(record: PlatformMenuMappingRecord) {
    this.db.prepare(`
      insert into platform_menu_mappings (
        mapping_id,
        menu_id,
        platform_code,
        platform_menu_id,
        platform_menu_name,
        matched_by,
        is_confirmed
      ) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(mapping_id) do update set
        platform_menu_name = excluded.platform_menu_name,
        matched_by = excluded.matched_by,
        is_confirmed = excluded.is_confirmed,
        last_verified_at = current_timestamp
    `).run(
      record.mappingId,
      record.menuId,
      record.platformCode,
      record.platformMenuId,
      record.platformMenuName,
      record.matchedBy,
      record.isConfirmed
    )
  }

  listForMenu(menuId: string): PlatformMenuMappingRecord[] {
    return this.db.prepare(`
      select
        mapping_id as mappingId,
        menu_id as menuId,
        platform_code as platformCode,
        platform_menu_id as platformMenuId,
        platform_menu_name as platformMenuName,
        matched_by as matchedBy,
        is_confirmed as isConfirmed,
        last_verified_at as lastVerifiedAt
      from platform_menu_mappings
      where menu_id = ?
      order by platform_code asc
    `).all(menuId) as unknown as PlatformMenuMappingRecord[]
  }

  listAll(): PlatformMenuMappingRecord[] {
    return this.db.prepare(`
      select
        mapping_id as mappingId,
        menu_id as menuId,
        platform_code as platformCode,
        platform_menu_id as platformMenuId,
        platform_menu_name as platformMenuName,
        matched_by as matchedBy,
        is_confirmed as isConfirmed,
        last_verified_at as lastVerifiedAt
      from platform_menu_mappings
      order by menu_id asc, platform_code asc
    `).all() as unknown as PlatformMenuMappingRecord[]
  }
}
