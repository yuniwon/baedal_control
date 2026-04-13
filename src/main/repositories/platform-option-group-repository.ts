import type { PlatformCode, PlatformOptionGroupRecord } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'
import { withSavepoint } from '../db/savepoint'

interface PlatformOptionGroupPresenceUpdate {
  platformCode: PlatformCode
  optionGroupId: string
  missingStreak: number
  presenceStatus: NonNullable<PlatformOptionGroupRecord['presenceStatus']>
}

export class PlatformOptionGroupRepository {
  constructor(private readonly db: DatabaseConnection) {}

  replaceForPlatform(platformCode: PlatformCode, records: PlatformOptionGroupRecord[]) {
    withSavepoint(this.db, () => {
      this.db.prepare(`
        delete from platform_option_groups
        where platform_code = ?
      `).run(platformCode)

      const statement = this.db.prepare(`
        insert into platform_option_groups (
          platform_code,
          option_group_id,
          option_group_name,
          min_order_quantity,
          max_order_quantity,
          mapping_menus_count,
          options_json,
          menus_json,
          signature_key,
          last_seen_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp)
      `)

      for (const record of records) {
        statement.run(
          record.platformCode,
          record.optionGroupId,
          record.optionGroupName,
          record.minOrderQuantity ?? null,
          record.maxOrderQuantity ?? null,
          record.mappingMenusCount ?? null,
          JSON.stringify(record.options),
          JSON.stringify(record.menus),
          record.signatureKey ?? null
        )
      }
    })
  }

  upsertSeenBatch(
    platformCode: PlatformCode,
    importRunId: string,
    records: PlatformOptionGroupRecord[]
  ) {
    if (records.length === 0) {
      return
    }

    const statement = this.db.prepare(`
      insert into platform_option_groups (
        platform_code,
        option_group_id,
        option_group_name,
        min_order_quantity,
        max_order_quantity,
        mapping_menus_count,
        options_json,
        menus_json,
        signature_key,
        last_seen_import_id,
        last_seen_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp)
      on conflict(platform_code, option_group_id) do update set
        option_group_name = excluded.option_group_name,
        min_order_quantity = excluded.min_order_quantity,
        max_order_quantity = excluded.max_order_quantity,
        mapping_menus_count = excluded.mapping_menus_count,
        options_json = excluded.options_json,
        menus_json = excluded.menus_json,
        signature_key = excluded.signature_key,
        last_seen_import_id = excluded.last_seen_import_id,
        last_seen_at = current_timestamp,
        missing_streak = 0,
        presence_status = 'present',
        presence_changed_at = case
          when platform_option_groups.presence_status <> 'present' then current_timestamp
          else platform_option_groups.presence_changed_at
        end
    `)

    withSavepoint(this.db, () => {
      for (const record of records) {
        statement.run(
          platformCode,
          record.optionGroupId,
          record.optionGroupName,
          record.minOrderQuantity ?? null,
          record.maxOrderQuantity ?? null,
          record.mappingMenusCount ?? null,
          JSON.stringify(record.options),
          JSON.stringify(record.menus),
          record.signatureKey ?? null,
          importRunId
        )
      }
    })
  }

  applyPresenceUpdates(updates: PlatformOptionGroupPresenceUpdate[]) {
    if (updates.length === 0) {
      return
    }

    const statement = this.db.prepare(`
      update platform_option_groups
      set
        missing_streak = ?,
        presence_status = ?,
        presence_changed_at = case
          when presence_status = ? then presence_changed_at
          else current_timestamp
        end
      where platform_code = ? and option_group_id = ?
    `)

    withSavepoint(this.db, () => {
      for (const update of updates) {
        statement.run(
          update.missingStreak,
          update.presenceStatus,
          update.presenceStatus,
          update.platformCode,
          update.optionGroupId
        )
      }
    })
  }

  listAll(): PlatformOptionGroupRecord[] {
    const rows = this.db.prepare(`
      select
        platform_code as platformCode,
        option_group_id as optionGroupId,
        option_group_name as optionGroupName,
        min_order_quantity as minOrderQuantity,
        max_order_quantity as maxOrderQuantity,
        mapping_menus_count as mappingMenusCount,
        options_json as optionsJson,
        menus_json as menusJson,
        signature_key as signatureKey,
        last_seen_import_id as lastSeenImportId,
        last_seen_at as lastSeenAt,
        missing_streak as missingStreak,
        presence_status as presenceStatus,
        presence_changed_at as presenceChangedAt
      from platform_option_groups
      order by platform_code asc, option_group_name asc, option_group_id asc
    `).all() as Array<{
      platformCode: PlatformCode
      optionGroupId: string
      optionGroupName: string
      minOrderQuantity: number | null
      maxOrderQuantity: number | null
      mappingMenusCount: number | null
      optionsJson: string
      menusJson: string
      signatureKey: string | null
      lastSeenImportId: string | null
      lastSeenAt: string
      missingStreak: number
      presenceStatus: NonNullable<PlatformOptionGroupRecord['presenceStatus']>
      presenceChangedAt: string | null
    }>

    return rows.map((row) => ({
      platformCode: row.platformCode,
      optionGroupId: row.optionGroupId,
      optionGroupName: row.optionGroupName,
      minOrderQuantity: row.minOrderQuantity,
      maxOrderQuantity: row.maxOrderQuantity,
      mappingMenusCount: row.mappingMenusCount,
      options: JSON.parse(row.optionsJson) as PlatformOptionGroupRecord['options'],
      menus: JSON.parse(row.menusJson) as PlatformOptionGroupRecord['menus'],
      signatureKey: row.signatureKey,
      lastSeenImportId: row.lastSeenImportId,
      lastSeenAt: row.lastSeenAt,
      missingStreak: row.missingStreak,
      presenceStatus: row.presenceStatus,
      presenceChangedAt: row.presenceChangedAt
    }))
  }
}
