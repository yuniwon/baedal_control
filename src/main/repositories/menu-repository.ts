import type { MenuRecord } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'
import {
  parsePlatformMenuPriceVariants,
  stringifyPlatformMenuPriceVariants
} from './platform-menu-price-variants'

export class MenuRepository {
  constructor(private readonly db: DatabaseConnection) {}

  get(menuId: string): MenuRecord | null {
    const row = this.db.prepare(`
      select
        menu_id as menuId,
        base_name as baseName,
        base_price as basePrice,
        base_price_variants_json as basePriceVariantsJson,
        is_dirty as isDirty,
        is_managed as isManaged,
        created_at as createdAt,
        updated_at as updatedAt
      from menus
      where menu_id = ?
    `).get(menuId) as
      | (MenuRecord & { basePriceVariantsJson?: string | null })
      | undefined

    if (!row) {
      return null
    }

    const { basePriceVariantsJson, ...record } = row
    return {
      ...record,
      basePriceVariants: parsePlatformMenuPriceVariants(basePriceVariantsJson)
    }
  }

  remove(menuId: string) {
    this.db.prepare(`
      delete from catalog_publication_targets
      where menu_id = ?
    `).run(menuId)
    this.db.prepare(`
      delete from menus
      where menu_id = ?
    `).run(menuId)
  }

  upsert(record: MenuRecord) {
    this.db.prepare(`
      insert into menus (menu_id, base_name, base_price, base_price_variants_json, is_dirty, is_managed)
      values (?, ?, ?, ?, ?, ?)
      on conflict(menu_id) do update set
        base_name = excluded.base_name,
        base_price = excluded.base_price,
        base_price_variants_json = excluded.base_price_variants_json,
        is_dirty = excluded.is_dirty,
        is_managed = excluded.is_managed,
        updated_at = current_timestamp
    `).run(
      record.menuId,
      record.baseName,
      record.basePrice,
      stringifyPlatformMenuPriceVariants(record.basePriceVariants),
      record.isDirty,
      record.isManaged ?? 1
    )
  }

  list(): MenuRecord[] {
    const rows = this.db.prepare(`
      select
        menu_id as menuId,
        base_name as baseName,
        base_price as basePrice,
        base_price_variants_json as basePriceVariantsJson,
        is_dirty as isDirty,
        is_managed as isManaged,
        created_at as createdAt,
        updated_at as updatedAt
      from menus
      order by base_name asc
    `).all() as unknown as Array<MenuRecord & { basePriceVariantsJson?: string | null }>

    return rows.map(({ basePriceVariantsJson, ...record }) => ({
      ...record,
      basePriceVariants: parsePlatformMenuPriceVariants(basePriceVariantsJson)
    }))
  }

  setDirty(menuId: string, isDirty: number) {
    this.db.prepare(`
      update menus
      set
        is_dirty = ?,
        updated_at = current_timestamp
      where menu_id = ?
    `).run(isDirty, menuId)
  }
}
