import type { PlatformCode, PlatformMenuCatalogRecord } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'
import { withSavepoint } from '../db/savepoint'

interface PlatformMenuPresenceUpdate {
  platformCode: PlatformCode
  platformMenuId: string
  missingStreak: number
  presenceStatus: NonNullable<PlatformMenuCatalogRecord['presenceStatus']>
}

export class PlatformMenuRepository {
  constructor(private readonly db: DatabaseConnection) {}

  replaceForPlatform(platformCode: PlatformCode, records: PlatformMenuCatalogRecord[]) {
    withSavepoint(this.db, () => {
      this.db.prepare(`
        delete from platform_menus
        where platform_code = ?
      `).run(platformCode)

      const statement = this.db.prepare(`
        insert into platform_menus (
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
          last_seen_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp)
      `)

      for (const record of records) {
        statement.run(
          record.platformCode,
          record.platformMenuId,
          record.platformMenuName,
          record.platformMenuCurrentPrice ?? null,
          record.platformMenuPriceCount ?? null,
          record.platformMenuGroupName ?? null,
          record.platformMenuStatus ?? null,
          record.platformMenuPriceSummary ?? null,
          record.platformMenuBindingSummary ?? null,
          record.platformMenuBindingStatus ?? null
        )
      }
    })
  }

  upsertSeenBatch(
    platformCode: PlatformCode,
    importRunId: string,
    records: PlatformMenuCatalogRecord[]
  ) {
    if (records.length === 0) {
      return
    }

    const statement = this.db.prepare(`
      insert into platform_menus (
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
        last_seen_import_id,
        last_seen_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp)
      on conflict(platform_code, platform_menu_id) do update set
        platform_menu_name = excluded.platform_menu_name,
        platform_menu_current_price = excluded.platform_menu_current_price,
        platform_menu_price_count = excluded.platform_menu_price_count,
        platform_menu_group_name = excluded.platform_menu_group_name,
        platform_menu_status = excluded.platform_menu_status,
        platform_menu_price_summary = excluded.platform_menu_price_summary,
        platform_menu_binding_summary = excluded.platform_menu_binding_summary,
        platform_menu_binding_status = excluded.platform_menu_binding_status,
        last_seen_import_id = excluded.last_seen_import_id,
        last_seen_at = current_timestamp,
        missing_streak = 0,
        presence_status = 'present',
        presence_changed_at = case
          when platform_menus.presence_status <> 'present' then current_timestamp
          else platform_menus.presence_changed_at
        end
    `)

    withSavepoint(this.db, () => {
      for (const record of records) {
        statement.run(
          platformCode,
          record.platformMenuId,
          record.platformMenuName,
          record.platformMenuCurrentPrice ?? null,
          record.platformMenuPriceCount ?? null,
          record.platformMenuGroupName ?? null,
          record.platformMenuStatus ?? null,
          record.platformMenuPriceSummary ?? null,
          record.platformMenuBindingSummary ?? null,
          record.platformMenuBindingStatus ?? null,
          importRunId
        )
      }
    })
  }

  applyPresenceUpdates(updates: PlatformMenuPresenceUpdate[]) {
    if (updates.length === 0) {
      return
    }

    const statement = this.db.prepare(`
      update platform_menus
      set
        missing_streak = ?,
        presence_status = ?,
        presence_changed_at = case
          when presence_status = ? then presence_changed_at
          else current_timestamp
        end
      where platform_code = ? and platform_menu_id = ?
    `)

    withSavepoint(this.db, () => {
      for (const update of updates) {
        statement.run(
          update.missingStreak,
          update.presenceStatus,
          update.presenceStatus,
          update.platformCode,
          update.platformMenuId
        )
      }
    })
  }

  listAll(): PlatformMenuCatalogRecord[] {
    return this.db.prepare(`
      select
        platform_code as platformCode,
        platform_menu_id as platformMenuId,
        platform_menu_name as platformMenuName,
        platform_menu_current_price as platformMenuCurrentPrice,
        platform_menu_price_count as platformMenuPriceCount,
        platform_menu_group_name as platformMenuGroupName,
        platform_menu_status as platformMenuStatus,
        platform_menu_price_summary as platformMenuPriceSummary,
        platform_menu_binding_summary as platformMenuBindingSummary,
        platform_menu_binding_status as platformMenuBindingStatus,
        last_seen_import_id as lastSeenImportId,
        last_seen_at as lastSeenAt,
        missing_streak as missingStreak,
        presence_status as presenceStatus,
        presence_changed_at as presenceChangedAt
      from platform_menus
      order by platform_code asc, platform_menu_name asc, platform_menu_id asc
    `).all() as unknown as PlatformMenuCatalogRecord[]
  }
}
