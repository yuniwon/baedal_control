import type { PlatformMappingStatus, PlatformMenuMappingRecord } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

export class MappingRepository {
  constructor(private readonly db: DatabaseConnection) {}

  remove(mappingId: string) {
    this.db.prepare(`
      delete from platform_menu_mappings
      where mapping_id = ?
    `).run(mappingId)
  }

  upsert(record: PlatformMenuMappingRecord) {
    this.db.prepare(`
      insert into platform_menu_mappings (
        mapping_id,
        menu_id,
        platform_code,
        platform_menu_id,
        platform_menu_name,
        platform_menu_current_price,
        platform_menu_price_count,
        platform_menu_group_name,
        platform_menu_status,
        platform_menu_price_summary,
        platform_menu_binding_summary,
        platform_menu_binding_status,
        mapping_status,
        matched_by,
        is_confirmed
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce(?, 'active'), ?, ?)
      on conflict(mapping_id) do update set
        platform_menu_id = excluded.platform_menu_id,
        platform_menu_name = excluded.platform_menu_name,
        platform_menu_current_price = excluded.platform_menu_current_price,
        platform_menu_price_count = excluded.platform_menu_price_count,
        platform_menu_group_name = excluded.platform_menu_group_name,
        platform_menu_status = excluded.platform_menu_status,
        platform_menu_price_summary = excluded.platform_menu_price_summary,
        platform_menu_binding_summary = excluded.platform_menu_binding_summary,
        platform_menu_binding_status = excluded.platform_menu_binding_status,
        mapping_status = case
          when ? is null then platform_menu_mappings.mapping_status
          else excluded.mapping_status
        end,
        matched_by = excluded.matched_by,
        is_confirmed = excluded.is_confirmed,
        last_verified_at = current_timestamp
    `).run(
      record.mappingId,
      record.menuId,
      record.platformCode,
      record.platformMenuId,
      record.platformMenuName,
      record.platformMenuCurrentPrice ?? null,
      record.platformMenuPriceCount ?? null,
      record.platformMenuGroupName ?? null,
      record.platformMenuStatus ?? null,
      record.platformMenuPriceSummary ?? null,
      record.platformMenuBindingSummary ?? null,
      record.platformMenuBindingStatus ?? null,
      record.mappingStatus ?? null,
      record.matchedBy,
      record.isConfirmed,
      record.mappingStatus ?? null
    )
  }

  setMappingStatus(mappingId: string, mappingStatus: PlatformMappingStatus) {
    this.db.prepare(`
      update platform_menu_mappings
      set mapping_status = ?
      where mapping_id = ?
    `).run(mappingStatus, mappingId)
  }

  listForMenu(menuId: string): PlatformMenuMappingRecord[] {
    return this.db.prepare(`
      select
        mapping_id as mappingId,
        menu_id as menuId,
        platform_code as platformCode,
        platform_menu_id as platformMenuId,
        platform_menu_name as platformMenuName,
        mapping_status as mappingStatus,
        platform_menu_current_price as platformMenuCurrentPrice,
        platform_menu_price_count as platformMenuPriceCount,
        platform_menu_group_name as platformMenuGroupName,
        platform_menu_status as platformMenuStatus,
        platform_menu_price_summary as platformMenuPriceSummary,
        platform_menu_binding_summary as platformMenuBindingSummary,
        platform_menu_binding_status as platformMenuBindingStatus,
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
        mapping_status as mappingStatus,
        platform_menu_current_price as platformMenuCurrentPrice,
        platform_menu_price_count as platformMenuPriceCount,
        platform_menu_group_name as platformMenuGroupName,
        platform_menu_status as platformMenuStatus,
        platform_menu_price_summary as platformMenuPriceSummary,
        platform_menu_binding_summary as platformMenuBindingSummary,
        platform_menu_binding_status as platformMenuBindingStatus,
        matched_by as matchedBy,
        is_confirmed as isConfirmed,
        last_verified_at as lastVerifiedAt
      from platform_menu_mappings
      order by menu_id asc, platform_code asc
    `).all() as unknown as PlatformMenuMappingRecord[]
  }
}
